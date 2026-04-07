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
    logger.debug("[email] _send_via_gmail_api: start, to=%s", to_email)
    settings = get_settings()
    logger.debug(
        "[email] credentials present: user=%s, client_id=%s, secret=%s, refresh_token=%s",
        bool(settings.gmail_user),
        bool(settings.gmail_client_id),
        bool(settings.gmail_client_secret),
        bool(settings.gmail_refresh_token),
    )

    creds = Credentials(
        token=None,
        refresh_token=settings.gmail_refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.gmail_client_id,
        client_secret=settings.gmail_client_secret,
        scopes=GMAIL_SCOPES,
    )
    logger.debug("[email] refreshing OAuth2 token...")
    creds.refresh(Request())
    logger.debug("[email] token refreshed successfully, valid=%s", creds.valid)

    mime_message = _build_message(settings.gmail_user, to_email)
    raw = base64.urlsafe_b64encode(mime_message.as_bytes()).decode()

    logger.debug("[email] calling Gmail API send...")
    service = build("gmail", "v1", credentials=creds)
    result = service.users().messages().send(userId="me", body={"raw": raw}).execute()
    logger.debug("[email] Gmail API response: %s", result)


async def send_registration_confirmation(to_email: str) -> None:
    logger.debug("[email] send_registration_confirmation called for %s", to_email)
    settings = get_settings()

    if not settings.email_enabled:
        logger.info("[email] EMAIL_ENABLED=false – skipping send to %s", to_email)
        return

    missing = [
        k
        for k, v in {
            "GMAIL_USER": settings.gmail_user,
            "GMAIL_CLIENT_ID": settings.gmail_client_id,
            "GMAIL_CLIENT_SECRET": settings.gmail_client_secret,
            "GMAIL_REFRESH_TOKEN": settings.gmail_refresh_token,
        }.items()
        if not v
    ]
    if missing:
        logger.warning(
            "[email] Gmail OAuth2 credentials not configured – skipping. Missing: %s",
            ", ".join(missing),
        )
        return

    try:
        loop = asyncio.get_event_loop()
        logger.debug("[email] dispatching to thread executor...")
        await loop.run_in_executor(None, _send_via_gmail_api, to_email)
        logger.info("[email] Confirmation email sent to %s", to_email)
    except HttpError as exc:
        logger.exception("[email] Gmail API HTTP error sending to %s: %s", to_email, exc)
        raise
    except Exception:
        logger.exception("[email] Unexpected error sending confirmation email to %s", to_email)
        raise


def _build_full_registration_message(
    sender: str, to_email: str, registrant_name: str, attendee_count: int, update_link: str
) -> MIMEMultipart:
    message = MIMEMultipart("alternative")
    message["Subject"] = "Detský biblický tábor – potvrdenie registrácie"
    message["From"] = sender
    message["To"] = to_email

    attendee_word = "účastníkov" if attendee_count != 1 else "účastníka"

    text_body = f"""\
Ahoj {registrant_name}!

Vaša registrácia na Detský biblický tábor bola úspešne prijatá.
Prihlásili ste {attendee_count} {attendee_word}.

Čoskoro sa vám ozveme s ďalšími informáciami o platbe a programe.

Pre úpravu alebo zrušenie registrácie použite tento odkaz:
{update_link}

Odkaz zostane aktívny, kým neuhradíte platbu za tábor. Po zaplatení zmeny nie sú možné.

Za prípravný tím
S. Alexovič
"""

    html_body = f"""\
<html>
  <body style="font-family: sans-serif; color: #333; margin: 0; padding: 0;">
    <div style="max-width: 600px;">
      <p>Ahoj <strong>{registrant_name}</strong>!</p>

      <p>
        Vaša registrácia na <strong>Detský biblický tábor</strong> bola úspešne prijatá.
        Prihlásili ste <strong>{attendee_count} {attendee_word}</strong>.
      </p>

      <p>
        Čoskoro sa vám ozveme s ďalšími informáciami o platbe a programe.
      </p>

      <p>
        Pre úpravu alebo zrušenie registrácie použite tento odkaz:<br>
        <a href="{update_link}">{update_link}</a>
      </p>

      <p style="color: #888; font-size: 0.9rem;">
        Odkaz zostane aktívny, kým neuhradíte platbu za tábor. Po zaplatení zmeny nie sú možné.
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


def _send_full_registration_via_gmail(
    to_email: str, registrant_name: str, attendee_count: int, update_link: str
) -> None:
    """Synchronous Gmail API call – intended to be run in a thread executor."""
    logger.debug(
        "[email] _send_full_registration_via_gmail: start, to=%s, name=%s, attendees=%d",
        to_email,
        registrant_name,
        attendee_count,
    )
    settings = get_settings()
    logger.debug(
        "[email] credentials present: user=%s, client_id=%s, secret=%s, refresh_token=%s",
        bool(settings.gmail_user),
        bool(settings.gmail_client_id),
        bool(settings.gmail_client_secret),
        bool(settings.gmail_refresh_token),
    )

    creds = Credentials(
        token=None,
        refresh_token=settings.gmail_refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.gmail_client_id,
        client_secret=settings.gmail_client_secret,
        scopes=GMAIL_SCOPES,
    )
    logger.debug("[email] refreshing OAuth2 token...")
    creds.refresh(Request())
    logger.debug("[email] token refreshed successfully, valid=%s", creds.valid)

    mime_message = _build_full_registration_message(
        settings.gmail_user, to_email, registrant_name, attendee_count, update_link
    )
    raw = base64.urlsafe_b64encode(mime_message.as_bytes()).decode()

    logger.debug("[email] calling Gmail API send...")
    service = build("gmail", "v1", credentials=creds)
    result = service.users().messages().send(userId="me", body={"raw": raw}).execute()
    logger.debug("[email] Gmail API response: %s", result)


async def send_full_registration_confirmation(
    to_email: str, registrant_name: str, attendee_count: int, update_link: str
) -> None:
    logger.debug("[email] send_full_registration_confirmation called for %s", to_email)
    settings = get_settings()

    if not settings.email_enabled:
        logger.info("[email] EMAIL_ENABLED=false – skipping send to %s", to_email)
        return

    missing = [
        k
        for k, v in {
            "GMAIL_USER": settings.gmail_user,
            "GMAIL_CLIENT_ID": settings.gmail_client_id,
            "GMAIL_CLIENT_SECRET": settings.gmail_client_secret,
            "GMAIL_REFRESH_TOKEN": settings.gmail_refresh_token,
        }.items()
        if not v
    ]
    if missing:
        logger.warning(
            "[email] Gmail OAuth2 credentials not configured – skipping. Missing: %s",
            ", ".join(missing),
        )
        return

    try:
        loop = asyncio.get_event_loop()
        logger.debug("[email] dispatching to thread executor...")
        await loop.run_in_executor(
            None,
            _send_full_registration_via_gmail,
            to_email,
            registrant_name,
            attendee_count,
            update_link,
        )
        logger.info("[email] Full registration confirmation email sent to %s", to_email)
    except HttpError as exc:
        logger.exception("[email] Gmail API HTTP error sending to %s: %s", to_email, exc)
        raise
    except Exception:
        logger.exception("[email] Unexpected error sending full registration email to %s", to_email)
        raise


# ── Payment info email ────────────────────────────────────────────────────


def _build_payment_info_message(
    sender: str,
    to_email: str,
    registrant_name: str,
    attendee_count: int,
) -> MIMEMultipart:
    message = MIMEMultipart("alternative")
    message["Subject"] = "Detský biblický tábor – informácie o platbe"
    message["From"] = sender
    message["To"] = to_email

    attendee_word = "účastníkov" if attendee_count != 1 else "účastníka"

    # TODO: Fill in your bank details below before going to production.
    bank_iban = "SK00 0000 0000 0000 0000 0000"  # TODO: set real IBAN
    bank_name = "Názov banky"  # TODO: set real bank name
    variable_symbol = ""  # TODO: define variable symbol logic (e.g. based on email or ID)
    payment_deadline = "30. apríla 2026"  # TODO: adjust deadline as needed
    amount_per_attendee = 0  # TODO: set real amount per attendee in EUR
    total_amount = amount_per_attendee * attendee_count

    text_body = f"""\
Ahoj {registrant_name}!

Ďakujeme za registráciu na Detský biblický tábor.
Zaregistrovali ste {attendee_count} {attendee_word}.

Pre dokončenie registrácie prosíme uhradiť registračný poplatok:

  Suma:              {total_amount} EUR
  IBAN:              {bank_iban}
  Banka:             {bank_name}
  Variabilný symbol: {variable_symbol}
  Termín platby:     {payment_deadline}

Po prijatí platby vás budeme informovať e-mailom.

Za prípravný tím
S. Alexovič
"""

    html_body = f"""\
<html>
  <body style="font-family: sans-serif; color: #333; margin: 0; padding: 0;">
    <div style="max-width: 600px;">
      <p>Ahoj <strong>{registrant_name}</strong>!</p>

      <p>
        Ďakujeme za registráciu na <strong>Detský biblický tábor</strong>.
        Zaregistrovali ste <strong>{attendee_count} {attendee_word}</strong>.
      </p>

      <p>Pre dokončenie registrácie prosíme uhradiť registračný poplatok:</p>

      <table style="border-collapse: collapse; margin: 1rem 0;">
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #666;">Suma:</td>
          <td style="padding: 4px 0;"><strong>{total_amount} EUR</strong></td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #666;">IBAN:</td>
          <td style="padding: 4px 0;"><strong>{bank_iban}</strong></td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #666;">Banka:</td>
          <td style="padding: 4px 0;">{bank_name}</td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #666;">Variabilný symbol:</td>
          <td style="padding: 4px 0;"><strong>{variable_symbol}</strong></td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #666;">Termín platby:</td>
          <td style="padding: 4px 0;">{payment_deadline}</td>
        </tr>
      </table>

      <p>Po prijatí platby vás budeme informovať e-mailom.</p>

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


def _send_payment_info_via_gmail(
    to_email: str,
    registrant_name: str,
    attendee_count: int,
) -> None:
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

    mime_message = _build_payment_info_message(settings.gmail_user, to_email, registrant_name, attendee_count)
    raw = base64.urlsafe_b64encode(mime_message.as_bytes()).decode()

    service = build("gmail", "v1", credentials=creds)
    service.users().messages().send(userId="me", body={"raw": raw}).execute()


async def send_payment_info_email(
    to_email: str,
    registrant_name: str,
    attendee_count: int,
) -> None:
    settings = get_settings()

    if not all(
        [
            settings.gmail_user,
            settings.gmail_client_id,
            settings.gmail_client_secret,
            settings.gmail_refresh_token,
        ]
    ):
        logger.warning("Gmail OAuth2 credentials not configured – skipping payment info email.")
        return

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            _send_payment_info_via_gmail,
            to_email,
            registrant_name,
            attendee_count,
        )
        logger.info("Payment info email sent to %s", to_email)
    except HttpError as exc:
        logger.exception("Gmail API error sending payment info to %s: %s", to_email, exc)
        raise
    except Exception:
        logger.exception("Failed to send payment info email to %s", to_email)
        raise
