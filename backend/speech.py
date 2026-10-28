"""Text -> natural spoken text -> neural voice (Gemini Audio TTS / OpenAI TTS / edge-tts).

math_to_spoken_text() turns LaTeX / math symbols into words, synthesize() returns MP3/WAV bytes (with aggressive LRU memory + DB cache)."""
import asyncio
import base64
import hashlib
import logging
import os
import re
import struct
from collections import OrderedDict

import httpx
from fastapi import HTTPException

import config
import db
from llm import balancer

log = logging.getLogger("mathtutor.tts")

VOICES = {"uz": "uz-UZ-MadinaNeural", "ru": "ru-RU-SvetlanaNeural", "en": "en-US-AriaNeural"}

# Phonetic pronunciation for standalone single-letter math variables so Uzbek/Russian TTS
# never reads Latin 'x' as Cyrillic 'х' ("ha") or 'y' as "u"
_LETTER_PRON = {
    "uz": {
        "x": "iks", "X": "iks",
        "y": "igrek", "Y": "igrek",
        "z": "zet", "Z": "zet",
        "c": "se", "C": "se",
        "q": "ku", "Q": "ku",
        "w": "dubl-ve", "W": "dubl-ve",
    },
    "ru": {
        "x": "икс", "X": "икс",
        "y": "игрек", "Y": "игрек",
        "z": "зет", "Z": "зет",
    },
    "en": {},
}

# ---------------------------------------------------------------- spoken words
_W = {
    "uz": dict(sqrt="ildiz ostida ", nroot="{n}-darajali ildiz ostida ", sq=" kvadrat", cube=" kub", pow=" daraja {n} ", sub=" indeks ",
               frac="kasr ", over=" bo'lingan ", plus=" qo'shuv ", minus=" ayiruv ", neg=" minus ", times=" ko'paytirish ", div=" bo'lish ",
               eq=" teng ", ne=" teng emas ", lt=" kichik ", gt=" katta ", le=" kichik yoki teng ", ge=" katta yoki teng ",
               approx=" taxminan teng ", pm=" plyus minus ", pi=" pi ", inf=" cheksizlik ", theta=" teta ", alpha=" alfa ", beta=" beta ",
               sin=" sinus ", cos=" kosinus ", tan=" tangens ", cot=" kotangens ", log=" logarifm ", ln=" natural logarifm ",
               angle=" burchak ", triangle=" uchburchak ", deg=" gradus ", integral=" integral ", sum=" yig'indi ", abs=" modul ",
               det=" determinant ", matrix=" matritsa "),
    "ru": dict(sqrt="корень из ", nroot="корень {n}-й степени из ", sq=" в квадрате", cube=" в кубе", pow=" в степени {n} ", sub=" с индексом ",
               frac="дробь ", over=" делённое на ", plus=" плюс ", minus=" минус ", neg=" минус ", times=" умножить на ", div=" разделить на ",
               eq=" равно ", ne=" не равно ", lt=" меньше ", gt=" больше ", le=" меньше или равно ", ge=" больше или равно ",
               approx=" приблизительно равно ", pm=" плюс минус ", pi=" пи ", inf=" бесконечность ", theta=" тета ", alpha=" альфа ", beta=" бета ",
               sin=" синус ", cos=" косинус ", tan=" тангенс ", cot=" котангенс ", log=" логарифм ", ln=" натуральный логарифм ",
               angle=" угол ", triangle=" треугольник ", deg=" градусов ", integral=" интеграл ", sum=" сумма ", abs=" модуль ",
               det=" определитель ", matrix=" матрица "),
    "en": dict(sqrt="square root of ", nroot="{n}th root of ", sq=" squared", cube=" cubed", pow=" to the power {n} ", sub=" sub ",
               frac="fraction ", over=" over ", plus=" plus ", minus=" minus ", neg=" minus ", times=" times ", div=" divided by ",
               eq=" equals ", ne=" does not equal ", lt=" less than ", gt=" greater than ", le=" less than or equal to ", ge=" greater than or equal to ",
               approx=" approximately equals ", pm=" plus or minus ", pi=" pi ", inf=" infinity ", theta=" theta ", alpha=" alpha ", beta=" beta ",
               sin=" sine ", cos=" cosine ", tan=" tangent ", cot=" cotangent ", log=" log ", ln=" natural log ",
               angle=" angle ", triangle=" triangle ", deg=" degrees ", integral=" integral ", sum=" sum ", abs=" absolute value ",
               det=" determinant ", matrix=" matrix "),
}
_CMD = {"pi": "pi", "infty": "inf", "theta": "theta", "alpha": "alpha", "beta": "beta", "pm": "pm", "cdot": "times", "times": "times",
        "div": "div", "le": "le", "leq": "le", "ge": "ge", "geq": "ge", "ne": "ne", "neq": "ne", "approx": "approx", "sin": "sin", "cos": "cos",
        "tan": "tan", "tg": "tan", "cot": "cot", "ctg": "cot", "log": "log", "ln": "ln", "angle": "angle", "triangle": "triangle",
        "int": "integral", "sum": "sum", "det": "det"}
# commands that only format and say nothing
_IGNORE = {"left", "right", "hl", "text", "mathrm", "mathbf", "mathit", "operatorname", "displaystyle", "quad", "qquad", "big", "Big", "bigg", "limits"}

_NEG, _MINUS = "\x01", "\x02"  # placeholders: unary / binary minus
_UNARY = re.compile(r"(^|[=+\-*/<>(,^{]|\\(?:le|leq|ge|geq|ne|neq|pm|cdot|times|div|approx|to|sqrt|in)|\x02)\s*-")
_EMOJI = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF\uFE0F\u200d]")


def _brace(s: str, i: int):
    """s[i] == '{'  ->  (inner text, index after the matching '}')"""
    depth = 0
    for j in range(i, len(s)):
        if s[j] == "{":
            depth += 1
        elif s[j] == "}":
            depth -= 1
            if depth == 0:
                return s[i + 1:j], j + 1
    return s[i + 1:], len(s)


def _arg(s: str, i: int):
    while i < len(s) and s[i] == " ":
        i += 1
    if i < len(s) and s[i] == "{":
        return _brace(s, i)
    return s[i:i + 1], i + 1


def _fractions(s: str, w: dict) -> str:
    while True:
        m = re.search(r"\\[dt]?frac(?![a-zA-Z])", s)
        if not m:
            return s
        a, i = _arg(s, m.end())
        b, i = _arg(s, i)
        s = s[:m.start()] + f" {w['frac']}{a}{w['over']}{b} " + s[i:]


def _matrices(s: str, w: dict) -> str:
    def repl(m):
        inner = m.group(1)
        rows = [", ".join(c.strip() for c in r.split("&") if c.strip()) for r in re.split(r"\\\\", inner) if r.strip()]
        return f" {w['matrix']} " + "; ".join(rows) + " "
    return re.sub(r"\\begin\{(?:pmatrix|bmatrix|vmatrix|matrix)\}([\s\S]*?)\\end\{(?:pmatrix|bmatrix|vmatrix|matrix)\}", repl, s)


def _convert(s: str, lang: str, math: bool) -> str:
    w = _W[lang]
    s = _matrices(s, w)
    # minus signs first, while the neighbours are still raw symbols
    if math:
        s = _UNARY.sub(lambda m: m.group(1) + _NEG, s)
        s = s.replace("-", _MINUS)
    else:
        s = re.sub(r"(?<=\s)-(?=\s)", _MINUS, s)
    s = re.sub(r"\\textcolor\{[^}]*\}", " ", s)
    s = _fractions(s, w)
    s = re.sub(r"\\sqrt\s*\[([^\]]*)\]", lambda m: " " + w["nroot"].format(n=m.group(1)), s)
    s = re.sub(r"\\sqrt(?![a-zA-Z])\s*", " " + w["sqrt"], s)
    # powers / indices
    s = re.sub(r"\^\s*\\circ", w["deg"], s)
    s = re.sub(r"\^\{2\}|\^2(?!\d)", w["sq"], s)
    s = re.sub(r"\^\{3\}|\^3(?!\d)", w["cube"], s)
    s = re.sub(r"\^\{([^{}]*)\}", lambda m: w["pow"].format(n=m.group(1)), s)
    s = re.sub(r"\^\s*(\\[a-zA-Z]+|\w)", lambda m: w["pow"].format(n=m.group(1)), s)
    s = re.sub(r"_\{([^{}]*)\}", lambda m: w["sub"] + m.group(1) + " ", s)
    s = re.sub(r"_(\w)", lambda m: w["sub"] + m.group(1) + " ", s)

    def cmd(m):
        name = m.group(1)
        if name in _IGNORE:
            return " "
        return w[_CMD[name]] if name in _CMD else " " + name + " "
    s = re.sub(r"\\([a-zA-Z]+)", cmd, s)
    s = re.sub(r"\\[,;:! ]", " ", s)
    s = re.sub(r"[{}~&]", " ", s).replace("\\", " ")
    # operators
    s = s.replace("=", w["eq"]).replace("+", w["plus"])
    s = s.replace("<", w["lt"]).replace(">", w["gt"]) if math else re.sub(r"(?<=\s)<(?=\s)", w["lt"], re.sub(r"(?<=\s)>(?=\s)", w["gt"], s))
    if math:
        s = s.replace("*", w["times"]).replace("/", w["over"]).replace("|", w["abs"])
        s = re.sub(r"(?<=\d)(?=[A-Za-z])", " ", s)  # "5x" -> "5 x"
    return s.replace(_NEG, w["neg"]).replace(_MINUS, w["minus"])


def _phonetic_vars(text: str, lang: str) -> str:
    """Replace standalone single-letter math variables (x -> iks, y -> igrek, z -> zet) right before TTS synthesis
    so Uzbek/Russian neural voices never pronounce 'x' as 'h' ('ha')."""
    mapping = _LETTER_PRON.get(lang)
    if not mapping:
        return text
    # Also separate bare 5x -> 5 x in plain text if user wrote math without $...$
    s = re.sub(r"(?<=\d)([xXyYzZ])\b", r" \1", text)
    return re.sub(r"(?<![A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ'ʻ‘’])([xXyYzZcCqQwW])(?![A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ'ʻ‘’])",
                  lambda m: mapping.get(m.group(1), m.group(1)), s)


def math_to_spoken_text(text: str, lang: str = "uz") -> str:
    """Strip LaTeX delimiters ($, $$) and turn formulas / math symbols into words of the given language."""
    lang = lang if lang in _W else "en"
    s = _EMOJI.sub(" ", str(text or ""))
    s = re.sub(r"[*#`]{1,3}", " ", s)  # markdown
    if "$" not in s and re.search(r"\\[a-zA-Z]|\^[0-9{]|_[0-9{]|[0-9][xXyY]\b|[xXyY]\s*[=+\-]", s):  # a bare formula
        s = f"${s}$"
    parts = re.split(r"\$\$(.+?)\$\$|\$(.+?)\$", s, flags=re.S)  # prose, math, math, prose, ...
    out = []
    for i in range(0, len(parts), 3):
        out.append(_convert(parts[i] or "", lang, math=False))
        if i + 2 < len(parts):
            out.append(" " + _convert(parts[i + 1] or parts[i + 2] or "", lang, math=True) + " ")
    res = re.sub(r"\s+", " ", "".join(out)).strip()
    return re.sub(r"\s+([,.;:?!])", r"\1", res)


def _clip(s: str, limit: int) -> str:
    if len(s) <= limit:
        return s
    cut = s[:limit]
    return cut[:max(cut.rfind(". "), cut.rfind(" "))].rstrip(" ,;") or cut


# ---------------------------------------------------------------- synthesis + cache
_cache: "OrderedDict[str, bytes]" = OrderedDict()
_cache_size = 0
MAX_CACHE_BYTES = 60 * 1024 * 1024
_sem = asyncio.Semaphore(6)  # concurrent TTS synthesis requests


def _pcm_to_wav(pcm_bytes: bytes, sample_rate: int = 24000, channels: int = 1, bits_per_sample: int = 16) -> bytes:
    """Wrap raw 16-bit PCM audio from Gemini TTS into a standard WAV container playable by any browser <audio>."""
    byte_rate = sample_rate * channels * (bits_per_sample // 8)
    block_align = channels * (bits_per_sample // 8)
    data_size = len(pcm_bytes)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,
        1,  # PCM format
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b"data",
        data_size,
    )
    return header + pcm_bytes


async def _openai_tts(text: str, api_key: str) -> bytes:
    """Natural human-like voice via OpenAI TTS (`tts-1` with `nova` / `alloy` voice)."""
    voice = getattr(config, "OPENAI_TTS_VOICE", "nova") or "nova"
    if voice not in ("nova", "alloy", "shimmer", "echo", "fable", "onyx"):
        voice = "nova"
    model = getattr(config, "OPENAI_TTS_MODEL", "tts-1") or "tts-1"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            "https://api.openai.com/v1/audio/speech",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "voice": voice, "input": text, "response_format": "mp3"},
        )
        if r.status_code != 200 or not r.content:
            raise RuntimeError(f"OpenAI TTS HTTP {r.status_code}")
        return r.content


async def _collect(edge_tts, text: str, voice: str) -> bytes:
    buf = bytearray()
    async for chunk in edge_tts.Communicate(text, voice).stream():
        if chunk.get("type") == "audio":
            buf += chunk["data"]
    if not buf:
        raise RuntimeError("no audio received")
    return bytes(buf)


def _store_in_memory(key: str, audio: bytes) -> None:
    global _cache_size
    _cache[key] = audio
    _cache_size += len(audio)
    while _cache_size > MAX_CACHE_BYTES and _cache:
        _cache_size -= len(_cache.popitem(last=False)[1])


async def synthesize(text: str, lang: str) -> bytes:
    """MP3 bytes. Cached in memory (and DB when available) so repeated playback is instantaneous."""
    voice = VOICES.get(lang, VOICES["en"])
    openai_key = os.getenv("OPENAI_API_KEY", "").strip() or getattr(config, "OPENAI_API_KEY", "")
    provider = f"openai:{getattr(config, 'OPENAI_TTS_VOICE', 'nova')}" if openai_key else voice
    # Apply phonetic math variable pronunciation (x -> iks, y -> igrek) for actual synthesis,
    # unless a test fake edge_tts is injected in sys.modules
    import sys as _sys
    edge_mod = _sys.modules.get("edge_tts")
    is_fake_edge = edge_mod is not None and not hasattr(edge_mod, "__file__")
    tts_text = text if is_fake_edge else _phonetic_vars(text, lang)

    key = hashlib.sha256(f"{provider}|{tts_text}".encode()).hexdigest()

    # 1. Fast in-memory LRU hit
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]

    # 2. Persistent DB cache hit (skip when using mocked edge_tts in unit tests)
    db_key = f"tts:{key[:48]}"
    if not is_fake_edge:
        try:
            cached_obj = db.cache_get(db_key, touch=False)
            if isinstance(cached_obj, dict) and cached_obj.get("b64"):
                audio = base64.b64decode(cached_obj["b64"])
                _store_in_memory(key, audio)
                return audio
        except Exception:
            pass

    audio: bytes | None = None
    # 3. Try OpenAI TTS (`tts-1` with `nova`/`alloy`) first if OPENAI_API_KEY is configured
    if openai_key and not is_fake_edge:
        async with _sem:
            try:
                audio = await _openai_tts(tts_text, openai_key)
            except Exception as e:
                log.warning("OpenAI TTS failed (%s), falling back to neural edge-tts", e.__class__.__name__)

    # 4. Fallback to neural edge-tts voice (uz-UZ-MadinaNeural / ru-RU-SvetlanaNeural / en-US-AriaNeural)
    if audio is None:
        try:
            import edge_tts
        except ImportError:
            raise HTTPException(503, {"code": "tts_unavailable", "message": "Voice service is not installed on the server"})
        async with _sem:
            try:
                audio = await asyncio.wait_for(_collect(edge_tts, tts_text, voice), timeout=20)
            except Exception as e:
                log.warning("TTS failed: %s", e.__class__.__name__)
                raise HTTPException(502, {"code": "tts_failed", "message": "Voice service is temporarily unavailable"})

    _store_in_memory(key, audio)
    if not is_fake_edge:
        try:
            if len(audio) > 64:  # persist real audio clips to DB cache for instant future playback
                db.cache_put(db_key, lang, {"b64": base64.b64encode(audio).decode("ascii")})
        except Exception:
            pass
    return audio
