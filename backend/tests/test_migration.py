# Run from the backend folder:  python tests/test_migration.py  (builds an OLD database and checks the upgrade; set DATABASE_URL to test PostgreSQL - it DROPS the users table!)
import os, sys, tempfile
from sqlalchemy import create_engine, text, inspect
url = os.environ.get("DATABASE_URL", "")
if not url:
    path = tempfile.mktemp(suffix=".db"); os.environ["DB_PATH"] = path; raw = "sqlite:///" + path
else:
    raw = url.replace("postgres://", "postgresql+psycopg2://", 1).replace("postgresql://", "postgresql+psycopg2://", 1)
# an OLD database: users table as it was before this release, with one existing account
old = create_engine(raw)
with old.begin() as c:
    c.execute(text("DROP TABLE IF EXISTS users"))
    c.execute(text("""CREATE TABLE users(id INTEGER PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, name VARCHAR(80) NOT NULL,
      pw_hash VARCHAR(255) NOT NULL, xp INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0,
      last_day VARCHAR(10) NOT NULL DEFAULT '', correct INTEGER NOT NULL DEFAULT 0, wrong INTEGER NOT NULL DEFAULT 0,
      problems INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL DEFAULT '{}', created FLOAT)"""))
    c.execute(text("INSERT INTO users(id,email,name,pw_hash,xp) VALUES (1,'old@test.uz','Old','x',120)"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db
db.init(); db.init()                                   # twice: must be idempotent
cols = {c["name"] for c in inspect(db.engine).get_columns("users")}
assert {"tokens_remaining", "last_token_reset"} <= cols, cols
u = db.get_user(1)
assert u["xp"] == 120 and u["tokens_remaining"] == 50, u
assert {"chat_threads", "chat_messages"} <= set(inspect(db.engine).get_table_names())
print("MIGRATION OK on", db.BACKEND, "| existing user kept xp=%d, got tokens=%d" % (u["xp"], u["tokens_remaining"]))
