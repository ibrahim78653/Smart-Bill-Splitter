"""
Application configuration via pydantic-settings.
All secrets are loaded from environment variables / .env file.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # AI
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # Database
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "bill_splitter"

    # Storage
    image_storage_path: Path = Path("./uploads")
    max_image_size_mb: int = 15
    image_ttl_hours: int = 24

    # Server
    cors_origins: str = "http://localhost:5173"
    log_level: str = "INFO"
    debug: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse comma-separated CORS origins."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
