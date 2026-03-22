from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ChatMode = Literal["general", "limitations", "connections"]


class PaperResponse(BaseModel):
    id: int
    title: str
    filename: str
    upload_date: datetime
    total_pages: int

    model_config = {"from_attributes": True}


class PaperDetailResponse(PaperResponse):
    full_text: str | None = None
    structured_content: dict | None = None


# ── AI Schemas ────────────────────────────────────────────────────────────────


class HighlightItem(BaseModel):
    category: str  # novelty, method, result
    text: str
    reason: str
    page: int
    bbox: dict  # {x, y, w, h}
    page_width: float
    page_height: float


class AutoHighlightResponse(BaseModel):
    highlights: list[HighlightItem]


# ── Explain / Translate / Formula Schemas ────────────────────────────────────


class ExplainRequest(BaseModel):
    selected_text: str
    context: str = ""  # surrounding text for better explanation
    content_type: str = "sentence"  # sentence, table, formula
    page: int = 1


class TranslateRequest(BaseModel):
    text: str
    page: int = 1
    target_language: str = "ko"


class FormulaRequest(BaseModel):
    page: int
    bbox: dict  # {x, y, w, h} in PDF coordinates


class FormulaResponse(BaseModel):
    latex: str
    page: int


# ── Chat / Citation Schemas ──────────────────────────────────────────────────


class ChatRequest(BaseModel):
    question: str
    mode: ChatMode = "general"


class ChatMessageResponse(BaseModel):
    id: int
    role: str
    content: str
    mode: ChatMode
    created_at: datetime

    model_config = {"from_attributes": True}


class CitationItem(BaseModel):
    number: int  # e.g. 1 for [1]
    raw_text: str  # original reference text
    summary: str  # AI-generated summary


class CitationsResponse(BaseModel):
    citations: list[CitationItem]
