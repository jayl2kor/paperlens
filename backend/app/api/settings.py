from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import settings as app_settings
from app.database import get_db
from app.models.user import User
from app.models.user_settings import UserSettings

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Validation allowlists
ALLOWED_MODELS = {
    "claude-sonnet-4-20250514",
    "claude-haiku-4-20250414",
    "claude-opus-4-20250514",
}
ALLOWED_LANGUAGES = {"ko", "en", "ja", "zh"}
ALLOWED_COLORS = {"yellow", "green", "blue", "pink", "purple"}

DEFAULTS = {
    "default_language": "ko",
    "highlight_color": "yellow",
    "claude_model": "claude-sonnet-4-20250514",
}


class SettingsResponse(BaseModel):
    api_key_configured: bool = False
    default_language: str = "ko"
    highlight_color: str = "yellow"
    claude_model: str = "claude-sonnet-4-20250514"


class SettingsUpdate(BaseModel):
    default_language: str | None = None
    highlight_color: str | None = None
    claude_model: str | None = None


def _get_all(db: Session, user_id: int) -> dict[str, str]:
    rows = (
        db.query(UserSettings)
        .filter(UserSettings.user_id == user_id)
        .all()
    )
    result = dict(DEFAULTS)
    for row in rows:
        if row.key in DEFAULTS:
            result[row.key] = row.value
    return result


def _set_value(db: Session, user_id: int, key: str, value: str) -> None:
    row = (
        db.query(UserSettings)
        .filter(UserSettings.user_id == user_id, UserSettings.key == key)
        .first()
    )
    if row:
        row.value = value
    else:
        db.add(UserSettings(user_id=user_id, key=key, value=value))


@router.get("", response_model=SettingsResponse)
def get_settings(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    values = _get_all(db, user.id)
    return SettingsResponse(
        api_key_configured=bool(app_settings.anthropic_api_key),
        **values,
    )


@router.put("", response_model=SettingsResponse)
def update_settings(
    body: SettingsUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updates = body.model_dump(exclude_unset=True)

    if "claude_model" in updates and updates["claude_model"] not in ALLOWED_MODELS:
        raise HTTPException(status_code=422, detail="허용되지 않는 모델입니다.")
    if "default_language" in updates and updates["default_language"] not in ALLOWED_LANGUAGES:
        raise HTTPException(status_code=422, detail="허용되지 않는 언어입니다.")
    if "highlight_color" in updates and updates["highlight_color"] not in ALLOWED_COLORS:
        raise HTTPException(status_code=422, detail="허용되지 않는 색상입니다.")

    for key, value in updates.items():
        if value is not None:
            _set_value(db, user.id, key, value)
    db.commit()

    values = _get_all(db, user.id)
    return SettingsResponse(
        api_key_configured=bool(app_settings.anthropic_api_key),
        **values,
    )
