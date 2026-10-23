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
