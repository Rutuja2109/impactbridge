"""Project loading, permission checks and serialisation."""
from __future__ import annotations

from .. import db
from ..domain import CAUSES, PUBLIC_STATUSES
from ..errors import ApiError
from ..security import is_reviewer
from . import resources, storage


def get_or_404(project_id: str) -> dict:
    p = db.get("projects", project_id)
    if not p:
        raise ApiError(404, "Project not found.")
    return p


def org_role(user_id: str, org_id: str | None) -> str | None:
    if not org_id:
        return None
    row = db.one("SELECT member_role FROM org_members WHERE org_id = ? AND user_id = ?", (org_id, user_id))
    return row["member_role"] if row else None


def is_manager(user: dict | None, p: dict) -> bool:
    """Owner, or an owner/admin of the organization the project belongs to."""
    if not user:
        return False
    if p["owner_id"] == user["id"]:
        return True
    return org_role(user["id"], p["org_id"]) in ("owner", "admin")


def is_supporter(user: dict | None, p: dict) -> bool:
    if not user:
        return False
    return bool(db.one(
        "SELECT 1 FROM commitments WHERE project_id = ? AND supporter_id = ? AND status IN ('accepted','fulfilled')",
        (p["id"], user["id"])))


def is_team(user: dict | None, p: dict) -> bool:
    return is_manager(user, p) or is_supporter(user, p) or is_reviewer(user)


def can_view(user: dict | None, p: dict) -> bool:
    if is_reviewer(user) or is_manager(user, p):
        return True
    if p["is_hidden"]:
        return False
    return p["status"] in PUBLIC_STATUSES


def require_view(user, p) -> None:
    if not can_view(user, p):
        raise ApiError(404, "Project not found.")


def require_manager(user, p) -> None:
    if not is_manager(user, p):
        raise ApiError(403, "Only the project owner or its organization admins can do this.")


def poster_label(p: dict) -> str:
    """Who posted a need, as shown on cards: the organisation's name, or the person's first name only."""
    if p["org_id"]:
        o = db.get("organizations", p["org_id"])
        if o:
            return o["name"]
    u = db.get("users", p["owner_id"]) if p["owner_id"] else None
    return (u["name"] or "").split(" ")[0] if u and u["name"] else ""


def _org_summary(org_id: str | None) -> dict | None:
    if not org_id:
        return None
    o = db.get("organizations", org_id)
    if not o:
        return None
    return {"id": o["id"], "name": o["name"], "org_type": o["org_type"],
            "verification_status": o["verification_status"], "is_demo": bool(o["is_demo"])}


def _user_summary(user_id: str) -> dict | None:
    u = db.get("users", user_id)
    if not u:
        return None
    return {"id": u["id"], "name": u["name"], "role": u["role"]}


def cover_photo(project_id: str) -> str | None:
    row = db.one("""SELECT id FROM files WHERE project_id = ? AND purpose = 'need_photo' AND visibility = 'public'
                    ORDER BY created_at LIMIT 1""", (project_id,))
    return f"/api/files/{row['id']}" if row else None


def _coord():
    from ..routes import coordination
    return coordination


def effort_level(p: dict) -> str:
    """Rough effort for supporters: light (short, few people), heavy (long or many people), else medium."""
    dur, vols = p.get("duration_weeks"), p.get("volunteers_required")
    if (dur or 0) > 8 or (vols or 0) > 20:
        return "heavy"
    if (dur is None or dur <= 2) and (vols is None or vols <= 5):
        return "light"
    return "medium"


def summary(p: dict, res: dict | None = None) -> dict:
    res = res or resources.compute(p)
    return {
        "id": p["id"], "title": p["title"], "status": p["status"], "cause": p["cause"],
        "cause_label": CAUSES.get(p["cause"] or "", None),
        "city": p["city"], "region": p["region"],
        "problem_excerpt": (p["problem_statement"] or "")[:220],
        "story": (p["story"] or "")[:600],
        "budget_required": p["budget_required"], "volunteers_required": p["volunteers_required"],
        "duration_weeks": p["duration_weeks"], "start_date": p["start_date"], "end_date": p["end_date"],
        "effort": effort_level(p), "posted_by": poster_label(p),
        "time_commitment": p["time_commitment"],
        "skills": p["skills"], "materials": p["materials"],
        "need_verified": bool(p["need_verified"]), "completion_verified": bool(p["completion_verified"]),
        "financial_verified": bool(p["financial_verified"]),
        "allow_multiple_supporters": bool(p["allow_multiple_supporters"]),
        "is_demo": bool(p["is_demo"]),
        "organization": _org_summary(p["org_id"]),
        "funding": {"requested": res["money"]["requested"], "pledged": res["money"]["pledged"], "gap": res["money"]["gap"]},
        "volunteers": {"requested": res["volunteers"]["requested"], "pledged": res["volunteers"]["pledged"],
                       "gap": res["volunteers"]["gap"]},
        "supporter_count": res["supporter_count"],
        "supporters_preview": supporters_preview(p["id"]),
        "cover_photo": cover_photo(p["id"]),
        "updated_at": p["updated_at"], "published_at": p["published_at"],
        "last_activity_at": last_activity(p),
        "open_items": [{"name": m["name"], "gap": m["gap"], "unit": m["unit"]} for m in res["materials"]
                       if m["gap"] is None or m["gap"] > 0][:4],
        "open_skills": [s["skill"] for s in res["skills"] if not s["pledged"]][:4],
    }


def supporters_preview(project_id: str, limit: int = 3) -> list[str]:
    """Names shown as small avatars on project cards: organisation name, or a person's first name only."""
    out: list[str] = []
    for c in db.query("""SELECT supporter_id, org_id, is_anonymous FROM commitments WHERE project_id = ? AND status IN ('accepted','fulfilled')
                         AND is_anonymous = 0 ORDER BY created_at""", (project_id,)):
        label = None
        if c["org_id"]:
            o = db.get("organizations", c["org_id"])
            label = o["name"] if o else None
        if not label:
            u = db.get("users", c["supporter_id"])
            label = (u["name"].split()[0] if u and u["name"] else None)
        if label and label not in out:
            out.append(label)
        if len(out) >= limit:
            break
    return out


def last_activity(p: dict) -> str | None:
    """Most recent public sign of life: publication, an update, a milestone done, or an accepted pledge."""
    candidates = [p["published_at"]]
    candidates.append(db.scalar("SELECT MAX(created_at) FROM updates WHERE project_id = ? AND is_hidden = 0", (p["id"],)))
    candidates.append(db.scalar("SELECT MAX(completed_at) FROM milestones WHERE project_id = ?", (p["id"],)))
    candidates.append(db.scalar("SELECT MAX(updated_at) FROM commitments WHERE project_id = ? AND status IN ('accepted','fulfilled')", (p["id"],)))
    vals = [c for c in candidates if c]
    return max(vals) if vals else None


def supporter_label(c: dict) -> str:
    """Organizations are named; individuals are shown by first name only on public surfaces; anonymous pledges stay anonymous."""
    if c.get("is_anonymous"):
        return "A kind neighbour"
    if c.get("org_id"):
        o = db.get("organizations", c["org_id"])
        if o:
            return o["name"]
    u = db.get("users", c["supporter_id"])
    return (u["name"].split()[0] if u else "A supporter")


def timeline(p: dict, user) -> list[dict]:
    """A dated proof feed: what happened on this project, newest first, from records only."""
    ev: list[dict] = []
    if p["published_at"]:
        ev.append({"at": p["published_at"], "kind": "published", "title": "Project published",
                   "body": "Approved by a reviewer and opened for support."})
    for c in db.query("SELECT * FROM commitments WHERE project_id = ? AND status IN ('accepted','fulfilled')", (p["id"],)):
        what = {"money": "funding", "volunteers": "volunteers", "materials": "materials", "equipment": "equipment",
                "skills": "skills"}[c["kind"]]
        ev.append({"at": c["updated_at"] if c["status"] == "fulfilled" else c["created_at"],
                   "kind": "delivered" if c["status"] == "fulfilled" else "pledge",
                   "title": f"{supporter_label(c)} {'delivered' if c['status'] == 'fulfilled' else 'committed'} {what}",
                   "commitment": {"kind": c["kind"], "quantity": c["quantity"], "item": c["item"], "unit": c["unit"],
                                  "hours": c["hours"]}})
    for m in db.query("SELECT * FROM milestones WHERE project_id = ? AND status = 'done' AND completed_at IS NOT NULL", (p["id"],)):
        ev.append({"at": m["completed_at"], "kind": "milestone", "title": f"Milestone completed: {m['title']}", "body": m["description"] or ""})
    for u in db.query("SELECT * FROM updates WHERE project_id = ? AND is_hidden = 0", (p["id"],)):
        a = db.get("users", u["author_id"])
        files = [storage.public_file(f) for f in (db.get("files", fid) for fid in u["file_ids"]) if f and can_view_file(user, f, p)]
        ev.append({"at": u["created_at"], "kind": "update", "title": u["title"], "body": u["body"],
                   "author": a["name"] if a else None, "files": files})
    for v in db.query("SELECT * FROM verifications WHERE subject_type = 'project' AND subject_id = ? AND status = 'approved'", (p["id"],)):
        label = {"project_need": "Need verified by a reviewer", "project_financial": "Budget checked by a reviewer",
                 "project_completion": "Completion independently verified"}.get(v["kind"], "Verified")
        ev.append({"at": v["reviewed_at"], "kind": "verified", "title": label, "body": v["reviewer_notes"] or ""})
    r = db.one("SELECT * FROM impact_reports WHERE project_id = ?", (p["id"],))
    if r:
        ev.append({"at": r["submitted_at"], "kind": "report", "title": "Impact report submitted",
                   "body": (r["summary"] or "")[:300]})
    ev.sort(key=lambda e: e["at"] or "", reverse=True)
    return ev


def visible_files(user, p: dict, purpose: str | None = None) -> list[dict]:
    rows = db.query("SELECT * FROM files WHERE project_id = ? ORDER BY created_at", (p["id"],))
    out = []
    for f in rows:
        if purpose and f["purpose"] != purpose:
            continue
        if can_view_file(user, f, p):
            out.append(storage.public_file(f))
    return out


def can_view_file(user, f: dict, p: dict | None = None) -> bool:
    if user and (f["owner_id"] == user["id"] or is_reviewer(user)):
        return True
    if f["org_id"] and not f["project_id"]:
        return bool(user) and org_role(user["id"], f["org_id"]) is not None and f["visibility"] != "reviewers"
    if p is None and f["project_id"]:
        p = db.get("projects", f["project_id"])
    if p is None:
        return False
    if f["visibility"] == "public":
        return can_view(user, p)
    if f["visibility"] == "team":
        return is_team(user, p)
    return is_manager(user, p)  # reviewers-only files: owner side + reviewers


def detail(p: dict, user: dict | None) -> dict:
    commitments = db.query("SELECT * FROM commitments WHERE project_id = ? ORDER BY created_at", (p["id"],))
    report = db.one("SELECT * FROM impact_reports WHERE project_id = ?", (p["id"],))
    res = resources.compute(p, commitments, report)
    manager = is_manager(user, p)
    team = is_team(user, p)
    reviewer = is_reviewer(user)
    out = summary(p, res)
    sensitive = p["involves_children"] or p["involves_vulnerable"]
    from ..routes.safety import blocked_ids
    _blocked = blocked_ids(user["id"]) if user else set()
    out.update({
        "problem_statement": p["problem_statement"],
        "proposed_solution": p["proposed_solution"],
        "story": p["story"] or "",
        "beneficiaries": p["beneficiaries"],
        "beneficiary_count": p["beneficiary_count"],
        "location_detail": p["location_detail"] if (team or not sensitive) else None,
        "location_detail_hidden": bool(sensitive and not team and p["location_detail"]),
        "time_commitment": p["time_commitment"],
        "end_date": p["end_date"],
        "involves_children": bool(p["involves_children"]),
        "involves_vulnerable": bool(p["involves_vulnerable"]),
        "safeguarding_notes": p["safeguarding_notes"] if team else None,
        "ai_assisted": bool(p["ai_assisted"]),
        "owner": _user_summary(p["owner_id"]),
        "resources": res,
        "milestones": db.query("SELECT * FROM milestones WHERE project_id = ? ORDER BY sort_order, due_date", (p["id"],)),
        "outcomes": db.query("SELECT * FROM outcomes WHERE project_id = ? ORDER BY created_at", (p["id"],)),
        "checklist": db.query("SELECT * FROM checklist_items WHERE project_id = ? ORDER BY created_at", (p["id"],)),
        "updates": [
            {**u, "author": _user_summary(u["author_id"]),
             "files": [storage.public_file(f) for f in (db.get("files", fid) for fid in u["file_ids"]) if f
                       and can_view_file(user, f, p)]}
            for u in db.query("SELECT * FROM updates WHERE project_id = ? AND is_hidden = 0 ORDER BY created_at DESC", (p["id"],))
            if u["author_id"] not in _blocked
        ],
        "blocked_owner": bool(user) and p["owner_id"] in _blocked,
        "effort": effort_level(p),
        "interest": _coord().interest_info(p, user),
        "can_chat": _coord().chat_access(user, p),
        "photos": visible_files(user, p, "need_photo"),
        "evidence": visible_files(user, p, "evidence") + visible_files(user, p, "impact"),
        "impact_report": report,
        "timeline": timeline(p, user),
        "verifications": db.query(
            "SELECT id, kind, status, reviewer_notes, created_at, reviewed_at FROM verifications WHERE subject_type='project' AND subject_id = ? ORDER BY created_at DESC",
            (p["id"],)) if (manager or reviewer) else [],
        "participants": _participants(commitments),
        "wall": _wall(commitments),
        "permissions": {
            "is_manager": manager, "is_team": team, "is_reviewer": reviewer,
            "can_edit": manager and p["status"] in ("draft", "needs_information"),
            "can_support": bool(user) and not manager and p["status"] in ("published", "in_progress") and p["owner_id"] not in _blocked,
        },
    })
    if manager or reviewer:
        out["original_description"] = p["original_description"]
        out["missing_info"] = p["missing_info"]
        out["follow_up_questions"] = p["follow_up_questions"]
        out["review_notes"] = p["review_notes"]
    out["commitments"] = [serialize_commitment(c, user, p, manager) for c in commitments
                          if manager or reviewer or (user and c["supporter_id"] == user["id"])
                          or c["status"] in ("accepted", "fulfilled")]
    return out


def _participants(commitments: list[dict]) -> list[dict]:
    seen, out = set(), []
    for c in commitments:
        if c["status"] not in ("accepted", "fulfilled"):
            continue
        key = c["org_id"] or c["supporter_id"]
        if key in seen:
            continue
        seen.add(key)
        if c.get("is_anonymous"):
            out.append({"type": "individual", "id": None, "name": "A kind neighbour", "role": None})
        elif c["org_id"]:
            org = _org_summary(c["org_id"])
            out.append({"type": "organization", **(org or {})})
        else:
            u = _user_summary(c["supporter_id"])
            out.append({"type": "individual", "id": u["id"], "name": u["name"], "role": u["role"]})
    return out


def _wall(commitments: list[dict]) -> list[dict]:
    """The public 'supporters' list: who stepped in, what they gave and the kind words they left (anonymous people stay anonymous)."""
    out = []
    for c in commitments:
        if c["status"] not in ("accepted", "fulfilled"):
            continue
        anon = bool(c.get("is_anonymous"))
        org = None if anon else _org_summary(c["org_id"]) if c["org_id"] else None
        u = _user_summary(c["supporter_id"])
        out.append({
            "name": "A kind neighbour" if anon else (org["name"] if org else u["name"]),
            "type": "organization" if org else "individual", "org_id": org["id"] if org else None,
            "anonymous": anon, "kind": c["kind"], "quantity": c["quantity"], "unit": c["unit"], "item": c["item"],
            "message": (c["description"] or "")[:200] or None, "at": c["updated_at"],
        })
    return sorted(out, key=lambda x: x["at"] or "", reverse=True)


def serialize_commitment(c: dict, user, p: dict, manager: bool | None = None) -> dict:
    manager = is_manager(user, p) if manager is None else manager
    mine = bool(user) and c["supporter_id"] == user["id"]
    out = {k: c[k] for k in ("id", "project_id", "kind", "quantity", "item", "unit", "hours", "description",
                             "deadline", "status", "received_quantity", "spent_amount", "responsibility",
                             "created_at", "updated_at")}
    out["is_anonymous"] = bool(c.get("is_anonymous"))
    out["supporter"] = _user_summary(c["supporter_id"])
    out["organization"] = _org_summary(c["org_id"])
    out["is_mine"] = mine
    if out["is_anonymous"] and not (manager or mine or is_reviewer(user)):
        out["supporter"] = {"id": None, "name": "A kind neighbour", "role": None}
        out["organization"] = None
    if manager or mine or is_reviewer(user):
        out["owner_message"] = c["owner_message"]
    return out
