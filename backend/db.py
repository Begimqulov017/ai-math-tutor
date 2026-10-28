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
import math
import re
import time
import unicodedata
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from sqlalchemy import (Column, Date, Float, ForeignKey, Integer, MetaData, String, Table, Text, and_, case, create_engine, delete,
                        event, func, inspect, or_, select, text, update)
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
    Column("tokens_remaining", Integer, nullable=False, server_default="50"),
    Column("last_token_reset", Date),
    Column("username", String(20), unique=True),  # public handle: friends, leaderboard, admin search
    Column("bonus_tokens", Integer, nullable=False, server_default="0"),  # admin grants: never reset, spent after the daily pool
    Column("plan", String(10), nullable=False, server_default="free"),    # free | premium | vip
    Column("plan_expires_at", Float),                                      # epoch seconds, NULL = no end date
    Column("chat_msg_count", Integer, nullable=False, server_default="0"),  # chat messages since the last chat token
    Column("tokens_valid_after", Float, nullable=False, server_default="0"),  # sessions issued before this are void (password reset)
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
chat_threads = Table(
    "chat_threads", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("title", String(200), nullable=False, server_default="New chat"),
    Column("topic_summary", Text, nullable=False, server_default=""),
    Column("problem_key", String(64)),  # the analysed problem this thread belongs to (one thread per problem)
    Column("created_at", Float, nullable=False),
    Column("updated_at", Float, nullable=False),
)
chat_messages = Table(
    "chat_messages", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("thread_id", Integer, ForeignKey("chat_threads.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("role", String(10), nullable=False),  # 'user' | 'assistant'
    Column("content", Text, nullable=False),
    Column("created_at", Float, nullable=False),
)
email_verifications = Table(  # a registration waiting for its 6-digit code (the account is created only after it)
    "email_verifications", metadata,
    Column("email", String(120), primary_key=True),
    Column("name", String(60), nullable=False),
    Column("pw_hash", Text, nullable=False),
    Column("code", String(10), nullable=False),
    Column("expires_at", Float, nullable=False),  # DOUBLE PRECISION on PostgreSQL, REAL on SQLite
    Column("attempts", Integer, nullable=False, server_default="0"),
    Column("username", String(20)),
)
password_resets = Table(  # "forgot password": a 6-digit code waiting to be used
    "password_resets", metadata,
    Column("email", String(120), primary_key=True),
    Column("code", String(10), nullable=False),
    Column("expires_at", Float, nullable=False),
    Column("attempts", Integer, nullable=False, server_default="0"),
)
friendships = Table(  # one row per pair: user_id asked, friend_id received; status pending -> accepted
    "friendships", metadata,
    Column("user_id", Integer, primary_key=True),
    Column("friend_id", Integer, primary_key=True),
    Column("status", String(10), nullable=False, server_default="pending"),
    Column("created_at", Float, nullable=False),
)
milestones = Table(  # study achievements (streak / XP / level) shown to friends
    "milestones", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, nullable=False, index=True),
    Column("kind", String(10), nullable=False),
    Column("value", Integer, nullable=False),
    Column("created_at", Float, nullable=False),
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
            migrate()
            log.info("Database ready: %s", "PostgreSQL" if IS_PG else "SQLite file " + config.DB_PATH)
            return
        except (OperationalError, InterfaceError) as e:
            if attempt == 4:
                raise
            log.warning("database not reachable yet (%s), retrying", e.__class__.__name__)
            time.sleep(2 ** attempt)


def _ddl(sql: str, what: str) -> None:
    try:
        with engine.begin() as c:
            c.execute(text(sql))
        log.info("migration: %s", what)
    except (OperationalError, InterfaceError):
        raise
    except Exception as e:  # another instance did it a moment ago
        log.warning("migration step skipped (%s): %s", what, e.__class__.__name__)


def migrate() -> None:
    """create_all never alters an existing table, so columns added after the first release are added here.
    Idempotent: safe on every start and with several instances starting at once."""
    ine = "IF NOT EXISTS " if IS_PG else ""  # SQLite has no IF NOT EXISTS for columns: the check below covers it
    real = "DOUBLE PRECISION" if IS_PG else "REAL"
    have = {c["name"] for c in inspect(engine).get_columns("users")}
    wanted = {
        "tokens_remaining": f"INTEGER NOT NULL DEFAULT {config.DAILY_TOKENS}", "last_token_reset": "DATE", "username": "VARCHAR(20)",
        "bonus_tokens": "INTEGER NOT NULL DEFAULT 0", "plan": "VARCHAR(10) NOT NULL DEFAULT 'free'", "plan_expires_at": real,
        "chat_msg_count": "INTEGER NOT NULL DEFAULT 0", "tokens_valid_after": f"{real} NOT NULL DEFAULT 0",
    }
    added = set()
    for name, ddl in wanted.items():
        if name not in have:
            _ddl(f"ALTER TABLE users ADD COLUMN {ine}{name} {ddl}", f"added users.{name}")
            added.add(name)
    if "bonus_tokens" in added:  # tokens above the free daily amount were admin grants: keep them as permanent bonus
        d = config.PLAN_DAILY["free"]
        _ddl(f"UPDATE users SET bonus_tokens = CASE WHEN tokens_remaining > {d} THEN tokens_remaining - {d} ELSE 0 END, "
             f"tokens_remaining = CASE WHEN tokens_remaining > {d} THEN {d} ELSE tokens_remaining END", "moved old admin grants to bonus_tokens")
    if "username" not in {c["name"] for c in inspect(engine).get_columns("email_verifications")}:
        _ddl(f"ALTER TABLE email_verifications ADD COLUMN {ine}username VARCHAR(20)", "added email_verifications.username")
    _backfill_usernames()
    _ddl("CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username ON users (username)", "unique index on users.username")


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


def cache_key(text_: str, lang: str, image_b64: str | None = None, advanced: bool = False) -> str:
    base = "img:" + hashlib.sha256(image_b64.encode()).hexdigest() if image_b64 else "txt:" + normalize_problem(text_)
    return hashlib.sha256(f"{lang}|{base}{'|adv' if advanced else ''}".encode()).hexdigest()


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


class UsernameTaken(Exception):
    pass


class FriendError(Exception):
    """code: user_not_found | self | already_friends | already_requested | not_found"""
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


TZ = timezone(timedelta(hours=5))  # Uzbekistan (no daylight saving) - streak days follow local midnight
_PUBLIC = ("id", "name", "username", "email", "xp", "streak", "best_streak", "correct", "wrong", "problems")
USERNAME_RE = re.compile(r"^[a-z0-9_]{3,20}$")
RESERVED = {"admin", "root", "support", "system", "moderator", "null", "undefined", "api", "me", "help", "official"}
XP_MILESTONES = (100, 250, 500, 1000, 2500, 5000, 10000)
STREAK_MILESTONES = (3, 7, 14, 30, 60, 100, 365)


def valid_username(u: str) -> bool:
    return bool(USERNAME_RE.fullmatch(u or "")) and u not in RESERVED


def free_username(base: str, is_taken) -> str:
    """A valid, unused handle derived from `base` (the part of the e-mail before '@')."""
    b = re.sub(r"[^a-z0-9_]", "", (base or "").lower())[:16] or "user"
    if len(b) < 3:
        b = (b + "user")[:16]
    cand, n = b, 1
    while cand in RESERVED or is_taken(cand):
        n += 1
        cand = f"{b[:20 - len(str(n))]}{n}"
    return cand


def _backfill_usernames() -> None:
    with conn() as c:
        rows = c.execute(select(users.c.id, users.c.email).where(users.c.username.is_(None)).order_by(users.c.id)).all()
        if not rows:
            return
        taken = {r[0] for r in c.execute(select(users.c.username).where(users.c.username.is_not(None)))}
        for uid, email in rows:
            name = free_username(email.split("@")[0], lambda n: n in taken)
            taken.add(name)
            c.execute(update(users).where(users.c.id == uid).values(username=name))
        log.info("migration: gave a username to %d existing users", len(rows))


def level_of(xp: int) -> int:
    return math.isqrt(max(0, int(xp))) // 10 + 1  # = floor(sqrt(xp / 100)) + 1, the same formula as the UI


def _today() -> str:
    return datetime.now(TZ).date().isoformat()


def _yesterday() -> str:
    return (datetime.now(TZ).date() - timedelta(days=1)).isoformat()


def _today_date():
    return datetime.now(TZ).date()


def _effective_plan(r) -> str:
    """The plan in force right now: a paid plan whose end date has passed counts as free."""
    plan, exp = r.get("plan") or "free", r.get("plan_expires_at")
    return plan if plan in config.PAID_PLANS and (exp is None or exp > time.time()) else "free"


def _daily_for(r) -> int:
    return config.PLAN_DAILY[_effective_plan(r)]


def _reset_if_new_day(c, u: dict) -> dict:
    """New calendar day (Tashkent) -> the daily pool is refilled to the plan's amount. Bonus tokens stay untouched."""
    today = _today_date()
    if u.get("last_token_reset") != today:
        pool = _daily_for(u)
        c.execute(update(users).where(users.c.id == u["id"]).values(tokens_remaining=pool, last_token_reset=today))
        return {**u, "tokens_remaining": pool, "last_token_reset": today}
    return u


def public_user(r) -> dict:
    """tokens_remaining is the TOTAL the user can spend (daily pool + bonus)."""
    plan = _effective_plan(r)
    until = max(1, config.CHAT_MESSAGES_PER_TOKEN - (r["chat_msg_count"] or 0))  # chat messages until the next token is taken
    return {**{k: r[k] for k in _PUBLIC}, "tokens_remaining": r["tokens_remaining"] + r["bonus_tokens"], "bonus_tokens": r["bonus_tokens"],
            "daily_tokens": config.PLAN_DAILY[plan], "plan": plan, "plan_expires_at": r["plan_expires_at"] if plan != "free" else None,
            "chat_until_charge": until}


@_retry
def get_user(uid: int):
    with conn() as c:
        r = c.execute(select(users).where(users.c.id == uid)).mappings().first()
        return public_user(_reset_if_new_day(c, dict(r))) if r else None


@_retry
def auth_user(uid: int, issued: float | None):
    """The user a token belongs to, or None: unknown user, or the token was issued before the last password reset."""
    with conn() as c:
        r = c.execute(select(users).where(users.c.id == uid)).mappings().first()
        if not r or (issued or 0) < float(r["tokens_valid_after"] or 0):
            return None
        return public_user(_reset_if_new_day(c, dict(r)))


@_retry
def user_by_email(email: str):
    with conn() as c:
        r = c.execute(select(users).where(users.c.email == email)).mappings().first()
        return dict(r) if r else None


@_retry
def user_by_username(username: str):
    with conn() as c:
        r = c.execute(select(users).where(users.c.username == username)).mappings().first()
        return dict(r) if r else None


@_retry
def username_taken(username: str) -> bool:
    with conn() as c:
        return c.execute(select(users.c.id).where(users.c.username == username)).first() is not None


@_retry
def create_user(email: str, name: str, pw_hash: str, username: str | None = None) -> int:
    """Insert a user. EmailTaken / UsernameTaken say exactly what collided; any other integrity problem is re-raised."""
    for _ in range(3):
        try:
            with conn() as c:
                uname = username or free_username(email.split("@")[0], lambda n: c.execute(select(users.c.id).where(users.c.username == n)).first() is not None)
                res = c.execute(users.insert().values(email=email, name=name, pw_hash=pw_hash, created=time.time(), username=uname,
                                                      last_token_reset=_today_date(), tokens_remaining=config.PLAN_DAILY["free"]))
                return int(res.inserted_primary_key[0])
        except IntegrityError:
            if user_by_email(email):
                raise EmailTaken from None
            if username:
                if username_taken(username):
                    raise UsernameTaken from None
                raise
            # a generated username collided with a signup happening at the same moment: pick another one
    raise UsernameTaken


@_retry
def record_activity(uid: int, *, award_key: str | None = None, xp: int = 0, ok: bool | None = None, problem: bool = False):
    """One transaction (row locked on PostgreSQL): touch the daily streak, give XP once per award_key, update counters
    and record milestones (streak / XP / level) for the friends feed. Returns (xp_gained, public_user)."""
    with conn() as c:
        u = c.execute(select(users).where(users.c.id == uid).with_for_update()).mappings().first()
        if not u:
            return 0, None
        u = _reset_if_new_day(c, dict(u))
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
        events = []
        if streak > u["streak"] and streak in STREAK_MILESTONES:
            events.append(("streak", streak))
        events += [("xp", m) for m in XP_MILESTONES if u["xp"] < m <= vals["xp"]]
        if level_of(vals["xp"]) > level_of(u["xp"]):
            events.append(("level", level_of(vals["xp"])))
        for kind, value in events:
            c.execute(milestones.insert().values(user_id=uid, kind=kind, value=value, created_at=time.time()))
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


# ---------------- daily tokens ----------------
def _spend(u: dict, n: int):
    """Take n tokens: the daily pool first, then the permanent bonus. -> (pool, bonus) or None if there are not enough."""
    pool, bonus = u["tokens_remaining"], u["bonus_tokens"]
    if pool + bonus < n:
        return None
    take = min(pool, n)
    return pool - take, bonus - (n - take)


@_retry
def charge_token(uid: int, key: str):
    """Take 1 token for analysing problem `key`. The same problem again on the same day is free.
    Returns (allowed, tokens_left, newly_charged)."""
    with conn() as c:
        u = c.execute(select(users).where(users.c.id == uid).with_for_update()).mappings().first()
        if not u:
            return False, 0, False
        u = _reset_if_new_day(c, dict(u))
        today = _today()
        c.execute(delete(awards).where(awards.c.user_id == uid, awards.c.key.like("t:%"), awards.c.key < f"t:{today}"))  # old days
        if c.execute(select(awards.c.key).where(awards.c.user_id == uid, awards.c.key == f"t:{today}:{key}")).first():
            return True, u["tokens_remaining"] + u["bonus_tokens"], False
        left = _spend(u, 1)
        if left is None:
            return False, 0, False
        c.execute(_insert(awards).values(user_id=uid, key=f"t:{today}:{key}").on_conflict_do_nothing())
        c.execute(update(users).where(users.c.id == uid).values(tokens_remaining=left[0], bonus_tokens=left[1]))
        return True, sum(left), True


@_retry
def refund_token(uid: int, key: str) -> None:
    """The AI failed: give the token back."""
    with conn() as c:
        if c.execute(delete(awards).where(awards.c.user_id == uid, awards.c.key == f"t:{_today()}:{key}")).rowcount:
            c.execute(update(users).where(users.c.id == uid).values(tokens_remaining=users.c.tokens_remaining + 1))


@_retry
def charge_n_tokens(uid: int, n: int = 1):
    """Charge `n` tokens directly (e.g. 1 token per batch of up to 10 generated test problems). Returns (allowed, tokens_left)."""
    n = max(1, int(n))
    with conn() as c:
        u = c.execute(select(users).where(users.c.id == uid).with_for_update()).mappings().first()
        if not u:
            return False, 0
        u = _reset_if_new_day(c, dict(u))
        left = _spend(u, n)
        if left is None:
            return False, 0
        c.execute(update(users).where(users.c.id == uid).values(tokens_remaining=left[0], bonus_tokens=left[1]))
        return True, sum(left)


@_retry
def refund_n_tokens(uid: int, n: int = 1) -> None:
    n = max(1, int(n))
    with conn() as c:
        c.execute(update(users).where(users.c.id == uid).values(tokens_remaining=users.c.tokens_remaining + n))


@_retry
def charge_chat_message(uid: int):
    """Every CHAT_MESSAGES_PER_TOKEN-th chat message (counted over all threads) costs 1 token.
    Returns (allowed, charged)."""
    with conn() as c:
        u = c.execute(select(users).where(users.c.id == uid).with_for_update()).mappings().first()
        if not u:
            return False, False
        u = _reset_if_new_day(c, dict(u))
        count = (u["chat_msg_count"] or 0) + 1
        if count >= config.CHAT_MESSAGES_PER_TOKEN:
            left = _spend(u, 1)
            if left is None:
                return False, False
            c.execute(update(users).where(users.c.id == uid).values(tokens_remaining=left[0], bonus_tokens=left[1], chat_msg_count=0))
            return True, True
        c.execute(update(users).where(users.c.id == uid).values(chat_msg_count=count))
        return True, False


@_retry
def refund_chat_message(uid: int, charged: bool) -> None:
    """The AI failed: undo the message count (and the token, if this message had paid one)."""
    with conn() as c:
        if charged:
            c.execute(update(users).where(users.c.id == uid).values(tokens_remaining=users.c.tokens_remaining + 1,
                                                                    chat_msg_count=config.CHAT_MESSAGES_PER_TOKEN - 1))
        else:
            c.execute(update(users).where(users.c.id == uid).values(chat_msg_count=case((users.c.chat_msg_count > 0, users.c.chat_msg_count - 1), else_=0)))


# ---------------- admin ----------------
def _like_escape(q: str) -> str:
    return q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@_retry
def admin_list_users(q: str = "", limit: int = 50, offset: int = 0) -> dict:
    """Search by username, name or e-mail (case-insensitive, partial)."""
    with conn() as c:
        stmt = select(users)
        if q.strip():
            pat = "%" + _like_escape(q.strip().lstrip("@")) + "%"
            stmt = stmt.where(or_(*[func.lower(col).like(pat, escape="\\") for col in (users.c.email, users.c.username, users.c.name)]))
        total = c.execute(select(func.count()).select_from(stmt.subquery())).scalar() or 0
        rows = c.execute(stmt.order_by(users.c.id.desc()).limit(limit).offset(offset)).mappings().all()
        today, out = _today_date(), []
        for r in rows:
            eff = dict(r)
            if r["last_token_reset"] != today:  # what the user would see right now
                eff["tokens_remaining"] = _daily_for(r)
            d = public_user(eff)
            d.update(last_active=r["last_day"] or None, created=r["created"])
            out.append(d)
        return {"total": total, "users": out}


@_retry
def admin_stats() -> dict:
    with conn() as c:
        n = lambda *w: c.execute(select(func.count()).select_from(users).where(*w)).scalar() or 0  # noqa: E731
        live = lambda p: and_(users.c.plan == p, or_(users.c.plan_expires_at.is_(None), users.c.plan_expires_at > time.time()))  # noqa: E731
        solved = c.execute(select(func.coalesce(func.sum(users.c.problems), 0))).scalar() or 0
        prem = n(live("premium"))
        vip = n(live("vip"))
        return {"users": n(), "premium": prem, "vip": vip, "subscribers": prem + vip, "problems_solved": int(solved), "active_today": n(users.c.last_day == _today())}


@_retry
def admin_adjust_tokens(uid: int, delta: int):
    """delta > 0 gives permanent bonus tokens; delta < 0 takes tokens away (daily pool first, then bonus), never below 0."""
    with conn() as c:
        u = c.execute(select(users).where(users.c.id == uid).with_for_update()).mappings().first()
        if not u:
            return None
        u = _reset_if_new_day(c, dict(u))
        pool, bonus = u["tokens_remaining"], u["bonus_tokens"]
        if delta >= 0:
            bonus += delta
        else:
            need = -delta
            take = min(pool, need); pool -= take; need -= take
            take = min(bonus, need); bonus -= take
        c.execute(update(users).where(users.c.id == uid).values(tokens_remaining=pool, bonus_tokens=bonus))
        return public_user({**u, "tokens_remaining": pool, "bonus_tokens": bonus})


@_retry
def admin_set_plan(uid: int, plan: str, days: int):
    """Activate / renew a plan. Renewing the same active plan adds the days to its current end date.
    days <= 0 = no end date. The daily pool is topped up to the new plan at once."""
    with conn() as c:
        u = c.execute(select(users).where(users.c.id == uid).with_for_update()).mappings().first()
        if not u:
            return None
        u = _reset_if_new_day(c, dict(u))
        now, exp = time.time(), None
        if plan != "free" and days > 0:
            cur = u["plan_expires_at"]
            base = cur if (u["plan"] == plan and cur and cur > now) else now
            exp = base + days * 86400
        pool = max(u["tokens_remaining"], config.PLAN_DAILY[plan]) if plan != "free" else min(u["tokens_remaining"], config.PLAN_DAILY["free"])
        c.execute(update(users).where(users.c.id == uid).values(plan=plan, plan_expires_at=exp, tokens_remaining=pool))
        return public_user({**u, "plan": plan, "plan_expires_at": exp, "tokens_remaining": pool})


# ---------------- chat threads / messages ----------------
def _thread_public(r) -> dict:
    return {k: r[k] for k in ("id", "title", "problem_key", "created_at", "updated_at")}


@_retry
def create_thread(uid: int, title: str, summary: str, problem_key: str | None = None) -> dict:
    """One thread per analysed problem (asking again returns the existing one); problem_key=None = a free chat."""
    with conn() as c:
        if problem_key:
            r = c.execute(select(chat_threads).where(chat_threads.c.user_id == uid, chat_threads.c.problem_key == problem_key)).mappings().first()
            if r:
                return _thread_public(r)
        now = time.time()
        vals = dict(user_id=uid, title=(title or "New chat")[:200], topic_summary=summary or "", problem_key=problem_key,
                    created_at=now, updated_at=now)
        vals["id"] = int(c.execute(chat_threads.insert().values(**vals)).inserted_primary_key[0])
        return _thread_public(vals)


@_retry
def list_threads(uid: int) -> list:
    with conn() as c:
        rows = c.execute(select(chat_threads).where(chat_threads.c.user_id == uid).order_by(chat_threads.c.updated_at.desc()).limit(100)).mappings().all()
        return [_thread_public(r) for r in rows]


@_retry
def get_thread(uid: int, tid: int):
    """Only the owner gets the thread (includes the private topic_summary used as AI context)."""
    with conn() as c:
        r = c.execute(select(chat_threads).where(chat_threads.c.id == tid, chat_threads.c.user_id == uid)).mappings().first()
        return dict(r) if r else None


@_retry
def delete_thread(uid: int, tid: int) -> bool:
    with conn() as c:
        if not c.execute(select(chat_threads.c.id).where(chat_threads.c.id == tid, chat_threads.c.user_id == uid)).first():
            return False
        c.execute(delete(chat_messages).where(chat_messages.c.thread_id == tid))  # SQLite does not enforce ON DELETE CASCADE
        c.execute(delete(chat_threads).where(chat_threads.c.id == tid))
        return True


@_retry
def add_messages(tid: int, pairs: list) -> list:
    """Store several (role, content) messages of one exchange together."""
    with conn() as c:
        now, out = time.time(), []
        for i, (role, content) in enumerate(pairs):
            vals = dict(thread_id=tid, role=role, content=content, created_at=now + i * 0.001)
            vals["id"] = int(c.execute(chat_messages.insert().values(**vals)).inserted_primary_key[0])
            out.append({k: vals[k] for k in ("id", "role", "content", "created_at")})
        c.execute(update(chat_threads).where(chat_threads.c.id == tid).values(updated_at=now))
        return out


@_retry
def list_messages(tid: int, last: int | None = None) -> list:
    """All messages oldest-first, or only the last `last` ones (the AI's short-term memory)."""
    with conn() as c:
        stmt = select(chat_messages).where(chat_messages.c.thread_id == tid)
        if last:
            rows = list(reversed(c.execute(stmt.order_by(chat_messages.c.id.desc()).limit(last)).mappings().all()))
        else:
            rows = c.execute(stmt.order_by(chat_messages.c.id).limit(1000)).mappings().all()
        return [{k: r[k] for k in ("id", "role", "content", "created_at")} for r in rows]


@_retry
def rename_thread(tid: int, title: str) -> None:
    with conn() as c:
        c.execute(update(chat_threads).where(chat_threads.c.id == tid).values(title=title[:200]))


# ---------------- e-mail verification (OTP) ----------------
@_retry
def verification_put(email: str, name: str, pw_hash: str, code: str, expires_at: float, username: str | None = None) -> None:
    """Start (or restart) a pending registration: a new code and zero wrong attempts."""
    stmt = _insert(email_verifications).values(email=email, name=name, pw_hash=pw_hash, code=code, expires_at=expires_at, attempts=0, username=username)
    stmt = stmt.on_conflict_do_update(index_elements=["email"], set_={k: stmt.excluded[k] for k in ("name", "pw_hash", "code", "expires_at", "attempts", "username")})
    with conn() as c:
        c.execute(delete(email_verifications).where(email_verifications.c.expires_at < time.time() - 86400))  # tidy up old rows
        c.execute(stmt)


@_retry
def verification_get(email: str):
    with conn() as c:
        r = c.execute(select(email_verifications).where(email_verifications.c.email == email)).mappings().first()
        return dict(r) if r else None


@_retry
def verification_bump(email: str) -> int:
    """One more wrong guess; returns the number of wrong guesses so far."""
    with conn() as c:
        c.execute(update(email_verifications).where(email_verifications.c.email == email).values(attempts=email_verifications.c.attempts + 1))
        r = c.execute(select(email_verifications.c.attempts).where(email_verifications.c.email == email)).first()
        return int(r[0]) if r else 0


@_retry
def verification_delete(email: str) -> None:
    with conn() as c:
        c.execute(delete(email_verifications).where(email_verifications.c.email == email))


# ---------------- forgot password ----------------
@_retry
def reset_put(email: str, code: str, expires_at: float) -> None:
    stmt = _insert(password_resets).values(email=email, code=code, expires_at=expires_at, attempts=0)
    stmt = stmt.on_conflict_do_update(index_elements=["email"], set_={k: stmt.excluded[k] for k in ("code", "expires_at", "attempts")})
    with conn() as c:
        c.execute(delete(password_resets).where(password_resets.c.expires_at < time.time() - 86400))
        c.execute(stmt)


@_retry
def reset_get(email: str):
    with conn() as c:
        r = c.execute(select(password_resets).where(password_resets.c.email == email)).mappings().first()
        return dict(r) if r else None


@_retry
def reset_bump(email: str) -> int:
    with conn() as c:
        c.execute(update(password_resets).where(password_resets.c.email == email).values(attempts=password_resets.c.attempts + 1))
        r = c.execute(select(password_resets.c.attempts).where(password_resets.c.email == email)).first()
        return int(r[0]) if r else 0


@_retry
def reset_delete(email: str) -> None:
    with conn() as c:
        c.execute(delete(password_resets).where(password_resets.c.email == email))


@_retry
def set_password(uid: int, pw_hash: str) -> None:
    """New password. Every session issued before this moment stops working."""
    with conn() as c:
        c.execute(update(users).where(users.c.id == uid).values(pw_hash=pw_hash, tokens_valid_after=time.time()))


@_retry
def user_by_id_raw(uid: int):
    """Full user row including pw_hash for password verification in settings."""
    with conn() as c:
        r = c.execute(select(users).where(users.c.id == uid)).mappings().first()
        return dict(r) if r else None


@_retry
def update_profile(uid: int, *, name: str | None = None, username: str | None = None, email: str | None = None):
    """Update user name, username, and/or email. Raises EmailTaken or UsernameTaken on conflict."""
    vals = {}
    if name is not None:
        vals["name"] = name.strip()[:80]
    if username is not None:
        vals["username"] = username.strip().lower()
    if email is not None:
        vals["email"] = email.strip().lower()
    if not vals:
        return get_user(uid)
    try:
        with conn() as c:
            if "email" in vals:
                existing = c.execute(select(users.c.id).where(users.c.email == vals["email"], users.c.id != uid)).first()
                if existing:
                    raise EmailTaken
            if "username" in vals:
                existing = c.execute(select(users.c.id).where(users.c.username == vals["username"], users.c.id != uid)).first()
                if existing:
                    raise UsernameTaken
            c.execute(update(users).where(users.c.id == uid).values(**vals))
    except IntegrityError:
        if "email" in vals:
            ex = user_by_email(vals["email"])
            if ex and ex["id"] != uid:
                raise EmailTaken from None
        if "username" in vals:
            ex = user_by_username(vals["username"])
            if ex and ex["id"] != uid:
                raise UsernameTaken from None
        raise
    return get_user(uid)


@_retry
def delete_all_threads(uid: int) -> None:
    with conn() as c:
        tids = [r[0] for r in c.execute(select(chat_threads.c.id).where(chat_threads.c.user_id == uid)).all()]
        if tids:
            c.execute(delete(chat_messages).where(chat_messages.c.thread_id.in_(tids)))
            c.execute(delete(chat_threads).where(chat_threads.c.user_id == uid))


@_retry
def delete_user_account(uid: int) -> bool:
    with conn() as c:
        u = c.execute(select(users.c.email).where(users.c.id == uid)).first()
        if not u:
            return False
        email = u[0]
        tids = [r[0] for r in c.execute(select(chat_threads.c.id).where(chat_threads.c.user_id == uid)).all()]
        if tids:
            c.execute(delete(chat_messages).where(chat_messages.c.thread_id.in_(tids)))
            c.execute(delete(chat_threads).where(chat_threads.c.user_id == uid))
        c.execute(delete(awards).where(awards.c.user_id == uid))
        c.execute(delete(milestones).where(milestones.c.user_id == uid))
        c.execute(delete(friendships).where(or_(friendships.c.user_id == uid, friendships.c.friend_id == uid)))
        c.execute(delete(email_verifications).where(email_verifications.c.email == email))
        c.execute(delete(password_resets).where(password_resets.c.email == email))
        c.execute(delete(users).where(users.c.id == uid))
        return True


# ---------------- friends / leaderboard / milestones ----------------
def _card(u) -> dict:
    return {"id": u["id"], "username": u["username"], "name": u["name"], "xp": u["xp"], "streak": u["streak"],
            "level": level_of(u["xp"]), "plan": _effective_plan(u)}


@_retry
def friend_request(me: int, username: str) -> str:
    """Send a friend request by username. If that user already asked me, it becomes a friendship at once.
    Returns 'requested' | 'accepted'; raises FriendError."""
    with conn() as c:
        t = c.execute(select(users.c.id).where(users.c.username == username)).first()
        if not t:
            raise FriendError("user_not_found")
        other = t[0]
        if other == me:
            raise FriendError("self")
        rows = c.execute(select(friendships).where(or_(and_(friendships.c.user_id == me, friendships.c.friend_id == other),
                                                       and_(friendships.c.user_id == other, friendships.c.friend_id == me)))).mappings().all()
        for r in rows:
            if r["status"] == "accepted":
                raise FriendError("already_friends")
            if r["user_id"] == me:
                raise FriendError("already_requested")
            c.execute(update(friendships).where(friendships.c.user_id == other, friendships.c.friend_id == me).values(status="accepted"))
            return "accepted"
        c.execute(friendships.insert().values(user_id=me, friend_id=other, status="pending", created_at=time.time()))
        return "requested"


@_retry
def friend_accept(me: int, requester_id: int) -> None:
    with conn() as c:
        res = c.execute(update(friendships).where(friendships.c.user_id == requester_id, friendships.c.friend_id == me,
                                                  friendships.c.status == "pending").values(status="accepted"))
        if not res.rowcount:
            raise FriendError("not_found")


@_retry
def friend_remove(me: int, other: int) -> bool:
    """Unfriend, decline or cancel: removes the pair in either direction."""
    with conn() as c:
        res = c.execute(delete(friendships).where(or_(and_(friendships.c.user_id == me, friendships.c.friend_id == other),
                                                      and_(friendships.c.user_id == other, friendships.c.friend_id == me))))
        return bool(res.rowcount)


@_retry
def friends_overview(me: int) -> dict:
    with conn() as c:
        rows = c.execute(select(friendships).where(or_(friendships.c.user_id == me, friendships.c.friend_id == me))).mappings().all()
        ids = {x for r in rows for x in (r["user_id"], r["friend_id"])} - {me}
        info = {r["id"]: r for r in c.execute(select(users).where(users.c.id.in_(ids))).mappings()} if ids else {}
        out = {"friends": [], "incoming": [], "outgoing": []}
        for r in rows:
            other = r["friend_id"] if r["user_id"] == me else r["user_id"]
            if other not in info:
                continue
            card = _card(info[other])
            out["friends" if r["status"] == "accepted" else "incoming" if r["friend_id"] == me else "outgoing"].append(card)
        return out


@_retry
def leaderboard(me: int, by: str = "xp") -> list:
    """Me + my accepted friends, ranked by XP or by streak."""
    with conn() as c:
        mine = c.execute(select(users).where(users.c.id == me)).mappings().first()
    rows = friends_overview(me)["friends"] + ([_card(mine)] if mine else [])
    key = "streak" if by == "streak" else "xp"
    rows.sort(key=lambda r: (-r[key], -r["xp"], r["username"] or ""))
    for i, r in enumerate(rows, 1):
        r["rank"], r["me"] = i, r["id"] == me
    return rows[:50]


@_retry
def global_leaderboard(me: int | None = None, by: str = "xp", limit: int = 10) -> list:
    """Global Top-10 XP / Streak Leaderboard across all users."""
    col = users.c.streak if by == "streak" else users.c.xp
    with conn() as c:
        rows = c.execute(select(users).order_by(col.desc(), users.c.xp.desc(), users.c.id.asc()).limit(limit)).mappings().all()
        out = []
        for i, r in enumerate(rows, 1):
            card = _card(r)
            card["rank"] = i
            card["me"] = (me is not None and r["id"] == me)
            out.append(card)
        return out


@_retry
def feed(me: int, limit: int = 30) -> list:
    """Latest milestones of me and my friends."""
    with conn() as c:
        fr = c.execute(select(friendships).where(friendships.c.status == "accepted",
                                                 or_(friendships.c.user_id == me, friendships.c.friend_id == me))).mappings().all()
        ids = {me} | {r["friend_id"] if r["user_id"] == me else r["user_id"] for r in fr}
        rows = c.execute(
            select(milestones.c.kind, milestones.c.value, milestones.c.created_at, users.c.username, users.c.name, users.c.id.label("uid"))
            .select_from(milestones.join(users, users.c.id == milestones.c.user_id))
            .where(milestones.c.user_id.in_(ids)).order_by(milestones.c.id.desc()).limit(limit)).mappings().all()
        return [{**dict(r), "me": r["uid"] == me} for r in rows]
