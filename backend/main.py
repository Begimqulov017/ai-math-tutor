"""AI Math Tutor API."""
import asyncio
import hmac
import json
import logging
import math
import re
import secrets
import time
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, field_validator

import config
import db
from llm import balancer, gemini, lane, model_for, parse_json
from mailer import MailFailed, MailNotConfigured, send_code
from prompts import ADVANCED, DEMO, LANGS, SCHEMA
from speech import _clip, math_to_spoken_text, synthesize
from security import (client_ip, hash_password, ip_bucket, ip_hash, is_loopback, make_admin_token, make_token, optional_user,
                      optional_user_id, rate_limit, require_admin, required_user_id, verify_password)

log = logging.getLogger("mathtutor")
Lang = Literal["uz", "ru", "en"]
XP_ANALYZE = 10
XP_PRACTICE = {"easy": 15, "medium": 30, "hard": 50}
EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    if not balancer.total:
        log.warning("No GEMINI_API_KEY_1..8 set: running in DEMO mode")
        db.cache_put("demo", "en", DEMO)
    yield


app = FastAPI(title="AI Math Tutor API", lifespan=lifespan)


@app.middleware("http")
async def catch_unhandled_errors(request: Request, call_next):
    """An unhandled exception (e.g. the database is unreachable) would otherwise bypass CORSMiddleware and the browser
    would only show "Network error". Registered BEFORE CORSMiddleware so CORS wraps the JSON error answer."""
    try:
        return await call_next(request)
    except Exception:
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse({"detail": "Server error, please try again in a moment"}, status_code=500)


# CORS is open to every origin (login uses a Bearer token, not cookies, so credentials stay off)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------- models ----------------
class AnalyzeIn(BaseModel):
    text: str = Field("", max_length=2000)
    image_base64: str | None = Field(None, max_length=7_000_000)
    image_mime: str = Field("image/png", max_length=40)
    lang: Lang = "uz"


class PracticeIn(BaseModel):
    key: str = Field(max_length=100)
    level: Literal["easy", "medium", "hard"]
    index: int = Field(0, ge=0, le=50)
    answer: str = Field(max_length=200)
    lang: Lang = "uz"


class ChatIn(BaseModel):
    message: str = Field(max_length=1500)
    lang: Lang = "uz"
    history: list[dict] = Field(default_factory=list, max_length=40)
    context: dict = Field(default_factory=dict)


class SolIn(BaseModel):
    problem: str = Field(max_length=2000)
    image_base64: str = Field(max_length=7_000_000)
    image_mime: str = Field("image/png", max_length=40)
    lang: Lang = "uz"


class ThreadIn(BaseModel):
    title: str = Field("", max_length=200)
    problem_key: str | None = Field(None, max_length=64)


class MsgIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    lang: Lang = "uz"
    context: dict = Field(default_factory=dict)  # what the student is looking at right now (current step), not stored


class AdminLoginIn(BaseModel):
    password: str = Field(max_length=64)


class GrantIn(BaseModel):
    amount: int = Field(ge=-100_000, le=100_000)  # positive = add tokens, negative = subtract

    @field_validator("amount")
    @classmethod
    def _not_zero(cls, v: int) -> int:
        if v == 0:
            raise ValueError("amount must not be 0")
        return v


class PlanIn(BaseModel):
    plan: Literal["free", "premium", "vip"]
    days: int = Field(30, ge=0, le=3650)  # 0 = no end date


class ForgotIn(BaseModel):
    email: str = Field(max_length=120)
    lang: Lang = "uz"


class ResetIn(BaseModel):
    email: str = Field(max_length=120)
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    password: str = Field(min_length=6, max_length=128)
    password_confirm: str | None = Field(None, max_length=128)


class FriendReqIn(BaseModel):
    username: str = Field(min_length=1, max_length=30)


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    email: str = Field(max_length=120)
    password: str = Field(min_length=6, max_length=128)
    password_confirm: str | None = Field(None, max_length=128)  # the UI always sends it; checked here as well
    username: str | None = Field(None, max_length=30)           # public handle; generated from the e-mail when omitted
    lang: Lang = "uz"  # language of the verification e-mail


class VerifyIn(BaseModel):
    email: str = Field(max_length=120)
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class ResendIn(BaseModel):
    email: str = Field(max_length=120)
    lang: Lang = "uz"


class TtsIn(BaseModel):
    text: str = Field(min_length=1, max_length=1500)
    lang: Lang = "uz"


class LoginIn(BaseModel):
    email: str = Field(max_length=120)
    password: str = Field(max_length=128)


# ---------------- helpers ----------------
def _clean_graph(g):
    """A function graph the browser can draw safely (the expression is whitelisted again in the browser)."""
    if not isinstance(g, dict) or not isinstance(g.get("functions"), list):
        return None
    fns = [{"expr": str(f.get("expr", ""))[:200], "label": str(f.get("label", ""))[:80]}
           for f in g["functions"][:3] if isinstance(f, dict) and f.get("expr")]
    try:
        x0, x1 = float(g.get("xmin", -5)), float(g.get("xmax", 5))
    except (TypeError, ValueError):
        return None
    if not fns or not x1 > x0:
        return None
    pts = [{"x": p["x"], "y": p["y"], "label": str(p.get("label", ""))[:20]} for p in (g.get("points") or [])[:8]
           if isinstance(p, dict) and isinstance(p.get("x"), (int, float)) and isinstance(p.get("y"), (int, float))]
    return {"functions": fns, "xmin": x0, "xmax": x1, "points": pts}


def clean_analysis(d, advanced: bool = False) -> dict:
    """Make the model's JSON safe for the UI. Diagrams only for geometry; function graphs only for paying users."""
    if not isinstance(d, dict) or not isinstance(d.get("steps"), list) or not d["steps"]:
        raise HTTPException(502, "AI returned an incomplete solution, please try again")
    geo = d.get("geometry_svg_or_coords")
    is_geo = bool(d.get("is_geometry")) and isinstance(geo, dict) and bool(geo.get("points"))
    d["is_geometry"], d["geometry_svg_or_coords"] = is_geo, (geo if is_geo else None)
    for k in ("prerequisites", "variations"):
        d[k] = d[k] if isinstance(d.get(k), list) else []
    pr = d.get("practice") if isinstance(d.get("practice"), dict) else {}
    d["practice"] = {lv: [x for x in pr.get(lv, []) if isinstance(x, dict)] if isinstance(pr.get(lv), list) else [] for lv in XP_PRACTICE}
    d.pop("diagram", None)
    raw_graph = d.pop("graph", None)  # always removed, then kept only for paying users
    graph = _clean_graph(raw_graph) if advanced else None
    if graph:
        d["graph"] = graph
    return d


def public_view(d: dict) -> dict:
    """What the browser may see: practice answers stay on the server (XP can't be faked)."""
    out = dict(d)
    out["practice"] = {lv: [{k: v for k, v in it.items() if k != "answer"} for it in items] for lv, items in d["practice"].items()}
    return out


def plain_title(d: dict) -> str:
    return re.sub(r"\s+", " ", str(d.get("problem", ""))).strip()[:120] or "Chat"


def topic_summary(d: dict) -> str:
    """The thread's permanent memory: the problem, its topic and the solution outline."""
    t = d.get("topic") or {}
    steps = "; ".join(str(x.get("latex", "")) for x in d.get("steps", [])[:8])
    return (f"Problem: {d.get('problem', '')}\nTopic: {t.get('area', '')} / {t.get('topic', '')} / {t.get('method', '')}\n"
            f"Core idea: {d.get('concept', '')}\nSolution steps (LaTeX): {steps}")[:3500]


def history_to_contents(msgs: list) -> list:
    """Stored messages -> Gemini turns (user/model alternate, first turn is the user's)."""
    out: list = []
    for m in msgs:
        role = "user" if m["role"] == "user" else "model"
        if out and out[-1]["role"] == role:
            out[-1]["parts"][0]["text"] += "\n" + m["content"]
        else:
            out.append({"role": role, "parts": [{"text": m["content"]}]})
    while out and out[0]["role"] != "user":
        out.pop(0)
    return out


def norm_answer(s: str) -> str:
    return ",".join(sorted(x for x in re.split(r"[,;]", re.sub(r"\s+", "", str(s).lower())) if x))


# ---------------- health / diagnostics ----------------
@app.get("/api/health")
def health():
    # no DB query on purpose: uptime pings must not keep a free Neon database awake
    return {"status": "ok", "active_keys": balancer.active(), "db": db.BACKEND}


@app.get("/api/health/db")
def health_db():
    t0 = time.time()
    try:
        db.ping()
    except Exception as e:
        log.warning("db health check failed: %s", e.__class__.__name__)
        return JSONResponse({"status": "down", "db": db.BACKEND}, status_code=503)
    return {"status": "ok", "db": db.BACKEND, "ms": round((time.time() - t0) * 1000)}


@app.get("/api/ip-check")
def ip_check(request: Request):
    """Shows which IP the server sees for YOU - use it to verify CLIENT_IP_HEADER / TRUSTED_PROXY_HOPS."""
    ip = client_ip(request)
    return {"ip": ip, "counted_as": ip_bucket(ip), "x_forwarded_for": request.headers.get("x-forwarded-for"),
            "header_used": config.CLIENT_IP_HEADER or None, "hops": config.TRUSTED_PROXY_HOPS,
            "limit_applies": config.GUEST_PROBLEM_LIMIT > 0 and not is_loopback(ip)}


@app.get("/api/guest-status")
def guest_status(request: Request, uid: int | None = Depends(optional_user_id)):
    ip = client_ip(request)
    if uid or config.GUEST_PROBLEM_LIMIT <= 0 or is_loopback(ip):
        return {"used": 0, "limit": 0}
    return {"used": db.guest_used(ip_hash(ip), config.GUEST_WINDOW_HOURS), "limit": config.GUEST_PROBLEM_LIMIT}


# ---------------- auth ----------------
def _otp() -> str:
    return f"{secrets.randbelow(10 ** 6):06d}"


def _wait_left(pending: dict) -> int:
    """Seconds until another e-mail may be sent to this address (the send time = expiry - TTL)."""
    sent_at = pending["expires_at"] - config.OTP_TTL_SECONDS
    return max(0, math.ceil(config.OTP_RESEND_SECONDS - (time.time() - sent_at)))


def _check_otp(pending: dict | None, given: str, bump, drop) -> None:
    """Shared by sign-up and password reset: expiry, 5 guesses at most, constant-time comparison."""
    if not pending or time.time() > pending["expires_at"]:
        drop()
        raise HTTPException(410, {"code": "code_expired", "message": "The code has expired, please request a new one"})
    if pending["attempts"] >= config.OTP_MAX_ATTEMPTS:
        drop()
        raise HTTPException(429, {"code": "too_many_attempts", "message": "Too many wrong codes, please start again"})
    if not hmac.compare_digest(pending["code"].encode(), given.encode()):
        left = config.OTP_MAX_ATTEMPTS - bump()
        if left <= 0:
            drop()  # the code is burned: a brute-force run gets at most OTP_MAX_ATTEMPTS guesses
            raise HTTPException(429, {"code": "too_many_attempts", "message": "Too many wrong codes, please start again"})
        raise HTTPException(400, {"code": "wrong_code", "message": "Wrong code", "attempts_left": left})


async def _mail_the_code(email: str, name: str, code: str, lang: str, drop, kind: str = "verify") -> None:
    try:
        await send_code(email, name, code, lang, kind)
    except MailNotConfigured:
        drop()
        raise HTTPException(503, {"code": "mail_not_configured", "message": "E-mail sending is not configured on the server"})
    except MailFailed:
        drop()  # do not lock the user out with a cooldown for a mail that never left
        raise HTTPException(502, {"code": "mail_failed", "message": "The e-mail could not be sent, please try again"})


def _same_password(password: str, confirm: str | None) -> None:
    if confirm is not None and confirm != password:
        raise HTTPException(400, {"code": "password_mismatch", "message": "The two passwords are not the same"})


@app.get("/api/auth/username-available")
def username_available(u: str, request: Request):
    rate_limit(request, "uname", 40)
    name = u.strip().lower().lstrip("@")
    if not db.valid_username(name):
        return {"valid": False, "available": False}
    return {"valid": True, "available": not db.username_taken(name)}


@app.post("/api/auth/register")
async def register(b: RegisterIn, request: Request):
    """Step 1: validate, store the pending registration and e-mail a 6-digit code. The account is created in /verify."""
    rate_limit(request, "auth", 10)
    email = b.email.strip().lower()
    if not EMAIL_RE.fullmatch(email):
        raise HTTPException(400, "Invalid email")
    _same_password(b.password, b.password_confirm)
    username = (b.username or "").strip().lower().lstrip("@")
    if username:
        if not db.valid_username(username):
            raise HTTPException(400, {"code": "bad_username", "message": "Username: 3-20 letters, digits or _"})
        if db.username_taken(username):
            raise HTTPException(409, {"code": "username_taken", "message": "This username is taken"})
    else:
        username = db.free_username(email.split("@")[0], db.username_taken)
    if db.user_by_email(email):
        raise HTTPException(409, {"code": "email_taken", "message": "This email is already registered"})
    pw_hash = await asyncio.to_thread(hash_password, b.password)  # bcrypt is slow on purpose: keep it off the event loop
    name = b.name.strip()
    if not config.REQUIRE_EMAIL_VERIFICATION:  # switched off (e.g. local development): register at once
        try:
            uid = db.create_user(email, name, pw_hash, username)
        except db.EmailTaken:
            raise HTTPException(409, {"code": "email_taken", "message": "This email is already registered"})
        except db.UsernameTaken:
            raise HTTPException(409, {"code": "username_taken", "message": "This username is taken"})
        return {"token": make_token(uid), "user": db.get_user(uid)}
    rate_limit(request, "regmail", 5, 600)  # nobody can use us to flood mailboxes
    pending = db.verification_get(email)
    if pending and _wait_left(pending) > 0:
        raise HTTPException(429, {"code": "resend_wait", "message": "Please wait before requesting a new code", "retry_after": _wait_left(pending)})
    code = _otp()
    db.verification_put(email, name, pw_hash, code, time.time() + config.OTP_TTL_SECONDS, username)
    await _mail_the_code(email, name, code, b.lang, lambda: db.verification_delete(email))
    return {"status": "verification_sent", "email": email, "expires_in": config.OTP_TTL_SECONDS, "resend_after": config.OTP_RESEND_SECONDS}


@app.post("/api/auth/verify")
def verify_email(b: VerifyIn, request: Request):
    """Step 2: the right code creates the account and logs the user in."""
    rate_limit(request, "verify", 15)
    email = b.email.strip().lower()
    pending = db.verification_get(email)
    _check_otp(pending, b.code, lambda: db.verification_bump(email), lambda: db.verification_delete(email))
    try:
        uid = db.create_user(email, pending["name"], pending["pw_hash"], pending.get("username"))
    except db.EmailTaken:
        db.verification_delete(email)
        raise HTTPException(409, {"code": "email_taken", "message": "This email is already registered"})
    except db.UsernameTaken:
        raise HTTPException(409, {"code": "username_taken", "message": "This username was taken meanwhile, please register again"})
    db.verification_delete(email)
    return {"token": make_token(uid), "user": db.get_user(uid)}


@app.post("/api/auth/resend")
async def resend_code(b: ResendIn, request: Request):
    rate_limit(request, "regmail", 5, 600)
    email = b.email.strip().lower()
    pending = db.verification_get(email)
    if not pending:
        raise HTTPException(410, {"code": "code_expired", "message": "Please register again"})
    if _wait_left(pending) > 0:
        raise HTTPException(429, {"code": "resend_wait", "message": "Please wait before requesting a new code", "retry_after": _wait_left(pending)})
    code = _otp()
    db.verification_put(email, pending["name"], pending["pw_hash"], code, time.time() + config.OTP_TTL_SECONDS, pending.get("username"))  # new code, attempts reset
    await _mail_the_code(email, pending["name"], code, b.lang, lambda: db.verification_delete(email))
    return {"status": "verification_sent", "email": email, "expires_in": config.OTP_TTL_SECONDS, "resend_after": config.OTP_RESEND_SECONDS}


@app.post("/api/auth/forgot")
async def forgot_password(b: ForgotIn, request: Request):
    """Forgot password, step 1: e-mail a 6-digit code. The answer is the same whether or not the address has an account."""
    rate_limit(request, "regmail", 5, 600)
    email = b.email.strip().lower()
    answer = {"status": "reset_sent", "resend_after": config.OTP_RESEND_SECONDS, "expires_in": config.OTP_TTL_SECONDS}
    user = db.user_by_email(email) if EMAIL_RE.fullmatch(email) else None
    if user is None:
        return answer
    pending = db.reset_get(email)
    if pending and _wait_left(pending) > 0:
        return answer
    code = _otp()
    db.reset_put(email, code, time.time() + config.OTP_TTL_SECONDS)
    await _mail_the_code(email, user["name"], code, b.lang, lambda: db.reset_delete(email), kind="reset")
    return answer


@app.post("/api/auth/reset")
async def reset_password(b: ResetIn, request: Request):
    """Forgot password, step 2: the code + a new password. All earlier sessions are signed out."""
    rate_limit(request, "verify", 15)
    email = b.email.strip().lower()
    _same_password(b.password, b.password_confirm)
    pending, user = db.reset_get(email), db.user_by_email(email)
    _check_otp(pending if user else None, b.code, lambda: db.reset_bump(email), lambda: db.reset_delete(email))
    pw_hash = await asyncio.to_thread(hash_password, b.password)
    db.set_password(user["id"], pw_hash)
    db.reset_delete(email)
    return {"status": "password_changed"}


# ---------------- neural voice ----------------
@app.post("/api/tts")
async def tts(b: TtsIn, request: Request):
    """Text (with LaTeX) -> spoken words -> MP3 in a neural voice (uz / ru / en)."""
    rate_limit(request, "tts", 30)
    spoken = _clip(math_to_spoken_text(b.text, b.lang), 900)
    if not spoken:
        raise HTTPException(400, "Nothing to read")
    audio = await synthesize(spoken, b.lang)
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=86400"})


@app.post("/api/auth/login")
async def login(b: LoginIn, request: Request):
    rate_limit(request, "auth", 10)
    row = db.user_by_email(b.email.strip().lower())
    if not row or not await asyncio.to_thread(verify_password, b.password, row["pw_hash"]):
        raise HTTPException(401, "Wrong email or password")
    return {"token": make_token(row["id"]), "user": db.get_user(row["id"])}


@app.get("/api/me")
def me(uid: int = Depends(required_user_id)):
    return {"user": db.get_user(uid)}


@app.get("/api/sync")
def sync_get(uid: int = Depends(required_user_id)):
    return db.get_blob(uid)


@app.put("/api/sync")
def sync_put(body: dict, uid: int = Depends(required_user_id)):
    clean = {"history": list(body.get("history") or [])[:50], "mistakes": list(body.get("mistakes") or [])[:200]}
    raw = json.dumps(clean, ensure_ascii=False)
    if len(raw) > 2_000_000:
        raise HTTPException(413, "Data too large")
    db.set_blob(uid, raw)
    return {"ok": True}


# ---------------- tutor ----------------
@app.post("/api/analyze-problem")
async def analyze(body: AnalyzeIn, request: Request, user: dict | None = Depends(optional_user)):
    if not body.text.strip() and not body.image_base64:
        raise HTTPException(400, "Provide text or an image")
    rate_limit(request, "llm", 20)
    uid = user["id"] if user else None
    plan = user["plan"] if user else "free"
    advanced = plan in config.PAID_PLANS  # Premium / VIP: function graphs + richer geometry, own AI lane, stronger model
    guest = None
    if not balancer.total:
        key, data, cached = "demo", DEMO, True
    else:
        key = db.cache_key(body.text, body.lang, body.image_base64, advanced)
        ipk, newly, charged = None, False, False
        ip = client_ip(request)
        if uid is None and config.GUEST_PROBLEM_LIMIT > 0 and not is_loopback(ip):
            # strict limit: a guest may open at most N different problems per IP (the same problem again is free)
            ipk = ip_hash(ip)
            allowed, newly, used = db.guest_reserve(ipk, key, config.GUEST_PROBLEM_LIMIT, config.GUEST_WINDOW_HOURS)
            if not allowed:
                raise HTTPException(403, "guest_limit")
            guest = {"used": used, "limit": config.GUEST_PROBLEM_LIMIT}
        elif uid is not None:
            # daily tokens: 1 per problem (the same problem again on the same day is free)
            ok, _left, charged = db.charge_token(uid, key)
            if not ok:
                raise HTTPException(403, {"code": "tokens_exhausted",
                                          "message": "Daily tokens exhausted. They are renewed at midnight (Tashkent time)."})
        try:
            data = db.cache_get(key)  # cache hit: no AI call at all
            cached = data is not None
            if data is None:
                system = f"You are an expert math tutor. Write all explanations in {LANGS[body.lang]}. " + SCHEMA + (ADVANCED if advanced else "")
                parts = []
                if body.image_base64:
                    parts.append({"inline_data": {"mime_type": body.image_mime, "data": body.image_base64}})
                parts.append({"text": body.text or "Solve the problem shown in the image."})
                async with lane(plan):
                    raw = await gemini(parts, system, as_json=True, model=model_for(plan))
                data = clean_analysis(parse_json(raw), advanced)
                db.cache_put(key, body.lang, data)
        except BaseException:
            if ipk and newly:  # the AI failed: an error must not cost a guest problem or a token
                db.guest_release(ipk, key)
            if uid is not None and charged:
                db.refund_token(uid, key)
            raise
    out = {**public_view(data), "key": key, "cached": cached}
    if guest:
        out["guest"] = guest
    if key == "demo":
        out["demo"] = True
    elif uid is not None:
        gained, u2 = db.record_activity(uid, award_key=f"a:{key}", xp=XP_ANALYZE, problem=True)
        out["progress"] = {"xp_gained": gained, "user": u2}
        try:  # every solved problem gets its own chat thread (one per problem)
            out["thread_id"] = db.create_thread(uid, plain_title(data), topic_summary(data), key)["id"]
        except Exception:
            log.exception("could not create the chat thread")
    return out


@app.post("/api/practice/check")
async def practice_check(b: PracticeIn, request: Request, uid: int | None = Depends(optional_user_id)):
    rate_limit(request, "check", 40)
    data = db.cache_get(b.key, touch=False)
    items = ((data or {}).get("practice") or {}).get(b.level) or []
    if b.index >= len(items):
        raise HTTPException(410, "This problem has expired, please submit it again")
    expected = str(items[b.index].get("answer", ""))
    correct, feedback = norm_answer(b.answer) == norm_answer(expected), ""
    if not correct and balancer.total:  # the AI decides equivalence: 1/2 = 0.5, order of roots, ...
        system = ("You are a kind but exact math teacher. Write in " + LANGS[b.lang] + ". Decide if the student's answer is "
                  "mathematically equivalent to the expected answer (1/2 = 0.5, order of roots does not matter). Return ONLY JSON: "
                  '{"correct": true, "feedback": "1-2 sentences, inline math in $...$; if wrong give a nudge, never the full answer"}')
        try:
            raw = await gemini([{"text": f"Question: {items[b.index].get('q', '')}\nExpected: {expected}\nStudent: {b.answer}"}], system, True)
            res = parse_json(raw)
            correct, feedback = bool(res.get("correct")), str(res.get("feedback", ""))
        except HTTPException as e:
            log.warning("answer check fell back to plain compare: %s", e.detail)
    out = {"correct": correct, "feedback": feedback, "xp_gained": 0, "user": None}
    if uid and b.key != "demo":
        gained, user = db.record_activity(
            uid, award_key=f"p:{b.key}:{b.level}:{b.index}" if correct else None,
            xp=XP_PRACTICE[b.level] if correct else 0, ok=correct)
        out.update(xp_gained=gained, user=user)
    return out


@app.post("/api/chat")
async def chat(body: ChatIn, request: Request):
    rate_limit(request, "llm", 20)
    if not balancer.total:
        return {"reply": "Demo mode: add GEMINI_API_KEY_1 to backend/.env to chat with the tutor."}
    system = (f"You are a patient math tutor. Answer in {LANGS[body.lang]}, briefly and concisely (2-4 sentences max), inline math in $...$. "
              "Current context: " + json.dumps(body.context, ensure_ascii=False)[:4000])
    hist = "\n".join(f"{m.get('role')}: {str(m.get('text'))[:800]}" for m in body.history[-8:])
    return {"reply": await gemini([{"text": f"{hist}\nstudent: {body.message}"}], system, as_json=False)}


@app.post("/api/check-solution")
async def check_solution(body: SolIn, request: Request):
    rate_limit(request, "llm", 20)
    if not balancer.total:
        return {"verdict": "demo", "summary": "Demo mode: add GEMINI_API_KEY_1 to backend/.env.", "steps": []}
    system = ("You are a math teacher checking a student's handwritten solution shown in the image. Write in " + LANGS[body.lang]
              + ". Go line by line and find the first mistake. Return ONLY JSON: "
              '{"verdict": "correct|partly|wrong", "summary": "2-3 sentences, inline math in $...$", '
              '"steps": [{"line": "short transcription of the student line", "ok": true, "note": "why it is right/wrong"}]}')
    parts = [{"inline_data": {"mime_type": body.image_mime, "data": body.image_base64}}, {"text": "Problem: " + body.problem}]
    return parse_json(await gemini(parts, system, True))


# ---------------- admin panel ----------------
@app.post("/api/admin/login")
def admin_login(b: AdminLoginIn, request: Request):
    rate_limit(request, "admin", 5, 600)  # brute force protection: 5 attempts / 10 minutes / IP
    if not config.ADMIN_PASSWORD:
        raise HTTPException(503, "The admin panel is disabled (ADMIN_PASSWORD is not set on the server)")
    good = re.fullmatch(r"\d{16}", b.password) is not None and hmac.compare_digest(b.password.encode(), config.ADMIN_PASSWORD.encode())
    if not good:
        log.warning("failed admin login from %s", ip_bucket(client_ip(request)))
        raise HTTPException(401, "Wrong password")
    return {"token": make_admin_token(), "expires_hours": config.ADMIN_TOKEN_HOURS}


@app.get("/api/admin/stats", dependencies=[Depends(require_admin)])
def admin_stats():
    return db.admin_stats()


@app.get("/api/admin/users", dependencies=[Depends(require_admin)])
def admin_users(q: str = "", limit: int = 50, offset: int = 0):
    """Search by username / nickname, name or e-mail."""
    return db.admin_list_users(q[:100], max(1, min(limit, 200)), max(0, offset))


@app.post("/api/admin/users/{user_id}/tokens", dependencies=[Depends(require_admin)])
def admin_tokens(user_id: int, b: GrantIn):
    """amount > 0 adds tokens, amount < 0 subtracts them (never below 0)."""
    user = db.admin_adjust_tokens(user_id, b.amount)
    if not user:
        raise HTTPException(404, "User not found")
    log.info("admin changed tokens of user %d by %+d", user_id, b.amount)
    return {"user": user}


@app.post("/api/admin/users/{user_id}/plan", dependencies=[Depends(require_admin)])
def admin_plan(user_id: int, b: PlanIn):
    """Activate / renew / cancel a subscription (paid manually via Telegram)."""
    user = db.admin_set_plan(user_id, b.plan, b.days)
    if not user:
        raise HTTPException(404, "User not found")
    log.info("admin set plan %s (%d days) for user %d", b.plan, b.days, user_id)
    return {"user": user}


# ---------------- chat threads (persistent, one memory per thread) ----------------
@app.get("/api/chat/threads")
def threads_list(uid: int = Depends(required_user_id)):
    return {"threads": db.list_threads(uid)}


@app.post("/api/chat/threads")
def threads_create(b: ThreadIn, uid: int = Depends(required_user_id)):
    title, summary = b.title.strip(), ""
    if b.problem_key:
        data = db.cache_get(b.problem_key, touch=False)
        if data:
            title, summary = plain_title(data), topic_summary(data)
    return {"thread": db.create_thread(uid, title, summary, b.problem_key)}


@app.get("/api/chat/threads/{tid}/messages")
def thread_messages(tid: int, uid: int = Depends(required_user_id)):
    th = db.get_thread(uid, tid)
    if not th:
        raise HTTPException(404, "Chat not found")
    return {"thread": {k: th[k] for k in ("id", "title", "problem_key", "created_at", "updated_at")}, "messages": db.list_messages(tid)}


@app.delete("/api/chat/threads/{tid}")
def thread_delete(tid: int, uid: int = Depends(required_user_id)):
    if not db.delete_thread(uid, tid):
        raise HTTPException(404, "Chat not found")
    return {"ok": True}


@app.post("/api/chat/threads/{tid}/messages")
async def thread_send(tid: int, b: MsgIn, request: Request, uid: int = Depends(required_user_id)):
    rate_limit(request, "llm", 20)
    th = db.get_thread(uid, tid)
    if not th:
        raise HTTPException(404, "Chat not found")
    if balancer.total:
        # every 3rd message (counted over all threads) costs 1 token; with no tokens left that message is refused
        allowed, charged = db.charge_chat_message(uid)
        if not allowed:
            raise HTTPException(403, {"code": "tokens_exhausted",
                                      "message": "Daily tokens exhausted. They are renewed at midnight (Tashkent time)."})
        try:
            plan = (db.get_user(uid) or {}).get("plan", "free")
            memory = th["topic_summary"] or "A free math conversation (no particular problem yet)."
            system = (f"You are a patient math tutor. Answer in {LANGS[b.lang]}, briefly and clearly (2-4 sentences max), inline math in $...$. "
                      "This conversation belongs to one topic; remember it and everything said earlier in it.\n"
                      f"Topic of this conversation:\n{memory}")
            ctx = json.dumps(b.context, ensure_ascii=False)[:1500] if b.context else ""
            text = b.content + (f"\n\n[What the student is looking at right now: {ctx}]" if ctx else "")
            history = history_to_contents(db.list_messages(tid, last=20))
            async with lane(plan):
                reply = await gemini([{"text": text}], system, as_json=False, history=history, model=model_for(plan))
        except BaseException:
            db.refund_chat_message(uid, charged)  # the AI failed: the message does not count
            raise
    else:
        reply = "Demo mode: add GEMINI_API_KEY_1 to backend/.env to chat with the tutor."
    saved = db.add_messages(tid, [("user", b.content), ("assistant", reply.strip() or "…")])  # saved only after a successful answer
    if th["title"] == "New chat" and not th["problem_key"]:  # a free chat is named after its first question
        db.rename_thread(tid, re.sub(r"\s+", " ", b.content).strip()[:60])
    return {"reply": saved[1], "message": saved[0], "user": db.get_user(uid)}


# ---------------- friends / leaderboard / milestones ----------------
_FRIEND_HTTP = {"user_not_found": 404, "self": 400, "already_friends": 409, "already_requested": 409, "not_found": 404}


def _friend_error(e: db.FriendError) -> HTTPException:
    return HTTPException(_FRIEND_HTTP.get(e.code, 400), {"code": e.code, "message": e.code.replace("_", " ")})


@app.get("/api/friends")
def friends_list(uid: int = Depends(required_user_id)):
    return db.friends_overview(uid)


@app.post("/api/friends/request")
def friends_request(b: FriendReqIn, request: Request, uid: int = Depends(required_user_id)):
    rate_limit(request, "friend", 20)
    try:
        return {"status": db.friend_request(uid, b.username.strip().lower().lstrip("@"))}
    except db.FriendError as e:
        raise _friend_error(e)


@app.post("/api/friends/{fid}/accept")
def friends_accept(fid: int, uid: int = Depends(required_user_id)):
    try:
        db.friend_accept(uid, fid)
    except db.FriendError as e:
        raise _friend_error(e)
    return {"ok": True}


@app.delete("/api/friends/{fid}")
def friends_remove(fid: int, uid: int = Depends(required_user_id)):
    if not db.friend_remove(uid, fid):
        raise HTTPException(404, {"code": "not_found", "message": "not found"})
    return {"ok": True}


@app.get("/api/leaderboard")
def leaderboard(by: Literal["xp", "streak"] = "xp", uid: int = Depends(required_user_id)):
    """Ranking of me and my friends (no global list: nobody is shown to strangers)."""
    return {"by": by, "rows": db.leaderboard(uid, by)}


@app.get("/api/feed")
def milestones_feed(uid: int = Depends(required_user_id)):
    return {"items": db.feed(uid)}
