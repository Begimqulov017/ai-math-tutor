"""Gemini access: round-robin key balancer with failover + low-latency JSON generation."""
import asyncio
import json
import logging
import os
import re
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import HTTPException

import config

log = logging.getLogger("mathtutor.llm")


def _url(model: str) -> str:
    m = model.strip().removeprefix("models/")
    return f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent"


# "Priority AI responses": every plan has its own lane of simultaneous AI calls. When the service is busy, free users
# wait in the free lane only, so they can never hold up Premium / VIP users (and VIP never waits behind Premium).
_lanes = {p: asyncio.Semaphore(config.LLM_LANE_SIZE) for p in ("free", "premium", "vip")}


@asynccontextmanager
async def lane(plan: str):
    async with _lanes.get(plan, _lanes["free"]):
        yield


def model_for(plan: str) -> str:
    return {"premium": config.PREMIUM_MODEL, "vip": config.VIP_MODEL}.get(plan, config.MODEL)


# HTTP status -> seconds the key rests before it is preferred again. Anything else (e.g. 400) is the
# request's fault and would fail on every key, so it is not retried.
COOLDOWN = {429: 60, 401: 900, 403: 900, 408: 10, 500: 10, 502: 10, 503: 10, 504: 10}


class APIKeyBalancer:
    """Round-robin over GEMINI_API_KEY_1..8 (and GEMINI_API_KEY); a key that just failed rests for a while."""

    def __init__(self) -> None:
        found = [os.getenv(f"GEMINI_API_KEY_{i}", "").strip() for i in range(1, 9)]
        found.append(os.getenv("GEMINI_API_KEY", "").strip())
        self.keys = list(dict.fromkeys(k for k in found if k))
        self._next = 0
        self._rest_until: dict[str, float] = {}

    @property
    def total(self) -> int:
        return len(self.keys)

    def active(self) -> int:
        now = time.time()
        return sum(1 for k in self.keys if self._rest_until.get(k, 0) <= now)

    def order(self) -> list[str]:
        """Keys in the order they should be tried: next in the ring first, resting keys last."""
        if not self.keys:
            return []
        start = self._next % len(self.keys)
        self._next = (start + 1) % len(self.keys)
        ring = self.keys[start:] + self.keys[:start]
        now = time.time()
        return [k for k in ring if self._rest_until.get(k, 0) <= now] + [k for k in ring if self._rest_until.get(k, 0) > now]

    def rest(self, key: str, seconds: int) -> None:
        self._rest_until[key] = time.time() + seconds


balancer = APIKeyBalancer()

# Remember which model last succeeded so subsequent calls hit the working model immediately
_working_model: str | None = None


def _gen_config(as_json: bool) -> dict:
    """Clean, universally compatible generationConfig for fast responses across all Gemini Flash versions."""
    cfg: dict = {"temperature": 0.25}
    if as_json:
        cfg["responseMimeType"] = "application/json"
    return cfg


def _candidate_models(preferred: str | None) -> list[str]:
    out = []
    if _working_model and (not preferred or preferred == config.MODEL):
        out.append(_working_model)
    if preferred:
        out.append(preferred)
    for m in getattr(config, "FALLBACK_MODELS", ["gemini-2.5-flash", "gemini-3-flash-preview", "gemini-2.0-flash"]):
        if m not in out:
            out.append(m)
    return out


async def gemini(parts: list, system: str, as_json: bool, history: list | None = None, model: str | None = None) -> str:
    global _working_model
    if not balancer.total:
        raise HTTPException(503, "AI service is not configured")

    models_to_try = _candidate_models(model or config.MODEL)
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [*(history or []), {"role": "user", "parts": parts}],
        "generationConfig": _gen_config(as_json),
    }

    last_status = 503
    async with httpx.AsyncClient(timeout=45) as client:
        for cur_model in models_to_try:
            url = _url(cur_model)
            for key in balancer.order():
                tag = "..." + key[-4:]
                try:
                    r = await client.post(url, params={"key": key}, json=body)
                except httpx.HTTPError as e:  # network problem: try the next key
                    log.warning("key %s network error %s", tag, e.__class__.__name__)
                    balancer.rest(key, 10)
                    continue
                last_status = r.status_code
                if r.status_code == 200:
                    try:
                        out = r.json()["candidates"][0]["content"]["parts"]
                    except (KeyError, IndexError, ValueError):
                        log.warning("key %s empty reply: %s", tag, r.text[:150])
                        continue
                    _working_model = cur_model
                    return "".join(p.get("text", "") for p in out if not p.get("thought"))
                # If this model name returned 404 (not found/deprecated) or 400, immediately try the next candidate model
                if r.status_code in (400, 404):
                    log.warning("model %s returned %s (%s), trying next fallback model", cur_model, r.status_code, r.text[:120])
                    if _working_model == cur_model:
                        _working_model = None
                    break
                log.warning("key %s failed on %s: %s %s", tag, cur_model, r.status_code, r.text[:200])
                if r.status_code in COOLDOWN:
                    balancer.rest(key, COOLDOWN[r.status_code])
                    continue
                raise HTTPException(502, f"AI request was rejected ({r.status_code})")
    if last_status in (400, 404):
        raise HTTPException(502, f"AI request was rejected ({last_status})")
    raise HTTPException(503, "AI is busy right now, please try again in a moment")


# ---- LLMs write LaTeX with single backslashes inside JSON; repair what json.loads would mangle ----
_CTRL = {"\x0c": "\\f", "\x08": "\\b", "\t": "\\t", "\r": "\\r"}
_NL = re.compile(r"\n(?=(?:eq|abla|ot|otin|i|u|ewline|mid|parallel|cong|sim|subset|exists|leq|geq|e)(?![a-z]))")
_BAD_ESC = re.compile(r'\\\\|\\(?!["/bfnrtu])')


def _fix(v):
    if isinstance(v, str):
        for k, r in _CTRL.items():
            v = v.replace(k, r)
        return _NL.sub(lambda m: "\\n", v)
    if isinstance(v, list):
        return [_fix(x) for x in v]
    if isinstance(v, dict):
        return {k: _fix(x) for k, x in v.items()}
    return v


def parse_json(raw: str):
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    raw = _BAD_ESC.sub(lambda m: m.group(0) if len(m.group(0)) == 2 else "\\\\", raw)
    try:
        return _fix(json.loads(raw))
    except json.JSONDecodeError:
        raise HTTPException(502, "AI returned an invalid answer, please try again")
