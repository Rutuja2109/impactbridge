// Domain logic ported from the Python backend (resources ledger, matching, AI guardrails).

export const CAUSES = {
  education: "Education & literacy", health: "Health & disease prevention",
  maternal_child_health: "Maternal & child health", water_sanitation: "Water, sanitation & hygiene",
  environment: "Environment", livelihoods: "Livelihoods & economic development",
  hunger_nutrition: "Hunger & nutrition", disaster_relief: "Disaster relief", elderly_care: "Elderly care",
  disability_inclusion: "Disability inclusion", women_empowerment: "Women's empowerment",
  peacebuilding: "Peacebuilding & community harmony", community_infrastructure: "Community infrastructure",
  animal_welfare: "Animal welfare",
};
export const ORG_TYPES = { community: "Community organization", rotary: "Rotary club", rotaract: "Rotaract club",
  csr: "Corporate CSR team", ngo: "NGO", company: "Company", other: "Other" };
export const COMMITMENT_KINDS = { money: "Funding", volunteers: "Volunteers", materials: "Materials",
  equipment: "Equipment", skills: "Professional skills" };
export const REPORT_REASONS = {
  suspicious: "Suspicious or fraudulent request", inaccurate: "Inaccurate information",
  safeguarding: "Safeguarding concern (children or vulnerable people)", privacy: "Exposes private information",
  offensive: "Offensive or inappropriate content", other: "Other",
};
export const ROLE_LABELS = {
  submitter: "Community organization / need submitter", club: "Rotary or Rotaract club", csr: "Corporate CSR team",
  ngo: "NGO", volunteer: "Individual volunteer", verifier: "Project verifier", admin: "Administrator",
};
export const SELF_SERVICE_ROLES = ["submitter", "club", "csr", "ngo", "volunteer"];
export const PROJECT_STATUSES = ["draft", "submitted", "needs_information", "approved", "published", "in_progress",
  "completed", "verified", "rejected"];
export const PUBLIC_STATUSES = ["published", "in_progress", "completed", "verified"];
export const SUPPORTABLE = ["published", "in_progress"];
export const EDITABLE = ["draft", "needs_information"];
export const COUNTED = ["accepted", "fulfilled"];
export const OPEN = ["proposed", "changes_requested"];
export const TRANSITIONS = {
  "draft>submitted": "owner", "needs_information>submitted": "owner",
  "submitted>needs_information": "reviewer", "submitted>approved": "reviewer", "submitted>rejected": "reviewer",
  "approved>published": "owner_or_reviewer", "published>in_progress": "owner", "in_progress>completed": "owner",
  "completed>verified": "reviewer", "completed>in_progress": "reviewer",
};

// ---------------------------------------------------------------- resources
const norm = (s) => String(s || "").toLowerCase().split(/\s+/).filter(Boolean).join(" ");
export function matches(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a) || a.replace(/s$/, "") === b.replace(/s$/, "");
}
const sum = (rows, f) => rows.reduce((t, r) => t + Number(f(r) || 0), 0);

export function computeResources(p, commitments, report) {
  const counted = commitments.filter((c) => COUNTED.includes(c.status));
  const pending = commitments.filter((c) => OPEN.includes(c.status));
  const tot = (rows, kind, field = "quantity") => sum(rows.filter((c) => c.kind === kind), (c) => c[field]);
  const budget = p.budget_required ?? null;
  const pledgedMoney = tot(counted, "money");
  const money = {
    requested: budget, proposed: tot(pending, "money"), pledged: pledgedMoney,
    received: tot(counted, "money", "received_quantity"), spent: tot(counted, "money", "spent_amount"),
    gap: budget !== null ? Math.max(0, budget - pledgedMoney) : null,
    reported_spent: report ? report.funds_spent ?? null : null,
    verified_spent: report && report.verified ? report.verified_funds_spent ?? null : null,
  };
  const volReq = p.volunteers_required ?? null;
  const pledgedVol = tot(counted, "volunteers");
  const volunteers = {
    requested: volReq, proposed: tot(pending, "volunteers"), pledged: pledgedVol,
    received: tot(counted, "volunteers", "received_quantity"),
    pledged_hours: sum(counted.filter((c) => c.kind === "volunteers"), (c) => (c.hours || 0) * (c.quantity || 0)),
    gap: volReq !== null ? Math.max(0, volReq - pledgedVol) : null,
    reported_involved: report ? report.volunteers_involved ?? null : null,
    reported_hours: report ? report.volunteer_hours ?? null : null,
    verified_involved: report && report.verified ? report.verified_volunteers_involved ?? null : null,
    verified_hours: report && report.verified ? report.verified_volunteer_hours ?? null : null,
  };
  const itemRows = commitments.filter((c) => ["materials", "equipment"].includes(c.kind));
  const used = new Set();
  const materials = (p.materials || []).map((need) => {
    const m = itemRows.filter((c) => matches(c.item, need.name));
    m.forEach((c) => used.add(c.id));
    const qty = need.quantity ?? null;
    const pledged = sum(m.filter((c) => COUNTED.includes(c.status)), (c) => c.quantity);
    return { name: need.name, unit: need.unit ?? null, requested: qty,
      proposed: sum(m.filter((c) => OPEN.includes(c.status)), (c) => c.quantity), pledged,
      received: sum(m.filter((c) => COUNTED.includes(c.status)), (c) => c.received_quantity),
      gap: qty !== null ? Math.max(0, qty - pledged) : null };
  });
  const other_items = itemRows.filter((c) => !used.has(c.id) && COUNTED.includes(c.status))
    .map((c) => ({ kind: c.kind, item: c.item, quantity: c.quantity, unit: c.unit, received: c.received_quantity }));
  const skills = (p.skills || []).map((s) => {
    const m = commitments.filter((c) => c.kind === "skills" && matches(c.item, s));
    return { skill: s, pledged: m.some((c) => COUNTED.includes(c.status)), proposed: m.some((c) => OPEN.includes(c.status)) };
  });
  const supporters = new Set(counted.map((c) => c.org_id || c.supporter_id));
  const open_gaps = [];
  if (money.gap) open_gaps.push({ kind: "money", amount: money.gap });
  if (volunteers.gap) open_gaps.push({ kind: "volunteers", amount: volunteers.gap });
  materials.forEach((m) => { if (m.gap) open_gaps.push({ kind: "materials", item: m.name, amount: m.gap, unit: m.unit }); });
  skills.forEach((s) => { if (!s.pledged) open_gaps.push({ kind: "skills", item: s.skill }); });
  return { money, volunteers, materials, other_items, skills, supporter_count: supporters.size, open_gaps,
    fully_resourced: !open_gaps.length };
}

// ---------------------------------------------------------------- matching
export const WEIGHTS = { cause: 0.25, resources: 0.35, location: 0.2, timing: 0.1, collaboration: 0.1 };
const d = (s) => (s ? new Date(s + "T00:00:00") : null);
function windowOf(p) {
  const start = d(p.start_date);
  let end = d(p.end_date);
  if (start && !end && p.duration_weeks) end = new Date(start.getTime() + p.duration_weeks * 7 * 86400000);
  return [start, end];
}
function overlap(a, b) {
  const out = [];
  for (const x of a) for (const y of b) if (matches(x, y) && !out.includes(y)) out.push(y);
  return out;
}
export function fmtMoney(v, cur = "INR") {
  const sym = { INR: "₹", USD: "$", EUR: "€", GBP: "£" }[cur] || cur + " ";
  return sym + Math.round(v).toLocaleString(cur === "INR" ? "en-IN" : undefined);
}
// Python round(): banker's rounding is not needed for display; keep simple Math.round on percents.
export function evaluate(p, offer, res, currency = "INR") {
  const reasons = [], excluded = [], contributions = [], coverage = [];
  const budget = Number(offer.budget || 0), vols = Number(offer.volunteers || 0);
  const moneyGap = res.money.gap || 0, volGap = res.volunteers.gap || 0;
  if (moneyGap > 0) {
    if (budget > 0) { const give = Math.min(budget, moneyGap); coverage.push(give / moneyGap); contributions.push({ kind: "money", amount: give, covers_fraction: give / moneyGap }); }
    else coverage.push(0);
  }
  if (volGap > 0) {
    if (vols > 0) { const give = Math.min(vols, volGap); coverage.push(give / volGap); contributions.push({ kind: "volunteers", amount: give, covers_fraction: give / volGap }); }
    else coverage.push(0);
  }
  const openSkills = res.skills.filter((s) => !s.pledged).map((s) => s.skill);
  const skillHits = overlap(offer.skills || [], openSkills);
  if (openSkills.length) { coverage.push(skillHits.length / openSkills.length); if (skillHits.length) contributions.push({ kind: "skills", items: skillHits }); }
  const openMats = res.materials.filter((m) => m.gap === null || m.gap > 0).map((m) => m.name);
  const eqHits = overlap(offer.equipment || [], openMats);
  if (openMats.length) { coverage.push(eqHits.length / openMats.length); if (eqHits.length) contributions.push({ kind: "materials", items: eqHits }); }
  if (!contributions.length) excluded.push("Nothing you offered matches this project's remaining needs.");

  const scope = offer.location_scope || "anywhere";
  const city = norm(offer.city), region = norm(offer.region), pc = norm(p.city), pr = norm(p.region);
  const sameCity = !!(city && pc && city === pc);
  const sameRegion = !!(region && pr && region === pr) || sameCity;
  if (scope === "city" && !sameCity) excluded.push("Outside your city.");
  else if (scope === "region" && !sameRegion) excluded.push("Outside your state/region.");
  let loc;
  if (sameCity) { loc = 1; reasons.push(`Located in your city (${p.city}).`); }
  else if (sameRegion) { loc = 0.6; reasons.push(`In your state/region (${p.region}).`); }
  else if (!(city || region)) loc = 0.5; else loc = 0.2;

  const af = d(offer.available_from), at = d(offer.available_until);
  const [ps, pe] = windowOf(p);
  let timing = 0.5;
  if (af || at) {
    if (ps || pe) {
      const ok1 = !(at && ps && ps > at), ok2 = !(af && pe && pe < af);
      if (!(ok1 && ok2)) { excluded.push("Project dates do not overlap with your availability."); timing = 0; }
      else { timing = 1; reasons.push("Project dates overlap with your availability."); }
    } else reasons.push("Project dates are not set yet; confirm timing with the owner.");
  }

  const coversAll = coverage.length ? coverage.every((x) => x >= 0.999) : false;
  const others = res.supporter_count;
  let collab = 0.5;
  if (!p.allow_multiple_supporters) {
    if (others > 0) excluded.push("This project accepts a single supporter and already has one.");
    else if (!coversAll) excluded.push("This project accepts a single supporter, and your offer would not cover all its needs.");
    else collab = 1;
  } else if (offer.open_to_partnering === false && !coversAll) {
    excluded.push("You prefer not to partner, and your offer would not cover all needs alone.");
  } else if (coversAll) collab = 1;
  else {
    collab = others > 0 ? 0.8 : 0.6;
    reasons.push(others ? `${others} supporter${others !== 1 ? "s" : ""} already committed; you can combine contributions.`
      : "Open to multiple supporters; your contribution can be combined with others.");
  }
  if (excluded.length) return { feasible: false, excluded_because: excluded };

  const causes = offer.causes || [];
  let cause = 0.5;
  if (causes.length) { if (causes.includes(p.cause)) { cause = 1; reasons.unshift("Matches a cause you prefer."); } else cause = 0; }
  const resource = coverage.length ? coverage.reduce((a, b) => a + b, 0) / coverage.length : 0;
  for (const c of contributions) {
    if (c.kind === "money") reasons.push(`Your budget covers ${Math.round(c.covers_fraction * 100)}% of the remaining funding gap.`);
    else if (c.kind === "volunteers") reasons.push(`Your ${c.amount} volunteer(s) cover ${Math.round(c.covers_fraction * 100)}% of the volunteer gap.`);
    else if (c.kind === "skills") reasons.push(`You offer needed skills: ${c.items.join(", ")}.`);
    else reasons.push(`You can supply: ${c.items.join(", ")}.`);
  }
  const missing = [];
  const given = Object.fromEntries(contributions.map((c) => [c.kind, c]));
  if (moneyGap > 0) { const rest = moneyGap - (given.money?.amount || 0); if (rest > 0) missing.push(`${fmtMoney(rest, currency)} in funding`); }
  if (volGap > 0) { const rest = volGap - (given.volunteers?.amount || 0); if (rest > 0) missing.push(`${rest} volunteer(s)`); }
  openSkills.forEach((s) => { if (!skillHits.includes(s)) missing.push(`skill: ${s}`); });
  res.materials.forEach((m) => {
    if ((m.gap === null || m.gap > 0) && !eqHits.includes(m.name))
      missing.push((m.gap ? `${m.gap} ${m.unit || ""} ${m.name}` : m.name).replace(/\s+/g, " ").trim());
  });
  if (res.money.requested === null) missing.push("budget not yet specified by the project");
  const components = { cause, resources: +resource.toFixed(3), location: loc, timing, collaboration: collab };
  const score = Object.entries(components).reduce((t, [k, v]) => t + WEIGHTS[k] * v, 0);
  return { feasible: true, score: Math.round(score * 100), components, reasons, your_contribution: contributions,
    still_missing: missing, covers_all_needs: coversAll };
}

// ---------------------------------------------------------------- AI guardrails
const MULT = { k: 1e3, thousand: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, crore: 1e7, cr: 1e7, million: 1e6, m: 1e6 };
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, dozen: 12 };
const DEVA_WORDS = { "एक": 1, "दो": 2, "दोन": 2, "तीन": 3, "चार": 4, "पाँच": 5, "पांच": 5, "पाच": 5, "छह": 6, "सहा": 6, "सात": 7, "आठ": 8,
  "नौ": 9, "नऊ": 9, "दस": 10, "दहा": 10, "बीस": 20, "वीस": 20, "तीस": 30, "पचास": 50, "पन्नास": 50, "सौ": 100, "शंभर": 100 };
const DEVA_MULT = { "हज़ार": 1e3, "हजार": 1e3, "लाख": 1e5, "करोड़": 1e7, "कोटी": 1e7 };
export function numbersIn(text) {
  const found = new Set();
  text = String(text || "").replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
  const dm = /(\d[\d,]*(?:\.\d+)?)\s*(हज़ार|हजार|लाख|करोड़|कोटी)/g;
  let x;
  while ((x = dm.exec(text))) found.add(parseFloat(x[1].replace(/,/g, "")) * DEVA_MULT[x[2]]);
  for (const [w, v] of Object.entries(DEVA_WORDS)) {
    const r = new RegExp(`(^|[^\u0900-\u097F])${w}(?![\u0900-\u097F])(?:\\s*(हज़ार|हजार|लाख|करोड़|कोटी))?`, "g");
    let mm;
    while ((mm = r.exec(text))) { found.add(v); if (mm[2]) found.add(v * DEVA_MULT[mm[2]]); }
  }
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakhs?|lac|crore|cr|million|m)?\b/gi;
  let m;
  while ((m = re.exec(text || ""))) {
    const v = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isNaN(v)) continue;
    found.add(v);
    if (m[2]) found.add(v * MULT[m[2].toLowerCase()]);
  }
  const low = (text || "").toLowerCase();
  for (const [w, v] of Object.entries(WORDS)) if (new RegExp(`\\b${w}\\b`).test(low)) found.add(v);
  return found;
}
function stated(value, nums, scaled = []) {
  if (value === null || value === undefined) return true;
  const v = Number(value);
  if (Number.isNaN(v)) return false;
  for (const n of nums) {
    if (Math.abs(v - n) <= Math.abs(n) * 0.001) return true;
    for (const f of scaled) if (Math.abs(v - Math.round(n * f)) <= 1) return true;
  }
  return false;
}
const cs = (v, n = 4000) => { if (v === null || v === undefined) return null; const s = String(v).trim(); return s ? s.slice(0, n) : null; };
export function sanitize(raw, source) {
  const nums = numbersIn(source);
  const missing = (raw.missing_information || []).map(String).filter((x) => x.trim()).slice(0, 15);
  const questions = (raw.follow_up_questions || []).map(String).filter((x) => x.trim()).slice(0, 10);
  const removed = [];
  const guard = (f, label, q, scaled = []) => {
    const v = raw[f];
    if (v !== null && v !== undefined && !stated(v, nums, scaled)) {
      removed.push(f); missing.push(`${label} was not stated in your description.`); questions.push(q); return null;
    }
    return v ?? null;
  };
  const budget = guard("budget_required", "Budget", "What is the estimated budget needed, if known?");
  const vols = guard("volunteers_required", "Number of volunteers", "How many volunteers would help?");
  const count = guard("beneficiary_count", "Number of beneficiaries", "Roughly how many people would benefit?");
  const weeks = guard("duration_weeks", "Duration", "How long do you expect the project to take?", [4.345, 52.18, 1 / 7]);
  const materials = (raw.materials || []).slice(0, 30).filter((m) => m && cs(m.name)).map((m) => {
    let q = m.quantity ?? null;
    if (q !== null && !stated(q, nums)) { q = null; removed.push("materials.quantity"); }
    return { name: cs(m.name, 120), quantity: q === null ? null : Number(q), unit: cs(m.unit, 40) };
  });
  const outcomes = (raw.outcomes || []).slice(0, 10).filter((o) => o && cs(o.metric)).map((o) => {
    let t = o.target ?? null;
    if (t !== null && !stated(t, nums)) { t = null; removed.push("outcomes.target"); }
    return { metric: cs(o.metric, 160), target: t === null ? null : Number(t), unit: cs(o.unit, 40) };
  });
  // The story may only repeat numbers the person gave; a sentence with an invented number is dropped.
  const story = (cs(raw.story, 700) || "").split(/(?<=[.!?।])\s+/).filter((sen) => {
    if (!sen) return false;
    const ok = [...numbersIn(sen)].every((n) => stated(n, nums));
    if (!ok) removed.push("story");
    return ok;
  }).map((sen) => sen.replace(/!/g, ".")).join(" ").slice(0, 600);
  const int = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Math.round(Number(v)));
  const flt = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
  return {
    title: cs(raw.title, 90) || "Untitled community need", story,
    problem_statement: cs(raw.problem_statement) || "", proposed_solution: cs(raw.proposed_solution) || "",
    beneficiaries: cs(raw.beneficiaries, 1000) || "", beneficiary_count: int(count),
    city: cs(raw.city, 80), region: cs(raw.region, 80), location_detail: cs(raw.location_detail, 200),
    cause: CAUSES[raw.cause] ? raw.cause : null, budget_required: flt(budget), volunteers_required: int(vols),
    materials, skills: (raw.skills || []).slice(0, 20).map((x) => cs(x, 80)).filter(Boolean),
    time_commitment: cs(raw.time_commitment, 200), duration_weeks: int(weeks),
    milestones: (raw.milestones || []).slice(0, 10).filter((m) => m && cs(m.title)).map((m) => ({ title: cs(m.title, 140), description: cs(m.description, 500) || "" })),
    outcomes, involves_children: !!raw.involves_children, involves_vulnerable: !!raw.involves_vulnerable,
    missing_information: [...new Set(missing)], follow_up_questions: [...new Set(questions)],
    removed_unstated_values: [...new Set(removed)].sort(),
    budget_estimate: estimate(raw.budget_estimate),
  };
}
function estimate(v) {
  if (!v || typeof v !== "object") return null;
  const a = Number(v.amount);
  if (!(a > 0 && a < 1e9)) return null;
  return { amount: a >= 1000 ? Math.round(a / 100) * 100 : Math.round(a), basis: cs(v.basis, 300) || "" };
}

export const AI_PROMPT = (currency) => `You help community members turn a description of a local problem into a clear,
editable project proposal for ImpactBridge, a platform connecting community needs with Rotary/Rotaract
clubs, NGOs, CSR teams and volunteers.

STRICT RULES
- Use ONLY information present in the description (and photos, if given). Never invent facts, names,
  numbers, budgets, beneficiary counts, partners, verification or results.
- If a value is not stated, return null (or an empty list) and add a short item to "missing_information"
  plus a friendly question to "follow_up_questions".
- You MAY suggest a proposed solution, milestones and outcome metrics, but these are suggestions:
  phrase them as plans, and leave every numeric "target" null unless the person gave the number.
- Keep the person's meaning; write plainly. Do not exaggerate urgency.
- "title" is a short, human headline that says who is affected and what would change, e.g. "Help the
  children of Kasarwadi school wash their hands before lunch". Not a technical label. Max 90 characters.
- "story" is 2 or 3 warm sentences that help a stranger feel why this matters: start with the people and a
  concrete moment from their day as described, then say what will change when it's fixed. Use only stated
  facts and numbers; no guilt, no pity, no exclamation marks, no words like "desperate" or "dying".
- "cause" must be one of: ${Object.keys(CAUSES).join(", ")} (or null).
- The description may be in English, Hindi or Marathi (possibly spoken). Write every text value in the
  OUTPUT LANGUAGE given below, keeping names of people and places as written.
- "budget_estimate" is the ONE place you may give your own number: a rough, typical cost in India for the
  proposed solution with a one-line basis. It is shown as a labelled suggestion and never used as the budget.
- Reply with ONLY a single JSON object, no other text.

JSON SHAPE
{"title": string (max 90 chars), "story": string (2-3 sentences, max 600 chars), "problem_statement": string, "proposed_solution": string,
 "beneficiaries": string, "beneficiary_count": integer|null, "city": string|null, "region": string|null,
 "location_detail": string|null, "cause": string|null, "budget_required": number|null (in ${currency}),
 "volunteers_required": integer|null, "materials": [{"name": string, "quantity": number|null, "unit": string|null}],
 "skills": [string], "time_commitment": string|null, "duration_weeks": integer|null,
 "milestones": [{"title": string, "description": string}],
 "outcomes": [{"metric": string, "target": number|null, "unit": string|null}],
 "budget_estimate": {"amount": number, "basis": string}|null,
 "involves_children": boolean, "involves_vulnerable": boolean,
 "missing_information": [string], "follow_up_questions": [string]}`;
