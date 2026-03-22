from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import ai, highlights, papers
from app.database import Base, engine

# Import all models so Base.metadata knows about them
from app.models import ai_cache as _ai_cache_models  # noqa: F401
from app.models import chat_message as _chat_message_models  # noqa: F401
from app.models import highlight as _highlight_models  # noqa: F401

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="paper-insight", version="0.1.0")

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(papers.router)
app.include_router(highlights.router)
app.include_router(ai.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
