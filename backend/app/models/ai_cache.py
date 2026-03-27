from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.types import Text as _Text

Text = LONGTEXT().with_variant(_Text(), "sqlite")
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AiCache(Base):
    __tablename__ = "ai_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    paper_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("papers.id", ondelete="CASCADE"), index=True
    )
    request_type: Mapped[str] = mapped_column(String(50))  # summary, auto_highlight
    response: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
