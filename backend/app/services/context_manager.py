"""Select relevant paper sections for chat context based on the user's question."""

import re

MAX_CONTEXT_CHARS = 200_000  # ~50K tokens — leave room for system prompt + history


def select_context(
    question: str,
    full_text: str,
    structured_content: dict | None,
    mode: str = "general",
) -> str:
    """Return the most relevant portion of the paper for the given question.

    For short papers (under limit), returns the full text.
    For long papers, scores each page by keyword relevance and returns the
    top-scoring pages plus the first and last pages (intro + conclusion).
    """
    if len(full_text) <= MAX_CONTEXT_CHARS:
        return full_text

    pages = _get_pages(full_text, structured_content)
    if not pages:
        # Fallback: truncate
        return full_text[:MAX_CONTEXT_CHARS]

    keywords = _extract_keywords(question)

    # Always include first 2 pages (abstract/intro) and last 2 pages (conclusion/references)
    must_include = set()
    if len(pages) > 0:
        must_include.update(range(min(2, len(pages))))
        must_include.update(range(max(0, len(pages) - 2), len(pages)))

    # Mode-specific boosting
    mode_keywords = {
        "limitations": ["limitation", "future work", "weakness", "drawback", "shortcoming", "challenge"],
        "connections": ["related work", "prior", "previous", "comparison", "baseline", "existing"],
    }
    keywords.extend(mode_keywords.get(mode, []))

    # Score pages by keyword overlap
    scored: list[tuple[int, float]] = []
    for i, page_text in enumerate(pages):
        if i in must_include:
            continue
        score = _score_page(page_text, keywords)
        scored.append((i, score))

    scored.sort(key=lambda x: x[1], reverse=True)

    # Build context: must_include + top-scoring pages until budget
    selected_indices = sorted(must_include)
    budget = MAX_CONTEXT_CHARS - sum(len(pages[i]) for i in selected_indices)

    for idx, _score in scored:
        if budget <= 0:
            break
        page_len = len(pages[idx])
        if page_len <= budget:
            selected_indices.append(idx)
            budget -= page_len

    selected_indices.sort()

    parts: list[str] = []
    prev_idx = -1
    for idx in selected_indices:
        if prev_idx >= 0 and idx > prev_idx + 1:
            parts.append(f"\n\n[...페이지 {prev_idx + 2}-{idx} 생략...]\n\n")
        parts.append(pages[idx])
        prev_idx = idx

    return "".join(parts)


def _get_pages(full_text: str, structured_content: dict | None) -> list[str]:
    """Extract per-page text from structured_content or split by heuristic."""
    if structured_content and "pages" in structured_content:
        return [p.get("text", "") for p in structured_content["pages"]]

    # Fallback: split by form-feed or by ~3000 char chunks
    if "\f" in full_text:
        return full_text.split("\f")

    chunk_size = 3000
    return [full_text[i : i + chunk_size] for i in range(0, len(full_text), chunk_size)]


def _extract_keywords(question: str) -> list[str]:
    """Extract meaningful keywords from the question."""
    stop_words = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been",
        "what", "how", "why", "which", "where", "when", "who",
        "this", "that", "these", "those", "it", "its",
        "of", "in", "on", "at", "to", "for", "with", "by", "from",
        "and", "or", "but", "not", "do", "does", "did",
        "이", "그", "저", "는", "은", "을", "를", "의", "에", "에서",
        "가", "이", "와", "과", "도", "로", "으로", "하", "한", "할",
        "무엇", "어떻게", "왜", "어디",
    }
    words = re.findall(r"[a-zA-Z가-힣]{2,}", question.lower())
    return [w for w in words if w not in stop_words]


def _score_page(page_text: str, keywords: list[str]) -> float:
    """Score a page by exact keyword substring matches."""
    text_lower = page_text.lower()
    score = 0.0
    for kw in keywords:
        # Count occurrences for higher-signal scoring
        count = text_lower.count(kw)
        if count > 0:
            score += 10.0 + min(count - 1, 5) * 2.0
    return score
