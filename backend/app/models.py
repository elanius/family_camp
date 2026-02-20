from datetime import datetime, timezone
from pydantic import BaseModel, EmailStr, Field


class EmailRegistration(BaseModel):
    email: EmailStr


class EmailRegistrationRecord(BaseModel):
    email: EmailStr
    registered_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
