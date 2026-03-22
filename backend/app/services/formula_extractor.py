import base64

import fitz  # PyMuPDF

from app.config import settings
from app.services.ai_service import _get_client

FORMULA_SYSTEM = (
    "You are a LaTeX extraction assistant. "
    "Given an image of a mathematical formula from an academic paper, "
    "extract the exact LaTeX representation. "
    "Return ONLY the LaTeX code, without any surrounding delimiters like $$ or \\[ \\]. "
    "Do not include any explanation."
)


async def extract_formula_latex(
    file_path: str,
    page: int,
    bbox: dict,
) -> str:
    """Extract a formula region from a PDF page and convert to LaTeX via Vision API.

    Args:
        file_path: Path to the PDF file
        page: 1-based page number
        bbox: dict with x, y, w, h in PDF coordinates (72 DPI)

    Returns:
        LaTeX string
    """
    with fitz.open(file_path) as doc:
        pdf_page = doc[page - 1]  # 0-based

        padding = 4
        clip = fitz.Rect(
            bbox["x"] - padding,
            bbox["y"] - padding,
            bbox["x"] + bbox["w"] + padding,
            bbox["y"] + bbox["h"] + padding,
        )

        mat = fitz.Matrix(3.0, 3.0)
        pix = pdf_page.get_pixmap(matrix=mat, clip=clip)
        img_bytes = pix.tobytes("png")

    img_b64 = base64.b64encode(img_bytes).decode("utf-8")

    client = _get_client()
    response = await client.messages.create(
        model=settings.claude_model,
        max_tokens=1000,
        system=FORMULA_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": img_b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": "이 수식의 LaTeX를 추출해 주세요.",
                    },
                ],
            }
        ],
    )

    latex = response.content[0].text.strip()
    # Clean up if model wraps in delimiters
    for prefix in ("$$", "\\[", "$"):
        if latex.startswith(prefix):
            latex = latex[len(prefix) :]
    for suffix in ("$$", "\\]", "$"):
        if latex.endswith(suffix):
            latex = latex[: -len(suffix)]

    return latex.strip()
