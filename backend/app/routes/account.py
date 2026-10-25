"""Account recovery and verification: password reset, email verification, phone sign-in codes."""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from pydantic import Field, field_validator
from starlette.requests import Request
from starlette.routing import Route

from .. import config, db
from ..errors import ApiError
from ..models import OrgCreate, Strict
from ..security import (SELF_SERVICE_ROLES, check_login_throttle, hash_password, record_failed_login,
                        require_user, validate_password_strength)
from ..services import sms
from ..services.notify import audit, send_email
from ..web import ok, parse

log = logging.getLogger("impactbridge")

RESET_MINUTES = 60
VERIFY_HOURS = 48
CODE_MINUTES = 10
TICKET_MINUTES = 30
MAX_CODE_ATTEMPTS = 5
CODES_PER_HOUR = 5
RESEND_SECONDS = 30


# ----------------------------------------------------------------- helpers
def _h(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _dev() -> bool:
    return config.settings.env != "production"


def _issue(kind: str, secret: str, *, user_id: str | None, target: str | None, minutes: int) -> None:
    ts = _now()
    db.insert("auth_tokens", {"id": db.new_id(), "kind": kind, "user_id": user_id, "target": target,
                              "secret_hash": _h(secret), "attempts": 0, "expires_at": _iso(ts + timedelta(minutes=minutes)),
                              "used_at": None, "created_at": _iso(ts)})


def _take(kind: str, secret: str) -> dict:
    row = db.one("SELECT * FROM auth_tokens WHERE kind = ? AND secret_hash = ?", (kind, _h(secret or "")))
    if not row or row["used_at"] or row["expires_at"] < _iso(_now()):
        raise ApiError(400, "This link has expired or was already used. Please request a new one.")
    db.execute("UPDATE auth_tokens SET used_at = ? WHERE id = ?", (_iso(_now()), row["id"]))
    return row


def _link(path: str, token: str) -> str:
    return f"{config.settings.public_url}{path}?token={token}"


def _mail(to: str, subject: str, heading: str, text: str, url: str, button: str) -> bool:
    esc = lambda t: t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    html = (f"<h2 style='font-family:sans-serif;color:#065f46'>{esc(heading)}</h2><p style='font-family:sans-serif'>{esc(text)}</p>"
            f"<p><a href='{esc(url)}' style='background:#065f46;color:#fff;padding:12px 20px;border-radius:999px;"
            f"text-decoration:none;font-family:sans-serif;font-weight:700'>{esc(button)}</a></p>"
            f"<p style='font-family:sans-serif;color:#666;font-size:12px'>If you didn't ask for this, you can ignore this email.</p>")
    return send_email(to, subject, html)


def send_verification(user: dict) -> dict:
    """Email a verification link. In development without email, the link is logged and returned for testing."""
    if user["email"].endswith(".invalid") or user["email_verified"]:
        return {}
    token = secrets.token_urlsafe(32)
    db.execute("UPDATE auth_tokens SET used_at = ? WHERE kind = 'verify' AND user_id = ? AND used_at IS NULL",
               (_iso(_now()), user["id"]))
    _issue("verify", token, user_id=user["id"], target=user["email"], minutes=VERIFY_HOURS * 60)
    url = _link("/verify-email", token)
    if _mail(user["email"], "Confirm your email", "Confirm your email address",
             "Tap the button to confirm this is your email address for ImpactBridge.", url, "Confirm email"):
        return {"sent": True}
    if _dev():
        log.info("Email not configured. Verification link for %s: %s", user["email"], url)
        return {"sent": False, "dev_link": url}
    return {"sent": False}


def contact_verified(user: dict) -> bool:
    return bool(user.get("email_verified") or user.get("phone_verified"))


def require_verified_contact(user: dict) -> None:
    """When email delivery is configured, posting or pledging needs a confirmed email or phone."""
    if config.settings.resend_api_key and not contact_verified(user):
        raise ApiError(403, "Please confirm your email address first. We sent you a link; you can resend it from your profile.",
                       code="verify_required")


# ----------------------------------------------------------------- schemas
class ForgotIn(Strict):
    email: str = Field(min_length=3, max_length=200)


class ResetIn(Strict):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=8, max_length=200)


class TokenIn(Strict):
    token: str = Field(min_length=10, max_length=200)


class OtpStartIn(Strict):
    phone: str = Field(min_length=6, max_length=30)
    purpose: str = "login"

    @field_validator("purpose")
    @classmethod
    def _p(cls, v):
        if v not in ("login", "verify"):
            raise ValueError("Unknown purpose")
        return v


class OtpVerifyIn(OtpStartIn):
    code: str = Field(min_length=4, max_length=8)


class PhoneRegisterIn(Strict):
    ticket: str = Field(min_length=10, max_length=200)
    name: str = Field(min_length=2, max_length=120)
    role: str
    city: str | None = Field(default=None, max_length=80)
    region: str | None = Field(default=None, max_length=80)
    organization: OrgCreate | None = None
    accept_terms: bool = False

    @field_validator("role")
    @classmethod
    def _role(cls, v):
        if v not in SELF_SERVICE_ROLES:
            raise ValueError("Choose a valid account type")
        return v

    @field_validator("accept_terms")
    @classmethod
    def _terms(cls, v):
        if not v:
            raise ValueError("Please accept the terms of use, community guidelines and privacy policy")
        return v


# ----------------------------------------------------------------- password reset
async def forgot(request: Request):
    data = await parse(request, ForgotIn)
    email = data.email.strip().lower()
    check_login_throttle(f"forgot|{email}")
    record_failed_login(f"forgot|{email}")  # counts requests: at most 8 per 15 minutes
    user = db.one("SELECT * FROM users WHERE email = ? AND is_suspended = 0", (email,))
    out = {"ok": True, "email_configured": bool(config.settings.resend_api_key)}
    if user and user["password_hash"] != "!":
        token = secrets.token_urlsafe(32)
        db.execute("UPDATE auth_tokens SET used_at = ? WHERE kind = 'reset' AND user_id = ? AND used_at IS NULL",
                   (_iso(_now()), user["id"]))
        _issue("reset", token, user_id=user["id"], target=email, minutes=RESET_MINUTES)
        url = _link("/reset-password", token)
        sent = _mail(email, "Reset your password", "Reset your password",
                     f"Someone asked to reset the password for this ImpactBridge account. The link works for {RESET_MINUTES} minutes.",
                     url, "Choose a new password")
        if not sent and _dev():
            log.warning("Email not configured. Password reset link for %s: %s", email, url)
            out["dev_link"] = url
        audit(user["id"], "user.password_reset_requested", "user", user["id"])
    return ok(out)  # same answer whether or not the account exists


async def reset(request: Request):
    data = await parse(request, ResetIn)
    validate_password_strength(data.password)
    row = _take("reset", data.token)
    user = db.get("users", row["user_id"]) if row["user_id"] else None
    if not user or user["is_suspended"]:
        raise ApiError(400, "This link has expired or was already used. Please request a new one.")
    db.update("users", user["id"], {"password_hash": hash_password(data.password), "email_verified": 1, "updated_at": db.now()})
    db.execute("UPDATE auth_tokens SET used_at = ? WHERE kind = 'reset' AND user_id = ? AND used_at IS NULL",
               (_iso(_now()), user["id"]))
    audit(user["id"], "user.password_reset", "user", user["id"])
    return ok({"ok": True})


# ----------------------------------------------------------------- email verification
async def verify_email(request: Request):
    data = await parse(request, TokenIn)
    row = _take("verify", data.token)
    user = db.get("users", row["user_id"]) if row["user_id"] else None
    if not user or user["email"].lower() != (row["target"] or "").lower():
        raise ApiError(400, "This link no longer matches your account's email. Request a new one from your profile.")
    db.update("users", user["id"], {"email_verified": 1, "updated_at": db.now()})
    audit(user["id"], "user.email_verified", "user", user["id"])
    return ok({"ok": True})


async def resend_verification(request: Request):
    user = require_user(request)
    key = f"verify|{user['id']}"
    check_login_throttle(key)
    record_failed_login(key)
    return ok(send_verification(user))


# ----------------------------------------------------------------- phone codes
async def otp_start(request: Request):
    data = await parse(request, OtpStartIn)
    phone = sms.normalize_phone(data.phone)
    user = None
    if data.purpose == "verify":
        user = require_user(request)
    s = config.settings
    if not s.sms_configured and not _dev():
        raise ApiError(503, "Sign-in with a phone number isn't available yet. Please use your email address.")
    since = _iso(_now() - timedelta(hours=1))
    recent = db.query("SELECT created_at FROM auth_tokens WHERE kind = 'otp' AND target = ? AND created_at > ? ORDER BY created_at DESC",
                      (phone, since))
    if len(recent) >= CODES_PER_HOUR:
        raise ApiError(429, "Too many codes requested for this number. Please try again in an hour.")
    if recent and recent[0]["created_at"] > _iso(_now() - timedelta(seconds=RESEND_SECONDS)):
        raise ApiError(429, "Please wait 30 seconds before asking for another code.")
    code = f"{secrets.randbelow(10**6):06d}"
    db.execute("UPDATE auth_tokens SET used_at = ? WHERE kind = 'otp' AND target = ? AND used_at IS NULL", (_iso(_now()), phone))
    _issue("otp", f"{phone}|{code}", user_id=user["id"] if user else None, target=phone, minutes=CODE_MINUTES)
    out = {"ok": True, "phone": phone, "sms_configured": s.sms_configured}
    if s.sms_configured:
        sms.send_code(phone, code)
    else:
        log.warning("SMS not configured (development). Code for %s: %s", phone, code)
        out["dev_code"] = code
    return ok(out)


async def otp_verify(request: Request):
    from .auth import _session_response, me_payload
    data = await parse(request, OtpVerifyIn)
    phone = sms.normalize_phone(data.phone)
    row = db.one("SELECT * FROM auth_tokens WHERE kind = 'otp' AND target = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1",
                 (phone,))
    if not row or row["expires_at"] < _iso(_now()):
        raise ApiError(400, "This code has expired. Ask for a new one.", field="code")
    if row["attempts"] >= MAX_CODE_ATTEMPTS:
        raise ApiError(429, "Too many wrong codes. Ask for a new one.", field="code")
    if row["secret_hash"] != _h(f"{phone}|{data.code.strip()}"):
        db.execute("UPDATE auth_tokens SET attempts = attempts + 1 WHERE id = ?", (row["id"],))
        raise ApiError(400, "That code isn't right. Check the text message and try again.", field="code")
    db.execute("UPDATE auth_tokens SET used_at = ? WHERE id = ?", (_iso(_now()), row["id"]))
    owner = db.one("SELECT * FROM users WHERE phone = ? AND phone_verified = 1 AND is_suspended = 0", (phone,))

    if data.purpose == "verify":
        user = require_user(request)
        if owner and owner["id"] != user["id"]:
            raise ApiError(409, "This number is already linked to another ImpactBridge account.", field="phone")
        db.update("users", user["id"], {"phone": phone, "phone_verified": 1, "updated_at": db.now()})
        audit(user["id"], "user.phone_verified", "user", user["id"])
        return ok({"user": me_payload(db.get("users", user["id"]))})

    if owner:
        audit(owner["id"], "user.phone_login", "user", owner["id"])
        return _session_response(owner)
    ticket = secrets.token_urlsafe(32)
    _issue("phone_signup", ticket, user_id=None, target=phone, minutes=TICKET_MINUTES)
    return ok({"needs_signup": True, "ticket": ticket, "phone": phone})


async def register_phone(request: Request):
    from .auth import ROLE_TO_ORG_TYPE, _session_response
    data = await parse(request, PhoneRegisterIn)
    row = _take("phone_signup", data.ticket)
    phone = row["target"]
    if db.one("SELECT id FROM users WHERE phone = ? AND phone_verified = 1", (phone,)):
        raise ApiError(409, "This number already has an account. Sign in with it instead.")
    if data.organization and data.role in ROLE_TO_ORG_TYPE and data.organization.org_type not in ROLE_TO_ORG_TYPE[data.role]:
        raise ApiError(422, f"For this account type the organization type must be one of: {', '.join(ROLE_TO_ORG_TYPE[data.role])}.",
                       field="organization.org_type")
    ts = db.now()
    uid = db.new_id()
    with db.transaction():
        db.insert("users", {"id": uid, "email": f"{uid}@phone.invalid", "password_hash": "!", "name": data.name,
                            "role": data.role, "phone": phone, "phone_verified": 1, "city": data.city, "region": data.region,
                            "skills": "[]", "created_at": ts, "updated_at": ts})
        if data.organization:
            org = data.organization
            oid = db.new_id()
            db.insert("organizations", {
                "id": oid, "name": org.name, "org_type": org.org_type, "description": org.description,
                "city": org.city or data.city, "region": org.region or data.region, "website": org.website,
                "registration_number": org.registration_number, "contact_email": org.contact_email,
                "created_by": uid, "created_at": ts, "updated_at": ts})
            db.insert("org_members", {"org_id": oid, "user_id": uid, "member_role": "owner", "created_at": ts})
        audit(uid, "user.registered", "user", uid, role=data.role, method="phone")
    return _session_response(db.get("users", uid), 201)


routes = [
    Route("/api/auth/forgot", forgot, methods=["POST"]),
    Route("/api/auth/reset", reset, methods=["POST"]),
    Route("/api/auth/verify-email", verify_email, methods=["POST"]),
    Route("/api/auth/resend-verification", resend_verification, methods=["POST"]),
    Route("/api/auth/otp/start", otp_start, methods=["POST"]),
    Route("/api/auth/otp/verify", otp_verify, methods=["POST"]),
    Route("/api/auth/register-phone", register_phone, methods=["POST"]),
]
