import logging
import secrets
from pathlib import Path

from pydantic_settings import BaseSettings

_logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    app_name: str = "paper-insight"
    database_url: str = "sqlite:///./data/paper_insight.db"
    upload_dir: str = str(Path(__file__).parent.parent / "uploads")
    max_upload_size_mb: int = 50
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"
    jwt_secret: str = ""
    jwt_expire_days: int = 7

    model_config = {
        "env_file": str(Path(__file__).parent.parent / ".env"),
        "env_file_encoding": "utf-8",
    }


settings = Settings()

# Generate a random JWT secret if not configured (dev convenience, warns loudly)
if not settings.jwt_secret:
    settings.jwt_secret = secrets.token_urlsafe(32)
    _logger.warning(
        "JWT_SECRET is not set — using auto-generated ephemeral secret. "
        "Tokens will be invalidated on restart. "
        "Set JWT_SECRET in .env or environment for production."
    )

# Ensure required directories exist
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
Path("data").mkdir(parents=True, exist_ok=True)
