from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # MongoDB
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "family_camp"

    # Gmail SMTP
    gmail_user: str = ""
    gmail_app_password: str = ""

    # Email content
    notification_from: str = ""
    notification_subject: str = "Rodinný tábor – registrujeme váš zájem"


@lru_cache
def get_settings() -> Settings:
    return Settings()
