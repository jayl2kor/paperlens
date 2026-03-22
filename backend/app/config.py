from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "paper-insight"
    database_url: str = "sqlite:///./paper_insight.db"
    upload_dir: str = str(Path(__file__).parent.parent / "uploads")
    max_upload_size_mb: int = 50
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

# Ensure upload directory exists
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
