import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from app.config import get_settings

logger = logging.getLogger(__name__)


async def send_registration_confirmation(to_email: str) -> None:
    settings = get_settings()

    if not settings.gmail_user or not settings.gmail_app_password:
        logger.warning("Gmail credentials not configured – skipping email send.")
        return

    sender = settings.notification_from or settings.gmail_user

    message = MIMEMultipart("alternative")
    message["Subject"] = settings.notification_subject
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

    try:
        await aiosmtplib.send(
            message,
            hostname="smtp.gmail.com",
            port=587,
            start_tls=True,
            username=settings.gmail_user,
            password=settings.gmail_app_password,
        )
        logger.info("Confirmation email sent to %s", to_email)
    except Exception:
        logger.exception("Failed to send confirmation email to %s", to_email)
        raise
