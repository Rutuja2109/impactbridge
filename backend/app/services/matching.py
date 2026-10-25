"""Two-stage resource-based matching.

Stage 1 filters out projects the supporter cannot feasibly help (no overlap between
what they offer and what the project still needs, wrong location scope, timing that
does not overlap, or a project that only accepts a single supporter which they
cannot fully resource).

Stage 2 ranks the remaining projects with a transparent, deterministic score built
only from the supporter's inputs and the project's recorded needs. Each component is
returned so the UI can explain the score; nothing is estimated or invented.
"""
from __future__ import annotations

from datetime import date, timedelta

from . import resources

WEIGHTS = {"cause": 0.25, "resources": 0.35, "location": 0.2, "timing": 0.1, "collaboration": 0.1}


def _norm(s):
    return " ".join((s or "").lower().split())


def _overlap(a: list[str], b: list[str]) -> list[str]:
    out = []
    for x in a:
        for y in b:
            if resources._matches(x, y):
                out.append(y)
    return list(dict.fromkeys(out))


def _project_window(p: dict) -> tuple[date | None, date | None]:
    start = date.fromisoformat(p["start_date"]) if p.get("start_date") else None
    end = date.fromisoformat(p["end_date"]) if p.get("end_date") else None
    if start and not end and p.get("duration_weeks"):
        end = start + timedelta(weeks=int(p["duration_weeks"]))
    return start, end


def fmt_money(v: float, currency: str) -> str:
    sym = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}.get(currency, currency + " ")
    return f"{sym}{v:,.0f}"


def evaluate(p: dict, offer: dict, res: dict, currency: str) -> dict:
    """Return {"feasible": bool, "excluded_because": [...]} or a full match explanation."""
    reasons: list[str] = []
    excluded: list[str] = []
    contributions: list[dict] = []

    # --- what can the supporter contribute toward open gaps? ---------------
    budget = float(offer.get("budget") or 0)
    vols = int(offer.get("volunteers") or 0)
    money_gap = res["money"]["gap"] or 0
    vol_gap = res["volunteers"]["gap"] or 0
    coverage_parts: list[float] = []

    if money_gap > 0:
        if budget > 0:
            give = min(budget, money_gap)
            coverage_parts.append(give / money_gap)
            contributions.append({"kind": "money", "amount": give, "covers_fraction": round(give / money_gap, 3)})
        else:
            coverage_parts.append(0.0)
    if vol_gap > 0:
        if vols > 0:
            give = min(vols, vol_gap)
            coverage_parts.append(give / vol_gap)
            contributions.append({"kind": "volunteers", "amount": give, "covers_fraction": round(give / vol_gap, 3)})
        else:
            coverage_parts.append(0.0)

    open_skills = [s["skill"] for s in res["skills"] if not s["pledged"]]
    skill_hits = _overlap(offer.get("skills") or [], open_skills)
    if open_skills:
        coverage_parts.append(len(skill_hits) / len(open_skills))
        if skill_hits:
            contributions.append({"kind": "skills", "items": skill_hits})

    open_materials = [m["name"] for m in res["materials"] if (m["gap"] is None or m["gap"] > 0)]
    equip_hits = _overlap(offer.get("equipment") or [], open_materials)
    if open_materials:
        coverage_parts.append(len(equip_hits) / len(open_materials))
        if equip_hits:
            contributions.append({"kind": "materials", "items": equip_hits})

    if not contributions:
        excluded.append("Nothing you offered matches this project's remaining needs.")

    # --- location scope ------------------------------------------------------
    scope = offer.get("location_scope") or "anywhere"
    city, region = _norm(offer.get("city")), _norm(offer.get("region"))
    pc, pr = _norm(p.get("city")), _norm(p.get("region"))
    same_city = bool(city and pc and city == pc)
    same_region = bool(region and pr and region == pr) or same_city
    if scope == "city" and not same_city:
        excluded.append("Outside your city.")
    elif scope == "region" and not same_region:
        excluded.append("Outside your state/region.")
    if same_city:
        loc_score = 1.0
        reasons.append(f"Located in your city ({p.get('city')}).")
    elif same_region:
        loc_score = 0.6
        reasons.append(f"In your state/region ({p.get('region')}).")
    elif not (city or region):
        loc_score = 0.5
    else:
        loc_score = 0.2

    # --- timing --------------------------------------------------------------
    avail_from = date.fromisoformat(offer["available_from"]) if offer.get("available_from") else None
    avail_to = date.fromisoformat(offer["available_until"]) if offer.get("available_until") else None
    p_start, p_end = _project_window(p)
    timing_score = 0.5
    if avail_from or avail_to:
        if p_start or p_end:
            starts_before_you_leave = not (avail_to and p_start and p_start > avail_to)
            ends_after_you_start = not (avail_from and p_end and p_end < avail_from)
            if not (starts_before_you_leave and ends_after_you_start):
                excluded.append("Project dates do not overlap with your availability.")
                timing_score = 0.0
            else:
                timing_score = 1.0
                reasons.append("Project dates overlap with your availability.")
        else:
            reasons.append("Project dates are not set yet; confirm timing with the owner.")

    # --- collaboration rules ------------------------------------------------
    covers_all = all(part >= 0.999 for part in coverage_parts) if coverage_parts else False
    others = res["supporter_count"]
    collab_score = 0.5
    if not p.get("allow_multiple_supporters"):
        if others > 0:
            excluded.append("This project accepts a single supporter and already has one.")
        elif not covers_all:
            excluded.append("This project accepts a single supporter, and your offer would not cover all its needs.")
        else:
            collab_score = 1.0
    else:
        if not offer.get("open_to_partnering", True) and not covers_all:
            excluded.append("You prefer not to partner, and your offer would not cover all needs alone.")
        elif covers_all:
            collab_score = 1.0
        else:
            collab_score = 0.8 if others > 0 else 0.6
            if others:
                reasons.append(f"{others} supporter{'s' if others != 1 else ''} already committed; you can combine contributions.")
            else:
                reasons.append("Open to multiple supporters; your contribution can be combined with others.")

    if excluded:
        return {"feasible": False, "excluded_because": excluded}

    # --- cause --------------------------------------------------------------
    causes = offer.get("causes") or []
    if not causes:
        cause_score = 0.5
    elif p.get("cause") in causes:
        cause_score = 1.0
        reasons.insert(0, "Matches a cause you prefer.")
    else:
        cause_score = 0.0

    resource_score = sum(coverage_parts) / len(coverage_parts) if coverage_parts else 0.0
    for c in contributions:
        if c["kind"] == "money":
            reasons.append(f"Your budget covers {round(c['covers_fraction'] * 100)}% of the remaining funding gap.")
        elif c["kind"] == "volunteers":
            reasons.append(f"Your {int(c['amount'])} volunteer(s) cover {round(c['covers_fraction'] * 100)}% of the volunteer gap.")
        elif c["kind"] == "skills":
            reasons.append("You offer needed skills: " + ", ".join(c["items"]) + ".")
        elif c["kind"] == "materials":
            reasons.append("You can supply: " + ", ".join(c["items"]) + ".")

    # --- what would still be missing after this supporter's offer? ---------
    still_missing = []
    given = {c["kind"]: c for c in contributions}
    if money_gap > 0:
        rest = money_gap - (given["money"]["amount"] if "money" in given else 0)
        if rest > 0:
            still_missing.append(f"{fmt_money(rest, currency)} in funding")
    if vol_gap > 0:
        rest = vol_gap - (given["volunteers"]["amount"] if "volunteers" in given else 0)
        if rest > 0:
            still_missing.append(f"{int(rest)} volunteer(s)")
    for s in open_skills:
        if s not in skill_hits:
            still_missing.append(f"skill: {s}")
    for m in res["materials"]:
        if (m["gap"] is None or m["gap"] > 0) and m["name"] not in equip_hits:
            label = f"{m['gap']:g} {m['unit'] or ''} {m['name']}" if m["gap"] else m["name"]
            still_missing.append(" ".join(label.split()))
    if res["money"]["requested"] is None:
        still_missing.append("budget not yet specified by the project")

    components = {
        "cause": round(cause_score, 3), "resources": round(resource_score, 3), "location": round(loc_score, 3),
        "timing": round(timing_score, 3), "collaboration": round(collab_score, 3),
    }
    score = sum(WEIGHTS[k] * v for k, v in components.items())
    return {
        "feasible": True,
        "score": round(score * 100),
        "components": components,
        "reasons": reasons,
        "your_contribution": contributions,
        "still_missing": still_missing,
        "covers_all_needs": covers_all,
    }


def match_projects(projects: list[dict], offer: dict, currency: str) -> dict:
    matches, excluded = [], []
    for p in projects:
        res = resources.compute(p)
        result = evaluate(p, offer, res, currency)
        if result["feasible"]:
            matches.append({"project_id": p["id"], **result})
        else:
            excluded.append({"project_id": p["id"], "title": p["title"], "reasons": result["excluded_because"]})
    matches.sort(key=lambda m: (-m["score"], m["project_id"]))
    return {"matches": matches, "excluded": excluded, "weights": WEIGHTS}
