from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Paper(Base):
    __tablename__ = "papers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(500), default="Untitled")
    filename: Mapped[str] = mapped_column(String(500))
    file_path: Mapped[str] = mapped_column(String(1000))
    upload_date: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    total_pages: Mapped[int] = mapped_column(Integer, default=0)
    full_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    structured_content: Mapped[dict | None] = mapped_column(JSON, nullable=True)
