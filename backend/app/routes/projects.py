from __future__ import annotations

from datetime import date, timedelta

from starlette.requests import Request
from starlette.routing import Route

from .. import config, db
from ..domain import (CAUSES, EDITABLE_STATUSES, PUBLIC_STATUSES, SUPPORTABLE_STATUSES, TRANSITIONS)
from ..errors import ApiError
from ..models import (ChecklistIn, ChecklistToggle, ImpactReportIn, MatchIn, MilestoneIn, OutcomeIn,
                      ProjectIn, ProjectVisibilityIn, TransitionIn, UpdateIn)
from ..security import current_user, is_admin, is_reviewer, require_roles, require_user
from ..services import ai, matching, resources
from ..services import projects as P
from ..services.notify import audit, notify, notify_many, reviewers
from ..web import ok, parse, qfloat, qint

PROJECT_FIELDS = ("title", "story", "problem_statement", "proposed_solution", "beneficiaries", "beneficiary_count", "city",
                  "region", "location_detail", "upi_id", "cause", "budget_required", "volunteers_required", "materials",
                  "skills", "time_commitment", "duration_weeks", "start_date", "end_date", "missing_info",
                  "follow_up_questions", "allow_multiple_supporters", "involves_children", "involves_vulnerable",
                  "safeguarding_notes", "org_id")


def _project_values(data: ProjectIn, user: dict) -> dict:
    values = data.model_dump(include=set(PROJECT_FIELDS))
    values["materials"] = [m.model_dump() for m in data.materials]
    if values.get("org_id"):
        if P.org_role(user["id"], values["org_id"]) is None:
            raise ApiError(403, "You can only post on behalf of organizations you belong to.", field="org_id")
    if values.get("involves_children") or values.get("involves_vulnerable"):
        if not (values.get("safeguarding_notes") or "").strip():
            raise ApiError(422, "Projects involving children or vulnerable people need safeguarding notes "
                                "(who supervises, how consent and privacy are handled).", field="safeguarding_notes")
    for k in ("allow_multiple_supporters", "involves_children", "involves_vulnerable"):
        values[k] = int(bool(values[k]))
    return values


def _attach_photos(file_ids: list[str], project: dict, user: dict) -> None:
    for fid in file_ids:
        f = db.get("files", fid)
        if not f or f["owner_id"] != user["id"]:
            raise ApiError(422, "One of the photos could not be found. Please upload it again.", field="photo_file_ids")
        if f["project_id"] and f["project_id"] != project["id"]:
            raise ApiError(422, "A photo belongs to another project.", field="photo_file_ids")
        if (project["involves_children"] or project["involves_vulnerable"]) and not f["consent_confirmed"] \
                and f["visibility"] == "public":
            raise ApiError(422, "Photos for projects involving children or vulnerable people must be uploaded "
                                "with consent confirmed, or kept team-only.", field="photo_file_ids")
        db.update("files", fid, {"project_id": project["id"]})


def _replace_plan(pid: str, data: ProjectIn) -> None:
    ts = db.now()
    if data.milestones is not None:
        db.execute("DELETE FROM milestones WHERE project_id = ? AND status = 'pending'", (pid,))
        for i, m in enumerate(data.milestones):
            db.insert("milestones", {"id": db.new_id(), "project_id": pid, "title": m.title,
                                     "description": m.description, "due_date": m.due_date, "status": "pending",
                                     "sort_order": i, "created_at": ts})
    if data.outcomes is not None:
        db.execute("DELETE FROM outcomes WHERE project_id = ? AND reported_value IS NULL AND verified_value IS NULL", (pid,))
        for o in data.outcomes:
            db.insert("outcomes", {"id": db.new_id(), "project_id": pid, "metric": o.metric, "target": o.target,
                                   "unit": o.unit, "created_at": ts})


async def create_project(request: Request):
    user = require_user(request)
    if is_reviewer(user):
        raise ApiError(403, "Reviewer accounts cannot submit projects; use a regular account.")
    data = await parse(request, ProjectIn)
    ts = db.now()
    values = _project_values(data, user)
    pid = db.new_id()
    row = {**values, "id": pid, "owner_id": user["id"], "status": "draft",
           "original_description": data.original_description or "", "ai_assisted": int(data.ai_assisted),
           "ai_provider": data.ai_provider if data.ai_assisted else None, "created_at": ts, "updated_at": ts}
    with db.transaction():
        db.insert("projects", row)
        _replace_plan(pid, data)
        _attach_photos(data.photo_file_ids, db.get("projects", pid), user)
        audit(user["id"], "project.created", "project", pid, ai_assisted=data.ai_assisted)
    return ok({"project": P.detail(db.get("projects", pid), user)}, 201)


async def get_project(request: Request):
    user = current_user(request)
    p = P.get_or_404(request.path_params["pid"])
    if not user and not (request.query_params.get("public") == "1" and p["status"] in ("completed", "verified")):
        raise ApiError(401, "Create a free account or sign in to see this need.")
    P.require_view(user, p)
    return ok({"project": P.detail(p, user)})


async def update_project(request: Request):
    user = require_user(request)
    p = P.get_or_404(request.path_params["pid"])
    P.require_manager(user, p)
    if p["status"] not in EDITABLE_STATUSES:
        raise ApiError(409, "This project can only be edited while it is a draft or when reviewers request more "
                            "information. Use updates and milestones to record progress.")
    data = await parse(request, ProjectIn)
    values = _project_values(data, user)
    if data.original_description is not None and not p["original_description"]:
        values["original_description"] = data.original_description  # never overwrite an existing original
    values["updated_at"] = db.now()
    with db.transaction():
        db.update("projects", p["id"], values)
        _replace_plan(p["id"], data)
        _attach_photos(data.photo_file_ids, db.get("projects", p["id"]), user)
        audit(user["id"], "project.edited", "project", p["id"])
    return ok({"project": P.detail(db.get("projects", p["id"]), user)})


async def delete_project(request: Request):
    user = require_user(request)
    p = P.get_or_404(request.path_params["pid"])
    P.require_manager(user, p)
    if p["status"] != "draft":
        raise ApiError(409, "Only drafts can be deleted.")
    db.execute("DELETE FROM projects WHERE id = ?", (p["id"],))
    audit(user["id"], "project.deleted", "project", p["id"])
    return ok()


def _submission_problems(p: dict) -> list[str]:
    problems = []
    if len((p["problem_statement"] or "").strip()) < 30:
        problems.append("Describe the problem in at least 30 characters.")
    if not p["city"]:
        problems.append("Add the city or town.")
    if not p["cause"]:
        problems.append("Choose a cause.")
    has_need = any([p["budget_required"], p["volunteers_required"], p["materials"], p["skills"]])
    if not has_need:
        problems.append("Add at least one requirement: budget, volunteers, materials or skills.")
    if config.settings.require_project_photo and not db.one(
            "SELECT id FROM files WHERE project_id = ? AND purpose = 'need_photo' LIMIT 1", (p["id"],)):
        problems.append("Add at least one real photo of the problem. Projects with photos get far more support.")
    return problems


def _supporter_ids(pid: str) -> list[str]:
    return [r["supporter_id"] for r in db.query(
        "SELECT DISTINCT supporter_id FROM commitments WHERE project_id = ? AND status IN ('accepted','fulfilled')", (pid,))]


async def transition(request: Request):
    user = require_user(request)
    p = P.get_or_404(request.path_params["pid"])
    data = await parse(request, TransitionIn)
    target = data.status
    if target == "verified":
        raise ApiError(409, "Projects become verified through a completion verification review.")
    rule = TRANSITIONS.get((p["status"], target))
    if rule is None:
        raise ApiError(409, f"A project cannot move from '{p['status']}' to '{target}'.")
    manager = P.is_manager(user, p)
    reviewer = is_reviewer(user)
    allowed = (rule == "owner" and manager) or (rule == "reviewer" and reviewer) or \
              (rule == "owner_or_reviewer" and (manager or reviewer))
    if not allowed:
        raise ApiError(403, "You don't have permission to make this change.")
    if rule == "reviewer" and p["owner_id"] == user["id"]:
        raise ApiError(403, "You cannot review your own project.")
    if target == "submitted":
        from .account import require_verified_contact
        require_verified_contact(user)
        problems = _submission_problems(p)
        if problems:
            raise ApiError(422, "Please complete the proposal before submitting.", details=[{"message": m} for m in problems])
    if target in ("needs_information", "rejected") and not (data.notes or "").strip():
        raise ApiError(422, "Please explain what is needed so the owner can act on it.", field="notes")
    if target == "completed":
        if not db.one("SELECT id FROM impact_reports WHERE project_id = ?", (p["id"],)):
            raise ApiError(422, "Submit an impact report before marking the project completed.")

    ts = db.now()
    changes = {"status": target, "updated_at": ts}
    if rule in ("reviewer",) or (rule == "owner_or_reviewer" and reviewer and not manager):
        changes["review_notes"] = data.notes
    if target == "submitted":
        changes["submitted_at"] = ts
    if target == "published":
        changes["published_at"] = ts
    if target == "completed":
        changes["completed_at"] = ts
    db.update("projects", p["id"], changes)
    audit(user["id"], f"project.{target}", "project", p["id"], from_status=p["status"], notes=data.notes)

    link = f"/projects/{p['id']}"
    if target == "submitted":
        notify_many(reviewers(), "review_needed", "New project awaiting review", p["title"], "/admin")
    elif target in ("needs_information", "approved", "rejected"):
        label = {"needs_information": "needs more information", "approved": "was approved",
                 "rejected": "was not approved"}[target]
        notify(p["owner_id"], "review_decision", f"Your project {label}", data.notes or p["title"], link)
    elif target == "published":
        _refresh_embedding(p["id"])
        if p["owner_id"] != user["id"]:
            notify(p["owner_id"], "review_decision", "Your project is now public", p["title"], link)
    elif target in ("in_progress", "completed"):
        notify_many(_supporter_ids(p["id"]), "project_status",
                    f"{p['title']} is now {target.replace('_', ' ')}", data.notes or "", link)
        if target == "completed":
            from .trust import create_verification
            create_verification("project_completion", p["id"], user["id"], data.notes)
    if target == "in_progress" and p["status"] == "completed":
        notify(p["owner_id"], "review_decision", "Completion evidence needs more work", data.notes or "", link)
    return ok({"project": P.detail(db.get("projects", p["id"]), user)})


def _refresh_embedding(pid: str) -> None:
    if not ai.semantic_enabled():
        return
    p = db.get("projects", pid)
    text = " ".join(filter(None, [p["title"], p["problem_statement"], p["proposed_solution"], p["beneficiaries"],
                                  CAUSES.get(p["cause"] or "", ""), p["city"], p["region"], " ".join(p["skills"] or [])]))
    try:
        vec = ai.embed(text)
    except ApiError:
        return  # search falls back to keywords; never block publishing
    if vec:
        db.update("projects", pid, {"embedding": vec})


# ---------------------------------------------------------------- explore ---
def _keyword_score(p: dict, terms: list[str]) -> int:
    fields = [(p["title"], 4), (p["problem_statement"], 2), (p["proposed_solution"], 1), (p["beneficiaries"], 1),
              (CAUSES.get(p["cause"] or "", ""), 2), (p["city"], 2), (p["region"], 1),
              (" ".join(p["skills"] or []), 2), (" ".join(m.get("name", "") for m in p["materials"] or []), 2)]
    score = 0
    for t in terms:
        hit = 0
        for text, w in fields:
            if text and t in text.lower():
                hit += w
        if not hit:
            return 0  # every term must appear somewhere
        score += hit
    return score


def _window(p: dict):
    start = date.fromisoformat(p["start_date"]) if p["start_date"] else None
    end = date.fromisoformat(p["end_date"]) if p["end_date"] else None
    if start and not end and p["duration_weeks"]:
        end = start + timedelta(weeks=p["duration_weeks"])
    return start, end


async def explore(request: Request):
    user = current_user(request)
    qp = request.query_params
    statuses = [s for s in (qp.get("status") or "").split(",") if s in PUBLIC_STATUSES] or list(PUBLIC_STATUSES)
    sql = f"SELECT * FROM projects WHERE is_hidden = 0 AND status IN ({','.join('?' * len(statuses))})"
    params: list = list(statuses)
    if qp.get("cause") in CAUSES:
        sql += " AND cause = ?"
        params.append(qp["cause"])
    if qp.get("city"):
        sql += " AND lower(city) = lower(?)"
        params.append(qp["city"].strip())
    if qp.get("region"):
        sql += " AND lower(region) = lower(?)"
        params.append(qp["region"].strip())
    min_b, max_b = qfloat(request, "min_budget"), qfloat(request, "max_budget")
    if min_b is not None:
        sql += " AND budget_required >= ?"
        params.append(min_b)
    if max_b is not None:
        sql += " AND budget_required <= ?"
        params.append(max_b)
    min_v, max_v = qint(request, "min_volunteers"), qint(request, "max_volunteers")
    if min_v is not None:
        sql += " AND volunteers_required >= ?"
        params.append(min_v)
    if max_v is not None:
        sql += " AND volunteers_required <= ?"
        params.append(max_v)
    max_d = qint(request, "max_duration_weeks")
    if max_d is not None:
        sql += " AND duration_weeks <= ?"
        params.append(max_d)
    verified = qp.get("verified")
    if verified == "need":
        sql += " AND need_verified = 1"
    elif verified == "completion":
        sql += " AND completion_verified = 1"
    elif verified == "any":
        sql += " AND (need_verified = 1 OR completion_verified = 1)"
    staff = bool(user and is_reviewer(user))
    if qp.get("include_demo") == "0" or not (config.settings.show_demo_publicly or staff):
        sql += " AND is_demo = 0"
    rows = db.query(sql + " ORDER BY COALESCE(published_at, updated_at) DESC", params)
    if user:
        from .safety import blocked_ids
        hidden = blocked_ids(user["id"])
        if hidden:
            rows = [r for r in rows if r["owner_id"] not in hidden]

    skill = (qp.get("skill") or "").strip().lower()
    material = (qp.get("material") or "").strip().lower()
    avail_from = qp.get("available_from")
    avail_to = qp.get("available_until")
    needs = qp.get("needs")  # money | volunteers | any (still has open gaps)
    effort = qp.get("effort")  # light | medium | heavy
    out = []
    for p in rows:
        if effort in ("light", "medium", "heavy") and P.effort_level(p) != effort:
            continue
        if skill and not any(skill in s.lower() for s in p["skills"] or []):
            continue
        if material and not any(material in (m.get("name") or "").lower() for m in p["materials"] or []):
            continue
        if avail_from or avail_to:
            s, e = _window(p)
            try:
                af = date.fromisoformat(avail_from) if avail_from else None
                at = date.fromisoformat(avail_to) if avail_to else None
            except ValueError:
                raise ApiError(422, "Availability dates must be YYYY-MM-DD.")
            if (at and s and s > at) or (af and e and e < af):
                continue
        res = resources.compute(p)
        if needs == "money" and not res["money"]["gap"]:
            continue
        if needs == "volunteers" and not res["volunteers"]["gap"]:
            continue
        if needs == "any" and (res["fully_resourced"] or p["status"] not in SUPPORTABLE_STATUSES):
            continue
        out.append((p, res))

    q = (qp.get("q") or "").strip()
    mode = "browse"
    if q:
        want_semantic = qp.get("semantic") == "1"
        if want_semantic and ai.semantic_enabled():
            mode = "semantic"
            try:
                qvec = ai.embed(q)
            except ApiError:
                qvec = None
                mode = "keyword"
            if qvec:
                scored = []
                for p, res in out:
                    vec = p["embedding"]
                    if not vec:
                        _refresh_embedding(p["id"])
                        vec = db.get("projects", p["id"])["embedding"]
                    sim = ai.cosine(qvec, vec) if vec else 0.0
                    kw = _keyword_score(p, q.lower().split())
                    if sim >= 0.25 or kw:
                        scored.append((sim + (0.1 if kw else 0), p, res))
                scored.sort(key=lambda t: -t[0])
                out = [(p, res) for _, p, res in scored]
        if mode != "semantic":
            mode = "keyword"
            terms = [t for t in q.lower().split() if len(t) > 1]
            scored = [(_keyword_score(p, terms), p, res) for p, res in out]
            out = [(p, res) for s, p, res in sorted(scored, key=lambda t: -t[0]) if s > 0]
    sort = qp.get("sort")
    if sort == "funding_gap":
        out.sort(key=lambda t: -(t[1]["money"]["gap"] or 0))
    elif sort == "starting_soon":
        out.sort(key=lambda t: t[0]["start_date"] or "9999")
    page = qint(request, "page", 1, lo=1)
    per = qint(request, "per_page", 12, lo=1, hi=50)
    if not user:
        page = 1
        per = min(per, 8)  # signed-out visitors only get a small teaser for the home page
    total = len(out)
    items = [P.summary(p, res) for p, res in out[(page - 1) * per: page * per]]
    return ok({"projects": items, "total": total, "page": page, "per_page": per, "search_mode": mode,
               "semantic_available": ai.semantic_enabled()})


async def my_projects(request: Request):
    user = require_user(request)
    rows = db.query(
        """SELECT DISTINCT p.* FROM projects p LEFT JOIN org_members m ON m.org_id = p.org_id AND m.user_id = ?
           WHERE p.owner_id = ? OR m.member_role IN ('owner','admin') ORDER BY p.updated_at DESC""",
        (user["id"], user["id"]))
    return ok({"projects": [P.summary(p) | {"review_notes": p["review_notes"]} for p in rows]})


async def match(request: Request):
    user = require_user(request)
    data = await parse(request, MatchIn)
    offer = data.model_dump()
    rows = db.query(
        "SELECT * FROM projects WHERE is_hidden = 0 AND status IN ('published','in_progress') ORDER BY published_at DESC")
    rows = [p for p in rows if not P.is_manager(user, p)]
    result = matching.match_projects(rows, offer, config.settings.currency)
    by_id = {p["id"]: p for p in rows}
    for m in result["matches"]:
        m["project"] = P.summary(by_id[m["project_id"]])
    return ok(result)


# ------------------------------------------------------- plan & progress ---
def _managed(request: Request) -> tuple[dict, dict]:
    user = require_user(request)
    p = P.get_or_404(request.path_params["pid"])
    P.require_manager(user, p)
    return user, p


def _not_closed(p: dict) -> None:
    if p["status"] in ("verified", "rejected"):
        raise ApiError(409, "This project is closed.")


async def add_milestone(request: Request):
    user, p = _managed(request)
    _not_closed(p)
    data = await parse(request, MilestoneIn)
    order = (db.scalar("SELECT MAX(sort_order) FROM milestones WHERE project_id = ?", (p["id"],)) or 0) + 1
    mid = db.new_id()
    db.insert("milestones", {"id": mid, "project_id": p["id"], **data.model_dump(), "sort_order": order,
                             "completed_at": db.now() if data.status == "done" else None, "created_at": db.now()})
    audit(user["id"], "milestone.created", "project", p["id"], milestone=mid)
    return ok({"milestone": db.get("milestones", mid)}, 201)


async def edit_milestone(request: Request):
    user, p = _managed(request)
    _not_closed(p)
    m = db.one("SELECT * FROM milestones WHERE id = ? AND project_id = ?", (request.path_params["mid"], p["id"]))
    if not m:
        raise ApiError(404, "Milestone not found.")
    data = await parse(request, MilestoneIn)
    changes = data.model_dump()
    changes["completed_at"] = (m["completed_at"] or db.now()) if data.status == "done" else None
    db.update("milestones", m["id"], changes)
    audit(user["id"], "milestone.updated", "project", p["id"], milestone=m["id"], status=data.status)
    if data.status == "done" and m["status"] != "done":
        notify_many([u for u in _supporter_ids(p["id"]) if u != user["id"]], "milestone",
                    f"Milestone completed: {data.title}", p["title"], f"/projects/{p['id']}")
    return ok({"milestone": db.get("milestones", m["id"])})


async def delete_milestone(request: Request):
    user, p = _managed(request)
    _not_closed(p)
    n = db.execute("DELETE FROM milestones WHERE id = ? AND project_id = ?", (request.path_params["mid"], p["id"]))
    if not n:
        raise ApiError(404, "Milestone not found.")
    audit(user["id"], "milestone.deleted", "project", p["id"], milestone=request.path_params["mid"])
    return ok()


async def add_outcome(request: Request):
    user, p = _managed(request)
    _not_closed(p)
    data = await parse(request, OutcomeIn)
    oid = db.new_id()
    db.insert("outcomes", {"id": oid, "project_id": p["id"], **data.model_dump(), "created_at": db.now()})
    return ok({"outcome": db.get("outcomes", oid)}, 201)


async def edit_outcome(request: Request):
    user, p = _managed(request)
    _not_closed(p)
    o = db.one("SELECT * FROM outcomes WHERE id = ? AND project_id = ?", (request.path_params["oid"], p["id"]))
    if not o:
        raise ApiError(404, "Outcome not found.")
    data = await parse(request, OutcomeIn)
    db.update("outcomes", o["id"], data.model_dump())  # verified_value is reviewer-only and untouched
    audit(user["id"], "outcome.reported", "project", p["id"], outcome=o["id"], reported=data.reported_value)
    return ok({"outcome": db.get("outcomes", o["id"])})


async def add_check(request: Request):
    user, p = _managed(request)
    _not_closed(p)
    data = await parse(request, ChecklistIn)
    cid = db.new_id()
    db.insert("checklist_items", {"id": cid, "project_id": p["id"], "text": data.text, "created_at": db.now()})
    return ok({"item": db.get("checklist_items", cid)}, 201)


async def toggle_check(request: Request):
    user, p = _managed(request)
    _not_closed(p)
    item = db.one("SELECT * FROM checklist_items WHERE id = ? AND project_id = ?", (request.path_params["cid"], p["id"]))
    if not item:
        raise ApiError(404, "Checklist item not found.")
    data = await parse(request, ChecklistToggle)
    db.update("checklist_items", item["id"], {"done": int(data.done), "done_by": user["id"] if data.done else None,
                                              "done_at": db.now() if data.done else None})
    return ok({"item": db.get("checklist_items", item["id"])})


async def delete_check(request: Request):
    user, p = _managed(request)
    _not_closed(p)
    db.execute("DELETE FROM checklist_items WHERE id = ? AND project_id = ?", (request.path_params["cid"], p["id"]))
    return ok()


def _check_files(file_ids: list[str], user: dict, p: dict) -> None:
    for fid in file_ids:
        f = db.get("files", fid)
        if not f or f["owner_id"] != user["id"]:
            raise ApiError(422, "An attached file could not be found. Please upload it again.", field="file_ids")
        if f["project_id"] and f["project_id"] != p["id"]:
            raise ApiError(422, "An attached file belongs to another project.", field="file_ids")
        db.update("files", fid, {"project_id": p["id"]})


async def post_update(request: Request):
    user = require_user(request)
    p = P.get_or_404(request.path_params["pid"])
    if not (P.is_manager(user, p) or P.is_supporter(user, p)):
        raise ApiError(403, "Only the project team and accepted supporters can post updates.")
    if p["status"] not in ("published", "in_progress", "completed"):
        raise ApiError(409, "Updates can be posted once a project is published.")
    data = await parse(request, UpdateIn)
    _check_files(data.file_ids, user, p)
    uid = db.new_id()
    db.insert("updates", {"id": uid, "project_id": p["id"], "author_id": user["id"], "kind": data.kind,
                          "title": data.title, "body": data.body, "file_ids": data.file_ids, "created_at": db.now()})
    audit(user["id"], "update.posted", "project", p["id"], update=uid)
    recipients = [u for u in _supporter_ids(p["id"]) + [p["owner_id"]] if u != user["id"]]
    notify_many(recipients, "project_update", f"Update on {p['title']}", data.title, f"/projects/{p['id']}")
    return ok({"update": db.get("updates", uid)}, 201)


async def put_impact_report(request: Request):
    user, p = _managed(request)
    if p["status"] not in ("in_progress", "completed"):
        raise ApiError(409, "Impact reports can be submitted once a project is in progress.")
    existing = db.one("SELECT * FROM impact_reports WHERE project_id = ?", (p["id"],))
    if existing and existing["verified"]:
        raise ApiError(409, "This impact report has been verified and can no longer be changed.")
    data = await parse(request, ImpactReportIn)
    _check_files(data.file_ids, user, p)
    values = data.model_dump() | {"submitted_by": user["id"], "submitted_at": db.now()}
    if existing:
        db.update("impact_reports", existing["id"], values)
    else:
        db.insert("impact_reports", {"id": db.new_id(), "project_id": p["id"], **values})
    for fid in data.file_ids:
        f = db.get("files", fid)
        if f and f["purpose"] not in ("evidence", "impact"):
            db.update("files", fid, {"purpose": "impact"})
    audit(user["id"], "impact_report.submitted", "project", p["id"])
    return ok({"impact_report": db.one("SELECT * FROM impact_reports WHERE project_id = ?", (p["id"],))})


async def set_visibility(request: Request):
    user = require_roles(request, "admin")
    p = P.get_or_404(request.path_params["pid"])
    data = await parse(request, ProjectVisibilityIn)
    db.update("projects", p["id"], {"is_hidden": int(data.is_hidden), "updated_at": db.now()})
    audit(user["id"], "project.hidden" if data.is_hidden else "project.unhidden", "project", p["id"], reason=data.reason)
    notify(p["owner_id"], "moderation", "Your project was hidden by moderators" if data.is_hidden
           else "Your project is visible again", data.reason, f"/projects/{p['id']}")
    return ok()


async def project_audit(request: Request):
    user = require_user(request)
    p = P.get_or_404(request.path_params["pid"])
    if not (P.is_manager(user, p) or is_reviewer(user)):
        raise ApiError(403, "Only the project team and reviewers can view the history.")
    rows = db.query(
        """SELECT a.action, a.details, a.created_at, u.name AS actor_name, u.role AS actor_role FROM audit_log a
           LEFT JOIN users u ON u.id = a.actor_id WHERE a.subject_type = 'project' AND a.subject_id = ?
           ORDER BY a.created_at DESC, a.rowid DESC LIMIT 200""", (p["id"],))
    return ok({"history": rows})


async def set_upi(request: Request):
    """Owner adds or changes the UPI ID where supporters send money, even after the need is published."""
    user = require_user(request)
    p = P.get_or_404(request.path_params["pid"])
    P.require_manager(user, p)
    body = await request.json()
    upi = str(body.get("upi_id") or "").strip()
    if upi:
        import re
        if not re.fullmatch(r"[A-Za-z0-9._-]{2,50}@[A-Za-z][A-Za-z0-9]{1,30}", upi):
            raise ApiError(422, "Enter a UPI ID like name@bank.", field="upi_id")
    db.update("projects", p["id"], {"upi_id": upi or None, "updated_at": db.now()})
    audit(user["id"], "project.upi_changed", "project", p["id"])
    return ok({"upi_id": upi or None})


async def stories(request: Request):
    """Story circles for the home screen: projects with recent updates, ones the member backed first."""
    user = require_user(request)
    demo_ok = config.settings.show_demo_publicly or is_reviewer(user)
    backed = {r["project_id"] for r in db.query("SELECT project_id FROM commitments WHERE supporter_id = ? AND status IN ('proposed','accepted','fulfilled')", (user["id"],))}
    rows = db.query("""SELECT u.project_id, u.title, u.body, u.created_at FROM updates u JOIN projects p ON p.id = u.project_id
                       WHERE u.is_hidden = 0 AND p.is_hidden = 0 AND p.status IN ('published','in_progress','completed','verified')
                       AND (p.is_demo = 0 OR ?) ORDER BY u.created_at DESC LIMIT 80""", (1 if demo_ok else 0,))
    by: dict[str, list] = {}
    for r in rows:
        by.setdefault(r["project_id"], []).append({"title": r["title"], "body": r["body"][:420], "created_at": r["created_at"]})
    out = []
    for pid, ups in by.items():
        p = db.get("projects", pid)
        res = resources.compute(p)
        out.append({"project": P.summary(p, res), "updates": ups[:3], "backed": pid in backed})
    out.sort(key=lambda x: (not x["backed"]))
    return ok({"stories": out[:14]})


routes = [
    Route("/api/stories", stories, methods=["GET"]),
    Route("/api/projects/{pid}/upi", set_upi, methods=["PUT"]),
    Route("/api/projects", explore, methods=["GET"]),
    Route("/api/projects", create_project, methods=["POST"]),
    Route("/api/projects/mine", my_projects, methods=["GET"]),
    Route("/api/match", match, methods=["POST"]),
    Route("/api/projects/{pid}", get_project, methods=["GET"]),
    Route("/api/projects/{pid}", update_project, methods=["PUT"]),
    Route("/api/projects/{pid}", delete_project, methods=["DELETE"]),
    Route("/api/projects/{pid}/transition", transition, methods=["POST"]),
    Route("/api/projects/{pid}/milestones", add_milestone, methods=["POST"]),
    Route("/api/projects/{pid}/milestones/{mid}", edit_milestone, methods=["PUT"]),
    Route("/api/projects/{pid}/milestones/{mid}", delete_milestone, methods=["DELETE"]),
    Route("/api/projects/{pid}/outcomes", add_outcome, methods=["POST"]),
    Route("/api/projects/{pid}/outcomes/{oid}", edit_outcome, methods=["PUT"]),
    Route("/api/projects/{pid}/checklist", add_check, methods=["POST"]),
    Route("/api/projects/{pid}/checklist/{cid}", toggle_check, methods=["PATCH"]),
    Route("/api/projects/{pid}/checklist/{cid}", delete_check, methods=["DELETE"]),
    Route("/api/projects/{pid}/updates", post_update, methods=["POST"]),
    Route("/api/projects/{pid}/impact-report", put_impact_report, methods=["PUT"]),
    Route("/api/projects/{pid}/visibility", set_visibility, methods=["POST"]),
    Route("/api/projects/{pid}/history", project_audit, methods=["GET"]),
]
