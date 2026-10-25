"""Supporter coordination: expressing interest, the project conversation, recommendations and sponsor certificates."""
from __future__ import annotations

from pydantic import Field
from starlette.requests import Request
from starlette.routing import Route

from .. import db
from ..domain import CAUSES, PUBLIC_STATUSES, SUPPORTABLE_STATUSES
from ..errors import ApiError
from ..models import Strict
from ..security import current_user, is_reviewer, require_user
from ..services import projects as P
from ..services import resources
from ..services.notify import audit, notify
from ..web import ok, parse
from .safety import blocked_between, blocked_ids


# ----------------------------------------------------------------- interest
def interest_info(p: dict, user: dict | None) -> dict:
    count = db.scalar("SELECT COUNT(*) FROM project_interests WHERE project_id = ?", (p["id"],))
    mine = bool(user and db.one("SELECT 1 FROM project_interests WHERE project_id = ? AND user_id = ?", (p["id"], user["id"])))
    out = {"count": count, "mine": mine}
    if user and (P.is_manager(user, p) or is_reviewer(user)):
        out["people"] = db.query("""SELECT u.id, u.name, u.city, u.skills, i.created_at FROM project_interests i
                                    JOIN users u ON u.id = i.user_id WHERE i.project_id = ? ORDER BY i.created_at DESC""", (p["id"],))
    return out


async def add_interest(request: Request):
    user = require_user(request)
    p = P.get_or_404(request.path_params["pid"])
    P.require_view(user, p)
    if P.is_manager(user, p):
        raise ApiError(409, "This is your own project.")
    if p["status"] not in SUPPORTABLE_STATUSES:
        raise ApiError(409, "This project is not accepting support right now.")
    if blocked_between(user["id"], p["owner_id"]):
        raise ApiError(403, "You can't offer support to this project.")
    new = not db.one("SELECT 1 FROM project_interests WHERE project_id = ? AND user_id = ?", (p["id"], user["id"]))
    if new:
        db.insert("project_interests", {"project_id": p["id"], "user_id": user["id"], "created_at": db.now()})
        notify(p["owner_id"], "interest", "Someone is interested in your project",
               f"{user['name'].split()[0]} is interested in {p['title']}. Say hello in the project chat.",
               f"/projects/{p['id']}#chat", dedupe_key=f"interest:{p['id']}:{user['id']}")
        audit(user["id"], "project.interest", "project", p["id"])
    return ok({"interest": interest_info(p, user)})


async def remove_interest(request: Request):
    user = require_user(request)
    p = P.get_or_404(request.path_params["pid"])
    db.execute("DELETE FROM project_interests WHERE project_id = ? AND user_id = ?", (p["id"], user["id"]))
    return ok({"interest": interest_info(p, user)})


# ----------------------------------------------------------------- project conversation
def chat_access(user: dict | None, p: dict) -> bool:
    if not user:
        return False
    if P.is_manager(user, p) or is_reviewer(user):
        return True
    if blocked_between(user["id"], p["owner_id"]):
        return False
    return bool(db.one("SELECT 1 FROM project_interests WHERE project_id = ? AND user_id = ?", (p["id"], user["id"]))
                or db.one("SELECT 1 FROM commitments WHERE project_id = ? AND supporter_id = ? AND status NOT IN ('withdrawn','declined')",
                          (p["id"], user["id"])))


def _participants(p: dict) -> set[str]:
    ids = {p["owner_id"]}
    ids |= {r["user_id"] for r in db.query("SELECT user_id FROM project_interests WHERE project_id = ?", (p["id"],))}
    ids |= {r["supporter_id"] for r in db.query(
        "SELECT supporter_id FROM commitments WHERE project_id = ? AND status NOT IN ('withdrawn','declined')", (p["id"],))}
    if p["org_id"]:
        ids |= {r["user_id"] for r in db.query("SELECT user_id FROM org_members WHERE org_id = ? AND member_role IN ('owner','admin')", (p["org_id"],))}
    return ids


class MessageIn(Strict):
    body: str = Field(min_length=1, max_length=2000)


async def list_messages(request: Request):
    user = require_user(request)
    p = P.get_or_404(request.path_params["pid"])
    if not chat_access(user, p):
        raise ApiError(403, "Tap “I'm interested” or offer support to join this project's conversation.")
    hidden = blocked_ids(user["id"])
    rows = db.query("""SELECT m.id, m.body, m.created_at, m.author_id, u.name AS author_name, u.role AS author_role
                       FROM project_messages m JOIN users u ON u.id = m.author_id
                       WHERE m.project_id = ? AND m.is_hidden = 0 ORDER BY m.created_at, m.rowid LIMIT 300""", (p["id"],))
    team = {p["owner_id"]} | ({r["user_id"] for r in db.query("SELECT user_id FROM org_members WHERE org_id = ?", (p["org_id"],))} if p["org_id"] else set())
    out = [{"id": r["id"], "body": r["body"], "created_at": r["created_at"], "mine": r["author_id"] == user["id"],
            "author": {"id": r["author_id"], "name": r["author_name"], "is_team": r["author_id"] in team,
                       "is_reviewer": r["author_role"] in ("admin", "verifier")}}
           for r in rows if r["author_id"] not in hidden]
    return ok({"messages": out})


async def post_message(request: Request):
    user = require_user(request)
    p = P.get_or_404(request.path_params["pid"])
    if not chat_access(user, p):
        raise ApiError(403, "Tap “I'm interested” or offer support to join this project's conversation.")
    data = await parse(request, MessageIn)
    body = data.body.strip()
    if not body:
        raise ApiError(422, "Write a message first.", field="body")
    recent = db.scalar("SELECT COUNT(*) FROM project_messages WHERE author_id = ? AND created_at > datetime('now', '-1 minute')", (user["id"],))
    if recent >= 10:
        raise ApiError(429, "You're sending messages too quickly. Please wait a minute.")
    mid = db.new_id()
    db.insert("project_messages", {"id": mid, "project_id": p["id"], "author_id": user["id"], "body": body,
                                   "is_hidden": 0, "created_at": db.now()})
    first = user["name"].split()[0]
    for uid in _participants(p) - {user["id"]} - blocked_ids(user["id"]):
        notify(uid, "message", f"New message on {p['title']}", f"{first}: {body[:140]}", f"/projects/{p['id']}#chat",
               dedupe_key=f"msg:{mid}:{uid}", email=False)
    return ok({"id": mid})


async def hide_message(request: Request):
    user = require_user(request)
    m = db.get("project_messages", request.path_params["mid"])
    if not m:
        raise ApiError(404, "Message not found.")
    p = P.get_or_404(m["project_id"])
    if not (m["author_id"] == user["id"] or P.is_manager(user, p) or is_reviewer(user)):
        raise ApiError(403, "You can only remove your own messages.")
    db.execute("UPDATE project_messages SET is_hidden = 1 WHERE id = ?", (m["id"],))
    audit(user["id"], "message.hidden", "project", p["id"], message=m["id"])
    return ok()


# ----------------------------------------------------------------- recommendations
async def recommendations(request: Request):
    """Projects that fit the signed-in supporter: same city/region, skills they listed, causes they've supported."""
    user = require_user(request)
    hidden = blocked_ids(user["id"])
    skills = {s.lower() for s in (user["skills"] or [])}
    past = {r["cause"] for r in db.query("""SELECT DISTINCT p.cause FROM commitments c JOIN projects p ON p.id = c.project_id
                                            WHERE c.supporter_id = ? AND c.status IN ('accepted','fulfilled')""", (user["id"],))}
    marks = ",".join("?" * len(SUPPORTABLE_STATUSES))
    rows = db.query(f"SELECT * FROM projects WHERE is_hidden = 0 AND status IN ({marks})", tuple(SUPPORTABLE_STATUSES))
    scored = []
    for p in rows:
        if p["owner_id"] == user["id"] or p["owner_id"] in hidden:
            continue
        res = resources.compute(p)
        if res["fully_resourced"]:
            continue
        score, reasons = 0.0, []
        if user["city"] and p["city"] and p["city"].lower() == user["city"].lower():
            score += 3; reasons.append("In your city")
        elif user["region"] and p["region"] and p["region"].lower() == user["region"].lower():
            score += 1; reasons.append("In your state")
        overlap = [s for s in (p["skills"] or []) if any(k in s.lower() or s.lower() in k for k in skills)]
        if overlap:
            score += 2 * len(overlap); reasons.append("Needs your skill: " + ", ".join(overlap[:2]))
        if p["cause"] in past:
            score += 1; reasons.append(f"A cause you've supported: {CAUSES.get(p['cause'], p['cause'])}")
        if p["need_verified"]:
            score += 0.5; reasons.append("Need verified")
        if P.effort_level(p) == "light":
            score += 0.3; reasons.append("Light effort")
        if not p["is_demo"]:
            score += 0.2
        if score > 0:
            scored.append((score, p, res, reasons))
    scored.sort(key=lambda x: (-x[0], x[1]["published_at"] or ""))
    return ok({"projects": [{**P.summary(p, res), "reasons": reasons[:3]} for _, p, res, reasons in scored[:6]]})


# ----------------------------------------------------------------- sponsor certificates
def _certificate(c: dict) -> dict:
    p = db.get("projects", c["project_id"])
    if not p or p["is_hidden"] or p["status"] not in ("completed", "verified") or c["status"] not in ("accepted", "fulfilled"):
        raise ApiError(404, "Certificate not found.")
    report = db.one("SELECT * FROM impact_reports WHERE project_id = ?", (p["id"],))
    org = db.get("organizations", c["org_id"]) if c["org_id"] else None
    sup = db.get("users", c["supporter_id"])
    contribution = {"kind": c["kind"], "quantity": c["quantity"], "item": c["item"], "unit": c["unit"], "hours": c["hours"],
                    "received_quantity": c["received_quantity"]}
    return {
        "id": c["id"], "number": "IB-" + c["id"][:8].upper(),
        "sponsor": {"name": org["name"] if org else (sup["name"] if sup else "A supporter"), "type": org["org_type"] if org else "individual",
                    "verified": bool(org and org["verification_status"] == "verified")},
        "project": {"id": p["id"], "title": p["title"], "city": p["city"], "region": p["region"], "cause": p["cause"],
                    "cause_label": CAUSES.get(p["cause"] or "", None), "status": p["status"],
                    "completion_verified": bool(p["completion_verified"]), "completed_at": p["completed_at"],
                    "is_demo": bool(p["is_demo"])},
        "contribution": contribution,
        "report": {k: report[k] for k in ("people_reached", "volunteers_involved", "volunteer_hours", "funds_spent", "summary",
                                          "verified", "verified_people_reached", "verified_volunteers_involved",
                                          "verified_volunteer_hours", "verified_funds_spent", "submitted_at", "verified_at")} if report else None,
        "issued_at": (report["verified_at"] if report and report["verified_at"] else p["completed_at"] or p["updated_at"]),
    }


async def certificate(request: Request):
    c = db.get("commitments", request.path_params["cid"])
    if not c:
        raise ApiError(404, "Certificate not found.")
    return ok({"certificate": _certificate(c)})


async def my_certificates(request: Request):
    user = require_user(request)
    org_ids = [r["org_id"] for r in db.query("SELECT org_id FROM org_members WHERE user_id = ?", (user["id"],))]
    marks = ",".join("?" * len(org_ids)) or "NULL"
    rows = db.query(f"""SELECT c.* FROM commitments c JOIN projects p ON p.id = c.project_id
                        WHERE c.status IN ('accepted','fulfilled') AND p.status IN ('completed','verified') AND p.is_hidden = 0
                          AND (c.supporter_id = ? OR c.org_id IN ({marks})) ORDER BY p.updated_at DESC""", (user["id"], *org_ids))
    return ok({"certificates": [_certificate(c) for c in rows]})


routes = [
    Route("/api/projects/{pid}/interest", add_interest, methods=["POST"]),
    Route("/api/projects/{pid}/interest", remove_interest, methods=["DELETE"]),
    Route("/api/projects/{pid}/messages", list_messages, methods=["GET"]),
    Route("/api/projects/{pid}/messages", post_message, methods=["POST"]),
    Route("/api/messages/{mid}", hide_message, methods=["DELETE"]),
    Route("/api/recommendations", recommendations, methods=["GET"]),
    Route("/api/certificates/{cid}", certificate, methods=["GET"]),
    Route("/api/my/certificates", my_certificates, methods=["GET"]),
]
