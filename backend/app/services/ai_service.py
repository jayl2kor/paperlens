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
    "Given a research paper's full text, provide a structured summary in Korean."
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
- "reason"은 한국어로 중요한 이유 설명 (1문장)
- 총 6-9개 하이라이트

JSON 형식:
{{"highlights": [{{"category": "novelty", "text": "exact quote", "reason": "이유"}}]}}

논문 전문:
{text}"""

# ── Helpers ───────────────────────────────────────────────────────────────────

MAX_TEXT_CHARS = 600_000  # ~150K tokens

_NO_KEY_MSG = "ANTHROPIC_API_KEY가 설정되지 않았습니다."

_client: anthropic.AsyncAnthropic | None = None


def get_client() -> anthropic.AsyncAnthropic:
    """Return a shared AsyncAnthropic client instance."""
    global _client
    if not settings.anthropic_api_key:
        raise ValueError(_NO_KEY_MSG)
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


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
        model=settings.claude_model,
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


async def stream_summary(
    paper_id: int, full_text: str, db: Session
) -> AsyncGenerator[str, None]:
    """Stream a paper summary via SSE. Returns cached result if available."""
    cached = _get_cache(db, paper_id, "summary")
    if cached:
        yield _sse({"type": "cached", "content": cached})
        yield _sse({"type": "done"})
        return

    try:
        client = get_client()
    except ValueError as e:
        yield _sse({"type": "error", "content": str(e)})
        return

    text = _truncate(full_text)
    full_response = ""
    try:
        async with client.messages.stream(
            model=settings.claude_model,
            max_tokens=2000,
            system=SUMMARY_SYSTEM,
            messages=[
                {"role": "user", "content": SUMMARY_USER.format(text=text)},
            ],
        ) as stream:
            async for chunk in stream.text_stream:
                full_response += chunk
                yield _sse({"type": "chunk", "content": chunk})

        # Use a fresh session — the original may be closed by FastAPI
        with db_session() as sdb:
            _set_cache(sdb, paper_id, "summary", full_response)
        yield _sse({"type": "done"})
    except anthropic.APIError as e:
        yield _sse({"type": "error", "content": f"AI API 오류: {e.message}"})


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
            model=settings.claude_model,
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
    text_hash = hashlib.md5(text.encode()).hexdigest()[:8]
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
            model=settings.claude_model,
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
        model=settings.claude_model,
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
            model=settings.claude_model,
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
