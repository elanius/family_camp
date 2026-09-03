from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).parent.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # MongoDB
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "evs-vzdelavanie-2026"

    # App — base URL used to build the "edit your registration" links in emails.
    app_base_url: str = "http://localhost:5173"

    # Email
    email_enabled: bool = True

    # SMTP
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""

    # Bank (payment info)
    bank_iban: str = ""
    bank_name: str = ""
    bank_beneficiary: str = ""

    # JWT (admin auth)
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480


@lru_cache
def get_settings() -> Settings:
    return Settings()
