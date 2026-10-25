"""Password hashing, JWT tokens, request authentication and role checks."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import threading
import time
from datetime import datetime, timedelta, timezone

import jwt
from starlette.requests import Request

from . import config, db
from .errors import ApiError

# ---- roles -----------------------------------------------------------------
SELF_SERVICE_ROLES = {"submitter", "club", "csr", "ngo", "volunteer"}
REVIEWER_ROLES = {"admin", "verifier"}
ALL_ROLES = SELF_SERVICE_ROLES | REVIEWER_ROLES
ROLE_LABELS = {
    "submitter": "Community organization / need submitter",
    "club": "Rotary or Rotaract club",
    "csr": "Corporate CSR team",
    "ngo": "NGO",
    "volunteer": "Individual volunteer",
    "verifier": "Project verifier",
    "admin": "Administrator",
}

# ---- passwords (scrypt, stdlib) --------------------------------------------
_SCRYPT = dict(n=2**14, r=8, p=1, dklen=32)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_b64, digest_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
    except ValueError:
        return False
    actual = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    return hmac.compare_digest(actual, expected)


def validate_password_strength(password: str) -> None:
    if len(password) < 8:
        raise ApiError(422, "Password must be at least 8 characters.", field="password")
    if password.isdigit() or password.isalpha():
        raise ApiError(422, "Password must mix letters with numbers or symbols.", field="password")


# ---- tokens -----------------------------------------------------------------
COOKIE_NAME = "ib_session"


def create_token(user_id: str) -> str:
    s = config.settings
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=s.jwt_ttl_hours),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, config.settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return payload.get("sub")


def _token_from_request(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.cookies.get(COOKIE_NAME)


def current_user(request: Request) -> dict | None:
    if "user" in request.state._state:
        return request.state.user
    user = None
    token = _token_from_request(request)
    if token:
        uid = decode_token(token)
        if uid:
            user = db.get("users", uid)
            if user and user["is_suspended"]:
                user = None
    request.state.user = user
    return user


def require_user(request: Request) -> dict:
    user = current_user(request)
    if not user:
        raise ApiError(401, "Please sign in to continue.")
    return user


def require_roles(request: Request, *roles: str) -> dict:
    user = require_user(request)
    if user["role"] not in roles:
        raise ApiError(403, "Your account role is not allowed to do this.")
    return user


def is_reviewer(user: dict | None) -> bool:
    return bool(user) and user["role"] in REVIEWER_ROLES


def is_admin(user: dict | None) -> bool:
    return bool(user) and user["role"] == "admin"


# ---- login throttling (in-memory, per email+ip) -----------------------------
_attempts: dict[str, list[float]] = {}
_attempt_lock = threading.Lock()
MAX_ATTEMPTS = 8
WINDOW_SECONDS = 15 * 60


def check_login_throttle(key: str) -> None:
    with _attempt_lock:
        recent = [t for t in _attempts.get(key, []) if time.time() - t < WINDOW_SECONDS]
        _attempts[key] = recent
        if len(recent) >= MAX_ATTEMPTS:
            raise ApiError(429, "Too many sign-in attempts. Please wait 15 minutes and try again.")


def record_failed_login(key: str) -> None:
    with _attempt_lock:
        _attempts.setdefault(key, []).append(time.time())


def clear_login_attempts(key: str) -> None:
    with _attempt_lock:
        _attempts.pop(key, None)


# ----------------------------------------------------------------- sign-up abuse protection
DISPOSABLE_DOMAINS = {
    "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com", "trashmail.com",
    "getnada.com", "sharklasers.com", "throwawaymail.com", "dispostable.com", "maildrop.cc", "fakeinbox.com", "mailnesia.com",
    "mohmal.com", "emailondeck.com", "tempinbox.com", "mintemail.com", "spamgourmet.com", "burnermail.io", "moakt.com",
}
_signups: dict[str, list[float]] = {}


def check_signup_allowed(email: str, ip: str) -> None:
    """Blocks throw-away email addresses and bursts of sign-ups from one network (5 per hour)."""
    import time
    from .errors import ApiError
    domain = email.rsplit("@", 1)[-1].lower()
    if domain in DISPOSABLE_DOMAINS:
        raise ApiError(422, "Please use your own email address. Temporary email services aren't accepted.", field="email")
    now = time.time()
    recent = [t for t in _signups.get(ip, []) if now - t < 3600]
    if len(recent) >= int(os.environ.get("SIGNUPS_PER_HOUR", "5")):
        raise ApiError(429, "Too many accounts were created from this network. Please try again in an hour.")
    recent.append(now)
    _signups[ip] = recent
