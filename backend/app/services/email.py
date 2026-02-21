import asyncio
import base64
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.config import get_settings

logger = logging.getLogger(__name__)

GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send"]


def _build_message(sender: str, to_email: str, subject: str) -> MIMEMultipart:
    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = to_email

    text_body = f"""\
Ahoj!

Děkujeme za váš zájem o Rodinný tábor.
Váš e-mail ({to_email}) jsme si zaznamenali.

Jakmile spustíme registrace, dáme vám vědět jako prvním.

Tým Rodinného tábora
"""

    html_body = f"""\
<html>
  <body style="font-family: sans-serif; color: #333; max-width: 600px; margin: auto;">
    <h2 style="color: #4a7c59;">Rodinný tábor</h2>
    <p>Ahoj!</p>
    <p>
      Děkujeme za váš zájem. Váš e-mail
      <strong>{to_email}</strong> jsme si zaznamenali.
    </p>
    <p>
      Jakmile spustíme registrace, dáme vám vědět jako prvním.
    </p>
    <p style="margin-top: 2rem; color: #888; font-size: 0.9rem;">
      Tým Rodinného tábora
    </p>
  </body>
</html>
"""

    message.attach(MIMEText(text_body, "plain", "utf-8"))
    message.attach(MIMEText(html_body, "html", "utf-8"))
    return message


def _send_via_gmail_api(to_email: str) -> None:
    """Synchronous Gmail API call – intended to be run in a thread executor."""
    settings = get_settings()

    creds = Credentials(
        token=None,
        refresh_token=settings.gmail_refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.gmail_client_id,
        client_secret=settings.gmail_client_secret,
        scopes=GMAIL_SCOPES,
    )
    creds.refresh(Request())

    sender = settings.notification_from or settings.gmail_user
    mime_message = _build_message(sender, to_email, settings.notification_subject)
    raw = base64.urlsafe_b64encode(mime_message.as_bytes()).decode()

    service = build("gmail", "v1", credentials=creds)
    service.users().messages().send(userId="me", body={"raw": raw}).execute()


async def send_registration_confirmation(to_email: str) -> None:
    settings = get_settings()

    if not all([
        settings.gmail_user,
        settings.gmail_client_id,
        settings.gmail_client_secret,
        settings.gmail_refresh_token,
    ]):
        logger.warning("Gmail OAuth2 credentials not configured – skipping email send.")
        return

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send_via_gmail_api, to_email)
        logger.info("Confirmation email sent to %s", to_email)
    except HttpError as exc:
        logger.exception("Gmail API error sending to %s: %s", to_email, exc)
        raise
    except Exception:
        logger.exception("Failed to send confirmation email to %s", to_email)
        raise
