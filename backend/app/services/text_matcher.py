from rapidfuzz import fuzz


def match_highlights_to_bboxes(
    highlights: list[dict], structured_content: dict
) -> list[dict]:
    """Match LLM-returned text snippets to PDF text blocks using fuzzy matching.

    Returns line-level bboxes instead of block-level for more precise highlights.
    """
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

    # Phase 3: try to narrow down to specific lines within the block
    lines = best_block.get("lines", [])
    if lines:
        bbox = _find_line_bbox(query_lower, lines)
        if bbox:
            return {
                "page": best_page["page_number"],
                "bbox": bbox,
                "page_width": best_page["width"],
                "page_height": best_page["height"],
            }

    return {
        "page": best_page["page_number"],
        "bbox": best_block["bbox"],
        "page_width": best_page["width"],
        "page_height": best_page["height"],
    }


def _find_line_bbox(query: str, lines: list[dict]) -> dict | None:
    """Find the tightest bounding box covering the matched lines."""
    # Build full text from lines and find best matching span
    best_start_line = 0
    best_end_line = 0
    best_score = 0

    for start in range(len(lines)):
        text_acc = ""
        for end in range(start, min(start + 5, len(lines))):
            line_text = lines[end].get("text", "")
            text_acc = (text_acc + " " + line_text).strip()
            score = fuzz.partial_ratio(query, text_acc.lower())
            if score > best_score:
                best_score = score
                best_start_line = start
                best_end_line = end

    if best_score < 70:
        return None

    # Merge bboxes of matched lines
    matched_lines = lines[best_start_line : best_end_line + 1]
    x_min = min(ln["bbox"]["x"] for ln in matched_lines)
    y_min = min(ln["bbox"]["y"] for ln in matched_lines)
    x_max = max(ln["bbox"]["x"] + ln["bbox"]["w"] for ln in matched_lines)
    y_max = max(ln["bbox"]["y"] + ln["bbox"]["h"] for ln in matched_lines)

    return {"x": x_min, "y": y_min, "w": x_max - x_min, "h": y_max - y_min}
