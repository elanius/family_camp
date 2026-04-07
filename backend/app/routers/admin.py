import logging
from typing import Literal

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.database import get_db
from app.models import AdminRegistrationItem, RegistrationStatus, TokenResponse
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
