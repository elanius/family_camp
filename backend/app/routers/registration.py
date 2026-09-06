import logging
import secrets

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import EmailStr

from app.config import get_settings
from app.database import get_db
from app.models import RegistrationRecord, RegistrationRequest, RegistrationTokenResponse
from app.services.email import send_full_registration_confirmation, send_sub_attendee_notification
from app.services.pricing import hotel_amount, transfer_amount

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["full-registration"])

# Statuses in which the public update link no longer works. Payment info carries a
# fixed amount, so the registration must not change once that e-mail went out.
# "paid" is a legacy name for what is now "accepted".
LOCKED_STATUSES = ("wait_for_payment", "paid", "accepted")

# Statuses of a registration the registrant has cancelled. "rejected" is the
# legacy name, from when an admin could reject one too.
CANCELLED_STATUSES = ("cancelled", "rejected")

# Matches an active (non-cancelled) registration, for both legacy docs that only
# have `cancelled` and current docs that have `status`.
ACTIVE_QUERY = {
    "$or": [
        {"status": {"$nin": list(CANCELLED_STATUSES)}},
        {"status": {"$exists": False}, "cancelled": {"$ne": True}},
    ]
}


def _attendee_full_names(payload: RegistrationRequest) -> list[str]:
    """Everyone who will attend, registrant first when they take part."""
    names: list[str] = []
    if payload.registrant.is_attendee:
        names.append(f"{payload.registrant.name} {payload.registrant.surname}".strip())
    names.extend(f"{a.name} {a.surname}".strip() for a in payload.attendees)
    return names


def _lock_flags(doc: dict) -> tuple[bool, bool, bool]:
    """Return (is_confirmed, is_locked, is_cancelled) for a registration document."""
    doc_status = doc.get("status")
    if doc_status is not None:
        return (
            doc_status in ("paid", "accepted"),
            doc_status in LOCKED_STATUSES,
            doc_status in CANCELLED_STATUSES,
        )
    legacy_paid = doc.get("is_paid", False)
    return legacy_paid, legacy_paid, doc.get("cancelled", False)


@router.post("/registration", status_code=status.HTTP_201_CREATED)
async def register(payload: RegistrationRequest) -> dict:
    db = get_db()
    collection = db["registration"]

    # A repeated e-mail is allowed on purpose — one person may register several
    # separate groups. The form only warns about it.
    token = secrets.token_urlsafe(32)
    record = RegistrationRecord(
        registration_type=payload.registration_type,
        registrant=payload.registrant,
        attendees=payload.attendees,
        note=payload.note or None,
        extra_contribution=payload.extra_contribution,
        recreation_voucher=payload.recreation_voucher,
        voucher_billing=payload.voucher_billing,
        update_token=token,
    )

    try:
        await collection.insert_one(record.model_dump())
    except Exception:
        logger.exception("Failed to insert registration record into DB.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registrácia sa nepodarila. Skúste to prosím znova.",
        )

    logger.info(
        "New full registration: %s %s (%s), %d attendee(s).",
        payload.registrant.name,
        payload.registrant.surname,
        payload.registrant.email,
        len(payload.attendees),
    )

    settings = get_settings()
    update_link = f"{settings.app_base_url}/update/{token}"

    # What the confirmation promises depends on who gets paid: a recreation voucher
    # moves the stay to the hotel and leaves only the contribution to transfer.
    registrant = payload.registrant.model_dump()
    attendees = [a.model_dump() for a in payload.attendees]
    at_hotel = hotel_amount(registrant, attendees, payload.recreation_voucher)
    due = transfer_amount(
        registrant, attendees, payload.extra_contribution, payload.recreation_voucher
    )

    # Send confirmation email to the main registrant
    try:
        await send_full_registration_confirmation(
            to_email=str(payload.registrant.email),
            registrant_name=payload.registrant.name,
            attendee_names=_attendee_full_names(payload),
            update_link=update_link,
            hotel_amount=at_hotel,
            transfer_due=due,
        )
    except Exception:
        logger.warning("Confirmation email failed for %s – continuing.", payload.registrant.email)

    # Send notification emails to sub-attendees with email addresses
    registrant_full_name = f"{payload.registrant.name} {payload.registrant.surname}"
    for attendee in payload.attendees:
        if attendee.email:
            try:
                await send_sub_attendee_notification(
                    to_email=str(attendee.email),
                    attendee_name=attendee.name,
                    registered_by_name=registrant_full_name,
                )
            except Exception:
                logger.warning(
                    "Sub-attendee notification email failed for %s (%s %s) – continuing.",
                    attendee.email,
                    attendee.name,
                    attendee.surname,
                )

    return {"message": "Registrácia prebehla úspešne."}


# NOTE: This route MUST be defined before /{token} to avoid path conflict.
@router.get("/registration/check-email", status_code=status.HTTP_200_OK)
async def check_email(email: EmailStr = Query(...)) -> dict:
    """Returns {"exists": true} if this email belongs to an active (non-cancelled) registration.

    Informational only — a duplicate e-mail does not block a new registration.
    """
    db = get_db()
    collection = db["registration"]
    doc = await collection.find_one(
        {"registrant.email": str(email), **ACTIVE_QUERY},
        projection={"_id": 1},
    )
    return {"exists": doc is not None}


@router.get("/registration/{token}", status_code=status.HTTP_200_OK)
async def get_registration(token: str) -> RegistrationTokenResponse:
    db = get_db()
    collection = db["registration"]
    doc = await collection.find_one({"update_token": token})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registrácia nebola nájdená.",
        )
    is_paid, is_locked, cancelled = _lock_flags(doc)
    return RegistrationTokenResponse(
        registration_type=doc["registration_type"],
        registrant=doc["registrant"],
        attendees=doc["attendees"],
        note=doc.get("note"),
        extra_contribution=doc.get("extra_contribution", 0),
        recreation_voucher=doc.get("recreation_voucher", False),
        voucher_billing=doc.get("voucher_billing"),
        is_paid=is_paid,
        cancelled=cancelled,
        locked=is_locked,
    )


@router.put("/registration/{token}", status_code=status.HTTP_200_OK)
async def update_registration(token: str, payload: RegistrationRequest) -> dict:
    db = get_db()
    collection = db["registration"]

    doc = await collection.find_one({"update_token": token})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registrácia nebola nájdená.",
        )
    _, is_locked, is_cancelled = _lock_flags(doc)
    if is_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registrácia je uzavretá, zmeny nie sú možné.",
        )
    if is_cancelled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Táto registrácia bola zrušená.",
        )

    update_fields = {
        "registration_type": payload.registration_type,
        "registrant": payload.registrant.model_dump(),
        "attendees": [a.model_dump() for a in payload.attendees],
        "note": payload.note or None,
        "extra_contribution": payload.extra_contribution,
        "recreation_voucher": payload.recreation_voucher,
        "voucher_billing": (
            payload.voucher_billing.model_dump() if payload.voucher_billing else None
        ),
    }
    await collection.update_one({"update_token": token}, {"$set": update_fields})

    logger.info("Registration updated via token for %s.", payload.registrant.email)
    return {"message": "Registrácia bola aktualizovaná."}


@router.delete("/registration/{token}", status_code=status.HTTP_200_OK)
async def cancel_registration(token: str) -> dict:
    db = get_db()
    collection = db["registration"]

    doc = await collection.find_one({"update_token": token})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registrácia nebola nájdená.",
        )
    _, is_locked, _ = _lock_flags(doc)
    if is_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registrácia je uzavretá, zrušenie nie je možné.",
        )

    await collection.update_one({"update_token": token}, {"$set": {"status": "cancelled"}})

    logger.info("Registration cancelled via token for %s.", doc["registrant"]["email"])
    return {"message": "Registrácia bola zrušená."}
