"""Password hashing (bcrypt), JWT, auth dependencies and a small in-memory rate limiter."""
import time
from collections import defaultdict, deque

import bcrypt
import jwt
from fastapi import Header, HTTPException, Request

import config
import db


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode()[:72], bcrypt.gensalt()).decode()  # bcrypt only reads 72 bytes


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode()[:72], hashed.encode())
    except ValueError:
        return False


def make_token(uid: int) -> str:
    return jwt.encode({"sub": str(uid), "exp": int(time.time()) + config.JWT_DAYS * 86400}, config.JWT_SECRET, algorithm="HS256")


def _uid(authorization: str | None) -> int | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        return int(jwt.decode(authorization[7:].strip(), config.JWT_SECRET, algorithms=["HS256"])["sub"])
    except (jwt.PyJWTError, ValueError, KeyError):
        return None


def optional_user_id(authorization: str | None = Header(None)) -> int | None:
    """Guest mode: no/invalid token simply means 'guest'."""
    uid = _uid(authorization)
    return uid if uid is not None and db.get_user(uid) else None


def required_user_id(authorization: str | None = Header(None)) -> int:
    uid = optional_user_id(authorization)
    if uid is None:
        raise HTTPException(401, "Not logged in")
    return uid


_hits: dict = defaultdict(deque)


def rate_limit(request: Request, bucket: str, limit: int, window: int = 60) -> None:
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "?")
    q, now = _hits[(bucket, ip)], time.time()
    while q and q[0] < now - window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Too many requests, please slow down")
    q.append(now)
    if len(_hits) > 20000:  # keep memory bounded
        _hits.clear()
