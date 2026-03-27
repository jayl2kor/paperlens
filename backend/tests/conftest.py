"""Shared test fixtures for paperlens backend tests."""

import os
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

# Ensure test config before importing app modules
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test-key-for-testing")
os.environ.setdefault("JWT_SECRET", "test-secret-for-testing")

from app.auth import create_access_token
from app.database import Base, get_db
from app.main import app
from app.models.user import User


@pytest.fixture()
def tmp_upload_dir(tmp_path: Path) -> Path:
    """Create a temporary upload directory."""
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    return upload_dir


@pytest.fixture()
def db_session(tmp_path: Path) -> Generator[Session, None, None]:
    """Create a fresh in-memory SQLite database session for each test."""
    db_url = f"sqlite:///{tmp_path / 'test.db'}"
    engine = create_engine(db_url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestSession()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _create_test_engine(tmp_path: Path):
    db_url = f"sqlite:///{tmp_path / 'test.db'}"
    engine = create_engine(db_url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture()
def client(tmp_path: Path, tmp_upload_dir: Path) -> Generator[TestClient, None, None]:
    """Create a FastAPI test client with isolated database, upload dir, and a test user."""
    engine = _create_test_engine(tmp_path)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Create a test user
    session = TestSession()
    from app.auth import hash_password

    test_user = User(
        email="test@example.com",
        password_hash=hash_password("testpass123"),
        name="Test User",
    )
    session.add(test_user)
    session.commit()
    session.refresh(test_user)
    user_id = test_user.id
    session.close()

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Patch upload dir
    import app.config as config_mod

    original_upload_dir = config_mod.settings.upload_dir
    config_mod.settings.upload_dir = str(tmp_upload_dir)

    token = create_access_token(user_id)

    with TestClient(app) as c:
        # Inject auth header by default
        c.headers["Authorization"] = f"Bearer {token}"
        yield c

    config_mod.settings.upload_dir = original_upload_dir
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture()
def sample_pdf(tmp_path: Path) -> Path:
    """Create a minimal valid PDF file for testing."""
    import fitz

    pdf_path = tmp_path / "sample.pdf"
    doc = fitz.open()

    # Page 1: title + authors + abstract
    page = doc.new_page(width=612, height=792)
    page.insert_text((72, 100), "A Novel Approach to Neural Networks", fontsize=20)
    page.insert_text((72, 140), "John Smith, Jane Doe, Bob Johnson", fontsize=12)
    page.insert_text((72, 200), "Abstract", fontsize=14)
    page.insert_text(
        (72, 230),
        "This paper presents a novel approach to training neural networks "
        "using gradient descent optimization with adaptive learning rates.",
        fontsize=10,
    )

    # Page 2: body text
    page2 = doc.new_page(width=612, height=792)
    page2.insert_text(
        (72, 100),
        "In this section, we describe our methodology for improving "
        "convergence speed in deep learning models.",
        fontsize=10,
    )

    doc.save(str(pdf_path))
    doc.close()
    return pdf_path


@pytest.fixture()
def uploaded_paper(client: TestClient, sample_pdf: Path) -> dict:
    """Upload a sample PDF and return the PaperResponse dict."""
    with open(sample_pdf, "rb") as f:
        resp = client.post(
            "/api/papers/upload",
            files={"file": ("test_paper.pdf", f, "application/pdf")},
        )
    assert resp.status_code == 200
    return resp.json()
