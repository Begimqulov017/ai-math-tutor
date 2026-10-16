"""Storage layer (SQLAlchemy Core).

* DATABASE_URL set   -> PostgreSQL (Neon, Supabase, ...) - data survives Render restarts
* DATABASE_URL empty -> local SQLite file backend/app.db (development)
Tables: users (XP, streak, counters), awards (one-time XP), problem_cache (solved problems).
"""
import hashlib
import json
import logging
import re
import time
import unicodedata
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from sqlalchemy import Column, Float, Integer, MetaData, String, Table, Text, create_engine, event, select, update
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.exc import IntegrityError

import config

log = logging.getLogger("mathtutor.db")


# ---------------- engine ----------------
def _database_url() -> str:
    raw = config.DATABASE_URL.strip().strip("'\"")
    if not raw:
        return "sqlite:///" + config.DB_PATH
    if raw.startswith("postgres://"):  # Heroku/Render style, SQLAlchemy wants "postgresql"
        raw = "postgresql://" + raw[len("postgres://"):]
    if raw.startswith("postgresql://"):
        raw = "postgresql+psycopg2://" + raw[len("postgresql://"):]
    return raw


URL = _database_url()
IS_PG = URL.startswith("postgresql")
BACKEND = "postgresql" if IS_PG else "sqlite"

if IS_PG:
    # pre_ping + recycle: free Neon/Supabase databases close idle connections
    engine = create_engine(URL, pool_pre_ping=True, pool_size=3, max_overflow=2, pool_recycle=280)
else:
    engine = create_engine(URL, pool_pre_ping=True)

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA journal_mode=WAL")


metadata = MetaData()
users = Table(
    "users", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("email", String(255), unique=True, nullable=False),
    Column("name", String(80), nullable=False),
    Column("pw_hash", String(255), nullable=False),
    Column("xp", Integer, nullable=False, server_default="0"),
    Column("streak", Integer, nullable=False, server_default="0"),
    Column("best_streak", Integer, nullable=False, server_default="0"),
    Column("last_day", String(10), nullable=False, server_default=""),
    Column("correct", Integer, nullable=False, server_default="0"),
    Column("wrong", Integer, nullable=False, server_default="0"),
    Column("problems", Integer, nullable=False, server_default="0"),
    Column("data", Text, nullable=False, server_default="{}"),
    Column("created", Float),
)
awards = Table(
    "awards", metadata,
    Column("user_id", Integer, primary_key=True),
    Column("key", String(255), primary_key=True),
)
problem_cache = Table(
    "problem_cache", metadata,
    Column("key", String(64), primary_key=True),
    Column("lang", String(8)),
    Column("data", Text, nullable=False),
    Column("ts", Float),
    Column("hits", Integer, nullable=False, server_default="0"),
)


def _insert(table):
    return (postgresql if IS_PG else sqlite).insert(table)  # both support ON CONFLICT


@contextmanager
def conn():
    with engine.begin() as c:  # commits on success, rolls back on error
        yield c


def init() -> None:
    metadata.create_all(engine)
    log.info("Database ready: %s", "PostgreSQL" if IS_PG else "SQLite file " + config.DB_PATH)


# ---------------- smart cache ----------------
_SUBST = {"×": "*", "·": "*", "⋅": "*", "÷": "/", "−": "-", "–": "-", "—": "-", "²": "^2", "³": "^3",
          "√": "sqrt", "π": "pi", "‘": "'", "’": "'", "ʻ": "'", "`": "'", "\\cdot": "*", "\\times": "*",
          "\\left": "", "\\right": "", "$": ""}


def normalize_problem(text: str) -> str:
    """Spaces, case and look-alike symbols must not create a new cache entry."""
    s = (text or "").lower()
    for a, b in _SUBST.items():  # before NFKC, which would turn "²" into a plain "2"
        s = s.replace(a, b)
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"\s+", "", s)


def cache_key(text: str, lang: str, image_b64: str | None = None) -> str:
    base = "img:" + hashlib.sha256(image_b64.encode()).hexdigest() if image_b64 else "txt:" + normalize_problem(text)
    return hashlib.sha256(f"{lang}|{base}".encode()).hexdigest()


def cache_get(key: str, touch: bool = True):
    with conn() as c:
        r = c.execute(select(problem_cache.c.data).where(problem_cache.c.key == key)).first()
        if not r:
            return None
        if touch:
            c.execute(update(problem_cache).where(problem_cache.c.key == key).values(hits=problem_cache.c.hits + 1))
        return json.loads(r[0])


def cache_put(key: str, lang: str, data: dict) -> None:
    stmt = _insert(problem_cache).values(key=key, lang=lang, data=json.dumps(data, ensure_ascii=False), ts=time.time(), hits=0)
    stmt = stmt.on_conflict_do_update(index_elements=["key"], set_={k: stmt.excluded[k] for k in ("lang", "data", "ts", "hits")})
    with conn() as c:
        c.execute(stmt)


# ---------------- users / XP / streak ----------------
class EmailTaken(Exception):
    pass


TZ = timezone(timedelta(hours=5))  # Uzbekistan (no daylight saving) - streak days follow local midnight
_PUBLIC = ("id", "name", "email", "xp", "streak", "best_streak", "correct", "wrong", "problems")


def _today() -> str:
    return datetime.now(TZ).date().isoformat()


def _yesterday() -> str:
    return (datetime.now(TZ).date() - timedelta(days=1)).isoformat()


def public_user(r) -> dict:
    return {k: r[k] for k in _PUBLIC}


def get_user(uid: int):
    with conn() as c:
        r = c.execute(select(users).where(users.c.id == uid)).mappings().first()
        return public_user(r) if r else None


def user_by_email(email: str):
    with conn() as c:
        r = c.execute(select(users).where(users.c.email == email)).mappings().first()
        return dict(r) if r else None


def create_user(email: str, name: str, pw_hash: str) -> int:
    try:
        with conn() as c:
            res = c.execute(users.insert().values(email=email, name=name, pw_hash=pw_hash, created=time.time()))
            return int(res.inserted_primary_key[0])
    except IntegrityError:
        raise EmailTaken from None


def record_activity(uid: int, *, award_key: str | None = None, xp: int = 0, ok: bool | None = None, problem: bool = False):
    """One transaction (row locked on PostgreSQL): touch the daily streak, give XP once per award_key,
    update counters. Returns (xp_gained, public_user)."""
    with conn() as c:
        u = c.execute(select(users).where(users.c.id == uid).with_for_update()).mappings().first()
        if not u:
            return 0, None
        today, streak = _today(), u["streak"]
        if u["last_day"] != today:
            streak = u["streak"] + 1 if u["last_day"] == _yesterday() else 1
        gained = 0
        if award_key and xp:
            if c.execute(_insert(awards).values(user_id=uid, key=award_key).on_conflict_do_nothing()).rowcount:
                gained = xp
        vals = dict(
            xp=u["xp"] + gained, streak=streak, best_streak=max(u["best_streak"], streak), last_day=today,
            correct=u["correct"] + (1 if ok is True and gained else 0),
            wrong=u["wrong"] + (1 if ok is False else 0),
            problems=u["problems"] + (1 if problem and gained else 0))
        c.execute(update(users).where(users.c.id == uid).values(**vals))
        return gained, public_user({**u, **vals})


def get_blob(uid: int) -> dict:
    with conn() as c:
        r = c.execute(select(users.c.data).where(users.c.id == uid)).first()
        return json.loads(r[0]) if r else {}


def set_blob(uid: int, raw: str) -> None:
    with conn() as c:
        c.execute(update(users).where(users.c.id == uid).values(data=raw))
