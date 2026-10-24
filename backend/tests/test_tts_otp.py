# Run from the backend folder:  python tests/test_tts_otp.py   (speech normalizer, /api/tts with a fake voice service, e-mail OTP flow)
import asyncio, json, os, sys, tempfile, time, types
os.environ.update(GEMINI_API_KEY_1="k1", JWT_SECRET="t" * 40, DB_PATH=tempfile.mktemp(suffix=".db"))
os.environ.pop("EMAIL_DEV_LOG", None)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy import update, select
from starlette.testclient import TestClient
import main, db, security, config, mailer, speech
from speech import math_to_spoken_text as say

# ======================= 1) math -> speech =======================
cases = [
 ("uz", "$x^2 - 5x + 6 = 0$", "x kvadrat ayiruv 5 x qo'shuv 6 teng 0"),
 ("uz", "$\\sqrt{x+1}$", "ildiz ostida x qo'shuv 1"),
 ("uz", "$\\frac{a}{b}$", "kasr a bo'lingan b"),
 ("uz", "$\\pi r^2$", "pi r kvadrat"),
 ("uz", "$x^3$", "x kub"),
 ("uz", "$x = -5$", "x teng minus 5"),
 ("uz", "5-qadam: $2x = 4$", "5-qadam: 2 x teng 4"),                    # a hyphen in prose is NOT a minus
 ("uz", "$$\\hl{x} = \\frac{-b \\pm \\sqrt{D}}{2a}$$", "x teng kasr minus b plyus minus ildiz ostida D bo'lingan 2 a"),
 ("ru", "$x^2 = 9$", "x в квадрате равно 9"),
 ("ru", "$\\sqrt{16} = 4$", "корень из 16 равно 4"),
 ("ru", "$x^3 + 1$", "x в кубе плюс 1"),
 ("ru", "$a - b$", "a минус b"),
 ("en", "$x^2 = 9$", "x squared equals 9"),
 ("en", "$\\sqrt{16} = 4$", "square root of 16 equals 4"),
 ("en", "$x^3$", "x cubed"),
 ("en", "$\\frac{1}{2} + \\frac{1}{3}$", "fraction 1 over 2 plus fraction 1 over 3"),
 ("en", "$x^{10}$", "x to the power 10"),
 ("en", "$\\sin(\\theta) \\le 1$", "sine ( theta ) less than or equal to 1"),
 ("en", "$x_1 + x_2$", "x sub 1 plus x sub 2"),
 ("en", "$$\\frac{\\frac{1}{2}}{3}$$", "fraction fraction 1 over 2 over 3"),
 ("en", "\\sqrt{4} = 2", "square root of 4 equals 2"),                       # a bare formula without $
 ("en", "Well done ✅ **very** good 🔥", "Well done very good"),
]
bad = 0
for lang, src, want in cases:
    got = say(src, lang)
    if got != want:
        bad += 1; print(f"  [{lang}] {src!r}\n     got : {got!r}\n     want: {want!r}")
assert not bad, f"{bad} normalizer cases differ"
assert "$" not in say("$$a$$ and $b$", "en") and say("", "uz") == ""
print(f"speech normalizer: {len(cases)} cases OK")

# ======================= 2) /api/tts with a fake edge_tts =======================
calls = []
class FakeComm:
    def __init__(self, text, voice=None, **k): calls.append((text, voice))
    async def stream(self):
        yield {"type": "WordBoundary", "text": "x"}
        yield {"type": "audio", "data": b"ID3" + b"\x00" * 10}
        yield {"type": "audio", "data": b"MP3DATA"}
fake = types.ModuleType("edge_tts"); fake.Communicate = FakeComm
sys.modules["edge_tts"] = fake
def fresh(): security._hits.clear()
with TestClient(main.app, raise_server_exceptions=False) as c:
    r = c.post("/api/tts", json={"text": "$x^2 = 9$", "lang": "uz"})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg" and r.content.endswith(b"MP3DATA"), (r.status_code, r.text)
    assert calls[-1] == ("x kvadrat teng 9", "uz-UZ-MadinaNeural"), calls[-1]
    for lang, voice in (("ru", "ru-RU-SvetlanaNeural"), ("en", "en-US-AriaNeural")):
        assert c.post("/api/tts", json={"text": "hello", "lang": lang}).status_code == 200 and calls[-1][1] == voice
    n = len(calls); c.post("/api/tts", json={"text": "$x^2 = 9$", "lang": "uz"}); assert len(calls) == n, "cache miss"
    assert c.post("/api/tts", json={"text": "x", "lang": "de"}).status_code == 422
    assert c.post("/api/tts", json={"text": "", "lang": "uz"}).status_code == 422
    assert c.post("/api/tts", json={"text": "a" * 1501, "lang": "uz"}).status_code == 422
    assert c.post("/api/tts", json={"text": "✅ 🔥", "lang": "uz"}).status_code == 400            # nothing left to read
    class Boom(FakeComm):
        async def stream(self): raise ConnectionError("blocked"); yield
    fake.Communicate = Boom
    r = c.post("/api/tts", json={"text": "fresh text", "lang": "uz"}, headers={"Origin": "https://x.vercel.app"})
    assert r.status_code == 502 and r.json()["detail"]["code"] == "tts_failed" and r.headers["access-control-allow-origin"] == "*"
    fake.Communicate = FakeComm
    sys.modules["edge_tts"] = None   # makes "import edge_tts" raise ImportError
    r = c.post("/api/tts", json={"text": "another one", "lang": "uz"}); assert r.status_code == 503, r.text    # library missing
    sys.modules["edge_tts"] = fake
    fresh(); codes = [c.post("/api/tts", json={"text": f"t{i}", "lang": "en"}).status_code for i in range(32)]
    assert codes[-1] == 429 and codes[0] == 200, codes
print("/api/tts: voices / cache / validation / failure / rate limit OK")

# ======================= 3) e-mail OTP =======================
sent = []
async def fake_send(email, name, code, lang): sent.append(dict(email=email, name=name, code=code, lang=lang))
main.send_code = fake_send
def reg(c, email="ali@test.uz", name="Ali", pw="secret1", lang="uz"):
    fresh(); return c.post("/api/auth/register", json={"name": name, "email": email, "password": pw, "lang": lang})
def rewind(email, seconds):   # pretend `seconds` have passed since the code was sent
    with db.conn() as cn: cn.execute(update(db.email_verifications).where(db.email_verifications.c.email == email).values(expires_at=db.email_verifications.c.expires_at - seconds))

with TestClient(main.app, raise_server_exceptions=False) as c:
    r = reg(c, "Ali@Test.uz", lang="ru"); j = r.json()
    assert r.status_code == 200 and j == {"status": "verification_sent", "email": "ali@test.uz", "expires_in": 600, "resend_after": 60}, j
    assert "token" not in j and db.user_by_email("ali@test.uz") is None, "account created before verification!"
    assert len(sent) == 1 and sent[0]["lang"] == "ru" and len(sent[0]["code"]) == 6 and sent[0]["code"].isdigit()
    code = sent[0]["code"]
    pend = db.verification_get("ali@test.uz"); assert pend["code"] == code and pend["attempts"] == 0 and pend["pw_hash"].startswith("$2")
    assert c.post("/api/auth/login", json={"email": "ali@test.uz", "password": "secret1"}).status_code == 401      # cannot log in yet
    # cooldown: another register / resend right away is refused
    r = reg(c, "ali@test.uz"); assert r.status_code == 429 and r.json()["detail"]["code"] == "resend_wait" and 0 < r.json()["detail"]["retry_after"] <= 60
    fresh(); r = c.post("/api/auth/resend", json={"email": "ali@test.uz"}); assert r.status_code == 429
    # wrong codes
    wrong = "000000" if code != "000000" else "111111"
    v = lambda cd, em="ali@test.uz": c.post("/api/auth/verify", json={"email": em, "code": cd})
    fresh(); r = v(wrong); assert r.status_code == 400 and r.json()["detail"] == {"code": "wrong_code", "message": "Wrong code", "attempts_left": 4}, r.text
    assert c.post("/api/auth/verify", json={"email": "ali@test.uz", "code": "12ab56"}).status_code == 422           # not 6 digits
    # resend: after the pause a NEW code arrives and the attempts start from zero
    rewind("ali@test.uz", 61)
    fresh(); r = c.post("/api/auth/resend", json={"email": "ali@test.uz", "lang": "en"}); assert r.status_code == 200, r.text
    assert len(sent) == 2 and sent[1]["lang"] == "en" and db.verification_get("ali@test.uz")["attempts"] == 0
    code = sent[1]["code"]
    # correct code -> account + token, pending row gone
    fresh(); r = v(code); j = r.json()
    assert r.status_code == 200 and j["token"] and j["user"]["email"] == "ali@test.uz" and j["user"]["name"] == "Ali" and j["user"]["tokens_remaining"] == 50, j
    assert db.verification_get("ali@test.uz") is None
    assert c.post("/api/auth/login", json={"email": "ali@test.uz", "password": "secret1"}).status_code == 200      # the password chosen at sign-up works
    assert c.get("/api/me", headers={"Authorization": "Bearer " + j["token"]}).status_code == 200
    fresh(); assert v(code).status_code == 410                                                                      # a code works only once
    assert reg(c, "ali@test.uz").status_code == 409                                                                 # already registered
    print("otp: happy path / no account before code / cooldown / resend / one-time: OK")

    # brute force: 5 wrong guesses burn the code (even the right one fails afterwards)
    reg(c, "bob@test.uz", "Bob"); good = sent[-1]["code"]; bad = "000000" if good != "000000" else "111111"
    for i in range(4):
        fresh(); r = v(bad, "bob@test.uz"); assert r.status_code == 400 and r.json()["detail"]["attempts_left"] == 4 - i
    fresh(); r = v(bad, "bob@test.uz"); assert r.status_code == 429 and r.json()["detail"]["code"] == "too_many_attempts"
    fresh(); assert v(good, "bob@test.uz").status_code == 410 and db.user_by_email("bob@test.uz") is None
    # expiry
    reg(c, "cem@test.uz", "Cem"); good = sent[-1]["code"]; rewind("cem@test.uz", 601)
    fresh(); r = v(good, "cem@test.uz"); assert r.status_code == 410 and r.json()["detail"]["code"] == "code_expired" and db.user_by_email("cem@test.uz") is None
    fresh(); assert v("123456", "nobody@test.uz").status_code == 410
    # a newer registration for the same address replaces the older code
    reg(c, "dil@test.uz", "Dil"); old = sent[-1]["code"]; rewind("dil@test.uz", 61); reg(c, "dil@test.uz", "Dilya", "otherpw1"); new = sent[-1]["code"]
    if new != old: fresh(); assert v(old, "dil@test.uz").status_code == 400
    fresh(); r = v(new, "dil@test.uz"); assert r.status_code == 200 and r.json()["user"]["name"] == "Dilya"
    assert c.post("/api/auth/login", json={"email": "dil@test.uz", "password": "otherpw1"}).status_code == 200
    # the mail rate limit: at most 5 mails / 10 minutes / IP
    security._hits.clear(); codes = []
    for i in range(7): codes.append(c.post("/api/auth/register", json={"name": "X", "email": f"u{i}@test.uz", "password": "secret1"}).status_code)
    assert codes[:5] == [200] * 5 and codes[5] == 429, codes
    print("otp: brute force burn / expiry / replace / mail flood limit: OK")

    # ---- mail problems never leave a locked-out user behind ----
    fresh()
    async def failing(*a, **k): raise MailFailed()
    from mailer import MailFailed, MailNotConfigured
    main.send_code = failing
    r = reg(c, "fail@test.uz"); assert r.status_code == 502 and r.json()["detail"]["code"] == "mail_failed" and db.verification_get("fail@test.uz") is None
    main.send_code = mailer.send_code                      # the real one: nothing configured
    assert mailer.mode() == "none"
    r = reg(c, "none@test.uz"); assert r.status_code == 503 and r.json()["detail"]["code"] == "mail_not_configured" and db.verification_get("none@test.uz") is None
    r = reg(c, "none@test.uz"); assert r.status_code == 503      # no cooldown trap after a failed mail
    print("otp: mail failure / not configured handled: OK")

    # ---- verification switched off = old behaviour ----
    config.REQUIRE_EMAIL_VERIFICATION = False
    r = reg(c, "direct@test.uz"); assert r.status_code == 200 and r.json()["token"] and db.user_by_email("direct@test.uz")
    config.REQUIRE_EMAIL_VERIFICATION = True

# ======================= 4) real mailer transports (HTTP mocked) =======================
import httpx
subject, text, page = mailer.render("<b>Ali</b>", "123456", "uz")
assert "123456" in subject and "123456" in text and "&lt;b&gt;" in page and "<b>Ali" not in page, "name must be HTML-escaped"
captured = {}
async def fake_post(self, url, headers=None, json=None, **kw):
    captured.update(url=url, headers=headers, json=json); return httpx.Response(201, json={"messageId": "x"}, request=httpx.Request("POST", url))
httpx.AsyncClient.post = fake_post
config.BREVO_API_KEY, config.MAIL_FROM = "brevo-key", "noreply@test.uz"
assert mailer.mode() == "brevo"
asyncio.run(mailer.send_code("to@test.uz", "Ali", "654321", "en"))
assert captured["url"].endswith("/v3/smtp/email") and captured["headers"]["api-key"] == "brevo-key"
assert captured["json"]["to"][0]["email"] == "to@test.uz" and "654321" in captured["json"]["htmlContent"] and captured["json"]["sender"]["email"] == "noreply@test.uz"
async def fake_403(self, url, **kw): return httpx.Response(401, text="unauthorized", request=httpx.Request("POST", url))
httpx.AsyncClient.post = fake_403
try: asyncio.run(mailer.send_code("to@test.uz", "Ali", "654321", "en")); raise SystemExit("expected MailFailed")
except mailer.MailFailed: pass
config.BREVO_API_KEY = ""; config.EMAIL_DEV_LOG = True; assert mailer.mode() == "log"; asyncio.run(mailer.send_code("to@test.uz", "Ali", "1", "uz"))
print("mailer: Brevo request shape / error handling / dev log OK")
print("TTS + OTP TESTS PASSED on", db.BACKEND)
