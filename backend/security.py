"""Password hashing (bcrypt), JWT, auth dependencies and a small in-memory rate limiter."""
import hashlib
import hmac
import ipaddress
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
    now = int(time.time())
    # "ts" has sub-second precision: a password reset voids exactly the sessions created before it, not the new login
    return jwt.encode({"sub": str(uid), "iat": now, "ts": time.time(), "exp": now + config.JWT_DAYS * 86400}, config.JWT_SECRET, algorithm="HS256")


def _claims(authorization: str | None):
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        p = jwt.decode(authorization[7:].strip(), config.JWT_SECRET, algorithms=["HS256"])
        return int(p["sub"]), float(p.get("ts") or p.get("iat") or 0)
    except (jwt.PyJWTError, ValueError, KeyError):
        return None


def optional_user(authorization: str | None = Header(None)) -> dict | None:
    """Guest mode: no / invalid / revoked token simply means 'guest'. Returns the public user dict otherwise."""
    c = _claims(authorization)
    return db.auth_user(c[0], c[1]) if c else None


def optional_user_id(authorization: str | None = Header(None)) -> int | None:
    u = optional_user(authorization)
    return u["id"] if u else None


def required_user_id(authorization: str | None = Header(None)) -> int:
    uid = optional_user_id(authorization)
    if uid is None:
        raise HTTPException(401, "Not logged in")
    return uid


_hits: dict = defaultdict(deque)


def rate_limit(request: Request, bucket: str, limit: int, window: int = 60) -> None:
    ip = client_ip(request)
    q, now = _hits[(bucket, ip)], time.time()
    while q and q[0] < now - window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Too many requests, please slow down")
    q.append(now)
    if len(_hits) > 20000:  # keep memory bounded
        _hits.clear()


# ---------------- visitor IP (for the guest limit) ----------------
def _valid_ip(value: str):
    try:
        return ipaddress.ip_address(value.strip())
    except ValueError:
        return None


def client_ip(request: Request) -> str:
    """The visitor's IP. X-Forwarded-For can be forged by the visitor on the LEFT, so we only trust what our own
    proxy added on the RIGHT (TRUSTED_PROXY_HOPS), or a header the edge overwrites (CLIENT_IP_HEADER)."""
    if config.CLIENT_IP_HEADER:
        ip = _valid_ip(request.headers.get(config.CLIENT_IP_HEADER, ""))
        if ip:
            return str(ip)
    parts = [x.strip() for x in request.headers.get("x-forwarded-for", "").split(",") if x.strip()]
    if parts:
        ip = _valid_ip(parts[-config.TRUSTED_PROXY_HOPS] if len(parts) >= config.TRUSTED_PROXY_HOPS else parts[0])
        if ip:
            return str(ip)
    return request.client.host if request.client else "0.0.0.0"


def ip_bucket(ip: str) -> str:
    """IPv6 users own a whole /64: group it, otherwise one person has billions of 'different' addresses."""
    a = _valid_ip(ip)
    if a is not None and a.version == 6:
        return str(ipaddress.ip_network(f"{a}/64", strict=False).network_address) + "/64"
    return ip


def is_loopback(ip: str) -> bool:
    a = _valid_ip(ip)
    return bool(a and a.is_loopback)


def ip_hash(ip: str) -> str:
    """Only a keyed hash of the IP is stored in the database."""
    return hmac.new(config.JWT_SECRET.encode(), ip_bucket(ip).encode(), hashlib.sha256).hexdigest()


# ---------------- admin ----------------
def make_admin_token() -> str:
    return jwt.encode({"sub": "admin", "adm": True, "exp": int(time.time()) + config.ADMIN_TOKEN_HOURS * 3600},
                      config.JWT_SECRET, algorithm="HS256")


def require_admin(authorization: str | None = Header(None)) -> None:
    """Only a token issued by /api/admin/login passes; ordinary user tokens have no 'adm' claim."""
    try:
        payload = jwt.decode((authorization or "")[7:].strip(), config.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Admin login required")
    if payload.get("adm") is not True:
        raise HTTPException(401, "Admin login required")
