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

RegistrationStatus = Literal["new", "wait_for_payment", "paid", "accepted", "rejected"]
RegistrationType = Literal["me_and_others", "just_others", "only_me"]

# Accommodation package chosen per attending person.
#   double – 179 € / person in a twin room
#   single – 219 € / person in a single room
#   none   – 0 €, attends the lectures only (no room, no meals)
Accommodation = Literal["double", "single", "none"]


class AttendeeData(BaseModel):
    name: str = Field(min_length=1)
    surname: str = Field(min_length=1)
    accommodation: Accommodation
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    recreation_voucher: bool = False
    roommate_preference: Optional[str] = None

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
    phone: str
    email: EmailStr
    is_attendee: bool
    accommodation: Optional[Accommodation] = None
    recreation_voucher: bool = False
    roommate_preference: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        import re

        if not re.match(PHONE_RE, v):
            raise ValueError("Invalid phone number format.")
        return v


class RegistrationRequest(BaseModel):
    registration_type: RegistrationType
    registrant: RegistrantData
    attendees: list[AttendeeData] = Field(default_factory=list)
    note: Optional[str] = None
    # Voluntary contribution on top of the accommodation price, in whole euros.
    extra_contribution: int = Field(default=0, ge=0, le=10000)

    @field_validator("attendees")
    @classmethod
    def validate_attendees(cls, v: list["AttendeeData"], info: object) -> list["AttendeeData"]:
        values = getattr(info, "data", {})
        reg_type = values.get("registration_type")
        if reg_type != "only_me" and len(v) == 0:
            raise ValueError("At least one attendee is required.")
        return v

    @field_validator("registrant")
    @classmethod
    def validate_registrant_accommodation(cls, v: RegistrantData, info: object) -> RegistrantData:
        if v.is_attendee and v.accommodation is None:
            raise ValueError("accommodation is required when the registrant attends.")
        return v


class RegistrationRecord(BaseModel):
    registration_type: RegistrationType
    registrant: RegistrantData
    attendees: list[AttendeeData]
    note: Optional[str] = None
    extra_contribution: int = 0
    registered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    update_token: str
    status: RegistrationStatus = "new"


class RegistrationTokenResponse(BaseModel):
    """Read-only data returned by the GET /registration/{token} endpoint."""

    registration_type: RegistrationType
    registrant: RegistrantData
    attendees: list[AttendeeData]
    note: Optional[str] = None
    extra_contribution: int = 0
    is_paid: bool
    cancelled: bool


# ── Admin models ─────────────────────────────────────────────────────────


class AdminUser(BaseModel):
    username: str
    hashed_password: str


class AdminRegistrationItem(BaseModel):
    id: str
    registration_type: RegistrationType
    registrant: RegistrantData
    attendees: list[AttendeeData]
    note: Optional[str] = None
    extra_contribution: int = 0
    status: RegistrationStatus
    registered_at: datetime
    update_token: str = ""
    variable_symbol: Optional[str] = None


class PaymentInfoResponse(BaseModel):
    iban: str
    bank_name: str
    amount: int
    variable_symbol: str
    recipient_note: str
    registrant_name: str
    registrant_email: str
    attendee_count: int
    qr_string: str


class SendPaymentInfoRequest(BaseModel):
    iban: str
    bank_name: str
    amount: int
    variable_symbol: str
    recipient_note: str
    bysquare_string: str


class QrStringRequest(BaseModel):
    iban: str
    amount: int
    variable_symbol: str
    note: str


class QrStringResponse(BaseModel):
    qr_string: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
