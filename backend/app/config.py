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
    mongodb_db: str = "kids-camp-2026"

    # App
    app_base_url: str = "https://tabor.lutheran.sk"

    # Email
    email_enabled: bool = True

    # Gmail OAuth2
    gmail_user: str = ""
    gmail_client_id: str = ""
    gmail_client_secret: str = ""
    gmail_refresh_token: str = ""

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
