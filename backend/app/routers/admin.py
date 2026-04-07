import io
import logging
import random
from datetime import date
from typing import Literal

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.config import get_settings
from app.database import get_db
from app.models import (
    AdminRegistrationItem,
    PaymentInfoResponse,
    QrStringRequest,
    QrStringResponse,
    RegistrationStatus,
    SendPaymentInfoRequest,
    TokenResponse,
)
from app.services.auth import create_access_token, get_current_admin, verify_password
from app.services.email import send_payment_info_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

# ── State machine ────────────────────────────────────────────────────────

_ACTION_REQUIRES: dict[str, tuple[str, ...]] = {
    "send_payment_info": ("new",),
    "payment_received": ("wait_for_payment",),
    "accept": ("paid",),
    "reject": ("new", "wait_for_payment", "paid"),
}

_ACTION_RESULT: dict[str, RegistrationStatus] = {
    "send_payment_info": "wait_for_payment",
    "payment_received": "paid",
    "accept": "accepted",
    "reject": "rejected",
}

AdminAction = Literal["send_payment_info", "payment_received", "accept", "reject"]


# ── Helpers ──────────────────────────────────────────────────────────────


def _effective_status(doc: dict) -> RegistrationStatus:
    """Return the registration status, falling back to legacy is_paid/cancelled fields."""
    if "status" in doc:
        return doc["status"]
    if doc.get("cancelled", False):
        return "rejected"
    if doc.get("is_paid", False):
        return "paid"
    return "new"


def _doc_to_item(doc: dict) -> AdminRegistrationItem:
    return AdminRegistrationItem(
        id=str(doc["_id"]),
        registration_type=doc["registration_type"],
        registrant=doc["registrant"],
        attendees=doc.get("attendees", []),
        note=doc.get("note"),
        status=_effective_status(doc),
        registered_at=doc["registered_at"],
        update_token=doc.get("update_token", ""),
        variable_symbol=doc.get("variable_symbol"),
    )


# ── Pricing (mirrors frontend pricing.ts) ───────────────────────────────

_LATE_FROM = date(2026, 7, 1)
_BASE_PRICE = {"baby": 0, "kid": 130, "adult": 150}
_LATE_FEE = 10
_KID_SIBLING_DISCOUNT = 20


def _age_category(age: int) -> str:
    if age <= 3:
        return "baby"
    if age <= 14:
        return "kid"
    return "adult"


def _calculate_total_amount(registrant: dict, attendees: list[dict]) -> int:
    is_late = date.today() >= _LATE_FROM
    all_ages: list[int] = []
    if registrant.get("is_attendee") and registrant.get("age") is not None:
        all_ages.append(int(registrant["age"]))
    for a in attendees:
        if a.get("age") is not None:
            all_ages.append(int(a["age"]))
    total = 0
    kid_count = 0
    for age in all_ages:
        cat = _age_category(age)
        base = _BASE_PRICE[cat]
        fee = _LATE_FEE if (is_late and base > 0) else 0
        discount = 0
        if cat == "kid":
            if kid_count > 0:
                discount = _KID_SIBLING_DISCOUNT
            kid_count += 1
        total += max(0, base + fee - discount)
    return total


async def _ensure_variable_symbol(collection, oid: ObjectId, doc: dict) -> str:
    if vs := doc.get("variable_symbol"):
        return str(vs)
    used: set[str] = set()
    async for d in collection.find({"variable_symbol": {"$exists": True}}, {"variable_symbol": 1}):
        if v := d.get("variable_symbol"):
            used.add(str(v))
    available = [str(i) for i in range(100, 1000) if str(i) not in used]
    if not available:
        raise HTTPException(status_code=500, detail="No variable symbols available.")
    vs = random.choice(available)
    await collection.update_one({"_id": oid}, {"$set": {"variable_symbol": vs}})
    return vs


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
    allowed_from = _ACTION_REQUIRES[action]

    if current_status not in allowed_from:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Action '{action}' is not allowed from status '{current_status}'.",
        )

    new_status = _ACTION_RESULT[action]
    await collection.update_one({"_id": oid}, {"$set": {"status": new_status}})

    if action == "send_payment_info":
        registrant = doc["registrant"]
        try:
            await send_payment_info_email(
                to_email=registrant["email"],
                registrant_name=registrant["name"],
                attendee_count=len(doc.get("attendees", [])),
            )
        except Exception:
            logger.warning("Payment info email failed for %s – status already updated.", registrant["email"])

    doc["status"] = new_status
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
    amount = _calculate_total_amount(registrant, doc.get("attendees", []))
    full_name = f"{registrant['name']} {registrant['surname']}"
    recipient_note = f"{full_name} {vs}"
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

    new_status: RegistrationStatus = "wait_for_payment"
    await collection.update_one(
        {"_id": oid},
        {"$set": {"status": new_status, "variable_symbol": body.variable_symbol}},
    )

    registrant = doc["registrant"]
    try:
        qr_bytes = _qr_png_bytes(body.bysquare_string) if body.bysquare_string else None
        await send_payment_info_email(
            to_email=registrant["email"],
            registrant_name=f"{registrant['name']} {registrant['surname']}",
            iban=body.iban,
            bank_name=body.bank_name,
            amount=body.amount,
            variable_symbol=body.variable_symbol,
            recipient_note=body.recipient_note,
            qr_png_bytes=qr_bytes,
        )
    except Exception:
        logger.warning("Payment info email failed for %s – status already updated.", registrant["email"])

    doc["status"] = new_status
    doc["variable_symbol"] = body.variable_symbol
    return _doc_to_item(doc)
