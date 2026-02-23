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


def _build_message(sender: str, to_email: str) -> MIMEMultipart:
    message = MIMEMultipart("alternative")
    message["Subject"] = "Detský biblický tábor – registrujeme váš záujem"
    message["From"] = sender
    message["To"] = to_email

    text_body = f"""\
Ahoj!

Ďakujeme za váš záujem o detský biblický tábor.
Vašu e-mailovú adresu ({to_email}) sme si zaznamenali.

Keď spustíme registráciu, budeme vás medzi prvými informovať.

Za prípravný tím
S. Alexovič
"""

    html_body = f"""\
<html>
  <body style="font-family: sans-serif; color: #333; margin: 0; padding: 0;">
    <div style="max-width: 600px;">
      <p>Ahoj!</p>

      <p>
        Ďakujeme za váš záujem o detský biblický tábor.
        Vašu e-mailovú adresu <strong>{to_email}</strong> sme si zaznamenali.
      </p>

      <p>
        Keď spustíme registráciu, budeme vás medzi prvými informovať.
      </p>

      <p style="margin-top: 2rem; color: #888; font-size: 0.9rem;">
        Za prípravný tím<br>
        S. Alexovič
      </p>
    </div>
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

    mime_message = _build_message(settings.gmail_user, to_email)
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
