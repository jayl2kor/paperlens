from pathlib import Path

import fitz  # PyMuPDF


def extract_pdf_data(file_path: str) -> dict:
    """Extract text and structured content from a PDF file.

    Returns:
        dict with keys:
        - title: extracted or inferred title
        - total_pages: number of pages
        - full_text: concatenated text of all pages
        - structured_content: per-page text blocks with bounding boxes
    """
    doc = fitz.open(file_path)

    title = _extract_title(doc)
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
                for line in block["lines"]:
                    for span in line["spans"]:
                        block_text += span["text"]
                    block_text += "\n"

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
        "total_pages": len(pages),
        "full_text": "\n\n".join(full_text_parts),
        "structured_content": {"pages": pages},
    }


def _extract_title(doc: fitz.Document) -> str:
    """Try to extract the title from PDF metadata or first page."""
    metadata = doc.metadata
    if metadata and metadata.get("title"):
        return metadata["title"]

    # Fallback: use the largest font text on the first page
    if len(doc) > 0:
        page = doc[0]
        blocks = page.get_text("dict")["blocks"]
        max_size = 0
        title = ""
        for block in blocks:
            if block["type"] == 0:
                for line in block["lines"]:
                    for span in line["spans"]:
                        if span["size"] > max_size and len(span["text"].strip()) > 3:
                            max_size = span["size"]
                            title = span["text"].strip()
        if title:
            return title

    return Path(doc.name).stem if doc.name else "Untitled"
