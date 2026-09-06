import io
import logging
from datetime import date, datetime, time, timezone
from typing import Literal, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.config import get_settings
from app.database import get_db
from app.models import (
    AdminActionRequest,
    AdminRegistrationItem,
    PaymentInfoResponse,
    QrStringRequest,
    QrStringResponse,
    RegistrationStatus,
    SendPaymentInfoRequest,
    TokenResponse,
)
from app.services.auth import create_access_token, get_current_admin, verify_password
from app.services.email import (
    send_payment_info_email,
    send_payment_received_confirmation,
)
from app.services.pricing import (
    amount_due,
    hotel_amount,
    transfer_amount,
    voucher_claimed,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

# One shared variable symbol for the whole event — payments are matched by the
# payer's name in the recipient note, not by a per-registration symbol.
FIXED_VARIABLE_SYMBOL = "022026"

# ── State machine ────────────────────────────────────────────────────────

# Recording the payment is what confirms the registration — there is no separate
# acceptance step, and no way back out: only the registrant cancels, through the
# public update link.
_ACTION_REQUIRES: dict[str, tuple[str, ...]] = {
    "send_payment_info": ("new",),
    "payment_received": ("wait_for_payment",),
    "accept": (),
}

# Nothing to transfer — a recreation voucher stay without a voluntary contribution.
# No payment can arrive, so the admin confirms the registration straight from "new".
# "payment_received" stays reachable so a registration that was already waiting for
# a payment cannot get stuck.
_ACTION_REQUIRES_NO_PAYMENT: dict[str, tuple[str, ...]] = {
    "send_payment_info": (),
    "payment_received": ("wait_for_payment",),
    "accept": ("new",),
}

_ACTION_RESULT: dict[str, RegistrationStatus] = {
    "send_payment_info": "wait_for_payment",
    "payment_received": "accepted",
    "accept": "accepted",
}

AdminAction = Literal["send_payment_info", "payment_received", "accept"]


# ── Helpers ──────────────────────────────────────────────────────────────


# Statuses that existed before "paid" was merged into "accepted" and "rejected"
# was narrowed to the registrant's own cancellation.
_LEGACY_STATUSES: dict[str, RegistrationStatus] = {
    "paid": "accepted",
    "rejected": "cancelled",
}


def _effective_status(doc: dict) -> RegistrationStatus:
    """Return the registration status, falling back to legacy fields and names."""
    if "status" in doc:
        stored = doc["status"]
        return _LEGACY_STATUSES.get(stored, stored)
    if doc.get("cancelled", False):
        return "cancelled"
    if doc.get("is_paid", False):
        return "accepted"
    return "new"


def _as_date(value: object) -> Optional[date]:
    """Mongo hands back a datetime; the API exposes a plain date."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def _doc_to_item(doc: dict) -> AdminRegistrationItem:
    return AdminRegistrationItem(
        id=str(doc["_id"]),
        registration_type=doc["registration_type"],
        registrant=doc["registrant"],
        attendees=doc.get("attendees", []),
        note=doc.get("note"),
        extra_contribution=doc.get("extra_contribution", 0),
        recreation_voucher=voucher_claimed(doc),
        voucher_billing=doc.get("voucher_billing"),
        status=_effective_status(doc),
        registered_at=doc["registered_at"],
        update_token=doc.get("update_token", ""),
        variable_symbol=doc.get("variable_symbol"),
        payment_amount=doc.get("payment_amount"),
        payment_received_at=_as_date(doc.get("payment_received_at")),
    )


async def _ensure_variable_symbol(collection, oid: ObjectId, doc: dict) -> str:
    """Store and return the event-wide variable symbol for this registration."""
    if doc.get("variable_symbol") != FIXED_VARIABLE_SYMBOL:
        await collection.update_one(
            {"_id": oid}, {"$set": {"variable_symbol": FIXED_VARIABLE_SYMBOL}}
        )
    return FIXED_VARIABLE_SYMBOL


def _qr_png_bytes(data: str) -> bytes:
    import qrcode  # lazy import – only needed at send time

    img = qrcode.make(data)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _generate_bysquare_string(
    iban: str, amount: int, variable_symbol: str, note: str, beneficiary_name: str = ""
) -> str:
    import pay_by_square

    return pay_by_square.generate(
        amount=float(amount),
        iban=iban,
        variable_symbol=variable_symbol,
        note=note,
        beneficiary_name=beneficiary_name,
    )


# ── Login ────────────────────────────────────────────────────────────────


@router.post("/login", response_model=TokenResponse)
async def admin_login(form: OAuth2PasswordRequestForm = Depends()) -> TokenResponse:
    db = get_db()
    admin = await db["admin_users"].find_one({"username": form.username})
    if not admin or not verify_password(form.password, admin["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(form.username)
    return TokenResponse(access_token=token)


# ── List registrations ───────────────────────────────────────────────────


@router.get("/registrations", response_model=list[AdminRegistrationItem])
async def list_registrations(
    _: str = Depends(get_current_admin),
) -> list[AdminRegistrationItem]:
    db = get_db()
    cursor = db["registration"].find({}).sort("registered_at", -1)
    docs = await cursor.to_list(length=None)
    return [_doc_to_item(doc) for doc in docs]


# ── Apply action ─────────────────────────────────────────────────────────


@router.post("/registrations/{reg_id}/action/{action}", response_model=AdminRegistrationItem)
async def apply_action(
    reg_id: str,
    action: AdminAction,
    body: Optional[AdminActionRequest] = None,
    _: str = Depends(get_current_admin),
) -> AdminRegistrationItem:
    try:
        oid = ObjectId(reg_id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid registration id.")

    db = get_db()
    collection = db["registration"]

    doc = await collection.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")

    current_status = _effective_status(doc)
    due = amount_due(doc)
    requires = _ACTION_REQUIRES if due > 0 else _ACTION_REQUIRES_NO_PAYMENT
    allowed_from = requires[action]

    if not allowed_from:
        reason = (
            "this registration has nothing to pay"
            if due == 0
            else "a payment has to be recorded instead"
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Action '{action}' is not available – {reason}.",
        )
    if current_status not in allowed_from:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Action '{action}' is not allowed from status '{current_status}'.",
        )

    new_status = _ACTION_RESULT[action]
    changes: dict = {"status": new_status}

    if action == "payment_received":
        # Default to today; the admin may back-date it to when the money arrived.
        received_on = (body.payment_received_at if body else None) or datetime.now(
            timezone.utc
        ).date()
        # BSON has no date type — store midnight UTC and read it back as a date.
        changes["payment_received_at"] = datetime.combine(
            received_on, time.min, tzinfo=timezone.utc
        )

    await collection.update_one({"_id": oid}, {"$set": changes})

    if action == "send_payment_info":
        registrant = doc["registrant"]
        try:
            await send_payment_info_email(
                to_email=registrant["email"],
                registrant_name=registrant["name"],
                attendee_count=len(doc.get("attendees", [])),
                contribution_only=voucher_claimed(doc),
            )
        except Exception:
            logger.warning("Payment info email failed for %s – status already updated.", registrant["email"])

    if action in ("payment_received", "accept"):
        # Both routes end in "accepted", and both close with the same e-mail — the
        # last one the registrant gets. Only "accept" (nothing to transfer) has no
        # payment to acknowledge in it.
        registrant = doc["registrant"]
        try:
            await send_payment_received_confirmation(
                to_email=registrant["email"],
                registrant_name=registrant["name"],
                variable_symbol=doc.get("variable_symbol", "–"),
                payment_made=action == "payment_received",
            )
        except Exception:
            logger.warning("Confirmation email failed for %s – status already updated.", registrant["email"])

    doc.update(changes)
    return _doc_to_item(doc)


# ── Payment info page endpoints ──────────────────────────────────────────


@router.get("/registrations/{reg_id}/payment-info", response_model=PaymentInfoResponse)
async def get_payment_info(
    reg_id: str,
    _: str = Depends(get_current_admin),
) -> PaymentInfoResponse:
    try:
        oid = ObjectId(reg_id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid registration id.")

    db = get_db()
    collection = db["registration"]
    doc = await collection.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")

    settings = get_settings()
    vs = await _ensure_variable_symbol(collection, oid, doc)
    registrant = doc["registrant"]
    attendees = doc.get("attendees", [])
    voucher = voucher_claimed(doc)
    calculated_amount = transfer_amount(
        registrant, attendees, doc.get("extra_contribution", 0), voucher
    )
    # Settled at the hotel reception instead of by transfer.
    at_hotel = hotel_amount(registrant, attendees, voucher)
    # A previously sent amount wins — that is what the registrant was asked to pay.
    stored_amount = doc.get("payment_amount")
    amount = int(stored_amount) if stored_amount is not None else calculated_amount
    # The recipient note carries the payer's full name; the symbol is the same for all.
    full_name = f"{registrant['name']} {registrant['surname']}"
    recipient_note = full_name
    qr_string = _generate_bysquare_string(settings.bank_iban, amount, vs, recipient_note, settings.bank_beneficiary)

    return PaymentInfoResponse(
        iban=settings.bank_iban,
        bank_name=settings.bank_name,
        amount=amount,
        variable_symbol=vs,
        recipient_note=recipient_note,
        registrant_name=full_name,
        registrant_email=registrant["email"],
        attendee_count=len(doc.get("attendees", [])),
        qr_string=qr_string,
        calculated_amount=calculated_amount,
        recreation_voucher=voucher,
        hotel_amount=at_hotel,
    )


@router.post("/payment-qr-string", response_model=QrStringResponse)
async def payment_qr_string(
    body: QrStringRequest,
    _: str = Depends(get_current_admin),
) -> QrStringResponse:
    settings = get_settings()
    qr_string = _generate_bysquare_string(
        body.iban, body.amount, body.variable_symbol, body.note, settings.bank_beneficiary
    )
    return QrStringResponse(qr_string=qr_string)


@router.post("/registrations/{reg_id}/send-payment-info", response_model=AdminRegistrationItem)
async def send_payment_info_endpoint(
    reg_id: str,
    body: SendPaymentInfoRequest,
    _: str = Depends(get_current_admin),
) -> AdminRegistrationItem:
    try:
        oid = ObjectId(reg_id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid registration id.")

    db = get_db()
    collection = db["registration"]
    doc = await collection.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")

    current_status = _effective_status(doc)
    if current_status != "new":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"send_payment_info is not allowed from status '{current_status}'.",
        )
    if amount_due(doc) == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nothing to pay – accept the registration instead of sending payment info.",
        )

    new_status: RegistrationStatus = "wait_for_payment"
    await collection.update_one(
        {"_id": oid},
        {
            "$set": {
                "status": new_status,
                "variable_symbol": body.variable_symbol,
                "payment_amount": body.amount,
            }
        },
    )

    registrant = doc["registrant"]
    try:
        qr_bytes = _qr_png_bytes(body.bysquare_string) if body.bysquare_string else None
        await send_payment_info_email(
            to_email=registrant["email"],
            registrant_name=registrant["name"],
            iban=body.iban,
            bank_name=body.bank_name,
            amount=body.amount,
            variable_symbol=body.variable_symbol,
            recipient_note=body.recipient_note,
            qr_png_bytes=qr_bytes,
            # A voucher stay is settled at the hotel — this transfer is the
            # voluntary contribution alone, and the e-mail says so.
            contribution_only=voucher_claimed(doc),
        )
    except Exception:
        logger.warning("Payment info email failed for %s – status already updated.", registrant["email"])

    doc["status"] = new_status
    doc["variable_symbol"] = body.variable_symbol
    doc["payment_amount"] = body.amount
    return _doc_to_item(doc)
