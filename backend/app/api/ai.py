import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_user_paper_with_text
from app.auth import get_current_user
from app.database import get_db
from app.models.schemas import (
    AutoHighlightResponse,
    ChatMessageResponse,
    ChatRequest,
    CitationsResponse,
    ExplainRequest,
    FormulaRequest,
    FormulaResponse,
    TranslateRequest,
)
from app.models.user import User
from app.services import ai_service
from app.services.formula_extractor import extract_formula_latex

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])

_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


@router.post("/summary/{paper_id}")
async def summary(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = get_user_paper_with_text(paper_id, user, db)
    return StreamingResponse(
        ai_service.stream_summary(paper_id, paper.full_text, db),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/auto-highlight/{paper_id}", response_model=AutoHighlightResponse)
async def auto_highlight(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = get_user_paper_with_text(paper_id, user, db)
    try:
        highlights = await ai_service.get_auto_highlights(
            paper_id, paper.full_text, paper.structured_content or {}, db
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("Auto-highlight failed for paper %d", paper_id)
        raise HTTPException(status_code=500, detail="AI 처리 중 오류가 발생했습니다.")
    return {"highlights": highlights}


@router.post("/explain/{paper_id}")
async def explain(
    paper_id: int,
    body: ExplainRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_user_paper_with_text(paper_id, user, db)
    return StreamingResponse(
        ai_service.stream_explain(
            selected_text=body.selected_text,
            context=body.context,
            content_type=body.content_type,
        ),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/translate/{paper_id}")
async def translate(
    paper_id: int,
    body: TranslateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_user_paper_with_text(paper_id, user, db)
    return StreamingResponse(
        ai_service.stream_translate(
            text=body.text,
            target_language=body.target_language,
            paper_id=paper_id,
            page=body.page,
            db=db,
        ),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/formula/{paper_id}", response_model=FormulaResponse)
async def formula(
    paper_id: int,
    body: FormulaRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = get_user_paper_with_text(paper_id, user, db)
    try:
        latex = await extract_formula_latex(
            file_path=paper.file_path,
            page=body.page,
            bbox=body.bbox,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("Formula extraction failed for paper %d", paper_id)
        raise HTTPException(status_code=500, detail="수식 추출 중 오류가 발생했습니다.")
    return {"latex": latex, "page": body.page}


@router.post("/chat/{paper_id}")
async def chat(
    paper_id: int,
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = get_user_paper_with_text(paper_id, user, db)
    return StreamingResponse(
        ai_service.stream_chat(
            paper_id=paper_id,
            question=body.question,
            mode=body.mode,
            full_text=paper.full_text,
            structured_content=paper.structured_content,
            db=db,
        ),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.get("/chat/{paper_id}/history", response_model=list[ChatMessageResponse])
async def chat_history(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_user_paper_with_text(paper_id, user, db)
    return ai_service.get_chat_history(paper_id, db)


@router.post("/citations/{paper_id}", response_model=CitationsResponse)
async def citations(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = get_user_paper_with_text(paper_id, user, db)
    try:
        result = await ai_service.get_citations(paper_id, paper.full_text, db)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("Citation extraction failed for paper %d", paper_id)
        raise HTTPException(status_code=500, detail="인용 분석 중 오류가 발생했습니다.")
    return {"citations": result}
