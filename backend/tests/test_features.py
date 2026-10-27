# Run from the backend folder:  python tests/test_features.py   (uses a temporary SQLite file; set DATABASE_URL to test PostgreSQL)
import json, os, sys, tempfile
os.environ.update(REQUIRE_EMAIL_VERIFICATION="false", GEMINI_API_KEY_1="k1aaaa", JWT_SECRET="t" * 40, DB_PATH=tempfile.mktemp(suffix=".db"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from datetime import timedelta
from sqlalchemy import update, select
from starlette.testclient import TestClient
import main, db, security, config

def analysis(problem):
    return {"problem": problem, "topic": {"area": "Algebra", "topic": "Linear", "method": "isolate x"}, "prerequisites": [],
            "concept": "Balance both sides", "steps": [{"latex": "2x=\\hl{4}", "comment": "c", "why": "w", "focus": []}],
            "variations": [], "practice": {"easy": [], "medium": [], "hard": []}, "is_geometry": False, "geometry_svg_or_coords": None}

calls = []
async def fake_gemini(parts, system, as_json, history=None, model=None):
    calls.append({"system": system, "history": history, "text": parts[0].get("text", ""), "json": as_json})
    if as_json:
        prob = parts[-1]["text"]
        return json.dumps(analysis(prob))
    return "assistant reply #%d" % len(calls)
main.gemini = fake_gemini
config.ADMIN_PASSWORD = "1234567890123456"

def fresh(): security._hits.clear()
def reg(c, email, name="Ali"):
    r = c.post("/api/auth/register", json={"name": name, "email": email, "password": "secret1"}).json()
    return r["token"], {"Authorization": "Bearer " + r["token"]}, r["user"]
def ana(c, text, H, ip="9.9.9.1"):
    return c.post("/api/analyze-problem", json={"text": text, "lang": "uz"}, headers={**H, "X-Forwarded-For": ip})

with TestClient(main.app, raise_server_exceptions=False) as c:
    # ---------- tokens ----------
    tok, H, u = reg(c, "ali@test.uz")
    assert u["tokens_remaining"] == 50 and u["daily_tokens"] == 50, u
    r = ana(c, "2x+1=5", H).json(); assert r["progress"]["user"]["tokens_remaining"] == 49, r["progress"]
    assert ana(c, "2x + 1 = 5", H).json()["progress"]["user"]["tokens_remaining"] == 49       # same problem, same day: free
    assert ana(c, "3x+1=7", H).json()["progress"]["user"]["tokens_remaining"] == 48
    with db.conn() as cn: cn.execute(update(db.users).values(tokens_remaining=1))
    assert ana(c, "4x+1=9", H).json()["progress"]["user"]["tokens_remaining"] == 0
    r = ana(c, "5x+1=11", H); d = r.json()["detail"]
    assert r.status_code == 403 and d["code"] == "tokens_exhausted" and "exhausted" in d["message"], r.text
    assert ana(c, "4x+1=9", H).status_code == 200                                                # already paid today: still opens
    # AI failure refunds the token
    with db.conn() as cn: cn.execute(update(db.users).values(tokens_remaining=5))
    real = main.gemini
    async def boom(*a, **k): raise main.HTTPException(503, "AI is busy")
    main.gemini = boom; assert ana(c, "6x+1=13", H).status_code == 503; main.gemini = real
    assert c.get("/api/me", headers=H).json()["user"]["tokens_remaining"] == 5
    print("tokens: charge / same-problem-free / 403 / refund: OK")

    # ---------- daily reset ----------
    yesterday = db._today_date() - timedelta(days=1)
    with db.conn() as cn: cn.execute(update(db.users).values(tokens_remaining=3, last_token_reset=yesterday))
    assert c.get("/api/me", headers=H).json()["user"]["tokens_remaining"] == 50                 # new day -> 50
    with db.conn() as cn: cn.execute(update(db.users).values(tokens_remaining=3, bonus_tokens=150, last_token_reset=yesterday))
    assert c.get("/api/me", headers=H).json()["user"]["tokens_remaining"] == 200                # pool refilled to 50, admin bonus (150) is kept
    with db.conn() as cn: cn.execute(update(db.users).values(tokens_remaining=50))
    print("daily reset: OK")

    # ---------- admin ----------
    fresh()
    tokB, HB, uB = reg(c, "bobur@test.uz", "Bobur")
    assert c.post("/api/admin/login", json={"password": "123"}).status_code == 401
    assert c.post("/api/admin/login", json={"password": "1234567890123450"}).status_code == 401
    assert c.get("/api/admin/users").status_code == 401 and c.get("/api/admin/users", headers=H).status_code == 401  # user token != admin
    r = c.post("/api/admin/login", json={"password": "1234567890123456"}); assert r.status_code == 200
    HA = {"Authorization": "Bearer " + r.json()["token"]}
    lst = c.get("/api/admin/users", headers=HA).json(); assert lst["total"] == 2
    assert {x["email"] for x in c.get("/api/admin/users?q=BOB", headers=HA).json()["users"]} == {"bobur@test.uz"}
    assert c.get("/api/admin/users?q=%25", headers=HA).json()["total"] == 0                       # '%' is not a wildcard
    g = c.post(f"/api/admin/users/{uB['id']}/tokens", headers=HA, json={"amount": 25}).json()["user"]
    assert g["tokens_remaining"] == 75, g
    assert c.post(f"/api/admin/users/{uB['id']}/tokens", headers=HA, json={"amount": 0}).status_code == 422
    assert c.post("/api/admin/users/999/tokens", headers=HA, json={"amount": 5}).status_code == 404
    assert c.get("/api/me", headers=HB).json()["user"]["tokens_remaining"] == 75
    fresh()
    codes = [c.post("/api/admin/login", json={"password": "0000000000000000"}).status_code for _ in range(6)]
    assert codes[-1] == 429, codes
    config.ADMIN_PASSWORD = ""; fresh()
    assert c.post("/api/admin/login", json={"password": "1234567890123456"}).status_code == 503
    config.ADMIN_PASSWORD = "1234567890123456"
    print("admin: auth / search / grant / brute-force lock / disabled: OK")

    # ---------- chat threads with memory ----------
    fresh(); calls.clear()
    tokC, HC, uC = reg(c, "chat@test.uz", "Sardor")
    a = ana(c, "7x-3=11", HC, "9.9.9.2").json()
    tid = a["thread_id"]; assert tid
    assert ana(c, "7x - 3 = 11", HC, "9.9.9.2").json()["thread_id"] == tid                       # one thread per problem
    th = c.get("/api/chat/threads", headers=HC).json()["threads"]; assert [t["id"] for t in th] == [tid]
    m1 = c.post(f"/api/chat/threads/{tid}/messages", headers=HC, json={"content": "Why divide by 7?", "lang": "uz", "context": {"step": 1}}).json()
    chat_calls = [x for x in calls if not x["json"]]
    assert "7x-3=11" in chat_calls[0]["system"] and "Balance both sides" in chat_calls[0]["system"], "topic memory missing"
    assert chat_calls[0]["history"] == [] and "step" in chat_calls[0]["text"]
    c.post(f"/api/chat/threads/{tid}/messages", headers=HC, json={"content": "And then?", "lang": "uz"})
    h2 = [x for x in calls if not x["json"]][1]["history"]
    assert [t["role"] for t in h2] == ["user", "model"] and h2[0]["parts"][0]["text"] == "Why divide by 7?" and "assistant reply" in h2[1]["parts"][0]["text"]
    msgs = c.get(f"/api/chat/threads/{tid}/messages", headers=HC).json()["messages"]
    assert [m["role"] for m in msgs] == ["user", "assistant", "user", "assistant"]
    # failing AI does not leave a dangling user message
    main.gemini = boom
    assert c.post(f"/api/chat/threads/{tid}/messages", headers=HC, json={"content": "x"}).status_code == 503; main.gemini = real
    assert len(c.get(f"/api/chat/threads/{tid}/messages", headers=HC).json()["messages"]) == 4
    # privacy: another user cannot read / write / delete it
    assert c.get(f"/api/chat/threads/{tid}/messages", headers=H).status_code == 404
    assert c.post(f"/api/chat/threads/{tid}/messages", headers=H, json={"content": "hi"}).status_code == 404
    assert c.delete(f"/api/chat/threads/{tid}", headers=H).status_code == 404
    assert c.get("/api/chat/threads").status_code == 401
    # free chat + second problem = separate threads, newest first
    free = c.post("/api/chat/threads", headers=HC, json={"title": "Fractions"}).json()["thread"]
    a2 = ana(c, "8x=16", HC, "9.9.9.2").json()
    ids = [t["id"] for t in c.get("/api/chat/threads", headers=HC).json()["threads"]]
    assert ids[0] == a2["thread_id"] and set(ids) == {tid, free["id"], a2["thread_id"]}, ids
    by_key = c.post("/api/chat/threads", headers=HC, json={"problem_key": a["key"]}).json()["thread"]; assert by_key["id"] == tid
    # memory survives (it is in the database, not in the browser)
    assert len(db.list_messages(tid, last=2)) == 2
    assert c.delete(f"/api/chat/threads/{tid}", headers=HC).status_code == 200
    assert c.get(f"/api/chat/threads/{tid}/messages", headers=HC).status_code == 404 and db.list_messages(tid) == []
    print("chat threads: auto-create / memory / privacy / delete: OK")
print("FEATURE TESTS PASSED on", db.BACKEND)
