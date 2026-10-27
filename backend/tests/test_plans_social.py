# Run from the backend folder:  python tests/test_plans_social.py   (usernames, forgot password, plans, admin tokens +/-, chat cost, friends, lanes)
import asyncio, json, os, sys, tempfile, time
os.environ.update(GEMINI_API_KEY_1="k1", JWT_SECRET="t" * 40, DB_PATH=tempfile.mktemp(suffix=".db"), REQUIRE_EMAIL_VERIFICATION="false")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy import update, select
from starlette.testclient import TestClient
import main, db, security, config, llm

seen = []
def analysis(problem):
    return {"problem": problem, "topic": {"area": "Algebra", "topic": "Quadratic", "method": "D"}, "prerequisites": [], "concept": "idea",
            "steps": [{"latex": "x=1", "comment": "c", "why": "w", "focus": []}], "variations": [],
            "practice": {"easy": [{"q": "1+1", "answer": "2", "hint": "h"}], "medium": [], "hard": []}, "is_geometry": False, "geometry_svg_or_coords": None,
            "graph": {"functions": [{"expr": "x^2-5*x+6", "label": "y"}], "xmin": -1, "xmax": 6, "points": [{"x": 2, "y": 0, "label": "x1"}, {"x": "bad", "y": 1}]}}
async def fake_gemini(parts, system, as_json, history=None, model=None):
    seen.append({"model": model, "advanced": "ADVANCED ANALYSIS" in system, "json": as_json})
    return json.dumps(analysis(parts[-1]["text"])) if as_json else "assistant reply"
main.gemini = fake_gemini
config.ADMIN_PASSWORD = "1234567890123456"
sent = []
async def fake_send(email, name, code, lang, kind="verify"): sent.append(dict(email=email, code=code, kind=kind, lang=lang))
main.send_code = fake_send

def fresh(): security._hits.clear()
def reg(c, email, name="Ali", username=None, pw="secret123", **extra):
    fresh(); body = {"name": name, "email": email, "password": pw, "password_confirm": pw, **extra}
    if username: body["username"] = username
    return c.post("/api/auth/register", json=body)
def make(c, email, username=None, name=None):
    r = reg(c, email, name or email.split("@")[0].title(), username).json()
    return {"Authorization": "Bearer " + r["token"]}, r["user"]
def ana(c, text, H, ip="9.9.9.1"):
    fresh(); return c.post("/api/analyze-problem", json={"text": text, "lang": "uz"}, headers={**H, "X-Forwarded-For": ip})
def admin(c):
    fresh(); t = c.post("/api/admin/login", json={"password": "1234567890123456"}).json()["token"]; return {"Authorization": "Bearer " + t}
def set_cols(uid, **v):
    with db.conn() as cn: cn.execute(update(db.users).where(db.users.c.id == uid).values(**v))

with TestClient(main.app, raise_server_exceptions=False) as c:
    # ================= username + password confirmation =================
    r = reg(c, "ali@test.uz", username="@Ali_01"); assert r.status_code == 200 and r.json()["user"]["username"] == "ali_01", r.text
    assert reg(c, "x@test.uz", username="ALI_01").json()["detail"]["code"] == "username_taken"
    assert reg(c, "x@test.uz", username="ab").json()["detail"]["code"] == "bad_username"
    assert reg(c, "x@test.uz", username="has space").status_code == 400 and reg(c, "x@test.uz", username="admin").status_code == 400
    r = c.post("/api/auth/register", json={"name": "X", "email": "x@test.uz", "password": "secret123", "password_confirm": "different1"})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "password_mismatch" and db.user_by_email("x@test.uz") is None
    assert reg(c, "ali@test.uz", username="other").json()["detail"]["code"] == "email_taken"
    assert reg(c, "ali.k@test.uz").json()["user"]["username"] == "alik"                       # generated from the e-mail
    assert reg(c, "alik@other.uz").json()["user"]["username"] == "alik2"                      # ...and made unique
    fresh(); assert c.get("/api/auth/username-available?u=free_name").json() == {"valid": True, "available": True}
    assert c.get("/api/auth/username-available?u=Ali_01").json() == {"valid": True, "available": False}
    assert c.get("/api/auth/username-available?u=a!").json() == {"valid": False, "available": False}
    # with e-mail verification the chosen username travels with the pending registration
    config.REQUIRE_EMAIL_VERIFICATION = True; sent.clear()
    assert reg(c, "pend@test.uz", username="pending_one").json()["status"] == "verification_sent"
    assert db.verification_get("pend@test.uz")["username"] == "pending_one"
    fresh(); j = c.post("/api/auth/verify", json={"email": "pend@test.uz", "code": sent[-1]["code"]}).json(); assert j["user"]["username"] == "pending_one"
    config.REQUIRE_EMAIL_VERIFICATION = False
    print("username + password confirmation: OK")

    # ================= forgot password =================
    config.REQUIRE_EMAIL_VERIFICATION = False
    H_old, u = make(c, "reset@test.uz", "resetter"); sent.clear()
    assert c.get("/api/me", headers=H_old).status_code == 200
    fresh(); r = c.post("/api/auth/forgot", json={"email": "nobody@test.uz", "lang": "uz"}); ghost = r.json()
    assert r.status_code == 200 and ghost["status"] == "reset_sent" and not sent, "must not reveal / mail unknown addresses"
    fresh(); real = c.post("/api/auth/forgot", json={"email": "Reset@Test.uz", "lang": "ru"}).json()
    assert real == ghost and len(sent) == 1 and sent[0]["kind"] == "reset" and sent[0]["lang"] == "ru"       # same answer for both
    code = sent[0]["code"]
    fresh(); c.post("/api/auth/forgot", json={"email": "reset@test.uz"}); assert len(sent) == 1                  # cooldown: no second mail
    rs = lambda cd, pw="NewPass#123", conf=None, em="reset@test.uz": c.post("/api/auth/reset", json={"email": em, "code": cd, "password": pw, "password_confirm": pw if conf is None else conf})
    wrong = "000000" if code != "000000" else "111111"
    fresh(); r = rs(wrong); assert r.status_code == 400 and r.json()["detail"]["attempts_left"] == 4
    fresh(); assert rs(code, conf="mismatch1").json()["detail"]["code"] == "password_mismatch"
    fresh(); assert rs(code, em="nobody@test.uz").status_code == 410
    fresh(); assert c.post("/api/auth/login", json={"email": "reset@test.uz", "password": "secret123"}).status_code == 200   # old password still fine
    fresh(); r = rs(code); assert r.status_code == 200 and r.json() == {"status": "password_changed"}, r.text
    fresh(); assert rs(code).status_code == 410                                                                   # a code works once
    assert c.post("/api/auth/login", json={"email": "reset@test.uz", "password": "secret123"}).status_code == 401  # old password dead
    j = c.post("/api/auth/login", json={"email": "reset@test.uz", "password": "NewPass#123"}).json(); H_new = {"Authorization": "Bearer " + j["token"]}
    assert c.get("/api/me", headers=H_old).status_code == 401, "old sessions must be signed out"
    assert c.get("/api/me", headers=H_new).status_code == 200, "the new login must work immediately"
    # brute force on the reset code burns it
    sent.clear(); fresh(); c.post("/api/auth/forgot", json={"email": "reset@test.uz"}); good = sent[-1]["code"]; bad = "000000" if good != "000000" else "111111"
    for i in range(5): fresh(); r = rs(bad, "Another#123")
    assert r.status_code == 429 and r.json()["detail"]["code"] == "too_many_attempts"
    fresh(); assert rs(good, "Another#123").status_code == 410
    # mail failures
    from mailer import MailFailed
    async def failing(*a, **k): raise MailFailed()
    main.send_code = failing; set_cols(u["id"], name="Resetter"); db.reset_delete("reset@test.uz")
    fresh(); assert c.post("/api/auth/forgot", json={"email": "reset@test.uz"}).status_code == 502 and db.reset_get("reset@test.uz") is None
    main.send_code = fake_send
    print("forgot / reset password: OK")

    # ================= plans =================
    config.PREMIUM_MODEL, config.VIP_MODEL = "gem-premium", "gem-vip"
    HF, uf = make(c, "free@test.uz", "free_user"); HP, up = make(c, "prem@test.uz", "prem_user"); HV, uv = make(c, "vip@test.uz", "vip_user")
    assert uf["plan"] == "free" and uf["daily_tokens"] == 50 and uf["tokens_remaining"] == 50
    HA = admin(c)
    seen.clear(); r = ana(c, "x^2-5x+6=0", HF).json()
    assert "graph" not in r and seen[-1] == {"model": config.MODEL, "advanced": False, "json": True}, (r.keys(), seen[-1])      # free: no graph, normal model
    adm = lambda uid, plan, days=30: c.post(f"/api/admin/users/{uid}/plan", headers=HA, json={"plan": plan, "days": days})
    r = adm(up["id"], "premium").json()["user"]
    assert r["plan"] == "premium" and r["daily_tokens"] == 200 and r["tokens_remaining"] == 200, r              # topped up at once
    assert abs(r["plan_expires_at"] - (time.time() + 30 * 86400)) < 60
    seen.clear(); r = ana(c, "x^2-5x+6=0", HP).json()                                                          # the SAME problem: own (richer) cache entry
    assert seen and seen[-1] == {"model": "gem-premium", "advanced": True, "json": True}, seen
    assert r["graph"]["functions"][0]["expr"] == "x^2-5*x+6" and len(r["graph"]["points"]) == 1, "graph kept, broken point dropped"
    assert r["progress"]["user"]["tokens_remaining"] == 199
    seen.clear(); assert "graph" not in ana(c, "x^2-5x+6=0", HF, "9.9.9.2").json() and not seen, "free users keep using the free cache entry"
    r = adm(uv["id"], "vip").json()["user"]; assert r["daily_tokens"] == 500 and r["tokens_remaining"] == 500
    seen.clear(); ana(c, "another", HV); assert seen[-1]["model"] == "gem-vip"
    # renewal adds days; free cancels and caps the pool
    r = adm(up["id"], "premium", 30).json()["user"]; assert abs(r["plan_expires_at"] - (time.time() + 60 * 86400)) < 60
    assert adm(up["id"], "free").json()["user"]["tokens_remaining"] == 50
    adm(up["id"], "premium", 10); set_cols(up["id"], plan_expires_at=time.time() - 5)                           # expired
    me = c.get("/api/me", headers=HP).json()["user"]; assert me["plan"] == "free" and me["daily_tokens"] == 50 and me["plan_expires_at"] is None
    set_cols(up["id"], tokens_remaining=190, last_token_reset=db._today_date() - __import__("datetime").timedelta(days=1))
    assert c.get("/api/me", headers=HP).json()["user"]["tokens_remaining"] == 50                                # no free ride after the plan ended
    assert c.post(f"/api/admin/users/{up['id']}/plan", headers=HA, json={"plan": "gold", "days": 30}).status_code == 422
    # unlimited plan (days = 0)
    assert adm(up["id"], "vip", 0).json()["user"]["plan_expires_at"] is None
    print("plans (daily tokens, advanced analysis, models, renewal, expiry): OK")

    # ================= admin: search + tokens +/- + stats =================
    fresh(); HA = admin(c)
    names = lambda q: {x["username"] for x in c.get(f"/api/admin/users?q={q}", headers=HA).json()["users"]}
    assert names("prem") == {"prem_user"} and names("@VIP_") == {"vip_user"} and "free_user" in names("test.uz")
    assert names("%25") == set() and names("_") == {x for x in names("_") if "_" in x}                          # wildcards are literal
    t = lambda uid, amount: c.post(f"/api/admin/users/{uid}/tokens", headers=HA, json={"amount": amount})
    f = db.get_user(uf["id"]); base = f["tokens_remaining"]
    assert t(uf["id"], 100).json()["user"]["tokens_remaining"] == base + 100
    assert t(uf["id"], -30).json()["user"]["tokens_remaining"] == base + 70
    assert t(uf["id"], -100000).json()["user"]["tokens_remaining"] == 0                                         # never below zero
    assert t(uf["id"], 0).status_code == 422 and t(999999, 5).status_code == 404
    set_cols(uf["id"], tokens_remaining=10, bonus_tokens=5)
    assert db.get_user(uf["id"])["tokens_remaining"] == 15
    r = t(uf["id"], -12).json()["user"]; assert db.admin_list_users("free_user")["users"][0]["tokens_remaining"] == 3 == r["tokens_remaining"]
    stats = c.get("/api/admin/stats", headers=HA).json(); assert stats["vip"] >= 1 and stats["users"] >= 5, stats
    assert c.get("/api/admin/stats").status_code == 401
    print("admin search / add / subtract / stats: OK")

    # ================= chat: 3 messages = 1 token =================
    HC, uc = make(c, "chat@test.uz", "chatter"); fresh()
    th = c.post("/api/chat/threads", headers=HC, json={"title": ""}).json()["thread"]["id"]
    th2 = c.post("/api/chat/threads", headers=HC, json={"title": ""}).json()["thread"]["id"]
    say = lambda tid, text="hi": (fresh(), c.post(f"/api/chat/threads/{tid}/messages", headers=HC, json={"content": text, "lang": "uz"}))[1]
    tokens = lambda: db.get_user(uc["id"])["tokens_remaining"]
    r1 = say(th); assert r1.status_code == 200 and tokens() == 50 and r1.json()["user"]["chat_until_charge"] == 2
    say(th2); assert tokens() == 50                                                                              # 2 messages: free (over all threads)
    r3 = say(th); assert tokens() == 49 and r3.json()["user"]["chat_until_charge"] == 3                          # the 3rd pays
    for _ in range(3): say(th)
    assert tokens() == 48
    # an AI failure does not count (neither the message nor the token)
    real = main.gemini
    async def boom(*a, **k): raise main.HTTPException(503, "busy")
    say(th); say(th)                                                                                             # counter = 2
    main.gemini = boom; assert say(th).status_code == 503; main.gemini = real
    assert tokens() == 48 and db.get_user(uc["id"])["chat_until_charge"] == 1                                   # the 3rd message is still the next one
    msgs_before = len(db.list_messages(th))
    # no tokens left: the paying message is refused and nothing is saved
    set_cols(uc["id"], tokens_remaining=0, bonus_tokens=0)
    r = say(th); assert r.status_code == 403 and r.json()["detail"]["code"] == "tokens_exhausted" and len(db.list_messages(th)) == msgs_before
    set_cols(uc["id"], chat_msg_count=0); assert say(th).status_code == 200 and say(th).status_code == 200      # 1st and 2nd are still free
    assert say(th).status_code == 403
    print("chat token cost (1 per 3 messages, refunds, exhausted): OK")

    # ================= friends =================
    HA1, a = make(c, "fa@test.uz", "anna"); HB1, b = make(c, "fb@test.uz", "bobur"); HC1, cc = make(c, "fc@test.uz", "carol"); HD1, d = make(c, "fd@test.uz", "stranger")
    fr = lambda H, un: (fresh(), c.post("/api/friends/request", headers=H, json={"username": un}))[1]
    assert fr(HA1, "@BOBUR").json() == {"status": "requested"}
    assert fr(HA1, "bobur").json()["detail"]["code"] == "already_requested" and fr(HA1, "anna").json()["detail"]["code"] == "self"
    assert fr(HA1, "nobody_here").status_code == 404
    ov = c.get("/api/friends", headers=HB1).json(); assert [x["username"] for x in ov["incoming"]] == ["anna"] and ov["friends"] == []
    assert [x["username"] for x in c.get("/api/friends", headers=HA1).json()["outgoing"]] == ["bobur"]
    assert c.post(f"/api/friends/{a['id']}/accept", headers=HC1).status_code == 404                              # not addressed to carol
    assert c.post(f"/api/friends/{b['id']}/accept", headers=HA1).status_code == 404                              # the sender cannot accept
    assert c.post(f"/api/friends/{a['id']}/accept", headers=HB1).status_code == 200
    assert fr(HB1, "anna").json()["detail"]["code"] == "already_friends"
    assert [x["username"] for x in c.get("/api/friends", headers=HA1).json()["friends"]] == ["bobur"]
    assert fr(HC1, "anna").json() == {"status": "requested"} and fr(HA1, "carol").json() == {"status": "accepted"}  # a crossing request = friends
    assert c.delete(f"/api/friends/{cc['id']}", headers=HA1).status_code == 200 and c.delete(f"/api/friends/{cc['id']}", headers=HA1).status_code == 404
    assert c.get("/api/friends").status_code == 401
    fr(HC1, "anna"); c.post(f"/api/friends/{cc['id']}/accept", headers=HA1)
    # leaderboard: me + friends only, by XP or streak
    db.record_activity(a["id"], award_key="t1", xp=120); db.record_activity(b["id"], award_key="t2", xp=300); db.record_activity(cc["id"], award_key="t3", xp=50)
    db.record_activity(d["id"], award_key="t4", xp=9999)
    rows = c.get("/api/leaderboard?by=xp", headers=HA1).json()["rows"]
    assert [(r["username"], r["rank"]) for r in rows] == [("bobur", 1), ("anna", 2), ("carol", 3)], rows
    assert [r["me"] for r in rows] == [False, True, False] and "stranger" not in {r["username"] for r in rows}
    set_cols(cc["id"], streak=9); rows = c.get("/api/leaderboard?by=streak", headers=HA1).json()["rows"]; assert rows[0]["username"] == "carol"
    assert c.get("/api/leaderboard?by=hax", headers=HA1).status_code == 422
    # milestones feed
    items = c.get("/api/feed", headers=HA1).json()["items"]
    kinds = {(i["username"], i["kind"], i["value"]) for i in items}
    assert ("anna", "xp", 100) in kinds and ("anna", "level", 2) in kinds and ("bobur", "xp", 250) in kinds and ("stranger", "xp", 5000) not in kinds, kinds
    set_cols(a["id"], streak=2, last_day=db._yesterday()); db.record_activity(a["id"])
    assert any(i["kind"] == "streak" and i["value"] == 3 and i["me"] for i in c.get("/api/feed", headers=HA1).json()["items"])
    assert not any(i["username"] == "anna" for i in c.get("/api/feed", headers=HD1).json()["items"]), "strangers must not see my milestones"
    print("friends / leaderboard / milestones: OK")

# ================= priority lanes =================
async def lanes():
    held = [await llm._lanes["free"].acquire() for _ in range(config.LLM_LANE_SIZE)]           # the free lane is completely busy
    async def use(plan):
        async with llm.lane(plan): return plan
    assert await asyncio.wait_for(use("premium"), 1) == "premium" and await asyncio.wait_for(use("vip"), 1) == "vip"
    try: await asyncio.wait_for(use("free"), 0.2); raise SystemExit("free user should have to wait")
    except asyncio.TimeoutError: pass
    for _ in held: llm._lanes["free"].release()
    assert await asyncio.wait_for(use("free"), 1) == "free"
asyncio.run(lanes())
print("priority lanes: OK")
print("PLANS + SOCIAL TESTS PASSED on", db.BACKEND)
