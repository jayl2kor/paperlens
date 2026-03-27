"""Shared FastAPI dependencies for paper ownership and guest access."""

from datetime import date

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.models.paper import Paper
from app.models.user import User

GUEST_AI_COOKIE = "pi_ai_date"
GUEST_ID_COOKIE = "pi_guest"


def get_guest_id(request: Request) -> str | None:
    """Extract guest session ID from middleware state or cookie."""
    return getattr(request.state, "guest_id", None) or request.cookies.get(GUEST_ID_COOKIE)


def get_accessible_paper(
    paper_id: int, user: User | None, request: Request, db: Session
) -> Paper:
    """Fetch a paper accessible to the current user or guest."""
    if user:
        paper = (
            db.query(Paper)
            .filter(Paper.id == paper_id, Paper.user_id == user.id)
            .first()
        )
    else:
        guest_id = get_guest_id(request)
        paper = (
            db.query(Paper)
            .filter(Paper.id == paper_id, Paper.guest_id == guest_id)
            .first()
        )
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    return paper


def get_accessible_paper_with_text(
    paper_id: int, user: User | None, request: Request, db: Session
) -> Paper:
    """Fetch an accessible paper that has extracted text."""
    paper = get_accessible_paper(paper_id, user, request, db)
    if not paper.full_text:
        raise HTTPException(status_code=422, detail="Paper has no extracted text")
    return paper


def check_guest_ai_limit(user: User | None, request: Request) -> None:
    """Raise 429 if guest has already used AI today (when limit is enabled)."""
    from app.config import settings

    if not settings.guest_ai_limit:
        return
    if user is not None:
        return
    last_used = request.cookies.get(GUEST_AI_COOKIE)
    if last_used == date.today().isoformat():
        raise HTTPException(
            status_code=429,
            detail="게스트는 하루 1회 AI 분석만 가능합니다. 로그인하면 무제한 이용할 수 있습니다.",
        )
