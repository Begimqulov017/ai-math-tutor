"""Storage layer (SQLAlchemy Core).

* DATABASE_URL set   -> PostgreSQL (Neon, Supabase, ...) - data survives Render restarts
* DATABASE_URL empty -> local SQLite file backend/app.db (development)
Tables: users (XP, streak, counters), awards (one-time XP), problem_cache (solved problems),
guest_usage (which problems a guest IP has used).
"""
import functools
import hashlib
import json
import logging
import re
import time
import unicodedata
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from sqlalchemy import (Column, Float, Integer, MetaData, String, Table, Text, create_engine, delete, event, func,
                        select, text, update)
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, InterfaceError, OperationalError

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


def _make_engine():
    url = make_url(_database_url())
    if url.drivername.startswith("postgresql"):
        if url.host and url.host not in ("localhost", "127.0.0.1", "::1") and "sslmode" not in url.query:
            url = url.update_query_dict({"sslmode": "require"})  # Neon/Supabase need TLS
        return create_engine(
            url,
            pool_pre_ping=True,      # test a pooled connection before use (free DBs close idle ones)
            pool_recycle=240,        # never reuse a connection older than 4 minutes
            pool_size=3, max_overflow=2, pool_timeout=30, pool_use_lifo=True,
            connect_args={"connect_timeout": 15, "keepalives": 1, "keepalives_idle": 30,
                          "keepalives_interval": 10, "keepalives_count": 5},
        )
    eng = create_engine(url, pool_pre_ping=True)

    @event.listens_for(eng, "connect")
    def _sqlite_pragmas(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA journal_mode=WAL")

    return eng


engine = _make_engine()
IS_PG = engine.dialect.name == "postgresql"
BACKEND = "postgresql" if IS_PG else "sqlite"


def _retry(fn):
    """A dropped connection or a sleeping (cold-starting) Neon/Supabase database must not become an error:
    every public function is one transaction, so it is safe to simply run it again."""
    @functools.wraps(fn)
    def wrapper(*a, **k):
        for attempt in range(4):
            try:
                return fn(*a, **k)
            except (OperationalError, InterfaceError) as e:
                if attempt == 3:
                    raise
                log.warning("database connection problem (%s), retry %d/3", e.__class__.__name__, attempt + 1)
                time.sleep(1.5 * (attempt + 1))
    return wrapper


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
awards = Table("awards", metadata, Column("user_id", Integer, primary_key=True), Column("key", String(255), primary_key=True))
problem_cache = Table(
    "problem_cache", metadata,
    Column("key", String(64), primary_key=True),
    Column("lang", String(8)),
    Column("data", Text, nullable=False),
    Column("ts", Float),
    Column("hits", Integer, nullable=False, server_default="0"),
)
guest_usage = Table(  # IP is stored only as a keyed hash
    "guest_usage", metadata,
    Column("ip_hash", String(64), primary_key=True),
    Column("key", String(64), primary_key=True),
    Column("ts", Float),
)


def _insert(table):
    return (postgresql if IS_PG else sqlite).insert(table)  # both support ON CONFLICT


@contextmanager
def conn():
    with engine.begin() as c:  # commits on success, rolls back on error
        yield c


def init() -> None:
    """Create the tables. Retries for ~15 s so a sleeping Neon database has time to wake up."""
    for attempt in range(5):
        try:
            metadata.create_all(engine)
            log.info("Database ready: %s", "PostgreSQL" if IS_PG else "SQLite file " + config.DB_PATH)
            return
        except (OperationalError, InterfaceError) as e:
            if attempt == 4:
                raise
            log.warning("database not reachable yet (%s), retrying", e.__class__.__name__)
            time.sleep(2 ** attempt)


@_retry
def ping() -> None:
    with conn() as c:
        c.execute(text("SELECT 1"))


# ---------------- smart cache ----------------
_SUBST = {"×": "*", "·": "*", "⋅": "*", "÷": "/", "−": "-", "–": "-", "—": "-", "²": "^2", "³": "^3",
          "√": "sqrt", "π": "pi", "‘": "'", "’": "'", "ʻ": "'", "`": "'", "\\cdot": "*", "\\times": "*",
          "\\left": "", "\\right": "", "$": ""}


def normalize_problem(text_: str) -> str:
    """Spaces, case and look-alike symbols must not create a new cache entry."""
    s = (text_ or "").lower()
    for a, b in _SUBST.items():  # before NFKC, which would turn "²" into a plain "2"
        s = s.replace(a, b)
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"\s+", "", s)


def cache_key(text_: str, lang: str, image_b64: str | None = None) -> str:
    base = "img:" + hashlib.sha256(image_b64.encode()).hexdigest() if image_b64 else "txt:" + normalize_problem(text_)
    return hashlib.sha256(f"{lang}|{base}".encode()).hexdigest()


@_retry
def cache_get(key: str, touch: bool = True):
    with conn() as c:
        r = c.execute(select(problem_cache.c.data).where(problem_cache.c.key == key)).first()
        if not r:
            return None
        if touch:
            c.execute(update(problem_cache).where(problem_cache.c.key == key).values(hits=problem_cache.c.hits + 1))
        return json.loads(r[0])


@_retry
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


@_retry
def get_user(uid: int):
    with conn() as c:
        r = c.execute(select(users).where(users.c.id == uid)).mappings().first()
        return public_user(r) if r else None


@_retry
def user_by_email(email: str):
    with conn() as c:
        r = c.execute(select(users).where(users.c.email == email)).mappings().first()
        return dict(r) if r else None


@_retry
def create_user(email: str, name: str, pw_hash: str) -> int:
    try:
        with conn() as c:
            res = c.execute(users.insert().values(email=email, name=name, pw_hash=pw_hash, created=time.time()))
            return int(res.inserted_primary_key[0])
    except IntegrityError:
        raise EmailTaken from None


@_retry
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


@_retry
def get_blob(uid: int) -> dict:
    with conn() as c:
        r = c.execute(select(users.c.data).where(users.c.id == uid)).first()
        return json.loads(r[0]) if r else {}


@_retry
def set_blob(uid: int, raw: str) -> None:
    with conn() as c:
        c.execute(update(users).where(users.c.id == uid).values(data=raw))


# ---------------- guest limit (per IP) ----------------
def _guest_prepare(c, ip_hash: str, window_hours: int) -> None:
    if IS_PG:  # serialise concurrent requests of the same IP (several server processes)
        c.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": ip_hash})
    if window_hours > 0:
        c.execute(delete(guest_usage).where(guest_usage.c.ip_hash == ip_hash, guest_usage.c.ts < time.time() - window_hours * 3600))


def _guest_count(c, ip_hash: str) -> int:
    return c.execute(select(func.count()).select_from(guest_usage).where(guest_usage.c.ip_hash == ip_hash)).scalar() or 0


@_retry
def guest_reserve(ip_hash: str, key: str, limit: int, window_hours: int = 0):
    """Reserve one of the guest's `limit` problems. The same problem again costs nothing.
    Returns (allowed, newly_reserved, used)."""
    with conn() as c:
        _guest_prepare(c, ip_hash, window_hours)
        used = _guest_count(c, ip_hash)
        if c.execute(select(guest_usage.c.key).where(guest_usage.c.ip_hash == ip_hash, guest_usage.c.key == key)).first():
            return True, False, used
        if used >= limit:
            return False, False, used
        c.execute(guest_usage.insert().values(ip_hash=ip_hash, key=key, ts=time.time()))
        return True, True, used + 1


@_retry
def guest_release(ip_hash: str, key: str) -> None:
    """Give the slot back when the AI failed, so an error never costs the guest a problem."""
    with conn() as c:
        c.execute(delete(guest_usage).where(guest_usage.c.ip_hash == ip_hash, guest_usage.c.key == key))


@_retry
def guest_used(ip_hash: str, window_hours: int = 0) -> int:
    with conn() as c:
        _guest_prepare(c, ip_hash, window_hours)
        return _guest_count(c, ip_hash)
