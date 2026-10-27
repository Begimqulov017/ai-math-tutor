# Run from the backend folder:  python tests/test_migration2.py     (upgrade from the previous release; with DATABASE_URL set it DROPS the users table!)
import os, sys, tempfile
from sqlalchemy import create_engine, text, inspect
url = os.environ.get("DATABASE_URL", "")
if not url:
    path = tempfile.mktemp(suffix=".db"); os.environ["DB_PATH"] = path; raw = "sqlite:///" + path
else:
    raw = url.replace("postgres://", "postgresql+psycopg2://", 1).replace("postgresql://", "postgresql+psycopg2://", 1)
real = "DOUBLE PRECISION" if raw.startswith("postgresql") else "REAL"
old = create_engine(raw)
with old.begin() as c:                         # the PREVIOUS release: tokens columns exist, nothing about plans / usernames
    for t in ("users", "email_verifications"): c.execute(text(f"DROP TABLE IF EXISTS {t}"))
    c.execute(text(f"""CREATE TABLE users(id {"SERIAL" if raw.startswith("postgresql") else "INTEGER"} PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, name VARCHAR(80) NOT NULL, pw_hash VARCHAR(255) NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0, last_day VARCHAR(10) NOT NULL DEFAULT '',
      correct INTEGER NOT NULL DEFAULT 0, wrong INTEGER NOT NULL DEFAULT 0, problems INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL DEFAULT '{{}}',
      created {real}, tokens_remaining INTEGER NOT NULL DEFAULT 50, last_token_reset DATE)"""))
    c.execute(text(f"""CREATE TABLE email_verifications(email VARCHAR(120) PRIMARY KEY, name VARCHAR(60) NOT NULL, pw_hash TEXT NOT NULL, code VARCHAR(10) NOT NULL,
      expires_at {real} NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)"""))
    c.execute(text("INSERT INTO users(id,email,name,pw_hash,xp,tokens_remaining) VALUES (1,'sam@a.uz','Sam','x',10,130),(2,'sam@b.uz','Sam2','x',20,40),(3,'a@c.uz','Tiny','x',0,50),(4,'Weird.Name+tag@d.uz','W','x',0,50)"))
if raw.startswith("postgresql"):
    with old.begin() as c: c.execute(text("SELECT setval(pg_get_serial_sequence('users','id'), 4)"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db
db.init(); db.init()                           # twice: idempotent
cols = {c["name"] for c in inspect(db.engine).get_columns("users")}
assert {"username", "bonus_tokens", "plan", "plan_expires_at", "chat_msg_count", "tokens_valid_after"} <= cols, cols
assert "username" in {c["name"] for c in inspect(db.engine).get_columns("email_verifications")}
names = {u: db.user_by_email(e)["username"] for u, e in ((1, "sam@a.uz"), (2, "sam@b.uz"), (3, "a@c.uz"), (4, "Weird.Name+tag@d.uz"))}
assert names[1] == "sam" and names[2] == "sam2" and len(names[3]) >= 3 and names[4] == "weirdnametag", names
assert len(set(names.values())) == 4 and all(db.valid_username(n) for n in names.values())
u1, u2 = db.get_user(1), db.get_user(2)
assert u1["tokens_remaining"] == 130 and u1["bonus_tokens"] == 80 and u1["daily_tokens"] == 50, u1     # the old admin grant (130-50) is now a permanent bonus
assert u2["tokens_remaining"] == 50 and u2["bonus_tokens"] == 0  # (40 -> 50: the first request of a new day refills the pool)
assert u2["bonus_tokens"] == 0 and u1["plan"] == "free" and u1["xp"] == 10
assert db.create_user("new@e.uz", "New", "h")                                                           # still works after the upgrade
try: db.create_user("x@f.uz", "X", "h", "sam"); raise SystemExit("duplicate username accepted")
except db.UsernameTaken: pass
print("MIGRATION v2 OK on", db.BACKEND, names)
