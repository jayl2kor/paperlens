"""
browser-use 기반 브라우저 자동화 에이전트.

용도:
  1. 논문 검색/다운로드 — arXiv, Google Scholar 등에서 논문 PDF 자동 다운로드
  2. 프론트엔드 E2E 검증 — 자연어 기반 UI 테스트
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from browser_use import Agent, Browser, Tools

from app.config import settings

Source = Literal["arxiv", "google_scholar"]

_SOURCE_URLS: dict[str, str] = {
    "arxiv": "https://arxiv.org 에서 검색",
    "google_scholar": "https://scholar.google.com 에서 검색",
}

_SEARCH_TASK = """
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

_VERIFY_TASK = """
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


@dataclass
class TestResult:
    passed: bool = False
    summary: str = ""
    steps: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


# Lazy imports — browser-use pulls in playwright (~690ms).
# Deferring to call time avoids penalizing every FastAPI cold start.
def _lazy_imports():
    from browser_use import Agent, Browser, ChatAnthropic, Tools, ActionResult, BrowserSession  # noqa: F811

    return Agent, Browser, ChatAnthropic, Tools, ActionResult, BrowserSession


_llm_instance = None


def _get_llm():
    """Anthropic Claude LLM 인스턴스를 반환 (싱글턴)."""
    global _llm_instance
    if not settings.anthropic_api_key:
        raise ValueError("ANTHROPIC_API_KEY가 설정되지 않았습니다.")
    if _llm_instance is None:
        _, _, ChatAnthropic, *_ = _lazy_imports()
        _llm_instance = ChatAnthropic(
            model=settings.claude_model,
            temperature=0.0,
            api_key=settings.anthropic_api_key,
        )
    return _llm_instance


def _find_chrome_path() -> str | None:
    """Playwright가 설치한 Chrome 또는 시스템 Chrome 경로를 탐색."""
    candidates = [
        # Playwright cache (macOS)
        *sorted(Path.home().glob(
            "Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/"
            "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
        ), reverse=True),
        # System Chrome (macOS)
        Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        # Linux
        Path("/usr/bin/google-chrome"),
        Path("/usr/bin/chromium"),
    ]
    for p in candidates:
        if p.exists():
            return str(p)
    return None


async def _run_agent(
    task: str,
    tools,
    *,
    headless: bool,
    max_steps: int,
    **browser_kwargs,
) -> None:
    """공통 에이전트 실행 헬퍼. 브라우저 종료를 보장."""
    Agent, Browser, *_ = _lazy_imports()

    chrome_path = _find_chrome_path()
    if chrome_path:
        browser_kwargs.setdefault("executable_path", chrome_path)

    browser = Browser(headless=headless, **browser_kwargs)
    try:
        agent = Agent(
            task=task,
            llm=_get_llm(),
            browser=browser,
            tools=tools,
            max_actions_per_step=3,
            use_vision=True,
        )
        await agent.run(max_steps=max_steps)
    finally:
        await browser.stop()


async def search_and_download_paper(
    query: str,
    *,
    max_papers: int = 1,
    source: Source = "arxiv",
    headless: bool = True,
) -> list[dict]:
    """
    브라우저를 이용해 논문을 검색하고 PDF를 다운로드한다.

    Returns:
        [{"title": str, "url": str, "pdf_path": str}, ...]
    """
    _, _, _, Tools, ActionResult, _ = _lazy_imports()

    tools = Tools()
    results: list[dict] = []
    downloads_dir = Path(settings.upload_dir)

    @tools.action("논문 정보를 결과 목록에 저장")
    async def save_paper_info(title: str, url: str, pdf_filename: str) -> ActionResult:
        pdf_path = str(downloads_dir / pdf_filename)
        results.append({"title": title, "url": url, "pdf_path": pdf_path})
        return ActionResult(
            extracted_content=f"저장 완료: {title}",
            long_term_memory=f"논문 '{title}'를 {pdf_filename}으로 저장했음",
        )

    source_instruction = _SOURCE_URLS[source]
    task = _SEARCH_TASK.format(
        query=query, source_instruction=source_instruction, max_papers=max_papers
    )

    await _run_agent(
        task, tools,
        headless=headless,
        max_steps=30,
        downloads_path=str(downloads_dir),
    )

    return results


async def verify_frontend(
    test_description: str,
    *,
    base_url: str = "http://localhost:3000",
    headless: bool = False,
) -> TestResult:
    """자연어 기반 프론트엔드 E2E 검증."""
    _, _, _, Tools, ActionResult, _ = _lazy_imports()

    tools = Tools()
    result = TestResult()

    @tools.action("테스트 단계 결과를 기록")
    async def log_test_step(step: str, passed: bool, error: str = "") -> ActionResult:
        result.steps.append({"step": step, "passed": passed, "error": error})
        if not passed and error:
            result.errors.append(f"[{step}] {error}")
        status = "PASS" if passed else f"FAIL: {error}"
        return ActionResult(
            extracted_content=f"[{status}] {step}",
            long_term_memory=f"테스트 '{step}': {status}",
        )

    @tools.action("전체 테스트 결과를 최종 판정")
    async def finalize_test(passed: bool, summary: str) -> ActionResult:
        result.passed = passed
        result.summary = summary
        return ActionResult(
            extracted_content=summary,
            is_done=True,
            success=passed,
        )

    task = _VERIFY_TASK.format(base_url=base_url, test_description=test_description)

    await _run_agent(
        task, tools,
        headless=headless,
        max_steps=50,
        window_size={"width": 1280, "height": 800},
    )

    # finalize_test가 호출되지 않은 경우 보정
    if not result.summary:
        all_passed = all(s.get("passed", False) for s in result.steps)
        result.passed = all_passed
        result.summary = "모든 단계 통과" if all_passed else "일부 단계 실패"

    return result


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="paper-insight 브라우저 에이전트")
    sub = parser.add_subparsers(dest="command", required=True)

    search_p = sub.add_parser("search", help="논문 검색 및 다운로드")
    search_p.add_argument("query", help="검색 키워드")
    search_p.add_argument("--max", type=int, default=1, help="최대 논문 수")
    search_p.add_argument("--source", default="arxiv", choices=["arxiv", "google_scholar"])
    search_p.add_argument("--show", action="store_true", help="브라우저 표시")

    verify_p = sub.add_parser("verify", help="프론트엔드 E2E 검증")
    verify_p.add_argument("scenario", help="테스트 시나리오 (자연어)")
    verify_p.add_argument("--url", default="http://localhost:3000", help="프론트엔드 URL")
    verify_p.add_argument("--headless", action="store_true", help="헤드리스 모드")

    args = parser.parse_args()

    if args.command == "search":
        found = asyncio.run(
            search_and_download_paper(
                args.query, max_papers=args.max, source=args.source, headless=not args.show
            )
        )
        for r in found:
            print(f"  📄 {r['title']}")
            print(f"     URL: {r['url']}")
            print(f"     PDF: {r['pdf_path']}")

    elif args.command == "verify":
        res = asyncio.run(
            verify_frontend(args.scenario, base_url=args.url, headless=args.headless)
        )
        status = "✅ PASSED" if res.passed else "❌ FAILED"
        print(f"\n{status}: {res.summary}")
        for s in res.steps:
            icon = "✓" if s["passed"] else "✗"
            print(f"  {icon} {s['step']}")
            if s.get("error"):
                print(f"    → {s['error']}")
