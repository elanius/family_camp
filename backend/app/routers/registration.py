import logging
import secrets

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import EmailStr

from app.config import get_settings
from app.database import get_db
from app.models import RegistrationRecord, RegistrationRequest, RegistrationTokenResponse
from app.services.email import send_full_registration_confirmation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["full-registration"])


@router.post("/registration", status_code=status.HTTP_201_CREATED)
async def register(payload: RegistrationRequest) -> dict:
    db = get_db()
    collection = db["registration"]

    # Duplicate email check — reject if an active (non-rejected) record exists.
    # Handles both legacy docs (cancelled field) and new docs (status field).
    existing = await collection.find_one(
        {
            "registrant.email": str(payload.registrant.email),
            "$or": [
                {"status": {"$nin": ["rejected"]}},
                {"status": {"$exists": False}, "cancelled": {"$ne": True}},
            ],
        }
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Tento e-mail je už zaregistrovaný. Pre úpravu registrácie použite odkaz, "
                "ktorý ste dostali v potvrdzovacom e-maile."
            ),
        )

    token = secrets.token_urlsafe(32)
    record = RegistrationRecord(
        registration_type=payload.registration_type,
        registrant=payload.registrant,
        attendees=payload.attendees,
        note=payload.note or None,
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

    try:
        await send_full_registration_confirmation(
            to_email=str(payload.registrant.email),
            registrant_name=payload.registrant.name,
            attendee_count=len(payload.attendees),
            update_link=update_link,
        )
    except Exception:
        logger.warning("Confirmation email failed for %s – continuing.", payload.registrant.email)

    return {"message": "Registrácia prebehla úspešne."}


# NOTE: This route MUST be defined before /{token} to avoid path conflict.
@router.get("/registration/check-email", status_code=status.HTTP_200_OK)
async def check_email(email: EmailStr = Query(...)) -> dict:
    """Returns {"exists": true} if this email belongs to an active (non-cancelled) registration."""
    db = get_db()
    collection = db["registration"]
    doc = await collection.find_one(
        {
            "registrant.email": str(email),
            "$or": [
                {"status": {"$nin": ["rejected"]}},
                {"status": {"$exists": False}, "cancelled": {"$ne": True}},
            ],
        },
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
    doc_status = doc.get("status")
    if doc_status is not None:
        is_paid = doc_status in ("paid", "accepted")
        cancelled = doc_status == "rejected"
    else:
        is_paid = doc.get("is_paid", False)
        cancelled = doc.get("cancelled", False)
    return RegistrationTokenResponse(
        registration_type=doc["registration_type"],
        registrant=doc["registrant"],
        attendees=doc["attendees"],
        note=doc.get("note"),
        is_paid=is_paid,
        cancelled=cancelled,
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
    doc_status = doc.get("status")
    if doc_status is not None:
        is_locked = doc_status in ("paid", "accepted")
        is_cancelled = doc_status == "rejected"
    else:
        is_locked = doc.get("is_paid", False)
        is_cancelled = doc.get("cancelled", False)
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

    # If the email is changing, ensure the new one is not already taken.
    new_email = str(payload.registrant.email)
    old_email = doc["registrant"]["email"]
    if new_email != old_email:
        conflict = await collection.find_one(
            {
                "registrant.email": new_email,
                "update_token": {"$ne": token},
                "$or": [
                    {"status": {"$nin": ["rejected"]}},
                    {"status": {"$exists": False}, "cancelled": {"$ne": True}},
                ],
            },
            projection={"_id": 1},
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Tento e-mail je už zaregistrovaný. Pre úpravu registrácie použite odkaz, "
                    "ktorý ste dostali v potvrdzovacom e-maile."
                ),
            )

    update_fields = {
        "registration_type": payload.registration_type,
        "registrant": payload.registrant.model_dump(),
        "attendees": [a.model_dump() for a in payload.attendees],
        "note": payload.note or None,
    }
    await collection.update_one({"update_token": token}, {"$set": update_fields})

    logger.info("Registration updated via token for %s.", new_email)
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
    doc_status = doc.get("status")
    if doc_status is not None:
        is_locked = doc_status in ("paid", "accepted")
    else:
        is_locked = doc.get("is_paid", False)
    if is_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registrácia je uzavretá, zrušenie nie je možné.",
        )

    await collection.update_one({"update_token": token}, {"$set": {"status": "rejected"}})

    logger.info("Registration cancelled via token for %s.", doc["registrant"]["email"])
    return {"message": "Registrácia bola zrušená."}
