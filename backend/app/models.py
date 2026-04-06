from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class EmailRegistration(BaseModel):
    email: EmailStr


class EmailRegistrationRecord(BaseModel):
    email: EmailStr
    registered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ── Full registration models ─────────────────────────────────────────────

PHONE_RE = r"^\+?[0-9\s\-]{9,15}$"


class AttendeeData(BaseModel):
    name: str = Field(min_length=1)
    surname: str = Field(min_length=1)
    age: int = Field(ge=0, le=120)
    phone: Optional[str] = None
    email: Optional[EmailStr] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        import re

        if v is not None and not re.match(PHONE_RE, v):
            raise ValueError("Invalid phone number format.")
        return v


class RegistrantData(BaseModel):
    name: str = Field(min_length=1)
    surname: str = Field(min_length=1)
    age: Optional[int] = Field(default=None, ge=0, le=120)
    phone: str
    email: EmailStr
    is_attendee: bool

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        import re

        if not re.match(PHONE_RE, v):
            raise ValueError("Invalid phone number format.")
        return v


class RegistrationRequest(BaseModel):
    registration_type: Literal["me_and_others", "just_others"]
    registrant: RegistrantData
    attendees: list[AttendeeData] = Field(min_length=1)

    @field_validator("registrant")
    @classmethod
    def validate_registrant_age(cls, v: RegistrantData, info: object) -> RegistrantData:
        values = getattr(info, "data", {})
        reg_type = values.get("registration_type")
        if reg_type == "me_and_others" and v.age is None:
            raise ValueError("age is required when registration_type is 'me_and_others'.")
        return v


class RegistrationRecord(BaseModel):
    registration_type: Literal["me_and_others", "just_others"]
    registrant: RegistrantData
    attendees: list[AttendeeData]
    registered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
