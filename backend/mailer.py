"""Sends the e-mail verification code: Brevo HTTPS API, any SMTP server, or the server log (development only).

Render's free tier blocks outbound SMTP ports (25/465/587), so the HTTPS API is the default for production."""
import asyncio
import html
import logging
import smtplib
import ssl
from email.message import EmailMessage

import httpx

import config

log = logging.getLogger("mathtutor.mail")


class MailNotConfigured(Exception):
    pass


class MailFailed(Exception):
    pass


def mode() -> str:
    if config.BREVO_API_KEY and config.MAIL_FROM:
        return "brevo"
    if config.SMTP_HOST and config.MAIL_FROM:
        return "smtp"
    if config.EMAIL_DEV_LOG:
        return "log"
    return "none"


_TEXT = {
    "uz": ("Tasdiqlash kodi: {code}", "Salom, {name}!", "AI Math Tutor uchun tasdiqlash kodingiz:", "Kod {minutes} daqiqa amal qiladi. Agar siz ro'yxatdan o'tmagan bo'lsangiz, bu xatni e'tiborsiz qoldiring."),
    "ru": ("Код подтверждения: {code}", "Здравствуйте, {name}!", "Ваш код подтверждения для AI Math Tutor:", "Код действителен {minutes} мин. Если вы не регистрировались, просто проигнорируйте это письмо."),
    "en": ("Verification code: {code}", "Hello, {name}!", "Your AI Math Tutor verification code:", "The code is valid for {minutes} minutes. If you did not sign up, just ignore this email."),
}


def render(name: str, code: str, lang: str):
    subject, hello, intro, note = _TEXT.get(lang, _TEXT["en"])
    minutes = max(1, config.OTP_TTL_SECONDS // 60)
    subject, note = subject.format(code=code), note.format(minutes=minutes)
    hello = hello.format(name=name)
    text = f"{hello}\n\n{intro} {code}\n\n{note}\n"
    page = (f'<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto"><p>{html.escape(hello)}</p><p>{html.escape(intro)}</p>'
            f'<p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#eef2ff;padding:12px;text-align:center;border-radius:12px">{code}</p>'
            f'<p style="color:#64748b;font-size:13px">{html.escape(note)}</p></div>')
    return subject, text, page


def _smtp_send(to: str, subject: str, text: str, page: str) -> None:
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, f"{config.MAIL_FROM_NAME} <{config.MAIL_FROM}>", to
    msg.set_content(text)
    msg.add_alternative(page, subtype="html")
    ctx = ssl.create_default_context()
    if config.SMTP_PORT == 465:
        smtp = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=15, context=ctx)
    else:
        smtp = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15)
        smtp.starttls(context=ctx)
    with smtp:
        if config.SMTP_USER:
            smtp.login(config.SMTP_USER, config.SMTP_PASSWORD)
        smtp.send_message(msg)


async def send_code(email: str, name: str, code: str, lang: str = "uz") -> None:
    m = mode()
    if m == "none":
        raise MailNotConfigured
    subject, text, page = render(name, code, lang)
    if m == "log":  # development: the code is printed in the server console instead of being e-mailed
        log.warning("VERIFICATION CODE for %s: %s", email, code)
        return
    try:
        if m == "brevo":
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post("https://api.brevo.com/v3/smtp/email",
                                      headers={"api-key": config.BREVO_API_KEY, "accept": "application/json"},
                                      json={"sender": {"name": config.MAIL_FROM_NAME, "email": config.MAIL_FROM},
                                            "to": [{"email": email, "name": name}], "subject": subject,
                                            "htmlContent": page, "textContent": text})
            if r.status_code not in (200, 201, 202):
                raise RuntimeError(f"Brevo answered {r.status_code}: {r.text[:200]}")
        else:
            await asyncio.to_thread(_smtp_send, email, subject, text, page)
    except Exception as e:
        log.error("could not send the verification e-mail via %s: %s", m, e if isinstance(e, RuntimeError) else e.__class__.__name__)
        raise MailFailed from None
