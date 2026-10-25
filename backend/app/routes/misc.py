"""Metadata, notifications, dashboards and impact reporting."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from pydantic import Field
from starlette.requests import Request
from starlette.routing import Route

from .. import config, db
from ..errors import ApiError
from ..domain import CAUSES, COMMITMENT_KINDS, ORG_TYPES, PROJECT_STATUSES, PUBLIC_STATUSES, REPORT_REASONS
from ..models import Strict
from ..security import ROLE_LABELS, SELF_SERVICE_ROLES, is_reviewer, require_user
from ..services import projects as P
from ..services import resources
from ..services.notify import sweep_deadlines
from ..web import ok, parse


async def meta(request: Request):
    return ok({
        "causes": CAUSES, "org_types": ORG_TYPES, "commitment_kinds": COMMITMENT_KINDS,
        "statuses": PROJECT_STATUSES, "report_reasons": REPORT_REASONS, "currency": config.settings.currency,
        "roles": {k: ROLE_LABELS[k] for k in SELF_SERVICE_ROLES}, "integrations": config.settings.integrations(), "require_project_photo": config.settings.require_project_photo,
        "support_email": config.settings.support_email or None,
        "support_whatsapp": config.settings.support_whatsapp or None,
    })


async def list_notifications(request: Request):
    user = require_user(request)
    limit = max(1, min(100, int(request.query_params.get("limit") or 100)))
    rows = db.query("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?", (user["id"], limit))
    unread = db.scalar("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0", (user["id"],))
    return ok({"notifications": rows, "unread": unread})


class ReadIn(Strict):
    ids: list[str] = Field(default_factory=list, max_length=200)
    all: bool = False


async def mark_read(request: Request):
    user = require_user(request)
    data = await parse(request, ReadIn)
    if data.all:
        db.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (user["id"],))
    else:
        for nid in data.ids:
            db.execute("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?", (nid, user["id"]))
    return ok()


async def dashboard(request: Request):
    user = require_user(request)
    sweep_deadlines()
    today = datetime.now(timezone.utc).date()
    horizon = (today + timedelta(days=30)).isoformat()

    my_projects = db.query(
        """SELECT DISTINCT p.* FROM projects p LEFT JOIN org_members m ON m.org_id = p.org_id AND m.user_id = ?
           WHERE p.owner_id = ? OR m.member_role IN ('owner','admin') ORDER BY p.updated_at DESC""",
        (user["id"], user["id"]))
    my_ids = [p["id"] for p in my_projects]
    incoming = []
    gaps = []
    for p in my_projects:
        res = resources.compute(p)
        if p["status"] in ("published", "in_progress") and res["open_gaps"]:
            gaps.append({"project": {"id": p["id"], "title": p["title"]}, "gaps": res["open_gaps"]})
        for c in db.query("SELECT * FROM commitments WHERE project_id = ? AND status = 'proposed' ORDER BY created_at", (p["id"],)):
            incoming.append(P.serialize_commitment(c, user, p, True) | {"project": {"id": p["id"], "title": p["title"]}})

    mine = db.query(
        """SELECT c.*, p.title AS ptitle, p.status AS pstatus FROM commitments c JOIN projects p ON p.id = c.project_id
           WHERE c.supporter_id = ? ORDER BY c.updated_at DESC""", (user["id"],))
    my_commitments = [{
        "id": c["id"], "kind": c["kind"], "quantity": c["quantity"], "item": c["item"], "unit": c["unit"],
        "status": c["status"], "deadline": c["deadline"], "received_quantity": c["received_quantity"],
        "owner_message": c["owner_message"], "project": {"id": c["project_id"], "title": c["ptitle"], "status": c["pstatus"]},
    } for c in mine]
    supported_ids = list({c["project_id"] for c in mine if c["status"] in ("accepted", "fulfilled")})

    related = list(dict.fromkeys(my_ids + supported_ids))
    upcoming = []
    if related:
        marks = ",".join("?" * len(related))
        for m in db.query(
                f"""SELECT m.*, p.title AS ptitle FROM milestones m JOIN projects p ON p.id = m.project_id
                    WHERE m.project_id IN ({marks}) AND m.status != 'done' AND m.due_date IS NOT NULL AND m.due_date <= ?
                      AND p.status IN ('published','in_progress') ORDER BY m.due_date""", (*related, horizon)):
            upcoming.append({"type": "milestone", "title": m["title"], "date": m["due_date"],
                             "overdue": m["due_date"] < today.isoformat(),
                             "project": {"id": m["project_id"], "title": m["ptitle"]}})
        for c in db.query(
                f"""SELECT c.*, p.title AS ptitle FROM commitments c JOIN projects p ON p.id = c.project_id
                    WHERE c.project_id IN ({marks}) AND c.status = 'accepted' AND c.deadline IS NOT NULL AND c.deadline <= ?
                    ORDER BY c.deadline""", (*related, horizon)):
            upcoming.append({"type": "commitment", "title": f"{COMMITMENT_KINDS[c['kind']]} due", "date": c["deadline"],
                             "overdue": c["deadline"] < today.isoformat(),
                             "project": {"id": c["project_id"], "title": c["ptitle"]}})
    upcoming.sort(key=lambda u: u["date"])

    completed = [P.summary(p) for p in my_projects if p["status"] in ("completed", "verified")]
    if supported_ids:
        marks = ",".join("?" * len(supported_ids))
        completed += [P.summary(p) | {"as_supporter": True} for p in db.query(
            f"SELECT * FROM projects WHERE id IN ({marks}) AND status IN ('completed','verified')", supported_ids)]

    out = {
        "role": user["role"],
        "my_projects": [P.summary(p) | {"review_notes": p["review_notes"]} for p in my_projects],
        "incoming_proposals": incoming,
        "my_commitments": my_commitments,
        "resource_gaps": gaps,
        "upcoming": upcoming,
        "completed": completed,
        "notifications": db.query("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 8",
                                  (user["id"],)),
        "organizations": db.query(
            """SELECT o.id, o.name, o.org_type, o.verification_status, m.member_role FROM org_members m
               JOIN organizations o ON o.id = m.org_id WHERE m.user_id = ?""", (user["id"],)),
        "stats": {
            "money_pledged": sum(c["quantity"] for c in mine if c["kind"] == "money" and c["status"] in ("accepted", "fulfilled")),
            "money_delivered": sum(c["received_quantity"] or 0 for c in mine if c["kind"] == "money" and c["status"] in ("accepted", "fulfilled")),
            "volunteer_places": sum(c["quantity"] for c in mine if c["kind"] == "volunteers" and c["status"] in ("accepted", "fulfilled")),
            "projects_supported": len(supported_ids),
            "projects_managed": len(my_projects),
            "projects_completed": len({p["id"] for p in completed}),
            "pending_offers": len(incoming),
        },
        "volunteer_hours_pledged": sum((c["hours"] or 0) * (c["quantity"] or 0) for c in mine
                                       if c["kind"] == "volunteers" and c["status"] in ("accepted", "fulfilled")),
    }
    if is_reviewer(user):
        out["review_counts"] = {
            "projects_to_review": db.scalar("SELECT COUNT(*) FROM projects WHERE status = 'submitted'"),
            "pending_verifications": db.scalar("SELECT COUNT(*) FROM verifications WHERE status = 'pending'"),
            "open_reports": db.scalar("SELECT COUNT(*) FROM reports WHERE status IN ('open','reviewing')"),
        }
    return ok(out)


async def impact(request: Request):
    """Platform impact computed from recorded data. Demo projects are excluded unless asked for."""
    include_demo = request.query_params.get("include_demo") == "1"
    demo = "" if include_demo else " AND p.is_demo = 0"
    statuses = ",".join(f"'{s}'" for s in PUBLIC_STATUSES)
    rows = db.query(f"""SELECT r.* FROM impact_reports r JOIN projects p ON p.id = r.project_id
                        WHERE p.is_hidden = 0 AND p.status IN ('completed','verified'){demo}""")
    verified = [r for r in rows if r["verified"]]

    def s(rs, key):
        vals = [r[key] for r in rs if r[key] is not None]
        return sum(vals) if vals else 0

    pledged = db.one(f"""SELECT
            COALESCE(SUM(CASE WHEN c.kind='money' THEN c.quantity END),0) AS money,
            COALESCE(SUM(CASE WHEN c.kind='volunteers' THEN c.quantity END),0) AS volunteers,
            COALESCE(SUM(CASE WHEN c.kind='money' THEN c.received_quantity END),0) AS money_received
        FROM commitments c JOIN projects p ON p.id = c.project_id
        WHERE c.status IN ('accepted','fulfilled') AND p.is_hidden = 0 AND p.status IN ({statuses}){demo}""")
    counts = db.one(f"""SELECT
            SUM(CASE WHEN p.status IN ('published','in_progress') THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN p.status = 'verified' THEN 1 ELSE 0 END) AS verified
        FROM projects p WHERE p.is_hidden = 0{demo}""")
    return ok({
        "includes_demo": include_demo,
        "projects": {k: counts[k] or 0 for k in ("active", "completed", "verified")},
        "pledged": pledged,
        "reported": {
            "projects": len(rows), "people_reached": s(rows, "people_reached"),
            "volunteers_involved": s(rows, "volunteers_involved"), "volunteer_hours": s(rows, "volunteer_hours"),
            "funds_spent": s(rows, "funds_spent"),
        },
        "verified": {
            "projects": len(verified), "people_reached": s(verified, "verified_people_reached"),
            "volunteers_involved": s(verified, "verified_volunteers_involved"),
            "volunteer_hours": s(verified, "verified_volunteer_hours"),
            "funds_spent": s(verified, "verified_funds_spent"),
        },
        "currency": config.settings.currency,
    })


async def activity(request: Request):
    """Recent real events on public projects, for the home page. Individuals appear by first name only."""
    from ..services.projects import supporter_label
    marks = ",".join("?" * len(PUBLIC_STATUSES))
    vis = f"p.is_hidden = 0 AND p.status IN ({marks})"
    if not config.settings.show_demo_publicly:
        vis += " AND p.is_demo = 0"
    ev = []
    for r in db.query(f"SELECT p.id, p.title, p.city, p.published_at AS at, p.is_demo FROM projects p WHERE {vis} AND p.published_at IS NOT NULL ORDER BY p.published_at DESC LIMIT 8", PUBLIC_STATUSES):
        ev.append({"kind": "published", "at": r["at"], "text": f"New need in {r['city'] or 'a community'}", "project": r})
    for c in db.query(f"SELECT c.*, p.title, p.city, p.is_demo FROM commitments c JOIN projects p ON p.id = c.project_id WHERE {vis} AND c.status IN ('accepted','fulfilled') ORDER BY c.updated_at DESC LIMIT 8", PUBLIC_STATUSES):
        what = {"money": "funding", "volunteers": f"{int(c['quantity'])} volunteer(s)", "materials": c["item"] or "materials",
                "equipment": c["item"] or "equipment", "skills": c["item"] or "skills"}[c["kind"]]
        ev.append({"kind": "pledge", "at": c["updated_at"], "text": f"{supporter_label(c)} committed {what}",
                   "project": {"id": c["project_id"], "title": c["title"], "city": c["city"], "is_demo": c["is_demo"]}})
    for u in db.query(f"SELECT u.created_at AS at, u.title AS utitle, p.id, p.title, p.city, p.is_demo FROM updates u JOIN projects p ON p.id = u.project_id WHERE {vis} AND u.is_hidden = 0 ORDER BY u.created_at DESC LIMIT 8", PUBLIC_STATUSES):
        ev.append({"kind": "update", "at": u["at"], "text": f"Update: {u['utitle']}",
                   "project": {"id": u["id"], "title": u["title"], "city": u["city"], "is_demo": u["is_demo"]}})
    for v in db.query(f"SELECT v.reviewed_at AS at, v.kind, p.id, p.title, p.city, p.is_demo FROM verifications v JOIN projects p ON p.id = v.subject_id WHERE v.subject_type = 'project' AND v.status = 'approved' AND {vis} ORDER BY v.reviewed_at DESC LIMIT 8", PUBLIC_STATUSES):
        ev.append({"kind": "verified", "at": v["at"], "text": {"project_need": "Need verified", "project_financial": "Budget checked",
                   "project_completion": "Completion verified"}.get(v["kind"], "Verified"),
                   "project": {"id": v["id"], "title": v["title"], "city": v["city"], "is_demo": v["is_demo"]}})
    for e in ev:
        e["project"] = {k: e["project"][k] for k in ("id", "title", "city")} | {"is_demo": bool(e["project"]["is_demo"])}
    rank = {"verified": 3, "pledge": 2, "update": 1, "published": 0}  # same-second ties: later stages first
    ev.sort(key=lambda e: (e["at"] or "", rank.get(e["kind"], 0)), reverse=True)
    return ok({"events": ev[:10]})


async def health(request: Request):
    db.scalar("SELECT 1")
    return ok({"status": "ok"})


class PushSubIn(Strict):
    endpoint: str = Field(min_length=10, max_length=1000)


async def push_key(request: Request):
    return ok({"key": config.settings.vapid_public or None})


async def push_subscribe(request: Request):
    from ..services.push import endpoint_allowed
    user = require_user(request)
    data = await parse(request, PushSubIn)
    if not config.settings.push_configured:
        raise ApiError(503, "Push notifications aren't set up on this server yet.")
    if not endpoint_allowed(data.endpoint):
        raise ApiError(422, "This browser's push service isn't supported.", field="endpoint")
    db.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (data.endpoint,))
    db.insert("push_subscriptions", {"id": db.new_id(), "user_id": user["id"], "endpoint": data.endpoint, "created_at": db.now()})
    return ok({"ok": True})


async def push_unsubscribe(request: Request):
    user = require_user(request)
    data = await parse(request, PushSubIn)
    db.execute("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", (data.endpoint, user["id"]))
    return ok({"ok": True})


routes = [
    Route("/api/push/key", push_key, methods=["GET"]),
    Route("/api/push/subscribe", push_subscribe, methods=["POST"]),
    Route("/api/push/unsubscribe", push_unsubscribe, methods=["POST"]),
    Route("/api/meta", meta, methods=["GET"]),
    Route("/api/health", health, methods=["GET"]),
    Route("/api/notifications", list_notifications, methods=["GET"]),
    Route("/api/notifications/read", mark_read, methods=["POST"]),
    Route("/api/dashboard", dashboard, methods=["GET"]),
    Route("/api/impact", impact, methods=["GET"]),
    Route("/api/activity", activity, methods=["GET"]),
]
