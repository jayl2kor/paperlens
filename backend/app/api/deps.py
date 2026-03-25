"""Shared FastAPI dependencies for paper ownership verification."""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.paper import Paper
from app.models.user import User


def get_user_paper(paper_id: int, user: User, db: Session) -> Paper:
    """Fetch a paper owned by the current user, or raise 404."""
    paper = (
        db.query(Paper)
        .filter(Paper.id == paper_id, Paper.user_id == user.id)
        .first()
    )
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    return paper


def get_user_paper_with_text(paper_id: int, user: User, db: Session) -> Paper:
    """Fetch a paper with full_text (for AI endpoints), or raise 404/422."""
    paper = get_user_paper(paper_id, user, db)
    if not paper.full_text:
        raise HTTPException(status_code=422, detail="Paper has no extracted text")
    return paper
