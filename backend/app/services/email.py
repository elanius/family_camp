import asyncio
import base64
import logging
from email.mime.image import MIMEImage
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
    iban: str,
    bank_name: str,
    amount: int,
    variable_symbol: str,
    recipient_note: str,
    qr_png_bytes: bytes | None = None,
) -> MIMEMultipart:
    outer = MIMEMultipart("related")
    outer["Subject"] = "Detský biblický tábor – informácie o platbe"
    outer["From"] = sender
    outer["To"] = to_email

    alt = MIMEMultipart("alternative")
    outer.attach(alt)

    payment_deadline = "30. apríla 2026"

    qr_block_html = (
        (
            '<p style="margin: 1.5rem 0 0.5rem;">'
            '<img src="cid:qrcode" alt="Pay by Square QR kód" width="200" height="200">'
            "</p>"
            '<p style="color: #888; font-size: 0.85rem; margin: 0;">Oskenujte v svojej bankovej aplikácii</p>'
        )
        if qr_png_bytes
        else ""
    )

    text_body = f"""\
Ahoj {registrant_name}!

Ďakujeme za registráciu na Detský biblický tábor.

Pre dokončenie registrácie prosíme uhradiť registračný poplatok:

  Suma:              {amount} EUR
  IBAN:              {iban}
  Banka:             {bank_name}
  Variabilný symbol: {variable_symbol}
  Správa pre príjemcu: {recipient_note}
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

      <p>Ďakujeme za registráciu na <strong>Detský biblický tábor</strong>.</p>

      <p>Pre dokončenie registrácie prosíme uhradiť registračný poplatok:</p>

      <table style="border-collapse: collapse; margin: 1rem 0;">
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #666;">Suma:</td>
          <td style="padding: 4px 0;"><strong>{amount} EUR</strong></td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #666;">IBAN:</td>
          <td style="padding: 4px 0; font-family: monospace;"><strong>{iban}</strong></td>
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
          <td style="padding: 4px 16px 4px 0; color: #666;">Správa pre príjemcu:</td>
          <td style="padding: 4px 0;">{recipient_note}</td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #666;">Termín platby:</td>
          <td style="padding: 4px 0;">{payment_deadline}</td>
        </tr>
      </table>

      {qr_block_html}

      <p style="margin-top: 1.5rem;">Po prijatí platby vás budeme informovať e-mailom.</p>

      <p style="margin-top: 2rem; color: #888; font-size: 0.9rem;">
        Za prípravný tím<br>
        S. Alexovič
      </p>
    </div>
  </body>
</html>
"""

    alt.attach(MIMEText(text_body, "plain", "utf-8"))
    alt.attach(MIMEText(html_body, "html", "utf-8"))

    if qr_png_bytes:
        img = MIMEImage(qr_png_bytes, _subtype="png")
        img.add_header("Content-ID", "<qrcode>")
        img.add_header("Content-Disposition", "inline", filename="platba.png")
        outer.attach(img)

    return outer


def _send_payment_info_via_gmail(
    to_email: str,
    registrant_name: str,
    iban: str,
    bank_name: str,
    amount: int,
    variable_symbol: str,
    recipient_note: str,
    qr_png_bytes: bytes | None,
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

    mime_message = _build_payment_info_message(
        settings.gmail_user,
        to_email,
        registrant_name,
        iban,
        bank_name,
        amount,
        variable_symbol,
        recipient_note,
        qr_png_bytes,
    )
    raw = base64.urlsafe_b64encode(mime_message.as_bytes()).decode()

    service = build("gmail", "v1", credentials=creds)
    service.users().messages().send(userId="me", body={"raw": raw}).execute()


async def send_payment_info_email(
    to_email: str,
    registrant_name: str,
    iban: str = "",
    bank_name: str = "",
    amount: int = 0,
    variable_symbol: str = "",
    recipient_note: str = "",
    qr_png_bytes: bytes | None = None,
    attendee_count: int = 0,  # kept for backward compat, unused
) -> None:
    settings = get_settings()

    if not settings.email_enabled:
        logger.info("[email] EMAIL_ENABLED=false – skipping payment info email to %s", to_email)
        return

    if not all(
        [settings.gmail_user, settings.gmail_client_id, settings.gmail_client_secret, settings.gmail_refresh_token]
    ):
        logger.warning("[email] Gmail OAuth2 credentials not configured – skipping payment info email.")
        return

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            _send_payment_info_via_gmail,
            to_email,
            registrant_name,
            iban,
            bank_name,
            amount,
            variable_symbol,
            recipient_note,
            qr_png_bytes,
        )
        logger.info("[email] Payment info email sent to %s", to_email)
    except HttpError as exc:
        logger.exception("[email] Gmail API error sending payment info to %s: %s", to_email, exc)
        raise
    except Exception:
        logger.exception("[email] Failed to send payment info email to %s", to_email)
        raise


# ── Sub-attendee notification email ────────────────────────────────────────


def _build_sub_attendee_notification_message(
    sender: str, to_email: str, attendee_name: str, registered_by_name: str
) -> MIMEMultipart:
    message = MIMEMultipart("alternative")
    message["Subject"] = "Detský biblický tábor – potvrdenie účasti"
    message["From"] = sender
    message["To"] = to_email

    text_body = f"""\
Ahoj {attendee_name}!

Potvrdzujeme, že ste boli zaregistrovaný/á na Detský biblický tábor.
Registráciu vykonal/a: {registered_by_name}

Za prípravný tím
S. Alexovič
"""

    html_body = f"""\
<html>
  <body style="font-family: sans-serif; color: #333; margin: 0; padding: 0;">
    <div style="max-width: 600px;">
      <p>Ahoj <strong>{attendee_name}</strong>!</p>

      <p>
        Potvrdzujeme, že ste boli zaregistrovaný/á na <strong>Detský biblický tábor</strong>.
      </p>

      <p>
        Registráciu vykonal/a: <strong>{registered_by_name}</strong>
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


def _send_sub_attendee_notification_via_gmail(
    to_email: str, attendee_name: str, registered_by_name: str
) -> None:
    """Synchronous Gmail API call – intended to be run in a thread executor."""
    logger.debug(
        "[email] _send_sub_attendee_notification_via_gmail: start, to=%s, attendee=%s, registered_by=%s",
        to_email,
        attendee_name,
        registered_by_name,
    )
    settings = get_settings()

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

    mime_message = _build_sub_attendee_notification_message(
        settings.gmail_user, to_email, attendee_name, registered_by_name
    )
    raw = base64.urlsafe_b64encode(mime_message.as_bytes()).decode()

    logger.debug("[email] calling Gmail API send...")
    service = build("gmail", "v1", credentials=creds)
    result = service.users().messages().send(userId="me", body={"raw": raw}).execute()
    logger.debug("[email] Gmail API response: %s", result)


async def send_sub_attendee_notification(
    to_email: str, attendee_name: str, registered_by_name: str
) -> None:
    """Send notification email to sub-attendee informing them they were registered."""
    logger.debug("[email] send_sub_attendee_notification called for %s", to_email)
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
            _send_sub_attendee_notification_via_gmail,
            to_email,
            attendee_name,
            registered_by_name,
        )
        logger.info("[email] Sub-attendee notification email sent to %s", to_email)
    except HttpError as exc:
        logger.exception("[email] Gmail API HTTP error sending to %s: %s", to_email, exc)
        raise
    except Exception:
        logger.exception("[email] Unexpected error sending sub-attendee notification to %s", to_email)
        raise
