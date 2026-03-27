from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ChatMode = Literal["general", "limitations", "connections"]
ContentType = Literal["sentence", "table", "formula"]
TargetLanguage = Literal["ko", "en", "ja", "zh"]


class PaperResponse(BaseModel):
    id: int
    title: str
    authors: list[str] = []
    filename: str
    upload_date: datetime
    total_pages: int
    tags: list[str] = []

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
    selected_text: str = Field(..., max_length=10_000)
    context: str = Field("", max_length=50_000)
    content_type: ContentType = "sentence"
    page: int = Field(1, ge=1)


class TranslateRequest(BaseModel):
    text: str = Field(..., max_length=100_000)
    page: int = Field(1, ge=1)
    target_language: TargetLanguage = "ko"


class BBox(BaseModel):
    x: float = Field(..., ge=0, le=10_000)
    y: float = Field(..., ge=0, le=10_000)
    w: float = Field(..., gt=0, le=5_000)
    h: float = Field(..., gt=0, le=5_000)


class FormulaRequest(BaseModel):
    page: int = Field(..., ge=1)
    bbox: BBox


class FormulaResponse(BaseModel):
    latex: str
    page: int


# ── Chat / Citation Schemas ──────────────────────────────────────────────────


class ChatRequest(BaseModel):
    question: str = Field(..., max_length=5_000)
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


# ── User Highlight Schemas ─────────────────────────────────────────────────


HighlightColor = Literal["yellow", "green", "blue", "pink", "purple"]


class UserHighlightCreate(BaseModel):
    text: str = Field(..., max_length=50_000)
    color: HighlightColor = "yellow"
    page: int
    note: str | None = Field(None, max_length=10_000)


class UserHighlightUpdate(BaseModel):
    color: HighlightColor | None = None
    note: str | None = Field(None, max_length=10_000)


class UserHighlightResponse(BaseModel):
    id: int
    paper_id: int
    text: str
    color: str
    page: int
    note: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
