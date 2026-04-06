import logging

from fastapi import APIRouter, HTTPException, status

from app.database import get_db
from app.models import RegistrationRequest, RegistrationRecord
from app.services.email import send_full_registration_confirmation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["full-registration"])


@router.post("/registration", status_code=status.HTTP_201_CREATED)
async def register(payload: RegistrationRequest) -> dict:
    db = get_db()
    collection = db["registration"]

    record = RegistrationRecord(
        registration_type=payload.registration_type,
        registrant=payload.registrant,
        attendees=payload.attendees,
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

    try:
        await send_full_registration_confirmation(
            to_email=str(payload.registrant.email),
            registrant_name=payload.registrant.name,
            attendee_count=len(payload.attendees),
        )
    except Exception:
        logger.warning(
            "Confirmation email failed for %s – continuing.", payload.registrant.email
        )

    return {"message": "Registrácia prebehla úspešne."}
