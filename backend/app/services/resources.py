"""Resource accounting: requested vs proposed vs pledged vs received vs spent vs reported vs verified.

Totals are always recomputed from commitment rows, so they stay correct whenever a
commitment is accepted, cancelled, edited or fulfilled.
"""
from __future__ import annotations

from .. import db
from ..domain import COUNTED_COMMITMENT_STATUSES, OPEN_COMMITMENT_STATUSES


def _norm(s: str | None) -> str:
    return " ".join((s or "").lower().split())


def _matches(a: str | None, b: str | None) -> bool:
    a, b = _norm(a), _norm(b)
    if not a or not b:
        return False
    return a == b or a in b or b in a or a.rstrip("s") == b.rstrip("s")


def compute(project: dict, commitments: list[dict] | None = None, report: dict | None = None) -> dict:
    if commitments is None:
        commitments = db.query("SELECT * FROM commitments WHERE project_id = ?", (project["id"],))
    if report is None:
        report = db.one("SELECT * FROM impact_reports WHERE project_id = ?", (project["id"],))
    counted = [c for c in commitments if c["status"] in COUNTED_COMMITMENT_STATUSES]
    pending = [c for c in commitments if c["status"] in OPEN_COMMITMENT_STATUSES]

    def total(rows, kind, field="quantity"):
        return sum(float(c[field] or 0) for c in rows if c["kind"] == kind)

    budget = project.get("budget_required")
    pledged_money = total(counted, "money")
    money = {
        "requested": budget,
        "proposed": total(pending, "money"),
        "pledged": pledged_money,
        "received": total(counted, "money", "received_quantity"),
        "spent": total(counted, "money", "spent_amount"),
        "gap": max(0.0, float(budget) - pledged_money) if budget is not None else None,
        "reported_spent": report["funds_spent"] if report else None,
        "verified_spent": report["verified_funds_spent"] if report and report["verified"] else None,
    }

    vol_req = project.get("volunteers_required")
    pledged_vol = total(counted, "volunteers")
    volunteers = {
        "requested": vol_req,
        "proposed": total(pending, "volunteers"),
        "pledged": pledged_vol,
        "received": total(counted, "volunteers", "received_quantity"),
        "pledged_hours": sum(float(c["hours"] or 0) * float(c["quantity"] or 0)
                             for c in counted if c["kind"] == "volunteers"),
        "gap": max(0.0, float(vol_req) - pledged_vol) if vol_req is not None else None,
        "reported_involved": report["volunteers_involved"] if report else None,
        "reported_hours": report["volunteer_hours"] if report else None,
        "verified_involved": report["verified_volunteers_involved"] if report and report["verified"] else None,
        "verified_hours": report["verified_volunteer_hours"] if report and report["verified"] else None,
    }

    item_rows = [c for c in commitments if c["kind"] in ("materials", "equipment")]
    used: set[str] = set()
    materials = []
    for need in project.get("materials") or []:
        name = need.get("name")
        matched = [c for c in item_rows if _matches(c["item"], name)]
        used.update(c["id"] for c in matched)
        qty = need.get("quantity")
        pledged = sum(float(c["quantity"] or 0) for c in matched if c["status"] in COUNTED_COMMITMENT_STATUSES)
        materials.append({
            "name": name,
            "unit": need.get("unit"),
            "requested": qty,
            "proposed": sum(float(c["quantity"] or 0) for c in matched if c["status"] in OPEN_COMMITMENT_STATUSES),
            "pledged": pledged,
            "received": sum(float(c["received_quantity"] or 0) for c in matched
                            if c["status"] in COUNTED_COMMITMENT_STATUSES),
            "gap": max(0.0, float(qty) - pledged) if qty is not None else None,
        })
    other_items = [
        {"kind": c["kind"], "item": c["item"], "quantity": c["quantity"], "unit": c["unit"],
         "received": c["received_quantity"]}
        for c in item_rows if c["id"] not in used and c["status"] in COUNTED_COMMITMENT_STATUSES
    ]

    skills = []
    for skill in project.get("skills") or []:
        matched = [c for c in commitments if c["kind"] == "skills" and _matches(c["item"], skill)]
        skills.append({
            "skill": skill,
            "pledged": any(c["status"] in COUNTED_COMMITMENT_STATUSES for c in matched),
            "proposed": any(c["status"] in OPEN_COMMITMENT_STATUSES for c in matched),
        })

    supporters = {}
    for c in counted:
        key = c["org_id"] or c["supporter_id"]
        supporters[key] = True

    open_gaps = []
    if money["gap"]:
        open_gaps.append({"kind": "money", "amount": money["gap"]})
    if volunteers["gap"]:
        open_gaps.append({"kind": "volunteers", "amount": volunteers["gap"]})
    for m in materials:
        if m["gap"]:
            open_gaps.append({"kind": "materials", "item": m["name"], "amount": m["gap"], "unit": m["unit"]})
    for s in skills:
        if not s["pledged"]:
            open_gaps.append({"kind": "skills", "item": s["skill"]})

    return {
        "money": money,
        "volunteers": volunteers,
        "materials": materials,
        "other_items": other_items,
        "skills": skills,
        "supporter_count": len(supporters),
        "open_gaps": open_gaps,
        "fully_resourced": not open_gaps,
    }
