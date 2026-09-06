import asyncio
import hashlib
import logging
import smtplib
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

from app.config import get_settings
from app.services.pricing import ACCOMMODATION_PRICE, ZTP_DISCOUNT

logger = logging.getLogger(__name__)

EVENT_NAME = "Vzdelávanie EVS 2026"
EVENT_DATES = "23. – 25. októbra 2026"
EVENT_PLACE = "Hotel Máj***, Liptovský Ján"
EVENT_VENUE_URL = "https://www.sorea.sk/nizke-tatry/hotel-sorea-maj"
CONTACT_EMAIL = "vzdelavanie@evs.sk"
CONTACT_PHONE = "0911 798 800"

# Money has to be on the EVS account by this day.
PAYMENT_DEADLINE = "28. 9. 2026"

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
            "príchode — hotel Vám na fakturačné údaje z prihlášky vystaví faktúru\n"
            "potrebnú na uplatnenie rekreačného poukazu."
        )
        htmls.append(
            "      <p>\n"
            f"        Ubytovanie a stravu (<strong>{hotel_amount} EUR</strong>) uhradíte priamo\n"
            "        v hoteli pri príchode — hotel Vám na fakturačné údaje z prihlášky\n"
            "        vystaví faktúru potrebnú na uplatnenie rekreačného poukazu.\n"
            "      </p>"
        )

    # What comes next, and until when the update link keeps working. Nothing is
    # promised about a payment when there is nothing left to transfer.
    if transfer_due:
        next_step = (
            "Prihlášku skontrolujeme a v ďalšom e-maile Vám zašleme podklady "
            "k platbe. Kým ich nedostanete, svoju prihlášku môžete upraviť alebo "
            "zrušiť cez odkaz uvedený nižšie."
        )
    else:
        next_step = (
            "Prihlášku skontrolujeme a potvrdíme Vám ju e-mailom. Dovtedy ju "
            "môžete upraviť alebo zrušiť cez odkaz uvedený nižšie."
        )
    next_step += (
        f" V prípade neskorších zmien nás kontaktujte na {CONTACT_EMAIL}."
    )
    texts.append(next_step)
    htmls.append(f"      <p>{next_step}</p>")

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

    attendee_text = "".join(f"- {name}\n" for name in attendee_names) + "\n"
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

{update_link}

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

      <p><a href="{update_link}">{update_link}</a></p>

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
    contribution_only: bool = False,
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

    # With a recreation voucher the stay is settled at the hotel, so the transfer
    # covers the voluntary contribution alone.
    request_line = (
        f"Príspevok prosíme do {PAYMENT_DEADLINE} uhradiť nasledovne:"
        if contribution_only
        else (
            "Pre dokončenie prihlásenia prosíme o úhradu poplatku podľa uvedených "
            "platobných údajov tak, aby bola suma pripísaná na účet EVS najneskôr "
            f"do {PAYMENT_DEADLINE}."
        )
    )

    text_body = f"""\
Dobrý deň, {registrant_name},

tešíme sa, že ste sa prihlásili na {EVENT_NAME}.

{request_line}

  Suma:                {amount} EUR
  IBAN:                {iban}
  Banka:               {bank_name}
  Variabilný symbol:   {variable_symbol}
  Správa pre príjemcu: {recipient_note}

O prijatí platby Vás budeme informovať e-mailom.

{SIGNATURE_TEXT}"""

    html_body = f"""\
{HTML_OPEN}      <p>Dobrý deň, <strong>{registrant_name}</strong>,</p>

      <p>tešíme sa, že ste sa prihlásili na <strong>{EVENT_NAME}</strong>.</p>

      <p>{request_line}</p>

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

      <p style="margin-top: 1.5rem;">O prijatí platby Vás budeme informovať e-mailom.</p>

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
    contribution_only: bool,
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
            contribution_only,
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
    contribution_only: bool = False,
) -> None:
    """`contribution_only` – a voucher stay: only the contribution is transferred."""
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
            contribution_only,
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
Prihlášku poslal/a: {registered_by_name}

Termín: {EVENT_DATES}
Miesto: {EVENT_PLACE}

Začíname v piatok o 16:00 prednáškou, končíme v nedeľu obedom.

Ďalšie informácie ohľadom vzdelávania aj pokyny k úhrade Vám pošleme v samostatnom e-maili.

{SIGNATURE_TEXT}"""

    html_body = f"""\
{HTML_OPEN}      <p>Dobrý deň, <strong>{attendee_name}</strong>,</p>

      <p>potvrdzujeme, že ste prihlásený/á na <strong>{EVENT_NAME}</strong>.</p>

    <p>Prihlášku poslal/a: <strong>{registered_by_name}</strong></p>

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

            <p>Ďalšie informácie ohľadom vzdelávania aj pokyny k úhrade Vám pošleme v samostatnom e-maili.</p>

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


# What the confirmed registration needs to know about the stay itself.
_STAY_INFO_ITEMS = [
    "Poplatok za celý pobyt v plne obsadenej dvojposteľovej izbe v skupine je "
    f"{ACCOMMODATION_PRICE['double']} EUR na osobu.",
    "Poplatok za celý pobyt v jednoposteľovej izbe je "
    f"{ACCOMMODATION_PRICE['single']} EUR na osobu.",
    "V cene je zahrnuté ubytovanie od piatku do nedele (2 noci), strava od piatku "
    "večere do nedele obeda, parkovanie, stolný tenis, Wifi pripojenie, miestna daň.",
    "Držiteľ preukazu ZŤP neplatí miestnu daň — poplatok za pobyt je "
    f"o {ZTP_DISCOUNT} EUR nižší.",
    "Uplatnenie rekreačného poukazu: Ak ste to uviedli v prihláške, platbu za "
    "ubytovanie a stravu uhradíte priamo v hoteli pri ubytovaní. Ak ste to "
    "v prihláške neuviedli, ale poukaz si chcete uplatniť, dajte nám to čím skôr "
    "vedieť — musíme to v hoteli nahlásiť vopred. Platba bude prebiehať na mieste.",
]

# Paid extras, as the hotel listed them for us.
_HOTEL_SERVICES = [
    (
        "KRYTÁ PLAVÁREŇ",
        "Hotel disponuje krytou plavárňou so vzácnou minerálnou vodou z Prameňa "
        "RUDOLF, ktorá má blahodarné účinky na zdravie a relaxáciu",
    ),
    ("BILIARD", "0,10 € / minúta"),
    (
        "MASÁŽE",
        "od 19,00 € / osoba / všetky druhy — klasická, relaxačná, športová, masáž "
        "aróma sviečkou, breussova, indická masáž hlavy, masáž bylinnými vrecúškami, "
        "medová, bankovanie, reflexná masáž chodidiel, aróma, antistresová, "
        "anticelulitídna, čokoládová, liečebná, olejová tepelná, aróma peeling, "
        "povzbudivá eukalyptová, masáž lávovými kameňmi",
    ),
    (
        "ZÁBALOVÁ TERAPIA",
        "od 10,00 € / osoba / všetky druhy — rašelinový zábal, zábal zo včelieho "
        "vosku, senný, čokoládový, škoricový, termický zábal",
    ),
]

_PROGRAM = [
    (
        "Piatok 23. 10. 2026",
        [
            ("14.00 – 16.00", "príchod"),
            ("16.00 – 17.00", "spoločný program – prednáška – Curt Westman (1)"),
            ("17.30 – 19.00", "večera"),
            (
                "19.00 – 21.00",
                "spoločný program – prednášky – Curt Westman (2), Ole Lilleheim (1)",
            ),
        ],
    ),
    (
        "Sobota 24. 10. 2026",
        [
            ("7.00 – 9.00", "raňajky"),
            ("9.00 – 10.00", "spoločný program – prednáška – Ole Lilleheim (2)"),
            ("10.30", "GZ EVS (len pre členov GZ)"),
            ("12.00 – 14.00", "obed"),
            ("14.00 – 17.30", "voľný program"),
            ("17.30 – 19.00", "večera"),
            (
                "19.00",
                "spoločný program – prednášky – Curt Westman (3), Ole Lilleheim (3)",
            ),
        ],
    ),
    (
        "Nedeľa 25. 10. 2026",
        [
            ("7.00 – 9.00", "raňajky"),
            ("do 10.00", "odhlásenie z hotela"),
            (
                "9.00 – 11.30",
                "spoločný program – prednášky – Curt Westman (4), Ole Lilleheim (4)",
            ),
            ("11.30", "obed"),
        ],
    ),
]


def _bullets_text(items: list[str]) -> str:
    return "\n".join(f"- {item}" for item in items)


def _bullets_html(items: list[str]) -> str:
    lis = "".join(f"        <li>{item}</li>\n" for item in items)
    return (
        '      <ul style="margin: 0.5rem 0 1.25rem; padding-left: 1.25rem;">\n'
        f"{lis}"
        "      </ul>"
    )


def _program_text() -> str:
    days = []
    for day, items in _PROGRAM:
        lines = "\n".join(f"  {time}  {label}" for time, label in items)
        days.append(f"{day}\n{lines}")
    return "\n\n".join(days)


def _program_html() -> str:
    days = []
    for day, items in _PROGRAM:
        rows = "".join(
            '          <tr>'
            f'<td style="padding: 2px 16px 2px 0; color: #6b7280; white-space: nowrap;">{time}</td>'
            f'<td style="padding: 2px 0;">{label}</td>'
            "</tr>\n"
            for time, label in items
        )
        days.append(
            f'      <p style="margin: 1.25rem 0 0.25rem;"><strong>{day}</strong></p>\n'
            '      <table style="border-collapse: collapse;">\n'
            f"{rows}"
            "      </table>"
        )
    return "\n".join(days)


def _build_payment_received_message(
    sender: str,
    to_email: str,
    registrant_name: str,
    variable_symbol: str,
    payment_made: bool = True,
) -> MIMEMultipart:
    message = MIMEMultipart("alternative")
    message["Subject"] = (
        f"{EVENT_NAME} – platba prijatá"
        if payment_made
        else f"{EVENT_NAME} – prihláška potvrdená"
    )
    message["From"] = sender
    message["To"] = to_email

    # A voucher stay with no contribution transfers nothing, so there is no
    # payment to acknowledge — the registration is simply confirmed.
    opening_text = (
        f"Vašu platbu za {EVENT_NAME} sme prijali "
        f"(variabilný symbol: {variable_symbol}).\n\nVaša prihláška je tým potvrdená."
        if payment_made
        else f"Vaša prihláška na {EVENT_NAME} je potvrdená."
    )
    opening_html = (
        f"""      <p>
        Vašu platbu za <strong>{EVENT_NAME}</strong> sme prijali
        (variabilný symbol: <strong>{variable_symbol}</strong>).
      </p>

      <p>Vaša prihláška je tým potvrdená.</p>"""
        if payment_made
        else f"      <p>Vaša prihláška na <strong>{EVENT_NAME}</strong> je potvrdená.</p>"
    )

    binding = (
        "Objednávky poslané do hotela sú záväzné, vzťahujú sa na ne rovnaké storno "
        "pravidlá, ako pre samostatne objednané pobyty. Preto Vás prosíme, aby ste "
        "nám dali čo najskôr vedieť, ak sa Vám zmení situácia a nebudete môcť "
        "prísť, alebo bude treba vo Vašej objednávke niečo upraviť."
    )
    warning = (
        "Upozornenie: Nezabudnite si overiť, aké údaje vyžaduje Váš zamestnávateľ "
        "na faktúre. Dodatočná úprava vystavených faktúr už nie je možná."
    )
    rooming = (
        "Ak sa prihlasujete sám/sama a máte záujem o ubytovanie v dvojposteľovej "
        "izbe, ubytujeme Vás s niekým v prípade, že bude ďalší záujemca. Ak Vás "
        "nebudeme mať s kým ubytovať a zostane iba možnosť ubytovať Vás na "
        "jednoposteľovej izbe za vyšší poplatok, budeme Vás vopred informovať."
    )
    prayer = (
        "Veľmi si vážime finančné príspevky a prosíme aj o modlitby – za speakrov, "
        "organizátorov, financie, pokoj v prípravách a Božie požehnanie pre celé "
        "vzdelávanie."
    )
    together = (
        "Keď každý prispeje tým, čo môže – či už finančne, modlitbou alebo "
        "prakticky – spoločne sa budeme môcť radovať a ďakovať za to, čo Pán koná."
    )
    services_intro = (
        "DOPLNKOVÉ SLUŽBY hotela, ktoré si môžete objednať a uhradiť priamo "
        f"v hoteli, nájdete aj na {EVENT_VENUE_URL}. Tieto služby hotel uviedol "
        "pre nás v ponuke:"
    )
    recap = (
        "Ak ste sa už niekedy zúčastnili vzdelávania, určite viete, že je to vzácny "
        "čas. Máme príležitosť duchovne sa obnoviť, načerpať nové sily, vymeniť si "
        "skúsenosti a budovať vzťahy s ľuďmi, ktorých spája láska k Pánovi Ježišovi "
        "Kristovi."
    )
    invite = (
        "Chystáte výlet, neformálne stretnutie alebo inú aktivitu? Neostávajte "
        "v tom sami – pozvite aj ďalších bratov a sestry. Keď trávime čas spolu, "
        "môžeme sa navzájom inšpirovať, povzbudiť vo viere a podať si pomocnú ruku "
        "presne tam, kde je to potrebné."
    )
    verse = (
        "„Potom Ježiš odišiel na druhú stranu Galilejského, čiže Tiberiadského "
        "mora. Šiel za ním veľký zástup ľudí, pretože videli znamenia, ktoré robil "
        "na chorých. Ježiš vystúpil na vrch a posadil sa tam so svojimi "
        "učeníkmi.“"
    )
    verse_ref = "Ján 6, 1-3"

    services_text = _bullets_text([f"{name} – {detail}" for name, detail in _HOTEL_SERVICES])
    services_html = _bullets_html(
        [f"<strong>{name}</strong> – {detail}" for name, detail in _HOTEL_SERVICES]
    )

    text_body = f"""\
Dobrý deň, {registrant_name},

{opening_text}

{binding}

Informácie o pobyte:

{_bullets_text(_STAY_INFO_ITEMS)}

{warning}

{rooming}

{prayer}

{together}

{services_intro}

{services_text}

Program Vzdelávania

{_program_text()}

{recap}

{invite}

{verse}
{verse_ref}

{SIGNATURE_TEXT}"""

    html_body = f"""\
{HTML_OPEN}      <p>Dobrý deň, <strong>{registrant_name}</strong>,</p>

{opening_html}

      <p>{binding}</p>

      <p><strong>Informácie o pobyte:</strong></p>

{_bullets_html(_STAY_INFO_ITEMS)}

      <p>{warning}</p>

      <p>{rooming}</p>

      <p>{prayer}</p>

      <p>{together}</p>

      <p>
        DOPLNKOVÉ SLUŽBY hotela, ktoré si môžete objednať a uhradiť priamo
        v hoteli, nájdete aj na
        <a href="{EVENT_VENUE_URL}">{EVENT_VENUE_URL}</a>.
        Tieto služby hotel uviedol pre nás v ponuke:
      </p>

{services_html}

      <p style="margin-top: 1.5rem;"><strong>Program Vzdelávania</strong></p>

{_program_html()}

      <p style="margin-top: 1.5rem;">{recap}</p>

      <p>{invite}</p>

      <blockquote style="margin: 1.5rem 0; padding-left: 1rem; border-left: 3px solid #d1d5db; color: #4b5563;">
        {verse}<br>
        <span style="color: #6b7280; font-size: 0.9rem;">{verse_ref}</span>
      </blockquote>

{SIGNATURE_HTML}{HTML_CLOSE}"""

    message.attach(MIMEText(text_body, "plain", "utf-8"))
    message.attach(MIMEText(html_body, "html", "utf-8"))
    return message


def _send_payment_received_via_smtp(
    to_email: str, registrant_name: str, variable_symbol: str, payment_made: bool
) -> None:
    settings = get_settings()
    _smtp_send(
        _build_payment_received_message(
            settings.smtp_user, to_email, registrant_name, variable_symbol, payment_made
        )
    )


async def send_payment_received_confirmation(
    to_email: str,
    registrant_name: str,
    variable_symbol: str,
    payment_made: bool = True,
) -> None:
    """Closing e-mail — the registration is confirmed and nothing follows it.

    `payment_made` is False when there was nothing to transfer (a voucher stay
    without a contribution), so the e-mail confirms without claiming a payment.
    """
    logger.debug("[email] send_payment_received_confirmation called for %s", to_email)
    try:
        await _dispatch(
            _send_payment_received_via_smtp,
            to_email,
            registrant_name,
            variable_symbol,
            payment_made,
        )
        logger.info("[email] Final confirmation e-mail sent to %s", to_email)
    except Exception:
        logger.exception("[email] Unexpected error sending final confirmation to %s", to_email)
        raise
