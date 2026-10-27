"""Settings read from backend/.env (or real environment variables on the server)."""
import logging
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / ".env")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")

# PostgreSQL (Neon, Supabase, ...) when DATABASE_URL is set, otherwise a local SQLite file
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DB_PATH = os.getenv("DB_PATH") or str(BASE_DIR / "app.db")  # used only for the SQLite fallback

# CORS: open to every origin by default (login uses a Bearer token, not cookies, so this is safe for the API)
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()] or ["*"]

JWT_DAYS = _int("JWT_DAYS", 30)
JWT_SECRET = os.getenv("JWT_SECRET", "")
if not JWT_SECRET:
    JWT_SECRET = secrets.token_urlsafe(48)
    logging.warning("JWT_SECRET is not set: a random one is used, so every restart logs everyone out "
                    "and resets the guest limit. Set JWT_SECRET.")

# Guests (not logged in): at most N different problems per IP address. 0 = unlimited.
GUEST_PROBLEM_LIMIT = _int("GUEST_PROBLEM_LIMIT", 3)
GUEST_WINDOW_HOURS = _int("GUEST_WINDOW_HOURS", 0)  # 0 = the limit never resets

# How to find the real visitor IP behind the hosting proxy (see README, "IP manzil")
CLIENT_IP_HEADER = os.getenv("CLIENT_IP_HEADER", "").strip().lower()  # e.g. "true-client-ip" (set by Cloudflare)
TRUSTED_PROXY_HOPS = max(1, _int("TRUSTED_PROXY_HOPS", 1))            # n-th X-Forwarded-For entry from the right

# Daily tokens: every logged-in user gets this many problems per calendar day (Tashkent time)
DAILY_TOKENS = _int("DAILY_TOKENS", 50)

# Admin panel: the master password lives ONLY here (server environment), never in the code or the repository.
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "").strip()
ADMIN_TOKEN_HOURS = _int("ADMIN_TOKEN_HOURS", 2)
if not ADMIN_PASSWORD:
    logging.info("ADMIN_PASSWORD is not set: the admin panel is disabled.")
elif not (len(ADMIN_PASSWORD) == 16 and ADMIN_PASSWORD.isdigit()):
    logging.warning("ADMIN_PASSWORD is not exactly 16 digits: nobody will be able to log in to the admin panel.")

# E-mail verification: a 6-digit code must be entered before the account is created
REQUIRE_EMAIL_VERIFICATION = os.getenv("REQUIRE_EMAIL_VERIFICATION", "true").strip().lower() not in ("0", "false", "no", "off")
OTP_TTL_SECONDS = _int("OTP_TTL_SECONDS", 600)       # the code is valid for 10 minutes
OTP_MAX_ATTEMPTS = _int("OTP_MAX_ATTEMPTS", 5)       # wrong guesses before the code is burned
OTP_RESEND_SECONDS = _int("OTP_RESEND_SECONDS", 60)  # minimum pause between two e-mails to the same address
# How the e-mail is sent (first configured wins): Brevo HTTPS API -> SMTP -> console (EMAIL_DEV_LOG, development only)
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "").strip()
MAIL_FROM = os.getenv("MAIL_FROM", "").strip()       # a sender address verified at your mail provider
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "AI Math Tutor").strip()
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = _int("SMTP_PORT", 587)
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
EMAIL_DEV_LOG = os.getenv("EMAIL_DEV_LOG", "").strip().lower() in ("1", "true", "yes", "on")

# ---- subscription plans (activated manually by the admin; the contact is shown in the pricing window) ----
PLAN_DAILY = {"free": DAILY_TOKENS, "premium": _int("PREMIUM_DAILY_TOKENS", 200), "vip": _int("VIP_DAILY_TOKENS", 500)}
PAID_PLANS = ("premium", "vip")
CHAT_MESSAGES_PER_TOKEN = max(1, _int("CHAT_MESSAGES_PER_TOKEN", 3))  # every 3rd chat message costs 1 token
# "Priority AI responses": every plan has its own lane of simultaneous AI calls, so free users can never queue paying ones.
LLM_LANE_SIZE = max(1, _int("LLM_LANE_SIZE", 4))
PREMIUM_MODEL = os.getenv("GEMINI_MODEL_PREMIUM", "").strip() or MODEL  # optional stronger model for paying users
VIP_MODEL = os.getenv("GEMINI_MODEL_VIP", "").strip() or PREMIUM_MODEL
