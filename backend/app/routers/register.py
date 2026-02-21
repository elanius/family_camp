import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from app.database import get_db
from app.models import EmailRegistration, EmailRegistrationRecord
from app.services.email import send_registration_confirmation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["registration"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_email(payload: EmailRegistration) -> dict:
    db = get_db()
    collection = db["preregistration"]

    # Prevent duplicates
    existing = await collection.find_one({"email": payload.email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already registered.",
        )

    record = EmailRegistrationRecord(
        email=payload.email,
        registered_at=datetime.now(timezone.utc),
    )
    await collection.insert_one(record.model_dump())
    logger.info("New registration: %s", payload.email)

    try:
        await send_registration_confirmation(payload.email)
    except Exception:
        # Email failure is non-fatal; DB record is already saved.
        logger.warning("Email notification failed for %s – continuing.", payload.email)

    return {"message": "Registration successful. We will be in touch!"}
