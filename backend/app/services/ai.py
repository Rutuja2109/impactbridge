"""AI-assisted structuring of community needs, embeddings and transcription.

Every provider call is optional. Output is post-processed so that the AI cannot
introduce numbers (budgets, beneficiary counts, volunteer counts, targets) that do
not appear in what the person actually wrote; such values are cleared and moved to
"missing information" instead.
"""
from __future__ import annotations

import base64
import json
import math
import re
import urllib.error
import urllib.request
import uuid
from typing import Callable

from .. import config
from ..domain import CAUSES
from ..errors import ApiError

# Tests (or alternative deployments) can inject a provider: fn(system, user_text, images) -> str
_test_provider: Callable[[str, str, list], str] | None = None
_test_embedder: Callable[[str], list[float]] | None = None
_test_transcriber: Callable[[bytes, str], str] | None = None


def set_test_hooks(provider=None, embedder=None, transcriber=None) -> None:
    global _test_provider, _test_embedder, _test_transcriber
    _test_provider, _test_embedder, _test_transcriber = provider, embedder, transcriber


SYSTEM_PROMPT = f"""You help community members turn a description of a local problem into a clear,
editable project proposal for ImpactBridge, a platform connecting community needs with Rotary/Rotaract
clubs, NGOs, CSR teams and volunteers.

STRICT RULES
- Use ONLY information present in the description (and photos, if given). Never invent facts, names,
  numbers, budgets, beneficiary counts, partners, verification or results.
- If a value is not stated, return null (or an empty list) and add a short item to "missing_information"
  plus a friendly question to "follow_up_questions".
- You MAY suggest a proposed solution, milestones and outcome metrics, but these are suggestions:
  phrase them as plans, and leave every numeric "target" null unless the person gave the number.
- Keep the person's meaning; write plainly. Do not exaggerate urgency.
- "title" is a short, human headline that says who is affected and what would change, e.g. "Help the
  children of Kasarwadi school wash their hands before lunch". Not a technical label. Max 90 characters.
- "story" is 2 or 3 warm sentences that help a stranger feel why this matters: start with the people and a
  concrete moment from their day as described, then say what will change when it's fixed. Use only stated
  facts and numbers; no guilt, no pity, no exclamation marks, no words like "desperate" or "dying".
- "cause" must be one of: {", ".join(CAUSES)} (or null).
- The description may be in English, Hindi or Marathi (possibly a voice transcript). Write every text value
  in the OUTPUT LANGUAGE given below, keeping names of people and places as written.
- "budget_estimate" is the ONE place you may give your own number: a rough, typical cost in India for the
  proposed solution, with a one-line basis. It is shown to the person as a clearly labelled suggestion and is
  never used as the project's budget. Use null if you can't estimate sensibly.
- Return a single JSON object and nothing else.

JSON SHAPE
{{
  "title": string (max 90 chars),
  "story": string (2-3 sentences, max 600 chars),
  "problem_statement": string,
  "proposed_solution": string,
  "beneficiaries": string (who benefits, as described; "" if unknown),
  "beneficiary_count": integer|null,
  "city": string|null, "region": string|null, "location_detail": string|null,
  "cause": string|null,
  "budget_required": number|null (in {config.settings.currency}),
  "volunteers_required": integer|null,
  "materials": [{{"name": string, "quantity": number|null, "unit": string|null}}],
  "skills": [string],
  "time_commitment": string|null,
  "duration_weeks": integer|null,
  "milestones": [{{"title": string, "description": string}}],
  "outcomes": [{{"metric": string, "target": number|null, "unit": string|null}}],
  "involves_children": boolean, "involves_vulnerable": boolean,
  "budget_estimate": {{"amount": number, "basis": string}}|null,
  "missing_information": [string],
  "follow_up_questions": [string]
}}"""

_NUM_RE = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|lac|crore|cr|million|m)?\b", re.I)
_MULT = {"k": 1e3, "thousand": 1e3, "lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "crore": 1e7, "cr": 1e7,
         "million": 1e6, "m": 1e6}
_WORD_NUMS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
              "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20, "thirty": 30,
              "forty": 40, "fifty": 50, "hundred": 100, "a dozen": 12, "dozen": 12}


_DEVA_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
_DEVA_WORDS = {"एक": 1, "दो": 2, "दोन": 2, "तीन": 3, "चार": 4, "पाँच": 5, "पांच": 5, "पाच": 5, "छह": 6, "सहा": 6,
               "सात": 7, "आठ": 8, "नौ": 9, "नऊ": 9, "दस": 10, "दहा": 10, "बीस": 20, "वीस": 20, "तीस": 30,
               "पचास": 50, "पन्नास": 50, "सौ": 100, "शंभर": 100}
_DEVA_MULT = {"हज़ार": 1e3, "हजार": 1e3, "लाख": 1e5, "करोड़": 1e7, "कोटी": 1e7}


def numbers_in(text: str) -> set[float]:
    """Every number the person actually stated: digits (Latin or Devanagari), lakh/crore, and number words."""
    text = (text or "").translate(_DEVA_DIGITS)
    found: set[float] = set()
    for raw, word in re.findall(r"(\d[\d,]*(?:\.\d+)?)\s*(हज़ार|हजार|लाख|करोड़|कोटी)", text):
        try:
            found.add(float(raw.replace(",", "")) * _DEVA_MULT[word])
        except ValueError:
            pass
    for word, val in _DEVA_WORDS.items():
        for m in re.finditer(rf"(?<![\w\u0900-\u097F]){word}(?![\u0900-\u097F])(?:\s*(हज़ार|हजार|लाख|करोड़|कोटी))?", text):
            found.add(float(val))
            if m.group(1):
                found.add(val * _DEVA_MULT[m.group(1)])
    for raw, suffix in _NUM_RE.findall(text or ""):
        try:
            val = float(raw.replace(",", ""))
        except ValueError:
            continue
        found.add(val)
        if suffix:
            found.add(val * _MULT[suffix.lower()])
    low = (text or "").lower()
    for word, val in _WORD_NUMS.items():
        if re.search(rf"\b{word}\b", low):
            found.add(float(val))
    return found


def _stated(value, nums: set[float], allow_scaled: tuple[float, ...] = ()) -> bool:
    if value is None:
        return True
    try:
        v = float(value)
    except (TypeError, ValueError):
        return False
    for n in nums:
        if math.isclose(v, n, rel_tol=0.001):
            return True
        for factor in allow_scaled:
            if math.isclose(v, round(n * factor), abs_tol=1):
                return True
    return False


def _clean_str(v, limit=4000):
    if v is None:
        return None
    s = str(v).strip()
    return s[:limit] if s else None


def sanitize(raw: dict, source_text: str) -> dict:
    """Validate AI output, drop anything unsupported by the source text."""
    nums = numbers_in(source_text)
    missing = [str(x)[:300] for x in (raw.get("missing_information") or []) if str(x).strip()][:15]
    questions = [str(x)[:300] for x in (raw.get("follow_up_questions") or []) if str(x).strip()][:10]
    removed = []

    def guard(field, label, question, scaled=()):
        val = raw.get(field)
        if val is not None and not _stated(val, nums, scaled):
            removed.append(field)
            missing.append(f"{label} was not stated in your description.")
            questions.append(question)
            return None
        return val

    budget = guard("budget_required", "Budget", "What is the estimated budget needed, if known?")
    vols = guard("volunteers_required", "Number of volunteers", "How many volunteers would help?")
    count = guard("beneficiary_count", "Number of beneficiaries", "Roughly how many people would benefit?")
    weeks = guard("duration_weeks", "Duration", "How long do you expect the project to take?", (4.345, 52.18, 1 / 7))

    materials = []
    for m in (raw.get("materials") or [])[:30]:
        if not isinstance(m, dict) or not _clean_str(m.get("name")):
            continue
        qty = m.get("quantity")
        if qty is not None and not _stated(qty, nums):
            qty = None
            removed.append("materials.quantity")
        materials.append({"name": _clean_str(m["name"], 120), "quantity": qty, "unit": _clean_str(m.get("unit"), 40)})

    outcomes = []
    for o in (raw.get("outcomes") or [])[:10]:
        if not isinstance(o, dict) or not _clean_str(o.get("metric")):
            continue
        target = o.get("target")
        if target is not None and not _stated(target, nums):
            target = None
            removed.append("outcomes.target")
        outcomes.append({"metric": _clean_str(o["metric"], 160), "target": target, "unit": _clean_str(o.get("unit"), 40)})

    cause = raw.get("cause")
    if cause not in CAUSES:
        cause = None

    # The story may only repeat numbers the person gave; any sentence with an invented number is dropped.
    story_parts = []
    for sentence in re.split(r"(?<=[.!?।])\s+", _clean_str(raw.get("story"), 700) or ""):
        if sentence and all(_stated(n, nums) for n in numbers_in(sentence)):
            story_parts.append(sentence.replace("!", "."))
        elif sentence:
            removed.append("story")
    story = " ".join(story_parts)[:600]

    def as_int(v):
        try:
            return int(round(float(v))) if v is not None else None
        except (TypeError, ValueError):
            return None

    def as_float(v):
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    return {
        "title": (_clean_str(raw.get("title"), 90) or "Untitled community need"),
        "story": story,
        "problem_statement": _clean_str(raw.get("problem_statement")) or "",
        "proposed_solution": _clean_str(raw.get("proposed_solution")) or "",
        "beneficiaries": _clean_str(raw.get("beneficiaries"), 1000) or "",
        "beneficiary_count": as_int(count),
        "city": _clean_str(raw.get("city"), 80),
        "region": _clean_str(raw.get("region"), 80),
        "location_detail": _clean_str(raw.get("location_detail"), 200),
        "cause": cause,
        "budget_required": as_float(budget),
        "volunteers_required": as_int(vols),
        "materials": materials,
        "skills": [s for s in (_clean_str(x, 80) for x in (raw.get("skills") or [])[:20]) if s],
        "time_commitment": _clean_str(raw.get("time_commitment"), 200),
        "duration_weeks": as_int(weeks),
        "milestones": [{"title": _clean_str(m.get("title"), 140), "description": _clean_str(m.get("description"), 500) or ""}
                       for m in (raw.get("milestones") or [])[:10] if isinstance(m, dict) and _clean_str(m.get("title"))],
        "outcomes": outcomes,
        "involves_children": bool(raw.get("involves_children")),
        "involves_vulnerable": bool(raw.get("involves_vulnerable")),
        "missing_information": list(dict.fromkeys(missing)),
        "follow_up_questions": list(dict.fromkeys(questions)),
        "removed_unstated_values": sorted(set(removed)),
        "budget_estimate": _estimate(raw.get("budget_estimate")),
    }


def _estimate(v) -> dict | None:
    """The AI's own rough cost estimate: kept apart from budget_required and labelled as a suggestion."""
    if not isinstance(v, dict):
        return None
    try:
        amount = float(v.get("amount"))
    except (TypeError, ValueError):
        return None
    if not (0 < amount < 1e9):
        return None
    return {"amount": round(amount, -2) if amount >= 1000 else round(amount), "basis": _clean_str(v.get("basis"), 300) or ""}


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).rstrip("`").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ApiError(502, "The AI service returned an unexpected response. Please try again or fill the form manually.")
    try:
        return json.loads(text[start:end + 1])
    except ValueError:
        raise ApiError(502, "The AI service returned malformed data. Please try again or fill the form manually.")


def _post_json(url: str, payload: dict, headers: dict, timeout: int = 90) -> dict:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read()[:300].decode(errors="ignore")
        raise ApiError(502, f"The AI provider returned an error ({exc.code}). {detail}".strip())
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ApiError(503, f"Could not reach the AI provider: {exc}")


def _call_provider(system: str, user_text: str, images: list[tuple[str, bytes]]) -> tuple[str, str]:
    if _test_provider is not None:
        return _test_provider(system, user_text, images), "test"
    s = config.settings
    provider = s.active_ai_provider
    if provider is None:
        raise ApiError(503, "AI assistance is not configured. Add ANTHROPIC_API_KEY, GEMINI_API_KEY or "
                            "OPENAI_API_KEY to the server's .env file, or fill in the proposal manually.")
    if provider == "anthropic":
        content = [{"type": "image", "source": {"type": "base64", "media_type": m, "data": base64.b64encode(b).decode()}}
                   for m, b in images]
        content.append({"type": "text", "text": user_text})
        data = _post_json("https://api.anthropic.com/v1/messages", {
            "model": s.anthropic_model, "max_tokens": 4000, "system": system,
            "messages": [{"role": "user", "content": content}]},
            {"x-api-key": s.anthropic_api_key, "anthropic-version": "2023-06-01"})
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        return text, f"anthropic:{s.anthropic_model}"
    if provider == "gemini":
        parts = [{"inline_data": {"mime_type": m, "data": base64.b64encode(b).decode()}} for m, b in images]
        parts.append({"text": user_text})
        data = _post_json(
            f"https://generativelanguage.googleapis.com/v1beta/models/{s.gemini_model}:generateContent",
            {"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": parts}],
             "generationConfig": {"responseMimeType": "application/json"}},
            {"x-goog-api-key": s.gemini_api_key})
        cands = data.get("candidates") or [{}]
        text = "".join(p.get("text", "") for p in cands[0].get("content", {}).get("parts", []))
        return text, f"gemini:{s.gemini_model}"
    # openai
    content = [{"type": "text", "text": user_text}] + [
        {"type": "image_url", "image_url": {"url": f"data:{m};base64,{base64.b64encode(b).decode()}"}} for m, b in images]
    data = _post_json("https://api.openai.com/v1/chat/completions", {
        "model": s.openai_model, "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}]},
        {"Authorization": f"Bearer {s.openai_api_key}"})
    return data["choices"][0]["message"]["content"], f"openai:{s.openai_model}"


LANG_NAMES = {"en": "English", "hi": "Hindi (Devanagari script)", "mr": "Marathi (Devanagari script)"}


def structure_need(description: str, city: str | None, region: str | None, cause_hint: str | None,
                   images: list[tuple[str, bytes]], language: str = "en") -> dict:
    context = [f"OUTPUT LANGUAGE: {LANG_NAMES.get(language, 'English')}"]
    if city or region:
        context.append(f"Location given by the person: {', '.join(x for x in (city, region) if x)}")
    if cause_hint:
        context.append(f"Cause suggested by the person: {cause_hint}")
    user_text = "DESCRIPTION FROM THE PERSON:\n\"\"\"\n" + description + "\n\"\"\"\n" + "\n".join(context)
    raw_text, provider = _call_provider(SYSTEM_PROMPT, user_text, images)
    raw = _extract_json(raw_text)
    source = description + " " + " ".join(x for x in (city, region) if x)
    out = sanitize(raw, source)
    if city and not out["city"]:
        out["city"] = city
    if region and not out["region"]:
        out["region"] = region
    if cause_hint in CAUSES and not out["cause"]:
        out["cause"] = cause_hint
    out["provider"] = provider
    return out


# ---- embeddings (semantic search) ------------------------------------------
def embed(text: str) -> list[float] | None:
    if _test_embedder is not None:
        return _test_embedder(text)
    s = config.settings
    provider = s.embeddings_provider
    if provider is None:
        return None
    text = text[:8000]
    if provider == "openai":
        data = _post_json("https://api.openai.com/v1/embeddings", {"model": s.openai_embed_model, "input": text},
                          {"Authorization": f"Bearer {s.openai_api_key}"}, timeout=30)
        return data["data"][0]["embedding"]
    data = _post_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/{s.gemini_embed_model}:embedContent",
        {"content": {"parts": [{"text": text}]}}, {"x-goog-api-key": s.gemini_api_key}, timeout=30)
    return data["embedding"]["values"]


def semantic_enabled() -> bool:
    return _test_embedder is not None or config.settings.embeddings_provider is not None


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


# ---- transcription ----------------------------------------------------------
def transcribe(audio: bytes, mime: str, language: str | None = None) -> str:
    if _test_transcriber is not None:
        return _test_transcriber(audio, mime)
    s = config.settings
    if not s.openai_api_key:
        raise ApiError(503, "Voice transcription is not configured (OPENAI_API_KEY is missing). "
                            "You can use your browser's dictation or type the description instead.")
    ext = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/mp4": "m4a"}.get(mime, "webm")
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n{s.whisper_model}\r\n"
        + (f"--{boundary}\r\nContent-Disposition: form-data; name=\"language\"\r\n\r\n{language}\r\n" if language else "")
        + 
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"audio.{ext}\"\r\n"
        f"Content-Type: {mime}\r\n\r\n"
    ).encode() + audio + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request("https://api.openai.com/v1/audio/transcriptions", data=body, method="POST", headers={
        "Authorization": f"Bearer {s.openai_api_key}", "Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read()).get("text", "")
    except urllib.error.HTTPError as exc:
        raise ApiError(502, f"Transcription failed ({exc.code}).")
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ApiError(503, f"Could not reach the transcription service: {exc}")
