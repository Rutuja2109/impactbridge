from __future__ import annotations

from starlette.requests import Request
from starlette.routing import Route

from .. import db
from ..domain import ORG_TYPES, PUBLIC_STATUSES
from ..errors import ApiError
from ..models import MemberIn, OrgCreate, OrgUpdate
from ..security import current_user, is_reviewer, require_user
from ..services import projects as P
from ..services.notify import audit, notify
from ..web import ok, parse

PUBLIC_FIELDS = ("id", "name", "org_type", "description", "city", "region", "website",
                 "verification_status", "verified_at", "is_demo", "created_at")


def public_org(o: dict) -> dict:
    out = {k: o[k] for k in PUBLIC_FIELDS}
    out["org_type_label"] = ORG_TYPES.get(o["org_type"], o["org_type"])
    out["is_demo"] = bool(o["is_demo"])
    return out


def _get(org_id: str) -> dict:
    o = db.get("organizations", org_id)
    if not o:
        raise ApiError(404, "Organization not found.")
    return o


def _require_org_admin(user: dict, org_id: str) -> None:
    if P.org_role(user["id"], org_id) not in ("owner", "admin") and not is_reviewer(user):
        raise ApiError(403, "Only organization owners or admins can do this.")


async def create_org(request: Request):
    user = require_user(request)
    data = await parse(request, OrgCreate)
    ts = db.now()
    oid = db.new_id()
    with db.transaction():
        db.insert("organizations", {**data.model_dump(), "id": oid, "created_by": user["id"],
                                    "contact_email": data.contact_email or user["email"],
                                    "created_at": ts, "updated_at": ts})
        db.insert("org_members", {"org_id": oid, "user_id": user["id"], "member_role": "owner", "created_at": ts})
        audit(user["id"], "org.created", "organization", oid)
    return ok({"organization": public_org(db.get("organizations", oid))}, 201)


async def get_org(request: Request):
    user = current_user(request)
    o = _get(request.path_params["org_id"])
    out = public_org(o)
    role = P.org_role(user["id"], o["id"]) if user else None
    out["my_role"] = role
    if role or is_reviewer(user):
        out["registration_number"] = o["registration_number"]
        out["contact_email"] = o["contact_email"]
        out["members"] = db.query(
            """SELECT u.id, u.name, u.email, u.role, m.member_role FROM org_members m
               JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.created_at""", (o["id"],))
        out["verifications"] = db.query(
            "SELECT id, kind, status, reviewer_notes, created_at, reviewed_at FROM verifications WHERE subject_type='organization' AND subject_id = ? ORDER BY created_at DESC",
            (o["id"],))
    projects = db.query(
        f"SELECT * FROM projects WHERE org_id = ? AND is_hidden = 0 AND status IN ({','.join('?' * len(PUBLIC_STATUSES))}) ORDER BY updated_at DESC",
        (o["id"], *PUBLIC_STATUSES))
    out["projects"] = [P.summary(p) for p in projects]
    supported = db.query(
        f"""SELECT DISTINCT p.* FROM commitments c JOIN projects p ON p.id = c.project_id
            WHERE c.org_id = ? AND c.status IN ('accepted','fulfilled') AND p.is_hidden = 0
              AND p.status IN ({','.join('?' * len(PUBLIC_STATUSES))})""", (o["id"], *PUBLIC_STATUSES))
    out["supported_projects"] = [P.summary(p) for p in supported]
    return ok({"organization": out})


async def update_org(request: Request):
    user = require_user(request)
    o = _get(request.path_params["org_id"])
    _require_org_admin(user, o["id"])
    data = await parse(request, OrgUpdate)
    changes = data.model_dump(exclude_unset=True)
    identity_changed = any(k in changes and changes[k] != o[k] for k in ("name", "registration_number"))
    if identity_changed and o["verification_status"] == "verified":
        # identity details changed: verification no longer applies
        changes["verification_status"] = "unverified"
        changes["verified_by"] = None
        changes["verified_at"] = None
    if changes:
        changes["updated_at"] = db.now()
        db.update("organizations", o["id"], changes)
        audit(user["id"], "org.updated", "organization", o["id"], fields=list(changes))
    return ok({"organization": public_org(db.get("organizations", o["id"]))})


async def add_member(request: Request):
    user = require_user(request)
    o = _get(request.path_params["org_id"])
    _require_org_admin(user, o["id"])
    data = await parse(request, MemberIn)
    member = db.one("SELECT * FROM users WHERE email = ?", (data.email,))
    if not member:
        raise ApiError(404, "No ImpactBridge account uses that email. Ask them to register first.", field="email")
    if P.org_role(member["id"], o["id"]):
        raise ApiError(409, "This person is already a member.")
    db.insert("org_members", {"org_id": o["id"], "user_id": member["id"], "member_role": data.member_role,
                              "created_at": db.now()})
    audit(user["id"], "org.member_added", "organization", o["id"], member=member["id"], member_role=data.member_role)
    notify(member["id"], "org_membership", f"You were added to {o['name']}",
           f"{user['name']} added you as {data.member_role}.", f"/organizations/{o['id']}")
    return ok({"ok": True}, 201)


async def remove_member(request: Request):
    user = require_user(request)
    o = _get(request.path_params["org_id"])
    target = request.path_params["user_id"]
    if target != user["id"]:
        _require_org_admin(user, o["id"])
    role = P.org_role(target, o["id"])
    if not role:
        raise ApiError(404, "Member not found.")
    if role == "owner":
        owners = db.scalar("SELECT COUNT(*) FROM org_members WHERE org_id = ? AND member_role = 'owner'", (o["id"],))
        if owners <= 1:
            raise ApiError(400, "An organization must keep at least one owner.")
    db.execute("DELETE FROM org_members WHERE org_id = ? AND user_id = ?", (o["id"], target))
    audit(user["id"], "org.member_removed", "organization", o["id"], member=target)
    return ok()


async def list_orgs(request: Request):
    q = (request.query_params.get("q") or "").strip()
    sql = "SELECT * FROM organizations WHERE 1=1"
    params: list = []
    if q:
        sql += " AND (name LIKE ? OR city LIKE ?)"
        params += [f"%{q}%", f"%{q}%"]
    if request.query_params.get("verified") == "1":
        sql += " AND verification_status = 'verified'"
    sql += " ORDER BY name LIMIT 100"
    return ok({"organizations": [public_org(o) for o in db.query(sql, params)]})


routes = [
    Route("/api/organizations", list_orgs, methods=["GET"]),
    Route("/api/organizations", create_org, methods=["POST"]),
    Route("/api/organizations/{org_id}", get_org, methods=["GET"]),
    Route("/api/organizations/{org_id}", update_org, methods=["PATCH"]),
    Route("/api/organizations/{org_id}/members", add_member, methods=["POST"]),
    Route("/api/organizations/{org_id}/members/{user_id}", remove_member, methods=["DELETE"]),
]
