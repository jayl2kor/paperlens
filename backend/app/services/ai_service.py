import hashlib
import json
from collections.abc import AsyncGenerator
from typing import Literal

import anthropic
from sqlalchemy.orm import Session

from app.config import settings
from app.database import db_session
from app.models.ai_cache import AiCache
from app.models.chat_message import ChatMessage
from app.services.context_manager import select_context
from app.services.text_matcher import match_highlights_to_bboxes

ChatMode = Literal["general", "limitations", "connections"]

# ── Prompts ──────────────────────────────────────────────────────────────────

SUMMARY_SYSTEM = (
    "You are an academic paper analysis assistant. "
    "Given a research paper's full text, provide a structured summary in Korean. "
    "Use LaTeX notation for all mathematical expressions: inline math with $...$ and display math with $$...$$. "
    "Use bullet points and sub-headings to organize content clearly."
)

SUMMARY_USER = """아래 논문의 내용을 분석하여 다음 형식으로 요약해 주세요.

## 3줄 요약
1. [연구 주제와 목적 — 1문장]
2. [핵심 방법론 — 1문장]
3. [주요 결과 및 기여 — 1문장]

## 방법론 요약
[핵심 방법론을 2-3 문단으로 상세히 설명. 전문 용어는 원어 병기.]

## 주요 결과
[핵심 실험 결과와 수치를 bullet point로 정리]

## 의의 및 영향
[이 연구의 학문적·실용적 기여를 2-3문장으로 서술. 기존 연구와의 차별점, 후속 연구에 미칠 영향 포함.]

---
논문 전문:
{text}"""

EXPLAIN_SYSTEM = (
    "You are an academic paper explanation assistant. "
    "Given a selected passage from a research paper, provide a clear, detailed explanation in Korean. "
    "Adapt your explanation based on the content type (sentence, table, or formula)."
)

EXPLAIN_USER = """아래 논문에서 선택된 부분을 설명해 주세요.

선택된 텍스트:
{selected_text}

{context_section}

내용 유형: {content_type}

규칙:
- 전문 용어는 원어를 병기 (예: 어텐션 메커니즘(Attention Mechanism))
- 수식이 포함된 경우 각 기호의 의미를 설명
- 표(table)인 경우 주요 수치와 트렌드를 해석
- 해당 내용이 논문 전체에서 갖는 의미를 간단히 언급
- 한국어로 답변"""

TRANSLATE_SYSTEM = (
    "You are a professional academic translator. "
    "Translate the given academic paper text to the target language. "
    "Preserve domain-specific terminology with original terms in parentheses."
)

TRANSLATE_USER = """아래 논문 텍스트를 {target_language}로 번역해 주세요.

규칙:
- 전문 용어는 번역 후 괄호 안에 원어 병기 (예: 합성곱 신경망(Convolutional Neural Network))
- 수식은 그대로 유지
- 문단 구조를 보존
- 자연스러운 학술 문체 사용
- 참고문헌 번호([1], [2] 등)는 그대로 유지

원문:
{text}"""

CHAT_SYSTEM_BASE = (
    "You are an AI research discussion partner. "
    "You discuss academic papers with the user in Korean. "
    "Always ground your answers in the paper content provided. "
    "Cite specific sections or quotes from the paper when relevant. "
    "전문 용어는 원어 병기 (예: 어텐션 메커니즘(Attention Mechanism))."
)

CHAT_MODE_INSTRUCTIONS = {
    "general": "사용자의 질문에 논문 내용을 기반으로 자세하게 답변하세요.",
    "limitations": (
        "이 논문의 한계점, 약점, 개선 가능성에 집중하여 비판적으로 분석하세요. "
        "구체적인 한계점을 지적하고, 가능한 개선 방향을 제시하세요."
    ),
    "connections": (
        "이 논문과 관련된 연구, 기존 방법론과의 비교, 학문적 맥락에 집중하세요. "
        "논문에서 언급하는 선행 연구를 분석하고, 이 연구가 기존 연구를 어떻게 확장하는지 설명하세요."
    ),
}

CHAT_USER = """논문 내용:
{context}

---
질문: {question}"""

CITATIONS_SYSTEM = (
    "You are an academic citation analyzer. "
    "Given a paper's text, extract the references section and summarize each citation. "
    "Return ONLY valid JSON, no markdown code blocks."
)

CITATIONS_USER = """아래 논문에서 참고문헌(References) 섹션을 찾아 각 인용을 분석하세요.

규칙:
- 각 참고문헌의 번호([1], [2] 등)를 식별
- 각 참고문헌의 원문 텍스트를 추출
- 각 참고문헌의 내용을 한국어로 1문장 요약
- 최대 30개까지만 처리

JSON 형식:
{{"citations": [{{"number": 1, "raw_text": "원문 참고문헌 텍스트", "summary": "한국어 요약"}}]}}

논문 전문:
{text}"""

AUTO_HIGHLIGHT_SYSTEM = (
    "You are an academic paper analysis assistant. "
    "Identify the most important passages from the paper. "
    "Return ONLY valid JSON, no markdown code blocks."
)

AUTO_HIGHLIGHT_USER = """아래 논문에서 가장 중요한 구절을 찾아 JSON으로 반환하세요.

카테고리:
- novelty: 새로운 기여/주장 (2-3개)
- method: 핵심 방법론 설명 (2-3개)
- result: 주요 결과/발견 (2-3개)

규칙:
- "text"는 논문에서 그대로 인용한 원문 (영어 원문 그대로, 10-50 단어)
- "reason"은 한국어로 2-3문장의 상세한 설명:
  - 이 구절이 논문에서 왜 중요한지
  - 구체적인 수치나 비교 대상이 있으면 포함
  - 해당 분야에서의 의미 또는 기존 연구와의 차이점
- 총 6-9개 하이라이트

JSON 형식:
{{"highlights": [{{"category": "novelty", "text": "exact quote", "reason": "2-3문장 상세 설명"}}]}}

논문 전문:
{text}"""

# ── STEM Analysis Prompts ─────────────────────────────────────────────────────

STEM_ANALYSIS_SYSTEM = (
    "You are an expert STEM paper analyst. "
    "Provide a comprehensive 8-step structural analysis of the given paper in Korean."
)

STEM_ANALYSIS_USER = """아래 논문을 이공계 전용 8단계로 구조화 분석해 주세요.
각 단계는 ## 제목으로 시작하고 200-400 단어로 작성합니다.

## 1. 배경 및 동기
[연구 배경, 기존 연구의 한계, 해결할 문제 정의]

## 2. 가설 및 목표
[연구 가설, 목표, 기대 성과]

## 3. 실험 설계
[방법론, 독립/종속 변수, 대조군, 측정 방법]

## 4. 재료 및 기기
[사용된 재료, 시약, 장비, 소프트웨어, 데이터셋]

## 5. 절차 상세
[단계별 실험/시뮬레이션 프로토콜]

## 6. 분석 방법
[데이터 전처리, 통계 기법, 오차 분석, 품질 보증]

## 7. 핵심 결과
[주요 수치 결과, 표/그래프 해석, 가설 검증 여부]

## 8. 결론 및 영향
[결론 요약, 한계점, 향후 연구 방향, 학문적·산업적 의의]

---
논문 전문:
{text}"""

NUMERICAL_TABLE_SYSTEM = (
    "You are a data extraction specialist for STEM papers. "
    "Extract all numerical data, parameters, and measurements. "
    "Organize into structured tables separating inputs from outputs."
)

NUMERICAL_TABLE_USER = """논문의 수치 데이터를 추출하여 입력/출력으로 분류해주세요.

논문 전문:
{text}

JSON 형식:
{{
  "tables": [
    {{
      "title": "테이블 제목",
      "type": "input|output|comparison",
      "headers": ["컬럼1", "컬럼2", "컬럼3", "컬럼4"],
      "rows": [["값1", "값2", "값3", "값4"]],
      "source": "Table 1 / Section 3.2 등 출처"
    }}
  ],
  "summary": "주요 수치 1줄 요약"
}}

규칙:
- input: 실험 파라미터, 초기 조건, 설정값 (컬럼: 변수명 | 값 | 단위 | 설명)
- output: 측정 결과, 성능 지표 (컬럼: 측정항목 | 값 | 단위 | 오차/표준편차)
- comparison: 기존 방법 vs 제안 방법 (컬럼: 항목 | 기존 | 제안 | 개선율)
- 논문에 명시적으로 나온 수치만 추출, 추론하지 말 것
- 소수점 자릿수와 유효숫자를 원문 그대로 유지"""

FORMULA_ANALYSIS_SYSTEM = (
    "You are a mathematical formula analyst for STEM papers. "
    "Extract and analyze all key formulas: identify variables, units, dimensions, "
    "and verify dimensional consistency."
)

FORMULA_ANALYSIS_USER = """논문의 핵심 수식을 추출하고 분석해주세요.

논문 전문:
{text}

JSON 형식:
{{
  "formulas": [
    {{
      "id": "Eq. (1)",
      "latex": "E = mc^2",
      "description": "수식의 물리적/수학적 의미",
      "variables": [
        {{"symbol": "E", "name": "에너지", "unit": "J", "dimension": "ML²T⁻²"}}
      ],
      "dimensions": {{
        "lhs": "ML²T⁻²",
        "rhs": "M × (LT⁻¹)² = ML²T⁻²",
        "consistent": true
      }},
      "constraints": "유효 범위, 가정, 경계 조건",
      "source": "Section 2.1, p.3 등 출처"
    }}
  ]
}}

규칙:
- LaTeX 표현은 논문 원문과 최대한 일치
- 차원 분석은 SI 기본 단위 기반 (M, L, T, I, Θ, N, J)
- 무차원수는 dimension: "1"로 표기
- 변수 설명은 논문 내 정의를 우선 사용
- consistent 필드: 양변 차원이 일치하면 true, 아니면 false + 사유"""

# ── Helpers ───────────────────────────────────────────────────────────────────

MAX_TEXT_CHARS = 600_000  # ~150K tokens

_NO_KEY_MSG = "ANTHROPIC_API_KEY가 설정되지 않았습니다. 설정 페이지에서 API 키를 입력하세요."

_client: anthropic.AsyncAnthropic | None = None
_client_key: str = ""


def _resolve_api_key() -> str:
    """Resolve API key from environment/config only."""
    return settings.anthropic_api_key


def get_client() -> anthropic.AsyncAnthropic:
    """Return a shared AsyncAnthropic client, recreating if the key changed."""
    global _client, _client_key
    api_key = _resolve_api_key()
    if not api_key:
        raise ValueError(_NO_KEY_MSG)
    if _client is None or _client_key != api_key:
        _client = anthropic.AsyncAnthropic(api_key=api_key)
        _client_key = api_key
    return _client


def _resolve_model() -> str:
    """Resolve Claude model from config."""
    return settings.claude_model


def _truncate(text: str) -> str:
    if len(text) <= MAX_TEXT_CHARS:
        return text
    return text[:400_000] + "\n\n[...중간 생략...]\n\n" + text[-200_000:]


def _parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return json.loads(text.strip())


def _get_cache(db: Session, paper_id: int, req_type: str) -> str | None:
    row = (
        db.query(AiCache)
        .filter(AiCache.paper_id == paper_id, AiCache.request_type == req_type)
        .first()
    )
    return row.response if row else None


def _set_cache(db: Session, paper_id: int, req_type: str, response: str) -> None:
    db.add(AiCache(paper_id=paper_id, request_type=req_type, response=response))
    db.commit()


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _cached_json_call(
    paper_id: int,
    cache_key: str,
    system: str,
    user_msg: str,
    result_key: str,
    db: Session,
) -> list[dict]:
    """Make a non-streaming Claude call, parsing JSON result. Caches."""
    cached = _get_cache(db, paper_id, cache_key)
    if cached:
        return json.loads(cached)

    client = get_client()
    response = await client.messages.create(
        model=_resolve_model(),
        max_tokens=4000,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    )

    raw = response.content[0].text
    parsed = _parse_json(raw)
    result = parsed.get(result_key, [])

    _set_cache(db, paper_id, cache_key, json.dumps(result, ensure_ascii=False))
    return result


# ── Public API ────────────────────────────────────────────────────────────────


async def _stream_cached_text(
    paper_id: int,
    cache_key: str,
    system: str,
    user_msg: str,
    max_tokens: int,
    db: Session,
) -> AsyncGenerator[str, None]:
    """Generic SSE streaming with cache. Shared by summary, stem analysis, etc."""
    cached = _get_cache(db, paper_id, cache_key)
    if cached:
        yield _sse({"type": "cached", "content": cached})
        yield _sse({"type": "done"})
        return

    try:
        client = get_client()
    except ValueError as e:
        yield _sse({"type": "error", "content": str(e)})
        return

    chunks: list[str] = []
    try:
        async with client.messages.stream(
            model=_resolve_model(),
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        ) as stream:
            async for chunk in stream.text_stream:
                chunks.append(chunk)
                yield _sse({"type": "chunk", "content": chunk})

        with db_session() as sdb:
            _set_cache(sdb, paper_id, cache_key, "".join(chunks))
        yield _sse({"type": "done"})
    except anthropic.APIError as e:
        yield _sse({"type": "error", "content": f"AI API 오류: {e.message}"})


async def stream_summary(
    paper_id: int, full_text: str, db: Session
) -> AsyncGenerator[str, None]:
    """Stream a paper summary via SSE."""
    async for event in _stream_cached_text(
        paper_id, "summary",
        SUMMARY_SYSTEM, SUMMARY_USER.format(text=_truncate(full_text)),
        2000, db,
    ):
        yield event


async def stream_explain(
    selected_text: str,
    context: str,
    content_type: str,
) -> AsyncGenerator[str, None]:
    """Stream an explanation of the selected text via SSE."""
    try:
        client = get_client()
    except ValueError as e:
        yield _sse({"type": "error", "content": str(e)})
        return

    context_section = f"주변 맥락:\n{context}" if context else ""
    user_msg = EXPLAIN_USER.format(
        selected_text=selected_text,
        context_section=context_section,
        content_type=content_type,
    )

    try:
        async with client.messages.stream(
            model=_resolve_model(),
            max_tokens=2000,
            system=EXPLAIN_SYSTEM,
            messages=[{"role": "user", "content": user_msg}],
        ) as stream:
            async for chunk in stream.text_stream:
                yield _sse({"type": "chunk", "content": chunk})
        yield _sse({"type": "done"})
    except anthropic.APIError as e:
        yield _sse({"type": "error", "content": f"AI API 오류: {e.message}"})


async def stream_translate(
    text: str,
    target_language: str,
    paper_id: int,
    page: int,
    db: Session,
) -> AsyncGenerator[str, None]:
    """Stream a translation of the given text via SSE. Caches per paper+page."""
    text_hash = hashlib.sha256(text.encode()).hexdigest()[:16]
    cache_key = f"translate_p{page}_{target_language}_{text_hash}"
    cached = _get_cache(db, paper_id, cache_key)
    if cached:
        yield _sse({"type": "cached", "content": cached})
        yield _sse({"type": "done"})
        return

    try:
        client = get_client()
    except ValueError as e:
        yield _sse({"type": "error", "content": str(e)})
        return

    lang_names = {"ko": "한국어", "en": "English", "ja": "日本語", "zh": "中文"}
    lang_display = lang_names.get(target_language, target_language)

    user_msg = TRANSLATE_USER.format(text=text, target_language=lang_display)
    full_response = ""
    try:
        async with client.messages.stream(
            model=_resolve_model(),
            max_tokens=4000,
            system=TRANSLATE_SYSTEM,
            messages=[{"role": "user", "content": user_msg}],
        ) as stream:
            async for chunk in stream.text_stream:
                full_response += chunk
                yield _sse({"type": "chunk", "content": chunk})

        with db_session() as sdb:
            _set_cache(sdb, paper_id, cache_key, full_response)
        yield _sse({"type": "done"})
    except anthropic.APIError as e:
        yield _sse({"type": "error", "content": f"AI API 오류: {e.message}"})


async def get_auto_highlights(
    paper_id: int,
    full_text: str,
    structured_content: dict,
    db: Session,
) -> list[dict]:
    """Return auto-highlights with matched bboxes. Uses cache if available."""
    cached = _get_cache(db, paper_id, "auto_highlight")
    if cached:
        return json.loads(cached)

    client = get_client()
    text = _truncate(full_text)

    response = await client.messages.create(
        model=_resolve_model(),
        max_tokens=4000,
        system=AUTO_HIGHLIGHT_SYSTEM,
        messages=[
            {"role": "user", "content": AUTO_HIGHLIGHT_USER.format(text=text)},
        ],
    )

    raw = response.content[0].text
    parsed = _parse_json(raw)
    highlights = parsed.get("highlights", [])

    result = match_highlights_to_bboxes(highlights, structured_content)
    _set_cache(db, paper_id, "auto_highlight", json.dumps(result, ensure_ascii=False))
    return result


async def stream_chat(
    paper_id: int,
    question: str,
    mode: ChatMode,
    full_text: str,
    structured_content: dict | None,
    db: Session,
) -> AsyncGenerator[str, None]:
    """Stream an AI chat response about the paper via SSE. Persists messages."""
    try:
        client = get_client()
    except ValueError as e:
        yield _sse({"type": "error", "content": str(e)})
        return

    # Fetch prior history (before saving the new user message)
    prior = (
        db.query(ChatMessage)
        .filter(ChatMessage.paper_id == paper_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(10)
        .all()
    )
    prior.reverse()

    # db is still alive here (before first yield), safe to use directly
    db.add(ChatMessage(paper_id=paper_id, role="user", content=question, mode=mode))
    db.commit()

    context = select_context(question, full_text, structured_content, mode)

    messages: list[dict] = [{"role": m.role, "content": m.content} for m in prior]
    messages.append({"role": "user", "content": CHAT_USER.format(context=context, question=question)})

    mode_instruction = CHAT_MODE_INSTRUCTIONS.get(mode, CHAT_MODE_INSTRUCTIONS["general"])
    system = f"{CHAT_SYSTEM_BASE}\n\n{mode_instruction}"

    full_response = ""
    try:
        async with client.messages.stream(
            model=_resolve_model(),
            max_tokens=3000,
            system=system,
            messages=messages,
        ) as stream:
            async for chunk in stream.text_stream:
                full_response += chunk
                yield _sse({"type": "chunk", "content": chunk})

        with db_session() as sdb:
            sdb.add(ChatMessage(paper_id=paper_id, role="assistant", content=full_response, mode=mode))
            sdb.commit()
        yield _sse({"type": "done"})
    except anthropic.APIError as e:
        yield _sse({"type": "error", "content": f"AI API 오류: {e.message}"})


def get_chat_history(paper_id: int, db: Session) -> list[ChatMessage]:
    """Return chat history for a paper as ORM objects."""
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.paper_id == paper_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )


async def get_citations(
    paper_id: int, full_text: str, db: Session
) -> list[dict]:
    """Extract and summarize citations from the paper. Uses cache."""
    text = _truncate(full_text)
    return await _cached_json_call(
        paper_id, "citations",
        CITATIONS_SYSTEM,
        CITATIONS_USER.format(text=text),
        "citations", db,
    )


# ── STEM Analysis Public API ─────────────────────────────────────────────────


async def stream_stem_analysis(
    paper_id: int, full_text: str, db: Session
) -> AsyncGenerator[str, None]:
    """Stream 8-step STEM structural analysis via SSE."""
    async for event in _stream_cached_text(
        paper_id, "stem_analysis",
        STEM_ANALYSIS_SYSTEM, STEM_ANALYSIS_USER.format(text=_truncate(full_text)),
        4000, db,
    ):
        yield event


async def get_numerical_tables(
    paper_id: int, full_text: str, db: Session
) -> list[dict]:
    """Extract numerical data tables (input/output/comparison)."""
    text = _truncate(full_text)
    return await _cached_json_call(
        paper_id, "numerical_tables",
        NUMERICAL_TABLE_SYSTEM,
        NUMERICAL_TABLE_USER.format(text=text),
        "tables", db,
    )


async def get_formula_analysis(
    paper_id: int, full_text: str, db: Session
) -> list[dict]:
    """Analyze formulas: variables, units, dimensional consistency."""
    text = _truncate(full_text)
    return await _cached_json_call(
        paper_id, "formula_analysis",
        FORMULA_ANALYSIS_SYSTEM,
        FORMULA_ANALYSIS_USER.format(text=text),
        "formulas", db,
    )
