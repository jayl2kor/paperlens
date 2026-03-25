from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Paper(Base):
    __tablename__ = "papers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(500), default="Untitled")
    authors: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    filename: Mapped[str] = mapped_column(String(500))
    file_path: Mapped[str] = mapped_column(String(1000))
    upload_date: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    total_pages: Mapped[int] = mapped_column(Integer, default=0)
    full_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    structured_content: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    tags: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
