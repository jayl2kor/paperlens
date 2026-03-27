import logging
import urllib.parse
import uuid
from itertools import groupby
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.api.deps import get_accessible_paper, get_guest_id
from app.auth import get_optional_user
from app.config import settings
from app.database import get_db
from app.models.ai_cache import AiCache
from app.models.highlight import UserHighlight
from app.models.paper import Paper
from app.models.schemas import PaperDetailResponse, PaperResponse
from app.models.user import User

router = APIRouter(prefix="/api/papers", tags=["papers"])


@router.post("/upload", response_model=PaperResponse)
async def upload_paper(
    file: UploadFile,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    file_ext = Path(file.filename).suffix
    unique_name = f"{uuid.uuid4()}{file_ext}"
    file_path = Path(settings.upload_dir) / unique_name

    # Stream file to disk with size limit
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    total = 0
    with open(file_path, "wb") as buffer:
        while chunk := await file.read(8192):
            total += len(chunk)
            if total > max_bytes:
                file_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"파일이 너무 큽니다 (최대 {settings.max_upload_size_mb}MB)",
                )
            buffer.write(chunk)

    # Extract PDF data
    try:
        from app.services.pdf_parser import extract_pdf_data

        pdf_data = extract_pdf_data(str(file_path))
    except Exception:
        file_path.unlink(missing_ok=True)
        logger.exception("PDF parse failed for file: %s", file.filename)
        raise HTTPException(status_code=422, detail="PDF 파싱에 실패했습니다.")

    # Create DB record
    paper = Paper(
        user_id=user.id if user else None,
        guest_id=get_guest_id(request) if user is None else None,
        title=pdf_data["title"],
        authors=pdf_data.get("authors", []),
        filename=file.filename,
        file_path=str(file_path),
        total_pages=pdf_data["total_pages"],
        full_text=pdf_data["full_text"],
        structured_content=pdf_data["structured_content"],
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)

    return paper


@router.get("", response_model=list[PaperResponse])
def list_papers(
    request: Request,
    q: str | None = Query(None, description="검색어 (제목/파일명)"),
    tag: str | None = Query(None, description="태그 필터"),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    if user:
        query = db.query(Paper).filter(Paper.user_id == user.id)
    else:
        guest_id = get_guest_id(request)
        query = db.query(Paper).filter(Paper.guest_id == guest_id)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            Paper.title.ilike(pattern)
            | Paper.filename.ilike(pattern)
            | Paper.authors.contains(f'"{q}"')
        )
    if tag:
        query = query.filter(Paper.tags.contains(f'"{tag}"'))
    return query.order_by(Paper.upload_date.desc()).all()


@router.get("/{paper_id}", response_model=PaperDetailResponse)
def get_paper(
    paper_id: int,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    return get_accessible_paper(paper_id, user, request, db)


@router.get("/{paper_id}/file")
def get_paper_file(
    paper_id: int,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    paper = get_accessible_paper(paper_id, user, request, db)

    file_path = Path(paper.file_path).resolve()
    upload_dir = Path(settings.upload_dir).resolve()
    if not file_path.is_relative_to(upload_dir):
        raise HTTPException(status_code=403, detail="Invalid file path")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found on disk")

    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        filename=paper.filename,
    )


@router.delete("/{paper_id}")
def delete_paper(
    paper_id: int,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    paper = get_accessible_paper(paper_id, user, request, db)

    # Delete file
    Path(paper.file_path).unlink(missing_ok=True)

    # Delete DB record
    db.delete(paper)
    db.commit()

    return {"detail": "Paper deleted"}


# ── Tags ─────────────────────────────────────────────────────────────────────


@router.put("/{paper_id}/tags", response_model=PaperResponse)
def update_tags(
    paper_id: int,
    tags: list[str],
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    paper = get_accessible_paper(paper_id, user, request, db)
    # Deduplicate & limit
    unique_tags = list(dict.fromkeys(t.strip()[:100] for t in tags if t.strip()))[:20]
    paper.tags = unique_tags
    db.commit()
    db.refresh(paper)
    return paper


@router.get("/meta/tags")
def list_all_tags(
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Return all unique tags across the user's papers."""
    if user:
        query = db.query(Paper.tags).filter(
            Paper.user_id == user.id, Paper.tags.isnot(None)
        )
    else:
        guest_id = get_guest_id(request)
        query = db.query(Paper.tags).filter(
            Paper.guest_id == guest_id, Paper.tags.isnot(None)
        )
    papers = query.all()
    tag_set: set[str] = set()
    for (tags_json,) in papers:
        if isinstance(tags_json, list):
            tag_set.update(tags_json)
    return sorted(tag_set)


# ── Markdown Export ──────────────────────────────────────────────────────────


COLOR_EMOJI = {
    "yellow": "\U0001f7e1",
    "green": "\U0001f7e2",
    "blue": "\U0001f535",
    "pink": "\U0001fa77",
    "purple": "\U0001f7e3",
}


@router.get("/{paper_id}/export/markdown")
def export_markdown(
    paper_id: int,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    paper = get_accessible_paper(paper_id, user, request, db)

    highlights = (
        db.query(UserHighlight)
        .filter(UserHighlight.paper_id == paper_id)
        .order_by(UserHighlight.page, UserHighlight.created_at)
        .all()
    )

    summary_cache = (
        db.query(AiCache)
        .filter(AiCache.paper_id == paper_id, AiCache.request_type == "summary")
        .first()
    )

    authors_str = ", ".join(paper.authors) if paper.authors else "Unknown"
    lines = [
        f"# {paper.title}",
        "",
        f"- **저자**: {authors_str}",
        f"- **파일**: {paper.filename}",
        f"- **페이지 수**: {paper.total_pages}",
        f"- **업로드**: {paper.upload_date.strftime('%Y-%m-%d')}",
        "",
    ]

    if summary_cache:
        lines.extend(["## AI 요약", "", summary_cache.response, ""])

    if highlights:
        lines.extend(["## 하이라이트 & 노트", ""])
        for page, group in groupby(highlights, key=lambda h: h.page):
            lines.append(f"### {page} 페이지")
            lines.append("")
            for h in group:
                emoji = COLOR_EMOJI.get(h.color, "\u26aa")
                lines.append(f'- {emoji} "{h.text}"')
                if h.note:
                    lines.append(f"  - **노트**: {h.note}")
            lines.append("")

    md = "\n".join(lines)
    safe_title = paper.title[:50].replace("/", "_")
    filename = f"{safe_title}_notes.md"
    encoded = urllib.parse.quote(filename)

    return Response(
        content=md,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )
