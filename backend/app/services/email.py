import asyncio
import hashlib
import logging
import smtplib
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

from app.config import get_settings

logger = logging.getLogger(__name__)

EVENT_NAME = "Vzdelávanie EVS 2026"
EVENT_DATES = "23. – 25. októbra 2026"
EVENT_PLACE = "Hotel Máj***, Liptovský Ján"
CONTACT_EMAIL = "lydia@evs.sk"
CONTACT_PHONE = "0911 798 800"

SIGNATURE_TEXT = f"""\
S pozdravom
tím EVS

{CONTACT_EMAIL} · {CONTACT_PHONE}
"""

SIGNATURE_HTML = f"""\
      <p style="margin-top: 2rem; color: #6b7280; font-size: 0.9rem; line-height: 1.6;">
        S pozdravom<br>
        <strong style="color: #374151;">tím EVS</strong><br>
        <a href="mailto:{CONTACT_EMAIL}" style="color: #6b7280;">{CONTACT_EMAIL}</a> ·
        {CONTACT_PHONE}
      </p>
"""

HTML_OPEN = """\
<html>
  <body style="font-family: Georgia, 'Times New Roman', serif; color: #1f2937; margin: 0; padding: 0; line-height: 1.7;">
    <div style="max-width: 600px;">
"""

HTML_CLOSE = """\
    </div>
  </body>
</html>
"""


def _smtp_send(mime_message: MIMEMultipart) -> None:
    """Send a pre-built MIME message via the configured SMTP server."""
    settings = get_settings()
    try:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port) as smtp:
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(mime_message)
    except smtplib.SMTPAuthenticationError:
        # Fingerprint (never the raw secret) so a mismatched deployed env var can be
        # diagnosed by comparing against the hash of the known-good local value.
        digest = hashlib.sha256(settings.smtp_password.encode()).hexdigest()[:12]
        logger.error(
            "[email] SMTP auth failed for user=%r password_len=%d password_sha256=%s",
            settings.smtp_user,
            len(settings.smtp_password),
            digest,
        )
        raise


def _credentials_missing() -> list[str]:
    """Return the names of SMTP settings that are not configured."""
    settings = get_settings()
    return [
        k
        for k, v in {
            "SMTP_HOST": settings.smtp_host,
            "SMTP_USER": settings.smtp_user,
            "SMTP_PASSWORD": settings.smtp_password,
        }.items()
        if not v
    ]


async def _dispatch(send_fn, to_email: str, *args) -> None:
    """Run a blocking SMTP send off the event loop, honouring EMAIL_ENABLED."""
    settings = get_settings()

    if not settings.email_enabled:
        logger.info("[email] EMAIL_ENABLED=false – skipping send to %s", to_email)
        return

    if missing := _credentials_missing():
        logger.warning(
            "[email] SMTP credentials not configured – skipping. Missing: %s",
            ", ".join(missing),
        )
        return

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, send_fn, to_email, *args)


# ── Interest / pre-registration email ────────────────────────────────────


def _build_message(sender: str, to_email: str) -> MIMEMultipart:
    message = MIMEMultipart("alternative")
    message["Subject"] = f"{EVENT_NAME} – registrujeme váš záujem"
    message["From"] = sender
    message["To"] = to_email

    text_body = f"""\
Dobrý deň,

ďakujeme za váš záujem o {EVENT_NAME}.
Vašu e-mailovú adresu ({to_email}) sme si zaznamenali.

Akonáhle otvoríme prihlasovanie, budeme vás informovať medzi prvými.

{SIGNATURE_TEXT}"""

    html_body = f"""\
{HTML_OPEN}      <p>Dobrý deň,</p>

      <p>
        ďakujeme za váš záujem o <strong>{EVENT_NAME}</strong>.
        Vašu e-mailovú adresu <strong>{to_email}</strong> sme si zaznamenali.
      </p>

      <p>Akonáhle otvoríme prihlasovanie, budeme vás informovať medzi prvými.</p>

{SIGNATURE_HTML}{HTML_CLOSE}"""

    message.attach(MIMEText(text_body, "plain", "utf-8"))
    message.attach(MIMEText(html_body, "html", "utf-8"))
    return message


def _send_via_smtp(to_email: str) -> None:
    settings = get_settings()
    _smtp_send(_build_message(settings.smtp_user, to_email))


async def send_registration_confirmation(to_email: str) -> None:
    logger.debug("[email] send_registration_confirmation called for %s", to_email)
    try:
        await _dispatch(_send_via_smtp, to_email)
        logger.info("[email] Confirmation email sent to %s", to_email)
    except Exception:
        logger.exception("[email] Unexpected error sending confirmation email to %s", to_email)
        raise


# ── Full registration confirmation ───────────────────────────────────────


def _payment_paragraphs(hotel_amount: int, transfer_due: int) -> tuple[str, str]:
    """The "how you pay" part of the confirmation, as (plain text, html).

    A recreation voucher moves the stay to the hotel reception; only what is left
    (the voluntary contribution, if any) is invoiced by e-mail.
    """
    texts: list[str] = []
    htmls: list[str] = []

    if hotel_amount:
        texts.append(
            f"Ubytovanie a stravu ({hotel_amount} EUR) uhradíte priamo v hoteli pri\n"
            "príchode — hotel vám na fakturačné údaje z prihlášky vystaví faktúru\n"
            "potrebnú na uplatnenie rekreačného poukazu."
        )
        htmls.append(
            "      <p>\n"
            f"        Ubytovanie a stravu (<strong>{hotel_amount} EUR</strong>) uhradíte priamo\n"
            "        v hoteli pri príchode — hotel vám na fakturačné údaje z prihlášky\n"
            "        vystaví faktúru potrebnú na uplatnenie rekreačného poukazu.\n"
            "      </p>"
        )

    if transfer_due:
        what = "k úhrade dobrovoľného príspevku" if hotel_amount else "k úhrade"
        texts.append(f"Informácie {what} vám pošleme v samostatnom e-maily.")
        htmls.append(f"      <p>Informácie {what} vám pošleme v samostatnom e-maily.</p>")
    elif hotel_amount:
        texts.append("Nič ďalšie prevodom neuhrádzate.")
        htmls.append("      <p>Nič ďalšie prevodom neuhrádzate.</p>")

    return "\n\n".join(texts), "\n".join(htmls)


def _build_full_registration_message(
    sender: str,
    to_email: str,
    registrant_name: str,
    attendee_names: list[str],
    update_link: str,
    hotel_amount: int = 0,
    transfer_due: int = 0,
) -> MIMEMultipart:
    message = MIMEMultipart("alternative")
    message["Subject"] = f"{EVENT_NAME} – potvrdenie prihlášky"
    message["From"] = sender
    message["To"] = to_email

    count = len(attendee_names)
    person_word = "osoba" if count == 1 else ("osoby" if count > 1 and count < 5 else "osôb")
    list_items = "".join(
        f"        <li>{escape(name)}</li>\n" for name in attendee_names
    )

    payment_text, payment_html = _payment_paragraphs(hotel_amount, transfer_due)
    # The update link only closes when a payment e-mail follows.
    lock_text = (
        "\nKeď dostanete informácie k úhrade, prihláška sa už nebude dať upraviť.\n"
        if transfer_due
        else ""
    )
    lock_html = (
        "\n      <p>Keď dostanete informácie k úhrade, prihláška sa už nebude dať upraviť.</p>\n"
        if transfer_due
        else ""
    )

    attendee_text = "".join(f"- {name}\n" for name in attendee_names)
    attendee_html = (
        "      <ul style=\"margin: 0.5rem 0 1.25rem; padding-left: 1.25rem;\">\n"
        f"{list_items}"
        "      </ul>\n"
        if attendee_names
        else ""
    )

    text_body = f"""\
Dobrý deň, {registrant_name},

prijali sme vašu prihlášku na {EVENT_NAME}.

Prihlásili ste {count} {person_word}:

{attendee_text}Termín: {EVENT_DATES}
Miesto: {EVENT_PLACE}

Začíname v piatok o 16:00 prednáškou, končíme v nedeľu obedom.

{payment_text}

Prihlášku môžete upraviť alebo zrušiť cez tento odkaz:
{update_link}
{lock_text}
{SIGNATURE_TEXT}"""

    html_body = f"""\
{HTML_OPEN}      <p>Dobrý deň, <strong>{registrant_name}</strong>,</p>

      <p>prijali sme vašu prihlášku na <strong>{EVENT_NAME}</strong>.</p>

      <p>Prihlásili ste {count} {person_word}:</p>

{attendee_html}
      <table style="border-collapse: collapse; margin: 1.25rem 0;">
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Termín:</td>
          <td style="padding: 4px 0;"><strong>{EVENT_DATES}</strong></td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Miesto:</td>
          <td style="padding: 4px 0;"><strong>{EVENT_PLACE}</strong></td>
        </tr>
      </table>

      <p>Začíname v piatok o 16:00 prednáškou, končíme v nedeľu obedom.</p>

{payment_html}

      <p>Prihlášku môžete upraviť alebo zrušiť cez tento odkaz:</p>
      <p><a href="{update_link}">{update_link}</a></p>
{lock_html}
{SIGNATURE_HTML}{HTML_CLOSE}"""

    message.attach(MIMEText(text_body, "plain", "utf-8"))
    message.attach(MIMEText(html_body, "html", "utf-8"))
    return message


def _send_full_registration_via_smtp(
    to_email: str,
    registrant_name: str,
    attendee_names: list[str],
    update_link: str,
    hotel_amount: int,
    transfer_due: int,
) -> None:
    settings = get_settings()
    _smtp_send(
        _build_full_registration_message(
            settings.smtp_user,
            to_email,
            registrant_name,
            attendee_names,
            update_link,
            hotel_amount,
            transfer_due,
        )
    )


async def send_full_registration_confirmation(
    to_email: str,
    registrant_name: str,
    attendee_names: list[str],
    update_link: str,
    hotel_amount: int = 0,
    transfer_due: int = 0,
) -> None:
    logger.debug("[email] send_full_registration_confirmation called for %s", to_email)
    try:
        await _dispatch(
            _send_full_registration_via_smtp,
            to_email,
            registrant_name,
            attendee_names,
            update_link,
            hotel_amount,
            transfer_due,
        )
        logger.info("[email] Full registration confirmation email sent to %s", to_email)
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
    outer["Subject"] = f"{EVENT_NAME} – informácie o platbe"
    outer["From"] = sender
    outer["To"] = to_email

    alt = MIMEMultipart("alternative")
    outer.attach(alt)

    qr_block_html = (
        (
            '<p style="margin: 1.5rem 0 0.5rem;">'
            '<img src="cid:qrcode" alt="Pay by Square QR kód" width="200" height="200">'
            "</p>"
            '<p style="color: #9ca3af; font-size: 0.85rem; margin: 0;">'
            "Oskenujte vo svojej bankovej aplikácii</p>"
        )
        if qr_png_bytes
        else ""
    )

    text_body = f"""\
Dobrý deň, {registrant_name},

ďakujeme za prihlášku na {EVENT_NAME}.

Prihlášku prosíme uhradiť nasledovne:

  Suma:                {amount} EUR
  IBAN:                {iban}
  Banka:               {bank_name}
  Variabilný symbol:   {variable_symbol}
  Správa pre príjemcu: {recipient_note}

Po prijatí platby vás budeme informovať e-mailom.

{SIGNATURE_TEXT}"""

    html_body = f"""\
{HTML_OPEN}      <p>Dobrý deň, <strong>{registrant_name}</strong>,</p>

      <p>ďakujeme za prihlášku na <strong>{EVENT_NAME}</strong>.</p>

      <p>Prihlášku prosíme uhradiť nasledovne:</p>

      <table style="border-collapse: collapse; margin: 1rem 0;">
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Suma:</td>
          <td style="padding: 4px 0;"><strong>{amount} EUR</strong></td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">IBAN:</td>
          <td style="padding: 4px 0; font-family: monospace;"><strong>{iban}</strong></td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Banka:</td>
          <td style="padding: 4px 0;">{bank_name}</td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Variabilný symbol:</td>
          <td style="padding: 4px 0;"><strong>{variable_symbol}</strong></td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Správa pre príjemcu:</td>
          <td style="padding: 4px 0;">{recipient_note}</td>
        </tr>
      </table>

      {qr_block_html}

      <p style="margin-top: 1.5rem;">Po prijatí platby vás budeme informovať e-mailom.</p>

{SIGNATURE_HTML}{HTML_CLOSE}"""

    alt.attach(MIMEText(text_body, "plain", "utf-8"))
    alt.attach(MIMEText(html_body, "html", "utf-8"))

    if qr_png_bytes:
        img = MIMEImage(qr_png_bytes, _subtype="png")
        img.add_header("Content-ID", "<qrcode>")
        img.add_header("Content-Disposition", "inline", filename="platba.png")
        outer.attach(img)

    return outer


def _send_payment_info_via_smtp(
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
    _smtp_send(
        _build_payment_info_message(
            settings.smtp_user,
            to_email,
            registrant_name,
            iban,
            bank_name,
            amount,
            variable_symbol,
            recipient_note,
            qr_png_bytes,
        )
    )


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
    try:
        await _dispatch(
            _send_payment_info_via_smtp,
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
    except Exception:
        logger.exception("[email] Failed to send payment info email to %s", to_email)
        raise


# ── Sub-attendee notification email ────────────────────────────────────────


def _build_sub_attendee_notification_message(
    sender: str, to_email: str, attendee_name: str, registered_by_name: str
) -> MIMEMultipart:
    message = MIMEMultipart("alternative")
    message["Subject"] = f"{EVENT_NAME} – potvrdenie účasti"
    message["From"] = sender
    message["To"] = to_email

    text_body = f"""\
Dobrý deň, {attendee_name},

potvrdzujeme, že ste prihlásený/á na {EVENT_NAME}.
Prihlášku podal/a: {registered_by_name}

Termín: {EVENT_DATES}
Miesto: {EVENT_PLACE}

{SIGNATURE_TEXT}"""

    html_body = f"""\
{HTML_OPEN}      <p>Dobrý deň, <strong>{attendee_name}</strong>,</p>

      <p>potvrdzujeme, že ste prihlásený/á na <strong>{EVENT_NAME}</strong>.</p>

      <p>Prihlášku podal/a: <strong>{registered_by_name}</strong></p>

      <table style="border-collapse: collapse; margin: 1.25rem 0;">
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Termín:</td>
          <td style="padding: 4px 0;"><strong>{EVENT_DATES}</strong></td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Miesto:</td>
          <td style="padding: 4px 0;"><strong>{EVENT_PLACE}</strong></td>
        </tr>
      </table>

{SIGNATURE_HTML}{HTML_CLOSE}"""

    message.attach(MIMEText(text_body, "plain", "utf-8"))
    message.attach(MIMEText(html_body, "html", "utf-8"))
    return message


def _send_sub_attendee_notification_via_smtp(
    to_email: str, attendee_name: str, registered_by_name: str
) -> None:
    settings = get_settings()
    _smtp_send(
        _build_sub_attendee_notification_message(
            settings.smtp_user, to_email, attendee_name, registered_by_name
        )
    )


async def send_sub_attendee_notification(
    to_email: str, attendee_name: str, registered_by_name: str
) -> None:
    """Send notification email to a sub-attendee informing them they were registered."""
    logger.debug("[email] send_sub_attendee_notification called for %s", to_email)
    try:
        await _dispatch(
            _send_sub_attendee_notification_via_smtp, to_email, attendee_name, registered_by_name
        )
        logger.info("[email] Sub-attendee notification email sent to %s", to_email)
    except Exception:
        logger.exception("[email] Unexpected error sending sub-attendee notification to %s", to_email)
        raise


# ── Payment received confirmation email ──────────────────────────────────


def _build_payment_received_message(
    sender: str, to_email: str, registrant_name: str, variable_symbol: str
) -> MIMEMultipart:
    message = MIMEMultipart("alternative")
    message["Subject"] = f"{EVENT_NAME} – platba prijatá"
    message["From"] = sender
    message["To"] = to_email

    text_body = f"""\
Dobrý deň, {registrant_name},

vašu platbu za {EVENT_NAME} sme prijali (variabilný symbol: {variable_symbol}).

Vaša prihláška je tým potvrdená. Pred pobytom vám pošleme ešte podrobné
informácie k programu. Tešíme sa na vás!

{SIGNATURE_TEXT}"""

    html_body = f"""\
{HTML_OPEN}      <p>Dobrý deň, <strong>{registrant_name}</strong>,</p>

      <p>
        vašu platbu za <strong>{EVENT_NAME}</strong> sme prijali
        (variabilný symbol: <strong>{variable_symbol}</strong>).
      </p>

      <p>
        Vaša prihláška je tým potvrdená. Pred pobytom vám pošleme ešte podrobné
        informácie k programu. Tešíme sa na vás!
      </p>

{SIGNATURE_HTML}{HTML_CLOSE}"""

    message.attach(MIMEText(text_body, "plain", "utf-8"))
    message.attach(MIMEText(html_body, "html", "utf-8"))
    return message


def _send_payment_received_via_smtp(to_email: str, registrant_name: str, variable_symbol: str) -> None:
    settings = get_settings()
    _smtp_send(
        _build_payment_received_message(settings.smtp_user, to_email, registrant_name, variable_symbol)
    )


async def send_payment_received_confirmation(to_email: str, registrant_name: str, variable_symbol: str) -> None:
    """Send confirmation email to registrant when admin marks payment as received."""
    logger.debug("[email] send_payment_received_confirmation called for %s", to_email)
    try:
        await _dispatch(_send_payment_received_via_smtp, to_email, registrant_name, variable_symbol)
        logger.info("[email] Payment received confirmation sent to %s", to_email)
    except Exception:
        logger.exception("[email] Unexpected error sending payment received email to %s", to_email)
        raise


# ── Registration accepted (final) email ──────────────────────────────────


def _build_registration_accepted_message(
    sender: str, to_email: str, registrant_name: str, hotel_amount: int
) -> MIMEMultipart:
    message = MIMEMultipart("alternative")
    message["Subject"] = f"{EVENT_NAME} – prihláška potvrdená"
    message["From"] = sender
    message["To"] = to_email

    # Only a recreation voucher registration pays anything at the reception.
    hotel_text = (
        f"""
Ubytovanie a stravu ({hotel_amount} EUR) uhradíte priamo v hoteli pri príchode —
hotel vám na fakturačné údaje z prihlášky vystaví faktúru, ktorú potrebujete
na uplatnenie rekreačného poukazu.
"""
        if hotel_amount
        else ""
    )

    hotel_html = (
        f"""
      <p>
        Ubytovanie a stravu (<strong>{hotel_amount} EUR</strong>) uhradíte priamo
        v hoteli pri príchode — hotel vám na fakturačné údaje z prihlášky vystaví
        faktúru, ktorú potrebujete na uplatnenie rekreačného poukazu.
      </p>
"""
        if hotel_amount
        else ""
    )

    text_body = f"""\
Dobrý deň, {registrant_name},

vaša prihláška na {EVENT_NAME} je potvrdená. Tešíme sa na vás!

Termín: {EVENT_DATES}
Miesto: {EVENT_PLACE}

Začíname v piatok o 16:00 prednáškou, končíme v nedeľu obedom.
{hotel_text}
Pred pobytom vám pošleme ešte podrobné informácie k programu.

{SIGNATURE_TEXT}"""

    html_body = f"""\
{HTML_OPEN}      <p>Dobrý deň, <strong>{registrant_name}</strong>,</p>

      <p>
        vaša prihláška na <strong>{EVENT_NAME}</strong> je potvrdená.
        Tešíme sa na vás!
      </p>

      <table style="border-collapse: collapse; margin: 1.25rem 0;">
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Termín:</td>
          <td style="padding: 4px 0;"><strong>{EVENT_DATES}</strong></td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Miesto:</td>
          <td style="padding: 4px 0;"><strong>{EVENT_PLACE}</strong></td>
        </tr>
      </table>

      <p>Začíname v piatok o 16:00 prednáškou, končíme v nedeľu obedom.</p>
{hotel_html}
      <p>Pred pobytom vám pošleme ešte podrobné informácie k programu.</p>

{SIGNATURE_HTML}{HTML_CLOSE}"""

    message.attach(MIMEText(text_body, "plain", "utf-8"))
    message.attach(MIMEText(html_body, "html", "utf-8"))
    return message


def _send_registration_accepted_via_smtp(
    to_email: str, registrant_name: str, hotel_amount: int
) -> None:
    settings = get_settings()
    _smtp_send(
        _build_registration_accepted_message(
            settings.smtp_user, to_email, registrant_name, hotel_amount
        )
    )


async def send_registration_accepted_email(
    to_email: str, registrant_name: str, hotel_amount: int = 0
) -> None:
    """Closing e-mail sent when the admin accepts the registration.

    `hotel_amount` > 0 means the stay is settled at the hotel (recreation voucher).
    """
    logger.debug("[email] send_registration_accepted_email called for %s", to_email)
    try:
        await _dispatch(_send_registration_accepted_via_smtp, to_email, registrant_name, hotel_amount)
        logger.info("[email] Registration accepted email sent to %s", to_email)
    except Exception:
        logger.exception("[email] Unexpected error sending accepted email to %s", to_email)
        raise
