import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.api import ai, auth, browser_agent, highlights, papers, settings
from app.database import Base, engine

# Import all models so Base.metadata knows about them
from app.models import ai_cache as _ai_cache_models  # noqa: F401
from app.models import chat_message as _chat_message_models  # noqa: F401
from app.models import highlight as _highlight_models  # noqa: F401
from app.models import user as _user_models  # noqa: F401
from app.models import user_settings as _user_settings_models  # noqa: F401

logger = logging.getLogger(__name__)

# Create tables
Base.metadata.create_all(bind=engine)

# Simple column migration for existing databases
_MIGRATIONS: list[tuple[str, str, str]] = [
    # (table, column, sql_type)
    ("papers", "tags", "TEXT"),
    ("papers", "authors", "TEXT"),
    ("papers", "user_id", "INTEGER"),
    ("papers", "guest_id", "VARCHAR(64)"),
    ("user_settings", "user_id", "INTEGER"),
]

with engine.connect() as conn:
    inspector = inspect(engine)
    for table, column, sql_type in _MIGRATIONS:
        if table in inspector.get_table_names():
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}"))
                conn.commit()
                logger.info("Migrated: added %s.%s", table, column)

app = FastAPI(title="paperlens", version="0.1.0")

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(papers.router)
app.include_router(highlights.router)
app.include_router(ai.router)
app.include_router(settings.router)
app.include_router(browser_agent.router)


@app.middleware("http")
async def guest_and_security(request: Request, call_next):
    """Assign a guest ID cookie if unauthenticated, and add security headers."""
    # Resolve guest ID before processing the request so handlers can use it
    has_auth = request.headers.get("authorization", "").startswith("Bearer ")
    guest_id = request.cookies.get("pi_guest")
    new_guest = False
    if not has_auth and not guest_id:
        guest_id = uuid.uuid4().hex
        new_guest = True
    request.state.guest_id = guest_id if not has_auth else None

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "0"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; "
        "font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';"
    )

    if new_guest and guest_id:
        response.set_cookie(
            "pi_guest",
            guest_id,
            max_age=30 * 86400,
            httponly=True,
            samesite="lax",
        )
    return response


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
