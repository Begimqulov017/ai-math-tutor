"""Settings read from backend/.env (or real environment variables on the server)."""
import logging
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / ".env")

MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
# PostgreSQL (Neon, Supabase, ...) when DATABASE_URL is set, otherwise a local SQLite file
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DB_PATH = os.getenv("DB_PATH") or str(BASE_DIR / "app.db")  # used only for the SQLite fallback
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
JWT_DAYS = int(os.getenv("JWT_DAYS", "30"))
JWT_SECRET = os.getenv("JWT_SECRET", "")
if not JWT_SECRET:
    JWT_SECRET = secrets.token_urlsafe(48)
    logging.warning("JWT_SECRET is not set: a random one is used, so every restart logs everyone out. Set JWT_SECRET.")
