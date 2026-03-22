from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.paper import Paper
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
from app.services import ai_service
from app.services.formula_extractor import extract_formula_latex

router = APIRouter(prefix="/api/ai", tags=["ai"])

_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def _get_paper(paper_id: int, db: Session) -> Paper:
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    if not paper.full_text:
        raise HTTPException(status_code=422, detail="Paper has no extracted text")
    return paper


@router.post("/summary/{paper_id}")
async def summary(paper_id: int, db: Session = Depends(get_db)):
    paper = _get_paper(paper_id, db)
    return StreamingResponse(
        ai_service.stream_summary(paper_id, paper.full_text, db),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/auto-highlight/{paper_id}", response_model=AutoHighlightResponse)
async def auto_highlight(paper_id: int, db: Session = Depends(get_db)):
    paper = _get_paper(paper_id, db)
    try:
        highlights = await ai_service.get_auto_highlights(
            paper_id, paper.full_text, paper.structured_content or {}, db
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 처리 오류: {e}")
    return {"highlights": highlights}


@router.post("/explain/{paper_id}")
async def explain(paper_id: int, body: ExplainRequest, db: Session = Depends(get_db)):
    _get_paper(paper_id, db)  # validate paper exists
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
    paper_id: int, body: TranslateRequest, db: Session = Depends(get_db)
):
    _get_paper(paper_id, db)  # validate paper exists
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
    paper_id: int, body: FormulaRequest, db: Session = Depends(get_db)
):
    paper = _get_paper(paper_id, db)
    try:
        latex = await extract_formula_latex(
            file_path=paper.file_path,
            page=body.page,
            bbox=body.bbox,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"수식 추출 오류: {e}")
    return {"latex": latex, "page": body.page}


@router.post("/chat/{paper_id}")
async def chat(paper_id: int, body: ChatRequest, db: Session = Depends(get_db)):
    paper = _get_paper(paper_id, db)
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
async def chat_history(paper_id: int, db: Session = Depends(get_db)):
    return ai_service.get_chat_history(paper_id, db)


@router.post("/citations/{paper_id}", response_model=CitationsResponse)
async def citations(paper_id: int, db: Session = Depends(get_db)):
    paper = _get_paper(paper_id, db)
    try:
        result = await ai_service.get_citations(paper_id, paper.full_text, db)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"인용 분석 오류: {e}")
    return {"citations": result}
