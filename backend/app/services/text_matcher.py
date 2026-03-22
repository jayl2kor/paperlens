from rapidfuzz import fuzz


def match_highlights_to_bboxes(
    highlights: list[dict], structured_content: dict
) -> list[dict]:
    """Match LLM-returned text snippets to PDF text blocks using fuzzy matching."""
    pages = structured_content.get("pages", [])
    result = []

    for hl in highlights:
        query = hl.get("text", "")
        if not query:
            continue

        matched = _find_best_match(query, pages)
        if matched:
            result.append(
                {
                    "category": hl.get("category", ""),
                    "text": hl["text"],
                    "reason": hl.get("reason", ""),
                    **matched,
                }
            )

    return result


def _find_best_match(query: str, pages: list[dict]) -> dict | None:
    query_lower = query.lower()

    # Phase 1: find best page
    best_page = None
    best_page_score = 0
    for page in pages:
        page_text = page.get("text", "")
        if not page_text:
            continue
        score = fuzz.partial_ratio(query_lower, page_text.lower())
        if score > best_page_score:
            best_page_score = score
            best_page = page

    if not best_page or best_page_score < 60:
        return None

    # Phase 2: find best block on that page
    best_block = None
    best_block_score = 0
    for block in best_page.get("blocks", []):
        if block["type"] != "text" or not block.get("text"):
            continue
        score = fuzz.partial_ratio(query_lower, block["text"].lower())
        if score > best_block_score:
            best_block_score = score
            best_block = block

    if not best_block or best_block_score < 50:
        return None

    return {
        "page": best_page["page_number"],
        "bbox": best_block["bbox"],
        "page_width": best_page["width"],
        "page_height": best_page["height"],
    }
