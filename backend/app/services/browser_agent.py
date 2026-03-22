"""
browser-use 기반 브라우저 자동화 에이전트.

용도:
  1. 논문 검색/다운로드 — arXiv, Google Scholar 등에서 논문 PDF 자동 다운로드
  2. 프론트엔드 E2E 검증 — 자연어 기반 UI 테스트
"""

import asyncio
import os
from pathlib import Path

from browser_use import Agent, Browser, ChatAnthropic, Tools, ActionResult, BrowserSession
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env")

# ── 공통 설정 ──────────────────────────────────────────────────────────────

DOWNLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)


def _get_llm():
    """Anthropic Claude LLM 인스턴스를 반환."""
    return ChatAnthropic(
        model=os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514"),
        temperature=0.0,
    )


# ── 1. 논문 검색/다운로드 에이전트 ────────────────────────────────────────


async def search_and_download_paper(
    query: str,
    *,
    max_papers: int = 1,
    source: str = "arxiv",
    headless: bool = True,
) -> list[dict]:
    """
    브라우저를 이용해 논문을 검색하고 PDF를 다운로드한다.

    Args:
        query: 검색 키워드 또는 논문 제목
        max_papers: 다운로드할 최대 논문 수
        source: 검색 소스 ("arxiv" | "google_scholar")
        headless: 헤드리스 모드 여부

    Returns:
        [{"title": str, "url": str, "pdf_path": str}, ...]
    """
    tools = Tools()
    results: list[dict] = []

    @tools.action("논문 정보를 결과 목록에 저장")
    async def save_paper_info(title: str, url: str, pdf_filename: str) -> ActionResult:
        pdf_path = str(DOWNLOADS_DIR / pdf_filename)
        results.append({"title": title, "url": url, "pdf_path": pdf_path})
        return ActionResult(
            extracted_content=f"저장 완료: {title}",
            long_term_memory=f"논문 '{title}'를 {pdf_filename}으로 저장했음",
        )

    source_instruction = {
        "arxiv": "https://arxiv.org 에서 검색",
        "google_scholar": "https://scholar.google.com 에서 검색",
    }.get(source, f"https://{source} 에서 검색")

    task = f"""
    다음 논문을 검색하고 PDF를 다운로드해주세요:

    검색어: "{query}"
    검색 소스: {source_instruction}
    최대 {max_papers}개 논문 다운로드

    절차:
    1. 검색 소스 사이트로 이동
    2. 검색어를 입력하고 검색
    3. 가장 관련성 높은 논문 {max_papers}개를 찾기
    4. 각 논문의 PDF 다운로드 링크를 클릭하여 PDF 다운로드
    5. 각 논문에 대해 save_paper_info 액션으로 제목, URL, 파일명 저장
    6. 모든 논문 다운로드 완료 후 done

    주의:
    - arXiv의 경우 "Download PDF" 링크를 사용
    - 파일명은 영문으로, 공백 대신 밑줄 사용
    - PDF가 브라우저에서 열리면 다운로드 버튼 클릭
    """

    browser = Browser(
        headless=headless,
        downloads_path=str(DOWNLOADS_DIR),
    )

    agent = Agent(
        task=task,
        llm=_get_llm(),
        browser=browser,
        tools=tools,
        max_actions_per_step=3,
        use_vision=True,
    )

    await agent.run(max_steps=30)

    return results


# ── 2. 프론트엔드 E2E 검증 에이전트 ──────────────────────────────────────


async def verify_frontend(
    test_description: str,
    *,
    base_url: str = "http://localhost:3000",
    headless: bool = False,
) -> dict:
    """
    자연어 기반 프론트엔드 E2E 검증.

    Args:
        test_description: 자연어로 기술된 테스트 시나리오
        base_url: 프론트엔드 서버 URL
        headless: 헤드리스 모드

    Returns:
        {"passed": bool, "steps": list[str], "errors": list[str]}
    """
    tools = Tools()
    test_results: dict = {"passed": False, "steps": [], "errors": []}

    @tools.action("테스트 단계 결과를 기록")
    async def log_test_step(step: str, passed: bool, error: str = "") -> ActionResult:
        test_results["steps"].append({"step": step, "passed": passed, "error": error})
        if not passed and error:
            test_results["errors"].append(f"[{step}] {error}")
        status = "PASS" if passed else f"FAIL: {error}"
        return ActionResult(
            extracted_content=f"[{status}] {step}",
            long_term_memory=f"테스트 '{step}': {status}",
        )

    @tools.action("전체 테스트 결과를 최종 판정")
    async def finalize_test(passed: bool, summary: str) -> ActionResult:
        test_results["passed"] = passed
        test_results["summary"] = summary
        return ActionResult(
            extracted_content=summary,
            is_done=True,
            success=passed,
        )

    task = f"""
    다음 프론트엔드 E2E 테스트를 수행해주세요:

    테스트 대상: {base_url}
    테스트 시나리오:
    {test_description}

    절차:
    1. {base_url} 로 이동
    2. 테스트 시나리오의 각 단계를 순서대로 수행
    3. 각 단계마다 log_test_step 액션으로 결과 기록 (step 이름, passed 여부, 실패 시 error)
    4. 모든 단계 완료 후 finalize_test 액션으로 전체 판정

    주의:
    - 페이지 로딩을 기다린 후 검증
    - 요소가 보이지 않으면 스크롤하여 확인
    - 에러 메시지가 있으면 정확히 기록
    - 콘솔 에러가 있으면 evaluate로 확인
    """

    browser = Browser(
        headless=headless,
        window_size={"width": 1280, "height": 800},
    )

    agent = Agent(
        task=task,
        llm=_get_llm(),
        browser=browser,
        tools=tools,
        max_actions_per_step=3,
        use_vision=True,
    )

    await agent.run(max_steps=50)

    # 모든 step이 pass였는데 finalize가 호출 안 된 경우 보정
    if not test_results.get("summary"):
        all_passed = all(s.get("passed", False) for s in test_results["steps"])
        test_results["passed"] = all_passed
        test_results["summary"] = "모든 단계 통과" if all_passed else "일부 단계 실패"

    return test_results


# ── CLI 진입점 ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="paper-insight 브라우저 에이전트")
    sub = parser.add_subparsers(dest="command", required=True)

    # 논문 검색
    search_p = sub.add_parser("search", help="논문 검색 및 다운로드")
    search_p.add_argument("query", help="검색 키워드")
    search_p.add_argument("--max", type=int, default=1, help="최대 논문 수")
    search_p.add_argument("--source", default="arxiv", choices=["arxiv", "google_scholar"])
    search_p.add_argument("--show", action="store_true", help="브라우저 표시")

    # FE 검증
    verify_p = sub.add_parser("verify", help="프론트엔드 E2E 검증")
    verify_p.add_argument("scenario", help="테스트 시나리오 (자연어)")
    verify_p.add_argument("--url", default="http://localhost:3000", help="프론트엔드 URL")
    verify_p.add_argument("--headless", action="store_true", help="헤드리스 모드")

    args = parser.parse_args()

    if args.command == "search":
        results = asyncio.run(
            search_and_download_paper(
                args.query, max_papers=args.max, source=args.source, headless=not args.show
            )
        )
        for r in results:
            print(f"  📄 {r['title']}")
            print(f"     URL: {r['url']}")
            print(f"     PDF: {r['pdf_path']}")

    elif args.command == "verify":
        result = asyncio.run(
            verify_frontend(args.scenario, base_url=args.url, headless=args.headless)
        )
        status = "✅ PASSED" if result["passed"] else "❌ FAILED"
        print(f"\n{status}: {result.get('summary', '')}")
        for s in result["steps"]:
            icon = "✓" if s["passed"] else "✗"
            print(f"  {icon} {s['step']}")
            if s.get("error"):
                print(f"    → {s['error']}")
