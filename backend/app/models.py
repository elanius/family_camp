from datetime import date, datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class EmailRegistration(BaseModel):
    email: EmailStr


class EmailRegistrationRecord(BaseModel):
    email: EmailStr
    registered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ── Full registration models ─────────────────────────────────────────────

PHONE_RE = r"^\+?[0-9\s\-]{9,15}$"

# new → wait_for_payment → accepted; "cancelled" is set by the registrant alone,
# through the public update link.
RegistrationStatus = Literal["new", "wait_for_payment", "accepted", "cancelled"]
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
    roommate_preference: Optional[str] = None
    # Holder of a ZTP card — exempt from the local tax, see services/pricing.py.
    ztp: bool = False

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
    roommate_preference: Optional[str] = None
    ztp: bool = False

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        import re

        if not re.match(PHONE_RE, v):
            raise ValueError("Invalid phone number format.")
        return v


class VoucherBilling(BaseModel):
    """Billing address the hotel invoices when the registrant uses a recreation voucher."""

    name: str = Field(min_length=1)
    surname: str = Field(min_length=1)
    address: str = Field(min_length=1)
    city: str = Field(min_length=1)
    postal_code: str = Field(min_length=1)


class RegistrationRequest(BaseModel):
    registration_type: RegistrationType
    registrant: RegistrantData
    attendees: list[AttendeeData] = Field(default_factory=list)
    note: Optional[str] = None
    # Voluntary contribution on top of the accommodation price, in whole euros.
    extra_contribution: int = Field(default=0, ge=0, le=10000)
    # Recreation voucher belongs to the registrant, so it lives on the registration
    # itself — only "only_me" and "me_and_others" may claim it.
    recreation_voucher: bool = False
    voucher_billing: Optional[VoucherBilling] = None

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

    # A model validator, not a field one: `voucher_billing` may be missing entirely,
    # and field validators do not run for defaults.
    @model_validator(mode="after")
    def validate_voucher(self) -> "RegistrationRequest":
        if not self.recreation_voucher:
            # Not claimed – drop any billing data that came along.
            self.voucher_billing = None
            return self
        if not self.registrant.is_attendee:
            raise ValueError("recreation_voucher requires the registrant to attend.")
        if self.voucher_billing is None:
            raise ValueError("voucher_billing is required when recreation_voucher is set.")
        return self


class RegistrationRecord(BaseModel):
    registration_type: RegistrationType
    registrant: RegistrantData
    attendees: list[AttendeeData]
    note: Optional[str] = None
    extra_contribution: int = 0
    recreation_voucher: bool = False
    voucher_billing: Optional[VoucherBilling] = None
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
    recreation_voucher: bool = False
    voucher_billing: Optional[VoucherBilling] = None
    # True once the registration is confirmed (accepted) — the form closes for good.
    is_paid: bool
    cancelled: bool
    # True once payment info was sent – the public update link stops working then.
    locked: bool = False


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
    recreation_voucher: bool = False
    voucher_billing: Optional[VoucherBilling] = None
    status: RegistrationStatus
    registered_at: datetime
    update_token: str = ""
    variable_symbol: Optional[str] = None
    # Amount actually sent in the payment e-mail; overrides the calculated price.
    payment_amount: Optional[int] = None
    # Day the payment arrived, as recorded by the admin.
    payment_received_at: Optional[date] = None


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
    # Price computed from the packages + contribution, for comparison with `amount`.
    calculated_amount: int
    # With a recreation voucher only the voluntary contribution is transferred —
    # the stay itself is settled at the hotel, for `hotel_amount`.
    recreation_voucher: bool = False
    hotel_amount: int = 0


class AdminActionRequest(BaseModel):
    """Optional body for POST /registrations/{id}/action/{action}."""

    # Only used by "payment_received"; defaults to today when omitted.
    payment_received_at: Optional[date] = None

    @field_validator("payment_received_at")
    @classmethod
    def not_in_the_future(cls, v: Optional[date]) -> Optional[date]:
        if v is not None and v > datetime.now(timezone.utc).date():
            raise ValueError("payment_received_at cannot be in the future.")
        return v


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
