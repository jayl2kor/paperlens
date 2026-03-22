import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.paper import Paper
from app.models.schemas import PaperDetailResponse, PaperResponse
from app.services.pdf_parser import extract_pdf_data

router = APIRouter(prefix="/api/papers", tags=["papers"])


@router.post("/upload", response_model=PaperResponse)
async def upload_paper(file: UploadFile, db: Session = Depends(get_db)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    # Save file with unique name
    file_ext = Path(file.filename).suffix
    unique_name = f"{uuid.uuid4()}{file_ext}"
    file_path = Path(settings.upload_dir) / unique_name

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Extract PDF data
    try:
        pdf_data = extract_pdf_data(str(file_path))
    except Exception as e:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=f"Failed to parse PDF: {e}")

    # Create DB record
    paper = Paper(
        title=pdf_data["title"],
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
def list_papers(db: Session = Depends(get_db)):
    return db.query(Paper).order_by(Paper.upload_date.desc()).all()


@router.get("/{paper_id}", response_model=PaperDetailResponse)
def get_paper(paper_id: int, db: Session = Depends(get_db)):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    return paper


@router.get("/{paper_id}/file")
def get_paper_file(paper_id: int, db: Session = Depends(get_db)):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    file_path = Path(paper.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found on disk")

    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        filename=paper.filename,
    )


@router.delete("/{paper_id}")
def delete_paper(paper_id: int, db: Session = Depends(get_db)):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    # Delete file
    Path(paper.file_path).unlink(missing_ok=True)

    # Delete DB record
    db.delete(paper)
    db.commit()

    return {"detail": "Paper deleted"}
