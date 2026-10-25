"""Support proposals (commitments) and their lifecycle."""
from __future__ import annotations

from starlette.requests import Request
from starlette.routing import Route

from .. import db
from ..domain import COMMITMENT_KINDS, COUNTED_COMMITMENT_STATUSES, SUPPORTABLE_STATUSES
from ..errors import ApiError
from ..models import CommitmentActionIn, CommitmentIn, CommitmentProgressIn
from ..security import is_reviewer, require_user
from ..services import projects as P
from ..services.notify import audit, notify
from ..web import ok, parse


def _load(cid: str) -> tuple[dict, dict]:
    c = db.get("commitments", cid)
    if not c:
        raise ApiError(404, "Support proposal not found.")
    return c, db.get("projects", c["project_id"])


def _describe(c: dict) -> str:
    label = COMMITMENT_KINDS.get(c["kind"], c["kind"])
    if c["kind"] == "money":
        return f"{label}: {c['quantity']:,.0f}"
    if c["kind"] == "volunteers":
        return f"{int(c['quantity'])} volunteer(s)" + (f", {c['hours']:g} h each" if c["hours"] else "")
    return f"{label}: {c['quantity']:g} {c['unit'] or ''} {c['item'] or ''}".strip()


def _check_single_supporter(p: dict, c: dict) -> None:
    if p["allow_multiple_supporters"]:
        return
    key = c["org_id"] or c["supporter_id"]
    others = db.query(
        "SELECT org_id, supporter_id FROM commitments WHERE project_id = ? AND status IN ('accepted','fulfilled') AND id != ?",
        (p["id"], c["id"]))
    if any((o["org_id"] or o["supporter_id"]) != key for o in others):
        raise ApiError(409, "This project accepts a single supporter, and another supporter is already committed.")


async def propose(request: Request):
    user = require_user(request)
    p = P.get_or_404(request.path_params["pid"])
    P.require_view(user, p)
    if is_reviewer(user):
        raise ApiError(403, "Reviewer accounts cannot pledge support; use a regular account.")
    if P.is_manager(user, p):
        raise ApiError(403, "You manage this project, so you can't propose support to it.")
    if p["status"] not in SUPPORTABLE_STATUSES:
        raise ApiError(409, "This project is not accepting support right now.")
    from .account import require_verified_contact
    from .safety import blocked_between
    if blocked_between(user["id"], p["owner_id"]):
        raise ApiError(403, "You can't offer support to this project.")
    require_verified_contact(user)
    data = await parse(request, CommitmentIn)
    if data.org_id and P.org_role(user["id"], data.org_id) is None:
        raise ApiError(403, "You can only pledge on behalf of organizations you belong to.", field="org_id")
    if data.kind == "money" and data.unit:
        data.unit = None
    ts = db.now()
    cid = db.new_id()
    row = {**data.model_dump(), "id": cid, "project_id": p["id"], "supporter_id": user["id"], "status": "proposed",
           "created_at": ts, "updated_at": ts}
    if row["kind"] == "volunteers":
        row["quantity"] = int(row["quantity"])
    db.insert("commitments", row)
    audit(user["id"], "commitment.proposed", "project", p["id"], commitment=cid, kind=data.kind, quantity=data.quantity)
    who = user["name"]
    if data.org_id:
        who = db.get("organizations", data.org_id)["name"]
    notify(p["owner_id"], "support_proposal", f"New support offer for {p['title']}",
           f"{who} offered {_describe(row)}.", f"/projects/{p['id']}#commitments")
    return ok({"commitment": P.serialize_commitment(db.get("commitments", cid), user, p)}, 201)


async def revise(request: Request):
    """Supporter edits their own proposal (only before it is accepted)."""
    user = require_user(request)
    c, p = _load(request.path_params["cid"])
    if c["supporter_id"] != user["id"]:
        raise ApiError(403, "Only the supporter who made this offer can edit it.")
    if c["status"] not in ("proposed", "changes_requested"):
        raise ApiError(409, "Only pending offers can be edited. Cancel and propose again if plans changed.")
    data = await parse(request, CommitmentIn)
    if data.org_id and P.org_role(user["id"], data.org_id) is None:
        raise ApiError(403, "You can only pledge on behalf of organizations you belong to.", field="org_id")
    changes = data.model_dump() | {"status": "proposed", "updated_at": db.now()}
    db.update("commitments", c["id"], changes)
    audit(user["id"], "commitment.revised", "project", p["id"], commitment=c["id"])
    notify(p["owner_id"], "support_proposal", f"Support offer updated for {p['title']}",
           _describe(db.get("commitments", c["id"])), f"/projects/{p['id']}#commitments")
    return ok({"commitment": P.serialize_commitment(db.get("commitments", c["id"]), user, p)})


async def act(request: Request):
    user = require_user(request)
    c, p = _load(request.path_params["cid"])
    data = await parse(request, CommitmentActionIn)
    manager = P.is_manager(user, p)
    supporter = c["supporter_id"] == user["id"]
    action, status = data.action, c["status"]
    link = f"/projects/{p['id']}#commitments"

    if action in ("accept", "decline", "request_changes", "fulfil") and not manager:
        raise ApiError(403, "Only the project owner can respond to support offers.")
    if action == "withdraw" and not supporter:
        raise ApiError(403, "Only the supporter can withdraw their offer.")
    if action == "cancel" and not (supporter or manager):
        raise ApiError(403, "Only the supporter or project owner can cancel a commitment.")

    allowed_from = {
        "accept": ("proposed",), "decline": ("proposed", "changes_requested"),
        "request_changes": ("proposed",), "withdraw": ("proposed", "changes_requested"),
        "cancel": ("accepted",), "fulfil": ("accepted",),
    }[action]
    if status not in allowed_from:
        raise ApiError(409, f"This offer is '{status.replace('_', ' ')}', so it can't be {action.replace('_', ' ')}ed.")
    if action in ("decline", "request_changes", "cancel") and not (data.message or "").strip():
        raise ApiError(422, "Please add a short message explaining why.", field="message")
    if action == "accept":
        if p["status"] not in SUPPORTABLE_STATUSES:
            raise ApiError(409, "Offers can only be accepted while the project is published or in progress.")
        _check_single_supporter(p, c)

    new_status = {"accept": "accepted", "decline": "declined", "request_changes": "changes_requested",
                  "withdraw": "withdrawn", "cancel": "cancelled", "fulfil": "fulfilled"}[action]
    changes = {"status": new_status, "updated_at": db.now()}
    if data.message:
        changes["owner_message"] = data.message if manager else (c["owner_message"] or "")
    if action == "fulfil" and not c["received_quantity"]:
        changes["received_quantity"] = c["quantity"]
    db.update("commitments", c["id"], changes)
    audit(user["id"], f"commitment.{new_status}", "project", p["id"], commitment=c["id"], message=data.message)

    desc = _describe(c)
    if manager and not supporter:
        titles = {"accepted": "Your support offer was accepted", "declined": "Your support offer was declined",
                  "changes_requested": "Changes requested on your support offer",
                  "cancelled": "A commitment was cancelled by the project",
                  "fulfilled": "Your contribution was marked as received"}
        notify(c["supporter_id"], "commitment", titles[new_status], f"{p['title']}: {desc}. {data.message or ''}".strip(), link)
    else:
        titles = {"withdrawn": "A support offer was withdrawn", "cancelled": "A supporter cancelled their commitment"}
        notify(p["owner_id"], "commitment", titles[new_status], f"{p['title']}: {desc}. {data.message or ''}".strip(), link)
    return ok({"commitment": P.serialize_commitment(db.get("commitments", c["id"]), user, p)})


async def progress(request: Request):
    """Project manager records what was actually received / spent, responsibilities and deadlines."""
    user = require_user(request)
    c, p = _load(request.path_params["cid"])
    if not P.is_manager(user, p):
        raise ApiError(403, "Only the project owner can record receipts and spending.")
    if c["status"] not in COUNTED_COMMITMENT_STATUSES:
        raise ApiError(409, "Only accepted commitments can be updated.")
    data = await parse(request, CommitmentProgressIn)
    changes = data.model_dump(exclude_unset=True)
    received = changes.get("received_quantity", c["received_quantity"])
    spent = changes.get("spent_amount", c["spent_amount"])
    if received is not None and received > c["quantity"] + 1e-9:
        raise ApiError(422, "Received amount can't exceed what was pledged.", field="received_quantity")
    if c["kind"] != "money" and changes.get("spent_amount"):
        raise ApiError(422, "Spending is only tracked for funding commitments.", field="spent_amount")
    if spent and spent > (received or 0) + 1e-9:
        raise ApiError(422, "Spent amount can't exceed the amount received.", field="spent_amount")
    if changes:
        changes["updated_at"] = db.now()
        db.update("commitments", c["id"], changes)
        audit(user["id"], "commitment.progress", "project", p["id"], commitment=c["id"], **data.model_dump(exclude_unset=True))
    return ok({"commitment": P.serialize_commitment(db.get("commitments", c["id"]), user, p)})


async def mine(request: Request):
    user = require_user(request)
    rows = db.query(
        """SELECT c.*, p.title AS project_title, p.status AS project_status FROM commitments c
           JOIN projects p ON p.id = c.project_id WHERE c.supporter_id = ? ORDER BY c.updated_at DESC""", (user["id"],))
    out = []
    for r in rows:
        p = db.get("projects", r["project_id"])
        item = P.serialize_commitment(r, user, p)
        item["project"] = {"id": p["id"], "title": p["title"], "status": p["status"], "city": p["city"]}
        out.append(item)
    return ok({"commitments": out})


routes = [
    Route("/api/projects/{pid}/commitments", propose, methods=["POST"]),
    Route("/api/commitments/mine", mine, methods=["GET"]),
    Route("/api/commitments/{cid}", revise, methods=["PUT"]),
    Route("/api/commitments/{cid}/action", act, methods=["POST"]),
    Route("/api/commitments/{cid}/progress", progress, methods=["PATCH"]),
]
