from __future__ import annotations

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from .. import config, db
from ..errors import ApiError
from ..models import DeleteAccountIn, LoginIn, PasswordChangeIn, ProfileIn, RegisterIn
from ..security import (COOKIE_NAME, ROLE_LABELS, check_login_throttle, clear_login_attempts, create_token,
                        hash_password, record_failed_login, require_user, validate_password_strength,
                        verify_password, current_user)
from ..services.notify import audit
from ..web import ok, parse

ROLE_TO_ORG_TYPE = {"club": ("rotary", "rotaract"), "csr": ("csr", "company"), "ngo": ("ngo",),
                    "submitter": ("community", "ngo", "other")}


def me_payload(user: dict) -> dict:
    orgs = db.query(
        """SELECT o.id, o.name, o.org_type, o.verification_status, m.member_role
           FROM org_members m JOIN organizations o ON o.id = m.org_id WHERE m.user_id = ? ORDER BY o.name""",
        (user["id"],))
    unread = db.scalar("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0", (user["id"],))
    s = config.settings
    return {
        "id": user["id"], "email": None if user["email"].endswith(".invalid") else user["email"],
        "name": user["name"], "role": user["role"],
        "email_verified": bool(user["email_verified"]), "phone_verified": bool(user["phone_verified"]),
        "has_password": user["password_hash"] != "!", "language": user["language"],
        "push_notifications": bool(user["push_notifications"]),
        "needs_verification": bool(s.resend_api_key) and not (user["email_verified"] or user["phone_verified"]),
        "role_label": ROLE_LABELS.get(user["role"], user["role"]), "phone": user["phone"],
        "city": user["city"], "region": user["region"], "bio": user["bio"], "skills": user["skills"],
        "email_notifications": bool(user["email_notifications"]), "organizations": orgs,
        "unread_notifications": unread, "created_at": user["created_at"],
    }


def _session_response(user: dict, status: int = 200) -> JSONResponse:
    token = create_token(user["id"])
    resp = JSONResponse({"user": me_payload(user), "token": token}, status_code=status)
    resp.set_cookie(COOKIE_NAME, token, httponly=True, samesite="strict", secure=config.settings.cookie_secure,
                    max_age=config.settings.jwt_ttl_hours * 3600, path="/")
    return resp


async def register(request: Request):
    data = await parse(request, RegisterIn)
    validate_password_strength(data.password)
    fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    from ..security import check_signup_allowed
    if db.one("SELECT id FROM users WHERE email = ?", (data.email,)) is None:
        check_signup_allowed(data.email, fwd or (request.client.host if request.client else "local"))
    if db.one("SELECT id FROM users WHERE email = ?", (data.email,)):
        raise ApiError(409, "An account with this email already exists. Try signing in.", field="email")
    if data.organization and data.role in ROLE_TO_ORG_TYPE and data.organization.org_type not in ROLE_TO_ORG_TYPE[data.role]:
        allowed = ", ".join(ROLE_TO_ORG_TYPE[data.role])
        raise ApiError(422, f"For this account type the organization type must be one of: {allowed}.",
                       field="organization.org_type")
    ts = db.now()
    user = {
        "id": db.new_id(), "email": data.email, "password_hash": hash_password(data.password), "name": data.name,
        "role": data.role, "city": data.city, "region": data.region, "skills": "[]",
        "created_at": ts, "updated_at": ts,
    }
    with db.transaction():
        db.insert("users", user)
        if data.organization:
            org = data.organization
            oid = db.new_id()
            db.insert("organizations", {
                "id": oid, "name": org.name, "org_type": org.org_type, "description": org.description,
                "city": org.city or data.city, "region": org.region or data.region, "website": org.website,
                "registration_number": org.registration_number, "contact_email": org.contact_email or data.email,
                "created_by": user["id"], "created_at": ts, "updated_at": ts})
            db.insert("org_members", {"org_id": oid, "user_id": user["id"], "member_role": "owner", "created_at": ts})
        audit(user["id"], "user.registered", "user", user["id"], role=data.role)
    from .account import send_verification
    send_verification(db.get("users", user["id"]))
    return _session_response(db.get("users", user["id"]), 201)


async def login(request: Request):
    data = await parse(request, LoginIn)
    key = f"{data.email}|{request.client.host if request.client else ''}"
    check_login_throttle(key)
    user = db.one("SELECT * FROM users WHERE email = ?", (data.email,))
    if not user or not verify_password(data.password, user["password_hash"]):
        record_failed_login(key)
        raise ApiError(401, "Incorrect email or password.")
    if user["is_suspended"]:
        raise ApiError(403, "This account has been suspended. Contact the ImpactBridge team for help.")
    clear_login_attempts(key)
    return _session_response(user)


async def logout(request: Request):
    resp = ok()
    resp.delete_cookie(COOKIE_NAME, path="/")
    return resp


async def me(request: Request):
    user = current_user(request)
    if not user:
        return ok({"user": None})
    return ok({"user": me_payload(user)})


async def update_me(request: Request):
    user = require_user(request)
    data = await parse(request, ProfileIn)
    changes = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    if "skills" in changes:
        changes["skills"] = list(dict.fromkeys(s.strip()[:80] for s in changes["skills"] or [] if s.strip()))
    if "email_notifications" in changes:
        changes["email_notifications"] = int(bool(changes["email_notifications"]))
    if "push_notifications" in changes:
        changes["push_notifications"] = int(bool(changes["push_notifications"]))
    if "phone" in changes:
        new = (changes["phone"] or "").strip() or None
        if new:
            from ..services.sms import normalize_phone
            new = normalize_phone(new)
        if new != user["phone"]:
            if user["phone_verified"] and user["password_hash"] == "!":
                raise ApiError(409, "You sign in with this number. Verify a new number from your profile to change it.", field="phone")
            changes["phone_verified"] = 0
        changes["phone"] = new
    if changes:
        changes["updated_at"] = db.now()
        db.update("users", user["id"], changes)
    return ok({"user": me_payload(db.get("users", user["id"]))})


async def change_password(request: Request):
    user = require_user(request)
    data = await parse(request, PasswordChangeIn)
    if not verify_password(data.current_password, user["password_hash"]):
        raise ApiError(400, "Your current password is incorrect.", field="current_password")
    validate_password_strength(data.new_password)
    db.update("users", user["id"], {"password_hash": hash_password(data.new_password), "updated_at": db.now()})
    audit(user["id"], "user.password_changed", "user", user["id"])
    return ok()


async def delete_account(request: Request):
    """Delete the signed-in account (Google Play account-deletion requirement).

    Removes personal data, private drafts and private uploads; withdraws open offers and cancels
    undelivered pledges (owners are notified); anonymises what must stay for public project records."""
    from pathlib import Path
    from ..services import storage
    from ..services.notify import notify
    user = require_user(request)
    data = await parse(request, DeleteAccountIn)
    if user["password_hash"] != "!" and not verify_password(data.password or "", user["password_hash"]):
        raise ApiError(400, "Your password is incorrect.", field="password")
    if user["role"] == "admin" and db.scalar("SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_suspended = 0 AND id != ?", (user["id"],)) == 0:
        raise ApiError(409, "You are the only administrator. Make someone else an administrator before deleting your account.")
    uid, ts = user["id"], db.now()
    to_notify = []
    with db.transaction():
        # private projects (never public) are deleted with their files
        private = db.query("SELECT id FROM projects WHERE owner_id = ? AND status IN ('draft','submitted','needs_information','approved','rejected')", (uid,))
        for p in private:
            for f in db.query("SELECT * FROM files WHERE project_id = ?", (p["id"],)):
                Path(storage.file_path(f)).unlink(missing_ok=True)
                db.execute("DELETE FROM files WHERE id = ?", (f["id"],))
            db.execute("DELETE FROM projects WHERE id = ?", (p["id"],))
        # offers and pledges
        db.execute("UPDATE commitments SET status = 'withdrawn', updated_at = ? WHERE supporter_id = ? AND status IN ('proposed','changes_requested')", (ts, uid))
        for c in db.query("""SELECT c.id, p.owner_id, p.title, p.id AS pid FROM commitments c JOIN projects p ON p.id = c.project_id
                             WHERE c.supporter_id = ? AND c.status = 'accepted' AND p.status IN ('published','in_progress')""", (uid,)):
            db.execute("UPDATE commitments SET status = 'cancelled', owner_message = ?, updated_at = ? WHERE id = ?",
                       ("Cancelled because the supporter deleted their account.", ts, c["id"]))
            to_notify.append((c["owner_id"], c["title"], c["pid"]))
        # uploads: keep only evidence on completed/verified projects (audit trail); delete the rest
        for f in db.query("""SELECT f.* FROM files f LEFT JOIN projects p ON p.id = f.project_id
                             WHERE f.owner_id = ? AND (p.id IS NULL OR p.status NOT IN ('completed','verified'))""", (uid,)):
            Path(storage.file_path(f)).unlink(missing_ok=True)
            db.execute("DELETE FROM files WHERE id = ?", (f["id"],))
        # organization memberships: hand over ownership where needed
        for m in db.query("SELECT org_id, member_role FROM org_members WHERE user_id = ?", (uid,)):
            db.execute("DELETE FROM org_members WHERE org_id = ? AND user_id = ?", (m["org_id"], uid))
            if m["member_role"] == "owner" and not db.scalar("SELECT COUNT(*) FROM org_members WHERE org_id = ? AND member_role = 'owner'", (m["org_id"],)):
                nxt = db.one("SELECT user_id FROM org_members WHERE org_id = ? ORDER BY member_role = 'admin' DESC, created_at LIMIT 1", (m["org_id"],))
                if nxt:
                    db.execute("UPDATE org_members SET member_role = 'owner' WHERE org_id = ? AND user_id = ?", (m["org_id"], nxt["user_id"]))
            db.execute("UPDATE organizations SET contact_email = NULL WHERE id = ? AND lower(contact_email) = lower(?)", (m["org_id"], user["email"]))
        db.execute("DELETE FROM notifications WHERE user_id = ?", (uid,))
        db.execute("DELETE FROM project_interests WHERE user_id = ?", (uid,))
        db.execute("DELETE FROM push_subscriptions WHERE user_id = ?", (uid,))
        db.update("users", uid, {"email": f"deleted+{uid}@deleted.invalid", "name": "Deleted user", "password_hash": "!",
                                 "phone": None, "city": None, "region": None, "bio": None, "skills": "[]",
                                 "is_suspended": 1, "email_notifications": 0, "phone_verified": 0, "email_verified": 0, "updated_at": ts})
        audit(uid, "user.deleted", "user", uid, private_projects_deleted=len(private))
    for owner_id, title, pid in to_notify:
        notify(owner_id, "commitment", "A supporter deleted their account",
               f"Their pledge to {title} was cancelled. Totals have been updated.", f"/projects/{pid}", email=False)
    resp = ok()
    resp.delete_cookie(COOKIE_NAME, path="/")
    return resp


routes = [
    Route("/api/auth/register", register, methods=["POST"]),
    Route("/api/auth/login", login, methods=["POST"]),
    Route("/api/auth/logout", logout, methods=["POST"]),
    Route("/api/auth/me", me, methods=["GET"]),
    Route("/api/auth/me", update_me, methods=["PATCH"]),
    Route("/api/auth/password", change_password, methods=["POST"]),
    Route("/api/auth/delete-account", delete_account, methods=["POST"]),
]
