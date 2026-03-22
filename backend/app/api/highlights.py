from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.highlight import UserHighlight
from app.models.paper import Paper
from app.models.schemas import (
    UserHighlightCreate,
    UserHighlightResponse,
    UserHighlightUpdate,
)

router = APIRouter(prefix="/api/papers", tags=["highlights"])


def _get_paper_or_404(paper_id: int, db: Session) -> Paper:
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    return paper


@router.get(
    "/{paper_id}/highlights", response_model=list[UserHighlightResponse]
)
def list_highlights(paper_id: int, db: Session = Depends(get_db)):
    _get_paper_or_404(paper_id, db)
    return (
        db.query(UserHighlight)
        .filter(UserHighlight.paper_id == paper_id)
        .order_by(UserHighlight.page, UserHighlight.created_at)
        .all()
    )


@router.post(
    "/{paper_id}/highlights", response_model=UserHighlightResponse, status_code=201
)
def create_highlight(
    paper_id: int,
    body: UserHighlightCreate,
    db: Session = Depends(get_db),
):
    _get_paper_or_404(paper_id, db)
    highlight = UserHighlight(paper_id=paper_id, **body.model_dump())
    db.add(highlight)
    db.commit()
    db.refresh(highlight)
    return highlight


@router.patch(
    "/{paper_id}/highlights/{highlight_id}",
    response_model=UserHighlightResponse,
)
def update_highlight(
    paper_id: int,
    highlight_id: int,
    body: UserHighlightUpdate,
    db: Session = Depends(get_db),
):
    highlight = (
        db.query(UserHighlight)
        .filter(
            UserHighlight.id == highlight_id,
            UserHighlight.paper_id == paper_id,
        )
        .first()
    )
    if not highlight:
        raise HTTPException(status_code=404, detail="Highlight not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(highlight, key, value)

    db.commit()
    db.refresh(highlight)
    return highlight


@router.delete("/{paper_id}/highlights/{highlight_id}")
def delete_highlight(
    paper_id: int,
    highlight_id: int,
    db: Session = Depends(get_db),
):
    highlight = (
        db.query(UserHighlight)
        .filter(
            UserHighlight.id == highlight_id,
            UserHighlight.paper_id == paper_id,
        )
        .first()
    )
    if not highlight:
        raise HTTPException(status_code=404, detail="Highlight not found")

    db.delete(highlight)
    db.commit()
    return {"detail": "Highlight deleted"}
