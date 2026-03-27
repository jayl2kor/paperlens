import re
from pathlib import Path

import fitz  # PyMuPDF


def extract_pdf_data(file_path: str) -> dict:
    """Extract text and structured content from a PDF file.

    Returns:
        dict with keys:
        - title: extracted or inferred title
        - authors: list of author names
        - total_pages: number of pages
        - full_text: concatenated text of all pages
        - structured_content: per-page text blocks with bounding boxes
    """
    doc = fitz.open(file_path)

    # Parse first page once, share with title/author extractors
    first_page_blocks = (
        doc[0].get_text("dict")["blocks"] if len(doc) > 0 else []
    )
    title = _extract_title(doc, first_page_blocks)
    authors = _extract_authors(doc, first_page_blocks)
    full_text_parts: list[str] = []
    pages: list[dict] = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text")
        full_text_parts.append(text)

        blocks = []
        for block in page.get_text("dict")["blocks"]:
            if block["type"] == 0:  # text block
                block_text = ""
                line_infos = []
                for line in block["lines"]:
                    line_text = ""
                    for span in line["spans"]:
                        line_text += span["text"]
                    block_text += line_text + "\n"
                    lb = line["bbox"]
                    line_infos.append({
                        "text": line_text.strip(),
                        "bbox": {
                            "x": lb[0], "y": lb[1],
                            "w": lb[2] - lb[0], "h": lb[3] - lb[1],
                        },
                    })

                blocks.append(
                    {
                        "text": block_text.strip(),
                        "bbox": {
                            "x": block["bbox"][0],
                            "y": block["bbox"][1],
                            "w": block["bbox"][2] - block["bbox"][0],
                            "h": block["bbox"][3] - block["bbox"][1],
                        },
                        "type": "text",
                        "lines": line_infos,
                    }
                )
            elif block["type"] == 1:  # image block
                blocks.append(
                    {
                        "text": "",
                        "bbox": {
                            "x": block["bbox"][0],
                            "y": block["bbox"][1],
                            "w": block["bbox"][2] - block["bbox"][0],
                            "h": block["bbox"][3] - block["bbox"][1],
                        },
                        "type": "image",
                    }
                )

        pages.append(
            {
                "page_number": page_num + 1,  # 1-based
                "text": text,
                "blocks": blocks,
                "width": page.rect.width,
                "height": page.rect.height,
            }
        )

    doc.close()

    return {
        "title": title,
        "authors": authors,
        "total_pages": len(pages),
        "full_text": "\n\n".join(full_text_parts),
        "structured_content": {"pages": pages},
    }


def _extract_title(doc: fitz.Document, first_page_blocks: list[dict]) -> str:
    """Try to extract the title from PDF metadata or first page."""
    metadata = doc.metadata
    if metadata and metadata.get("title"):
        title = metadata["title"].strip()
        if title and not _is_non_title(title):
            return title

    if len(doc) == 0:
        return Path(doc.name).stem if doc.name else "Untitled"

    page = doc[0]
    blocks = first_page_blocks
    lines_info: list[dict] = []

    for block in blocks:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            spans = line["spans"]
            parts = []
            sizes = []
            for i, span in enumerate(spans):
                text = span["text"]
                if not text.strip():
                    # Whitespace-only span — keep it as a separator
                    parts.append(" ")
                    continue
                parts.append(text)
                sizes.append(span["size"])
            text = "".join(parts).strip()
            # Collapse multiple spaces
            text = re.sub(r" {2,}", " ", text)
            if text and sizes:
                lines_info.append({
                    "text": text,
                    "size": round(max(sizes), 1),
                    "y": line["bbox"][1],
                })

    if not lines_info:
        return Path(doc.name).stem if doc.name else "Untitled"

    # Group lines by font size, filter out non-title patterns
    size_groups: dict[float, list[dict]] = {}
    for li in lines_info:
        if _is_non_title(li["text"]):
            continue
        # Only consider lines in the top 40% of the page (titles are near the top)
        if li["y"] > page.rect.height * 0.4:
            continue
        size_groups.setdefault(li["size"], []).append(li)

    if not size_groups:
        return Path(doc.name).stem if doc.name else "Untitled"

    # Try font sizes from largest to smallest
    for size in sorted(size_groups.keys(), reverse=True):
        group = size_groups[size]
        # Sort by vertical position and join consecutive lines
        group.sort(key=lambda x: x["y"])
        candidate = " ".join(g["text"] for g in group)
        candidate = re.sub(r"\s+", " ", candidate).strip()
        # A valid title should be >5 chars and not look like a header/footer
        if len(candidate) > 5 and not _is_non_title(candidate):
            return candidate

    return Path(doc.name).stem if doc.name else "Untitled"


# Patterns that indicate text is NOT a paper title
_NON_TITLE_RE = re.compile(
    r"^(arXiv:|http|www\.|doi:|©|copyright|\d{4}\s|vol\.\s|"
    r"published\s|accepted\s|received\s|submitted\s|"
    r"proceedings\s|journal\s|conference\s|"
    r"page\s*\d|^\d+$|"
    r"under\s+review|preprint|draft|"
    r"\[cs\.|technical\s+report)",
    re.IGNORECASE,
)


def _is_non_title(text: str) -> bool:
    """Check if text matches known non-title patterns."""
    return bool(_NON_TITLE_RE.search(text.strip()))


# Patterns that indicate a line is NOT an author name
_NON_AUTHOR_PATTERNS = re.compile(
    r"^(abstract|introduction|keywords|doi:|http|www\.|©|copyright|"
    r"\d{4}\s|vol\.\s|journal\s|proceedings|university|department|"
    r"institute|school\sof|college\sof|received|accepted|published)",
    re.IGNORECASE,
)

# Email or affiliation markers — strip these from author text
_AFFILIATION_MARKERS = re.compile(
    r"[\d∗†‡§¶\*]+$|,?\s*\d+$|\{.*\}|<.*>|\(.*@.*\)"
)


def _extract_authors(doc: fitz.Document, first_page_blocks: list[dict]) -> list[str]:
    """Extract author names from PDF metadata or first page heuristics."""
    metadata = doc.metadata
    if metadata and metadata.get("author"):
        raw = metadata["author"]
        names = re.split(r"[;,]|\band\b", raw)
        authors = [n.strip() for n in names if n.strip() and len(n.strip()) > 1]
        if authors:
            return authors

    if len(doc) == 0:
        return []

    page = doc[0]
    blocks = first_page_blocks

    # Collect all text spans with their font size and vertical position
    spans_info: list[dict] = []
    for block in blocks:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            line_text_parts = []
            line_sizes = []
            for span in line["spans"]:
                line_text_parts.append(span["text"])
                line_sizes.append(span["size"])
            text = "".join(line_text_parts).strip()
            if text and line_sizes:
                spans_info.append({
                    "text": text,
                    "size": max(line_sizes),
                    "y": block["bbox"][1],
                })

    if not spans_info:
        return []

    # Find title font size (largest)
    title_size = max(s["size"] for s in spans_info)
    # Find body font size (most common, excluding title-sized)
    size_counts: dict[float, int] = {}
    for s in spans_info:
        if s["size"] < title_size - 0.5:
            rounded = round(s["size"], 1)
            size_counts[rounded] = size_counts.get(rounded, 0) + 1
    body_size = max(size_counts, key=size_counts.get) if size_counts else title_size

    # Find the title block's bottom y position
    title_bottom_y = 0.0
    for s in spans_info:
        if abs(s["size"] - title_size) < 0.5:
            title_bottom_y = max(title_bottom_y, s["y"])

    # Collect candidate author lines: between title and "Abstract" / body text start
    candidates: list[str] = []
    for s in spans_info:
        # Must be below the title
        if s["y"] <= title_bottom_y:
            continue
        text = s["text"].strip()
        # Stop at abstract or similar section headers
        if re.match(r"^(abstract|introduction)\b", text, re.IGNORECASE):
            break
        # Skip body-sized text blocks (likely abstract content)
        if abs(s["size"] - body_size) < 0.5 and len(text) > 80:
            break
        # Skip non-author patterns
        if _NON_AUTHOR_PATTERNS.match(text):
            continue
        # Skip very short or very long lines
        if len(text) < 3 or len(text) > 200:
            continue
        # Author lines are typically between body and title size
        if s["size"] >= body_size - 1:
            candidates.append(text)

    # Parse candidates into individual author names
    authors: list[str] = []
    for line in candidates:
        # Remove superscript markers and affiliation numbers
        cleaned = _AFFILIATION_MARKERS.sub("", line).strip()
        # Split by comma or " and "
        parts = re.split(r"[,;]|\band\b", cleaned)
        for part in parts:
            name = part.strip().strip("*†‡§¶ ")
            # Basic name validation: 2+ chars, contains at least one letter,
            # not a number, not an affiliation
            if (
                len(name) >= 2
                and re.search(r"[a-zA-Z\u4e00-\u9fff\uac00-\ud7af]", name)
                and not re.match(r"^\d+$", name)
                and not _NON_AUTHOR_PATTERNS.match(name)
            ):
                authors.append(name)

    return authors
