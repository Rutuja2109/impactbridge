"""Verification, reporting, moderation and the admin console."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from starlette.requests import Request
from starlette.routing import Route

from .. import db
from ..domain import REPORT_REASONS, VERIFICATION_KINDS
from ..errors import ApiError
from ..models import AdminUserIn, ReportIn, ReportResolveIn, VerificationDecisionIn, VerificationRequestIn
from ..security import ALL_ROLES, ROLE_LABELS, require_roles, require_user
from ..services import projects as P
from ..services.notify import audit, notify, notify_many, reviewers
from ..web import ok, parse

KIND_LABELS = {
    "organization_identity": "Organization identity",
    "project_need": "Project need",
    "project_financial": "Financial information",
    "project_completion": "Project completion",
}


def create_verification(kind: str, subject_id: str, requester_id: str, notes: str | None = None,
                        file_ids: list[str] | None = None) -> dict:
    subject_type = VERIFICATION_KINDS[kind]
    if db.one("SELECT id FROM verifications WHERE kind = ? AND subject_id = ? AND status = 'pending'", (kind, subject_id)):
        raise ApiError(409, "A verification request of this type is already pending.")
    vid = db.new_id()
    db.insert("verifications", {"id": vid, "subject_type": subject_type, "subject_id": subject_id, "kind": kind,
                                "requested_by": requester_id, "notes": notes, "file_ids": file_ids or [],
                                "status": "pending", "created_at": db.now()})
    if kind == "organization_identity":
        db.update("organizations", subject_id, {"verification_status": "pending", "updated_at": db.now()})
    audit(requester_id, "verification.requested", subject_type, subject_id, kind=kind, verification=vid)
    notify_many(reviewers(), "review_needed", f"{KIND_LABELS[kind]} verification requested", "", "/admin")
    return db.get("verifications", vid)


async def request_verification(request: Request):
    user = require_user(request)
    data = await parse(request, VerificationRequestIn)
    for fid in data.file_ids:
        f = db.get("files", fid)
        if not f or f["owner_id"] != user["id"]:
            raise ApiError(422, "An attached document could not be found.", field="file_ids")
    if data.kind == "organization_identity":
        org = db.get("organizations", data.subject_id)
        if not org:
            raise ApiError(404, "Organization not found.")
        if P.org_role(user["id"], org["id"]) not in ("owner", "admin"):
            raise ApiError(403, "Only organization owners or admins can request verification.")
        if org["verification_status"] == "verified":
            raise ApiError(409, "This organization is already verified.")
        if not data.file_ids and not org["registration_number"]:
            raise ApiError(422, "Add a registration number or upload a registration document so reviewers can "
                                "check your identity.", field="file_ids")
    else:
        p = P.get_or_404(data.subject_id)
        P.require_manager(user, p)
        if data.kind == "project_need":
            if p["status"] in ("draft", "rejected"):
                raise ApiError(409, "Submit the project before requesting need verification.")
            if p["need_verified"]:
                raise ApiError(409, "The need is already verified.")
        if data.kind == "project_financial":
            if not p["budget_required"]:
                raise ApiError(422, "Add a budget before requesting financial verification.")
            if not data.file_ids:
                raise ApiError(422, "Upload a budget breakdown, quotation or receipts for financial verification.",
                               field="file_ids")
        if data.kind == "project_completion":
            if p["status"] != "completed":
                raise ApiError(409, "Mark the project completed (with an impact report) first.")
    for fid in data.file_ids:
        db.update("files", fid, {"purpose": "verification", "visibility": "reviewers"})
    v = create_verification(data.kind, data.subject_id, user["id"], data.notes, data.file_ids)
    return ok({"verification": v}, 201)


def _verification_view(v: dict) -> dict:
    out = dict(v)
    out["kind_label"] = KIND_LABELS.get(v["kind"], v["kind"])
    req = db.get("users", v["requested_by"])
    out["requested_by_name"] = req["name"] if req else None
    if v["subject_type"] == "organization":
        o = db.get("organizations", v["subject_id"])
        out["subject"] = {"id": o["id"], "name": o["name"], "org_type": o["org_type"], "city": o["city"],
                          "registration_number": o["registration_number"], "website": o["website"],
                          "contact_email": o["contact_email"]} if o else None
    else:
        p = db.get("projects", v["subject_id"])
        out["subject"] = P.summary(p) | {"budget_required": p["budget_required"]} if p else None
        if p and v["kind"] == "project_completion":
            out["impact_report"] = db.one("SELECT * FROM impact_reports WHERE project_id = ?", (p["id"],))
            out["outcomes"] = db.query("SELECT * FROM outcomes WHERE project_id = ?", (p["id"],))
    out["files"] = [{"id": fid, "url": f"/api/files/{fid}", "name": (db.get("files", fid) or {}).get("original_name")}
                    for fid in v["file_ids"]]
    return out


async def list_verifications(request: Request):
    require_roles(request, "admin", "verifier")
    status = request.query_params.get("status", "pending")
    rows = db.query("SELECT * FROM verifications WHERE status = ? ORDER BY created_at", (status,)) if status != "all" \
        else db.query("SELECT * FROM verifications ORDER BY created_at DESC LIMIT 200")
    return ok({"verifications": [_verification_view(v) for v in rows]})


def _conflict(reviewer: dict, v: dict) -> bool:
    if v["requested_by"] == reviewer["id"]:
        return True
    if v["subject_type"] == "organization":
        return P.org_role(reviewer["id"], v["subject_id"]) is not None
    p = db.get("projects", v["subject_id"])
    return bool(p) and (P.is_manager(reviewer, p) or P.is_supporter(reviewer, p))


async def decide_verification(request: Request):
    reviewer = require_roles(request, "admin", "verifier")
    v = db.get("verifications", request.path_params["vid"])
    if not v:
        raise ApiError(404, "Verification request not found.")
    if v["status"] != "pending":
        raise ApiError(409, "This request has already been decided.")
    if _conflict(reviewer, v):
        raise ApiError(403, "You are involved with this subject, so another reviewer must decide.")
    data = await parse(request, VerificationDecisionIn)
    approve = data.decision == "approve"
    ts = db.now()
    with db.transaction():
        db.update("verifications", v["id"], {"status": "approved" if approve else "rejected",
                                             "reviewer_id": reviewer["id"], "reviewer_notes": data.notes,
                                             "reviewed_at": ts})
        link = "/dashboard"
        if v["kind"] == "organization_identity":
            db.update("organizations", v["subject_id"], {
                "verification_status": "verified" if approve else "rejected",
                "verified_by": reviewer["id"] if approve else None, "verified_at": ts if approve else None,
                "updated_at": ts})
            link = f"/organizations/{v['subject_id']}"
        else:
            p = db.get("projects", v["subject_id"])
            link = f"/projects/{p['id']}"
            if v["kind"] == "project_need" and approve:
                db.update("projects", p["id"], {"need_verified": 1, "updated_at": ts})
            elif v["kind"] == "project_financial" and approve:
                db.update("projects", p["id"], {"financial_verified": 1, "updated_at": ts})
            elif v["kind"] == "project_completion":
                report = db.one("SELECT * FROM impact_reports WHERE project_id = ?", (p["id"],))
                if approve:
                    if p["status"] != "completed" or not report:
                        raise ApiError(409, "The project must be completed with an impact report to verify completion.")
                    db.update("impact_reports", report["id"], {
                        "verified": 1, "verified_people_reached": data.verified_people_reached,
                        "verified_volunteers_involved": data.verified_volunteers_involved,
                        "verified_volunteer_hours": data.verified_volunteer_hours,
                        "verified_funds_spent": data.verified_funds_spent,
                        "verification_notes": data.notes, "verified_by": reviewer["id"], "verified_at": ts})
                    for oid, value in (data.verified_outcomes or {}).items():
                        db.execute("UPDATE outcomes SET verified_value = ? WHERE id = ? AND project_id = ?",
                                   (value, oid, p["id"]))
                    db.update("projects", p["id"], {"status": "verified", "completion_verified": 1, "updated_at": ts,
                                                    "review_notes": data.notes})
                    audit(reviewer["id"], "project.verified", "project", p["id"])
                else:
                    db.update("projects", p["id"], {"status": "in_progress", "updated_at": ts, "review_notes": data.notes})
                    audit(reviewer["id"], "project.in_progress", "project", p["id"], reason="completion not verified")
        audit(reviewer["id"], f"verification.{'approved' if approve else 'rejected'}", v["subject_type"],
              v["subject_id"], kind=v["kind"], notes=data.notes)
    label = KIND_LABELS[v["kind"]]
    notify(v["requested_by"], "review_decision",
           f"{label} verification {'approved' if approve else 'not approved'}", data.notes, link)
    if v["kind"] == "project_completion" and approve:
        supporters = [r["supporter_id"] for r in db.query(
            "SELECT DISTINCT supporter_id FROM commitments WHERE project_id = ? AND status IN ('accepted','fulfilled')",
            (v["subject_id"],))]
        notify_many(supporters, "project_status", "A project you supported was independently verified", "", link)
    return ok({"verification": _verification_view(db.get("verifications", v["id"]))})


# ---------------------------------------------------------------- reports ---
async def create_report(request: Request):
    user = require_user(request)
    data = await parse(request, ReportIn)
    table = {"project": "projects", "organization": "organizations", "user": "users", "update": "updates"}[data.subject_type]
    if not db.get(table, data.subject_id):
        raise ApiError(404, "The item you're reporting no longer exists.")
    if db.one("SELECT id FROM reports WHERE reporter_id = ? AND subject_id = ? AND status IN ('open','reviewing')",
              (user["id"], data.subject_id)):
        raise ApiError(409, "You've already reported this. Our reviewers will look at it.")
    rid = db.new_id()
    db.insert("reports", {"id": rid, "reporter_id": user["id"], **data.model_dump(), "status": "open",
                          "created_at": db.now()})
    audit(user["id"], "report.created", data.subject_type, data.subject_id, report=rid, reason=data.reason)
    urgent = data.reason == "safeguarding"
    notify_many(reviewers(), "report", ("URGENT safeguarding report" if urgent else "New report") + f" on a {data.subject_type}",
                REPORT_REASONS[data.reason], "/admin#reports")
    return ok({"report": {"id": rid, "status": "open"}}, 201)


async def list_reports(request: Request):
    require_roles(request, "admin", "verifier")
    status = request.query_params.get("status", "open")
    sql = "SELECT r.*, u.name AS reporter_name FROM reports r JOIN users u ON u.id = r.reporter_id"
    params: list = []
    if status != "all":
        sql += " WHERE r.status IN (?, ?)" if status == "open" else " WHERE r.status = ?"
        params = ["open", "reviewing"] if status == "open" else [status]
    rows = db.query(sql + " ORDER BY (r.reason = 'safeguarding') DESC, r.created_at", params)
    for r in rows:
        r["reason_label"] = REPORT_REASONS.get(r["reason"], r["reason"])
        r["subject_title"] = _subject_title(r["subject_type"], r["subject_id"])
    return ok({"reports": rows})


def _subject_title(kind: str, sid: str) -> str | None:
    if kind == "project":
        p = db.get("projects", sid)
        return p["title"] if p else None
    if kind == "organization":
        o = db.get("organizations", sid)
        return o["name"] if o else None
    if kind == "user":
        u = db.get("users", sid)
        return u["name"] if u else None
    u = db.get("updates", sid)
    return u["title"] if u else None


async def resolve_report(request: Request):
    reviewer = require_roles(request, "admin", "verifier")
    r = db.get("reports", request.path_params["rid"])
    if not r:
        raise ApiError(404, "Report not found.")
    data = await parse(request, ReportResolveIn)
    if data.hide_subject:
        if reviewer["role"] != "admin":
            raise ApiError(403, "Only administrators can hide content or suspend accounts.")
        if r["subject_type"] == "project":
            db.update("projects", r["subject_id"], {"is_hidden": 1, "updated_at": db.now()})
        elif r["subject_type"] == "update":
            db.update("updates", r["subject_id"], {"is_hidden": 1})
        elif r["subject_type"] == "user":
            if r["subject_id"] == reviewer["id"]:
                raise ApiError(400, "You can't suspend your own account.")
            db.update("users", r["subject_id"], {"is_suspended": 1, "updated_at": db.now()})
        elif r["subject_type"] == "organization":
            db.update("organizations", r["subject_id"], {"verification_status": "rejected", "updated_at": db.now()})
    db.update("reports", r["id"], {"status": data.status, "resolution": data.resolution, "handled_by": reviewer["id"],
                                   "handled_at": db.now()})
    audit(reviewer["id"], f"report.{data.status}", r["subject_type"], r["subject_id"], report=r["id"],
          hidden=data.hide_subject, resolution=data.resolution)
    if data.status in ("resolved", "dismissed"):
        notify(r["reporter_id"], "report", "Your report was reviewed", data.resolution, "")
    return ok()


# ------------------------------------------------------------------ admin ---
def _signals() -> list[dict]:
    """Rule-based signals for reviewers. These are prompts to look closer, not judgements."""
    out = []
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    day_ago = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    for p in db.query("""SELECT p.*, u.created_at AS owner_created FROM projects p JOIN users u ON u.id = p.owner_id
                         WHERE p.status NOT IN ('draft','rejected','verified') AND p.is_hidden = 0"""):
        reasons = []
        reports = db.scalar("SELECT COUNT(*) FROM reports WHERE subject_id = ? AND status IN ('open','reviewing')", (p["id"],))
        if reports >= 2:
            reasons.append(f"{reports} open reports")
        if p["owner_created"] > week_ago and (p["budget_required"] or 0) >= 1_000_000:
            reasons.append("Large budget requested by an account less than 7 days old")
        dup = db.scalar("SELECT COUNT(*) FROM projects WHERE lower(title) = lower(?) AND owner_id != ? AND id != ?",
                        (p["title"], p["owner_id"], p["id"]))
        if dup:
            reasons.append("Same title as a project from another account")
        recent = db.scalar("SELECT COUNT(*) FROM projects WHERE owner_id = ? AND submitted_at > ?", (p["owner_id"], day_ago))
        if recent >= 3:
            reasons.append(f"Owner submitted {recent} projects in the last 24 hours")
        if p["budget_required"] and p["beneficiary_count"] and p["budget_required"] / max(p["beneficiary_count"], 1) > 200_000:
            reasons.append("Very high budget per stated beneficiary")
        if reasons:
            out.append({"project": P.summary(p), "signals": reasons})
    return out


async def overview(request: Request):
    require_roles(request, "admin", "verifier")
    submitted = db.query("SELECT * FROM projects WHERE status = 'submitted' ORDER BY submitted_at")
    approved = db.query("SELECT * FROM projects WHERE status = 'approved' ORDER BY updated_at")
    completed = db.query("SELECT * FROM projects WHERE status = 'completed' ORDER BY completed_at")
    return ok({
        "counts": {
            "projects_to_review": len(submitted),
            "pending_verifications": db.scalar("SELECT COUNT(*) FROM verifications WHERE status = 'pending'"),
            "open_reports": db.scalar("SELECT COUNT(*) FROM reports WHERE status IN ('open','reviewing')"),
            "completed_awaiting_verification": len(completed),
            "users": db.scalar("SELECT COUNT(*) FROM users"),
            "organizations": db.scalar("SELECT COUNT(*) FROM organizations"),
        },
        "review_queue": [P.summary(p) | {"submitted_at": p["submitted_at"], "original_description": p["original_description"],
                                          "owner_id": p["owner_id"]} for p in submitted],
        "approved_unpublished": [P.summary(p) for p in approved],
        "signals": _signals(),
    })


async def list_users(request: Request):
    require_roles(request, "admin")
    q = (request.query_params.get("q") or "").strip()
    sql = "SELECT id, name, email, role, city, is_suspended, is_demo, created_at FROM users"
    params: list = []
    if q:
        sql += " WHERE name LIKE ? OR email LIKE ?"
        params = [f"%{q}%", f"%{q}%"]
    return ok({"users": db.query(sql + " ORDER BY created_at DESC LIMIT 200", params), "roles": ROLE_LABELS})


async def edit_user(request: Request):
    admin = require_roles(request, "admin")
    target = db.get("users", request.path_params["uid"])
    if not target:
        raise ApiError(404, "User not found.")
    if target["id"] == admin["id"]:
        raise ApiError(400, "You can't change your own role or suspend yourself.")
    data = await parse(request, AdminUserIn)
    changes = {}
    if data.role is not None:
        if data.role not in ALL_ROLES:
            raise ApiError(422, "Unknown role.", field="role")
        changes["role"] = data.role
    if data.is_suspended is not None:
        changes["is_suspended"] = int(data.is_suspended)
    if changes:
        changes["updated_at"] = db.now()
        db.update("users", target["id"], changes)
        audit(admin["id"], "user.admin_updated", "user", target["id"], **{k: v for k, v in changes.items() if k != "updated_at"})
    return ok()


async def audit_log(request: Request):
    require_roles(request, "admin", "verifier")
    qp = request.query_params
    sql = """SELECT a.*, u.name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE 1=1"""
    params: list = []
    if qp.get("subject_type"):
        sql += " AND a.subject_type = ?"
        params.append(qp["subject_type"])
    if qp.get("subject_id"):
        sql += " AND a.subject_id = ?"
        params.append(qp["subject_id"])
    return ok({"entries": db.query(sql + " ORDER BY a.created_at DESC, a.rowid DESC LIMIT 300", params)})


routes = [
    Route("/api/verifications", request_verification, methods=["POST"]),
    Route("/api/admin/verifications", list_verifications, methods=["GET"]),
    Route("/api/admin/verifications/{vid}/decide", decide_verification, methods=["POST"]),
    Route("/api/reports", create_report, methods=["POST"]),
    Route("/api/admin/reports", list_reports, methods=["GET"]),
    Route("/api/admin/reports/{rid}", resolve_report, methods=["POST"]),
    Route("/api/admin/overview", overview, methods=["GET"]),
    Route("/api/admin/users", list_users, methods=["GET"]),
    Route("/api/admin/users/{uid}", edit_user, methods=["PATCH"]),
    Route("/api/admin/audit", audit_log, methods=["GET"]),
]
