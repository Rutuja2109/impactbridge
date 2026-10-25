"""Blocking other users (required for apps with user-generated content) and client error reports."""
from __future__ import annotations

from pydantic import Field
from starlette.requests import Request
from starlette.routing import Route

from .. import db
from ..errors import ApiError
from ..models import Strict
from ..security import current_user, is_reviewer, require_user
from ..services.notify import audit, notify
from ..web import ok, parse


def blocked_ids(user_id: str | None) -> set[str]:
    """Everyone this user blocked, plus everyone who blocked this user."""
    if not user_id:
        return set()
    rows = db.query("SELECT blocked_id AS o FROM user_blocks WHERE blocker_id = ? UNION SELECT blocker_id AS o FROM user_blocks WHERE blocked_id = ?",
                    (user_id, user_id))
    return {r["o"] for r in rows}


def blocked_between(a: str | None, b: str | None) -> bool:
    if not a or not b or a == b:
        return False
    return bool(db.one("SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
                       (a, b, b, a)))


async def block(request: Request):
    user = require_user(request)
    target = db.get("users", request.path_params["uid"])
    if not target or target["id"] == user["id"]:
        raise ApiError(404, "User not found")
    if is_reviewer(target):
        raise ApiError(409, "ImpactBridge reviewers can't be blocked. Use “Report a concern” if something is wrong.")
    ts = db.now()
    with db.transaction():
        db.execute("INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)", (user["id"], target["id"], ts))
        # open offers between the two are closed so neither keeps waiting on the other
        rows = db.query("""SELECT c.id, c.supporter_id, p.owner_id, p.id AS pid, p.title FROM commitments c JOIN projects p ON p.id = c.project_id
                           WHERE c.status IN ('proposed','changes_requested')
                             AND ((c.supporter_id = ? AND p.owner_id = ?) OR (c.supporter_id = ? AND p.owner_id = ?))""",
                        (user["id"], target["id"], target["id"], user["id"]))
        for r in rows:
            db.execute("UPDATE commitments SET status = 'withdrawn', owner_message = ?, updated_at = ? WHERE id = ?",
                       ("Closed because one person blocked the other.", ts, r["id"]))
        audit(user["id"], "user.blocked", "user", target["id"], closed_offers=len(rows))
    return ok({"ok": True, "closed_offers": len(rows)})


async def unblock(request: Request):
    user = require_user(request)
    db.execute("DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?", (user["id"], request.path_params["uid"]))
    audit(user["id"], "user.unblocked", "user", request.path_params["uid"])
    return ok({"ok": True})


async def list_blocks(request: Request):
    user = require_user(request)
    rows = db.query("""SELECT u.id, u.name, b.created_at FROM user_blocks b JOIN users u ON u.id = b.blocked_id
                       WHERE b.blocker_id = ? ORDER BY b.created_at DESC""", (user["id"],))
    return ok({"blocked": rows})


class ClientErrorIn(Strict):
    message: str = Field(min_length=1, max_length=500)
    source: str | None = Field(default=None, max_length=300)
    path: str | None = Field(default=None, max_length=300)
    app_version: str | None = Field(default=None, max_length=40)


async def client_error(request: Request):
    """Crash reports from the app. No personal data: message, file:line and the page path only."""
    data = await parse(request, ClientErrorIn)
    if db.scalar("SELECT COUNT(*) FROM client_errors") > 5000:
        db.execute("DELETE FROM client_errors WHERE id IN (SELECT id FROM client_errors ORDER BY created_at LIMIT 1000)")
    path = (data.path or "").split("?")[0][:300]
    db.insert("client_errors", {"id": db.new_id(), "message": data.message, "source": data.source, "path": path,
                                "app_version": data.app_version, "created_at": db.now()})
    return ok({"ok": True})


async def list_client_errors(request: Request):
    user = require_user(request)
    if user["role"] != "admin":
        raise ApiError(403, "Administrators only.")
    rows = db.query("""SELECT message, source, path, app_version, COUNT(*) AS count, MAX(created_at) AS last_seen
                       FROM client_errors GROUP BY message, source ORDER BY last_seen DESC LIMIT 100""")
    return ok({"errors": rows})


routes = [
    Route("/api/users/{uid}/block", block, methods=["POST"]),
    Route("/api/users/{uid}/block", unblock, methods=["DELETE"]),
    Route("/api/blocks", list_blocks, methods=["GET"]),
    Route("/api/client-errors", client_error, methods=["POST"]),
    Route("/api/admin/client-errors", list_client_errors, methods=["GET"]),
]
