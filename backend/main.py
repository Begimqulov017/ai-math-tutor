"""AI Math Tutor API."""
import json
import logging
import re
import time
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import config
import db
from llm import balancer, gemini, parse_json
from prompts import DEMO, LANGS, SCHEMA
from security import (client_ip, hash_password, ip_bucket, ip_hash, is_loopback, make_token, optional_user_id, rate_limit,
                      required_user_id, verify_password)

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


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    email: str = Field(max_length=120)
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: str = Field(max_length=120)
    password: str = Field(max_length=128)


# ---------------- helpers ----------------
def clean_analysis(d) -> dict:
    """Make the model's JSON safe for the UI; charts only for real geometry."""
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
    d.pop("graph", None)
    return d


def public_view(d: dict) -> dict:
    """What the browser may see: practice answers stay on the server (XP can't be faked)."""
    out = dict(d)
    out["practice"] = {lv: [{k: v for k, v in it.items() if k != "answer"} for it in items] for lv, items in d["practice"].items()}
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
@app.post("/api/auth/register")
def register(b: RegisterIn, request: Request):
    rate_limit(request, "auth", 10)
    email = b.email.strip().lower()
    if not EMAIL_RE.fullmatch(email):
        raise HTTPException(400, "Invalid email")
    try:
        uid = db.create_user(email, b.name.strip(), hash_password(b.password))
    except db.EmailTaken:
        raise HTTPException(409, "This email is already registered")
    return {"token": make_token(uid), "user": db.get_user(uid)}


@app.post("/api/auth/login")
def login(b: LoginIn, request: Request):
    rate_limit(request, "auth", 10)
    row = db.user_by_email(b.email.strip().lower())
    if not row or not verify_password(b.password, row["pw_hash"]):
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
async def analyze(body: AnalyzeIn, request: Request, uid: int | None = Depends(optional_user_id)):
    if not body.text.strip() and not body.image_base64:
        raise HTTPException(400, "Provide text or an image")
    rate_limit(request, "llm", 20)
    guest = None
    if not balancer.total:
        key, data, cached = "demo", DEMO, True
    else:
        key = db.cache_key(body.text, body.lang, body.image_base64)
        ipk, newly = None, False
        ip = client_ip(request)
        if uid is None and config.GUEST_PROBLEM_LIMIT > 0 and not is_loopback(ip):
            # strict limit: a guest may open at most N different problems per IP (the same problem again is free)
            ipk = ip_hash(ip)
            allowed, newly, used = db.guest_reserve(ipk, key, config.GUEST_PROBLEM_LIMIT, config.GUEST_WINDOW_HOURS)
            if not allowed:
                raise HTTPException(403, "guest_limit")
            guest = {"used": used, "limit": config.GUEST_PROBLEM_LIMIT}
        try:
            data = db.cache_get(key)  # cache hit: no AI call at all
            cached = data is not None
            if data is None:
                system = f"You are an expert math tutor. Write all explanations in {LANGS[body.lang]}. " + SCHEMA
                parts = []
                if body.image_base64:
                    parts.append({"inline_data": {"mime_type": body.image_mime, "data": body.image_base64}})
                parts.append({"text": body.text or "Solve the problem shown in the image."})
                data = clean_analysis(parse_json(await gemini(parts, system, as_json=True)))
                db.cache_put(key, body.lang, data)
        except BaseException:
            if ipk and newly:  # the AI failed: an error must not cost the guest a problem
                db.guest_release(ipk, key)
            raise
    out = {**public_view(data), "key": key, "cached": cached}
    if guest:
        out["guest"] = guest
    if key == "demo":
        out["demo"] = True
    elif uid:
        gained, user = db.record_activity(uid, award_key=f"a:{key}", xp=XP_ANALYZE, problem=True)
        out["progress"] = {"xp_gained": gained, "user": user}
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
    system = (f"You are a patient math tutor. Answer in {LANGS[body.lang]}, briefly, inline math in $...$. "
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
