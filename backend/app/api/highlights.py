from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_user_paper
from app.auth import get_current_user
from app.database import get_db
from app.models.highlight import UserHighlight
from app.models.schemas import (
    UserHighlightCreate,
    UserHighlightResponse,
    UserHighlightUpdate,
)
from app.models.user import User

router = APIRouter(prefix="/api/papers", tags=["highlights"])


@router.get(
    "/{paper_id}/highlights", response_model=list[UserHighlightResponse]
)
def list_highlights(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_user_paper(paper_id, user, db)
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
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_user_paper(paper_id, user, db)
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
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_user_paper(paper_id, user, db)
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
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_user_paper(paper_id, user, db)
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
