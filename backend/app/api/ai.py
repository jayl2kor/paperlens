import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import (
    GUEST_AI_COOKIE,
    check_guest_ai_limit,
    get_accessible_paper_with_text,
)
from app.auth import get_optional_user
from app.database import get_db
from app.services.figure_analyzer import get_figure_analyzer
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
_COOKIE_MAX_AGE = 86400


def _stamp_guest_cookie(response: Response, user: User | None) -> None:
    """Set the daily AI-limit cookie for guest users."""
    if user is None:
        response.set_cookie(
            GUEST_AI_COOKIE,
            date.today().isoformat(),
            max_age=_COOKIE_MAX_AGE,
            samesite="lax",
            path="/",
            httponly=True,
        )


def _sse_headers(user: User | None) -> dict[str, str]:
    """SSE headers, with AI-limit cookie for guests."""
    headers = dict(_SSE_HEADERS)
    if user is None:
        today = date.today().isoformat()
        headers["Set-Cookie"] = (
            f"{GUEST_AI_COOKIE}={today}; Path=/; Max-Age={_COOKIE_MAX_AGE}; SameSite=Lax; HttpOnly"
        )
    return headers


@router.post("/summary/{paper_id}")
async def summary(
    paper_id: int,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    check_guest_ai_limit(user, request)
    paper = get_accessible_paper_with_text(paper_id, user, request, db)
    return StreamingResponse(
        ai_service.stream_summary(paper_id, paper.full_text, db),
        media_type="text/event-stream",
        headers=_sse_headers(user),
    )


@router.post("/auto-highlight/{paper_id}", response_model=AutoHighlightResponse)
async def auto_highlight(
    paper_id: int,
    request: Request,
    response: Response,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    check_guest_ai_limit(user, request)
    paper = get_accessible_paper_with_text(paper_id, user, request, db)
    try:
        highlights = await ai_service.get_auto_highlights(
            paper_id, paper.full_text, paper.structured_content or {}, db
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("Auto-highlight failed for paper %d", paper_id)
        raise HTTPException(status_code=500, detail="AI 처리 중 오류가 발생했습니다.")
    _stamp_guest_cookie(response, user)
    return {"highlights": highlights}


@router.post("/explain/{paper_id}")
async def explain(
    paper_id: int,
    body: ExplainRequest,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    check_guest_ai_limit(user, request)
    get_accessible_paper_with_text(paper_id, user, request, db)
    return StreamingResponse(
        ai_service.stream_explain(
            selected_text=body.selected_text,
            context=body.context,
            content_type=body.content_type,
        ),
        media_type="text/event-stream",
        headers=_sse_headers(user),
    )


@router.post("/translate/{paper_id}")
async def translate(
    paper_id: int,
    body: TranslateRequest,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    check_guest_ai_limit(user, request)
    get_accessible_paper_with_text(paper_id, user, request, db)
    return StreamingResponse(
        ai_service.stream_translate(
            text=body.text,
            target_language=body.target_language,
            paper_id=paper_id,
            page=body.page,
            db=db,
        ),
        media_type="text/event-stream",
        headers=_sse_headers(user),
    )


@router.post("/formula/{paper_id}", response_model=FormulaResponse)
async def formula(
    paper_id: int,
    body: FormulaRequest,
    request: Request,
    response: Response,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    check_guest_ai_limit(user, request)
    paper = get_accessible_paper_with_text(paper_id, user, request, db)
    try:
        latex = await extract_formula_latex(
            file_path=paper.file_path,
            page=body.page,
            bbox=body.bbox.model_dump(),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("Formula extraction failed for paper %d", paper_id)
        raise HTTPException(status_code=500, detail="수식 추출 중 오류가 발생했습니다.")
    _stamp_guest_cookie(response, user)
    return {"latex": latex, "page": body.page}


@router.post("/chat/{paper_id}")
async def chat(
    paper_id: int,
    body: ChatRequest,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    check_guest_ai_limit(user, request)
    paper = get_accessible_paper_with_text(paper_id, user, request, db)
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
        headers=_sse_headers(user),
    )


@router.get("/chat/{paper_id}/history", response_model=list[ChatMessageResponse])
async def chat_history(
    paper_id: int,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    get_accessible_paper_with_text(paper_id, user, request, db)
    return ai_service.get_chat_history(paper_id, db)


@router.post("/citations/{paper_id}", response_model=CitationsResponse)
async def citations(
    paper_id: int,
    request: Request,
    response: Response,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    check_guest_ai_limit(user, request)
    paper = get_accessible_paper_with_text(paper_id, user, request, db)
    try:
        result = await ai_service.get_citations(paper_id, paper.full_text, db)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("Citation extraction failed for paper %d", paper_id)
        raise HTTPException(status_code=500, detail="인용 분석 중 오류가 발생했습니다.")
    _stamp_guest_cookie(response, user)
    return {"citations": result}


# ── STEM Analysis Endpoints ──────────────────────────────────────────────────


@router.post("/stem-analysis/{paper_id}")
async def stem_analysis(
    paper_id: int,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    check_guest_ai_limit(user, request)
    paper = get_accessible_paper_with_text(paper_id, user, request, db)
    return StreamingResponse(
        ai_service.stream_stem_analysis(paper_id, paper.full_text, db),
        media_type="text/event-stream",
        headers=_sse_headers(user),
    )


@router.post("/numerical-tables/{paper_id}")
async def numerical_tables(
    paper_id: int,
    request: Request,
    response: Response,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    check_guest_ai_limit(user, request)
    paper = get_accessible_paper_with_text(paper_id, user, request, db)
    try:
        tables = await ai_service.get_numerical_tables(paper_id, paper.full_text, db)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("Numerical table extraction failed for paper %d", paper_id)
        raise HTTPException(status_code=500, detail="데이터 테이블 추출 중 오류가 발생했습니다.")
    _stamp_guest_cookie(response, user)
    return {"tables": tables}


@router.post("/formula-analysis/{paper_id}")
async def formula_analysis(
    paper_id: int,
    request: Request,
    response: Response,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    check_guest_ai_limit(user, request)
    paper = get_accessible_paper_with_text(paper_id, user, request, db)
    try:
        formulas = await ai_service.get_formula_analysis(paper_id, paper.full_text, db)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("Formula analysis failed for paper %d", paper_id)
        raise HTTPException(status_code=500, detail="수식 분석 중 오류가 발생했습니다.")
    _stamp_guest_cookie(response, user)
    return {"formulas": formulas}


@router.post("/figure-analysis/{paper_id}")
async def figure_analysis(
    paper_id: int,
    request: Request,
    response: Response,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    check_guest_ai_limit(user, request)
    paper = get_accessible_paper_with_text(paper_id, user, request, db)
    try:
        analyzer = get_figure_analyzer()
        figures = await analyzer.analyze(
            paper_id, paper.full_text, paper.structured_content, paper.file_path, db
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("Figure analysis failed for paper %d", paper_id)
        raise HTTPException(status_code=500, detail="그래프 분석 중 오류가 발생했습니다.")
    _stamp_guest_cookie(response, user)
    return {"figures": figures}
