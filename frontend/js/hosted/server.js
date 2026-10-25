// ImpactBridge API running inside the hosted page. Mirrors backend/app/routes/* over the shared store.
// Permission checks here run in the browser: right for a pilot, not a substitute for a server.
import { Store } from "./store.js";
import {
  AI_PROMPT, CAUSES, COMMITMENT_KINDS, COUNTED, EDITABLE, ORG_TYPES, PUBLIC_STATUSES, PROJECT_STATUSES,
  REPORT_REASONS, ROLE_LABELS, SELF_SERVICE_ROLES, SUPPORTABLE, TRANSITIONS, WEIGHTS, computeResources, evaluate,
  numbersIn, sanitize,
} from "./logic.js";

const CURRENCY = "INR";
const REVIEWERS = ["admin", "verifier"];

class HErr extends Error {
  constructor(status, error, field, details) { super(error); this.status = status; this.body = { error, field, details }; }
}
const E = (s, m, f, d) => { throw new HErr(s, m, f, d); };
const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now()).replace(/-/g, "");
const today = () => new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------------ setup
let S, CTX = { uid: null, isOwner: false, canWrite: true, platform: {} };
export async function boot(platform) {
  CTX.platform = platform;
  S = new Store(platform.db);
  const user = platform.user;
  CTX.uid = user ? await user.id() : null;
  CTX.isOwner = user ? await user.isOwner() : false;
  const cw = user ? await user.can("data.write") : null;
  CTX.canWrite = cw !== false;
  await S.init();
  return S;
}
export function onDataChange(fn) { S?.onChange(fn); }
export const hostedContext = () => CTX;

// ------------------------------------------------------------------ validation helpers
const str = (v, { field, min = 0, max = 4000, required = false, label } = {}) => {
  if (v === null || v === undefined || String(v).trim() === "") {
    if (required || min > 0) E(422, `${label || field}: Please fill this in.`, field);
    return null;
  }
  const s = String(v).trim();
  if (s.length < min) E(422, `${label || field}: Use at least ${min} characters.`, field);
  if (s.length > max) E(422, `${label || field}: Keep this under ${max + 1} characters.`, field);
  return s;
};
const numv = (v, { field, min = 0, max = 1e12, int = false, gt = false, label } = {}) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) E(422, `${label || field}: Enter a number.`, field);
  if (gt ? n <= min : n < min) E(422, `${label || field}: Must be ${gt ? "greater than" : "at least"} ${min}`, field);
  if (n > max) E(422, `${label || field}: Too large`, field);
  return int ? Math.round(n) : n;
};
const datev = (v, field) => {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || Number.isNaN(new Date(v).getTime())) E(422, `${field}: Use the date format YYYY-MM-DD`, field);
  return String(v);
};
const bool = (v) => !!v;

// ------------------------------------------------------------------ identity
function me() {
  if (!CTX.uid) return null;
  const m = S.get("members", CTX.uid);
  if (!m || m.is_suspended) return null;
  return m;
}
function requireUser() {
  const u = me();
  if (!u) E(401, "Please create your ImpactBridge profile to continue.");
  if (!CTX.canWrite) E(403, "You can browse this ImpactBridge preview, but only people the owner invited as editors can take part.");
  return u;
}
const isReviewer = (u) => !!u && REVIEWERS.includes(u.role);
const requireRoles = (...roles) => { const u = requireUser(); if (!roles.includes(u.role)) E(403, "Your account role is not allowed to do this."); return u; };

// ------------------------------------------------------------------ audit + notifications
async function audit(actor, action, subject_type, subject_id, details = {}) {
  await S.put("audit", { id: newId(), actor_id: actor, action, subject_type, subject_id, details, created_at: now() });
}
async function notify(user_id, type, title, body = "", link = "", dedupe = null) {
  if (!user_id) return false;
  const id = dedupe ? "d-" + dedupe.replace(/[^A-Za-z0-9_\-.~:@+]/g, "_").slice(0, 180) : newId();
  if (dedupe && S.get("notifications", id)) return false;
  await S.put("notifications", { id, user_id, type, title, body, link, is_read: false, created_at: now() });
  return true;
}
const notifyMany = async (ids, ...a) => { for (const id of [...new Set(ids.filter(Boolean))]) await notify(id, ...a); };
const reviewers = () => S.where("members", (m) => REVIEWERS.includes(m.role) && !m.is_suspended).map((m) => m.id);

// ------------------------------------------------------------------ project helpers
const orgRole = (uid, orgId) => {
  if (!orgId) return null;
  const o = S.get("orgs", orgId);
  return o?.members?.find((m) => m.user_id === uid)?.member_role || null;
};
const isManager = (u, p) => !!u && (p.owner_id === u.id || ["owner", "admin"].includes(orgRole(u.id, p.org_id)));
const commitsOf = (pid) => S.where("commitments", (c) => c.project_id === pid).sort((a, b) => a.created_at.localeCompare(b.created_at));
const isSupporter = (u, p) => !!u && commitsOf(p.id).some((c) => c.supporter_id === u.id && COUNTED.includes(c.status));
const isTeam = (u, p) => isManager(u, p) || isSupporter(u, p) || isReviewer(u);
const canView = (u, p) => isReviewer(u) || isManager(u, p) || (!p.is_hidden && PUBLIC_STATUSES.includes(p.status));
const getProject = (id) => S.get("projects", id) || E(404, "Project not found.");
const requireView = (u, p) => { if (!canView(u, p)) E(404, "Project not found."); };
const requireManager = (u, p) => { if (!isManager(u, p)) E(403, "Only the project owner or its organization admins can do this."); };
const resOf = (p) => computeResources(p, commitsOf(p.id), p.impact_report || null);
const orgSummary = (id) => { const o = S.get("orgs", id); return o ? { id: o.id, name: o.name, org_type: o.org_type, verification_status: o.verification_status, is_demo: !!o.is_demo } : null; };
const userSummary = (id) => { const u = S.get("members", id); return u ? { id: u.id, name: u.name, role: u.role } : null; };
const fileUrl = (f) => `/_blob/${f.asset_id}`;
const publicFile = (f) => ({ id: f.id, original_name: f.original_name, mime: f.mime, size: f.size, purpose: f.purpose, visibility: f.visibility, created_at: f.created_at, url: fileUrl(f) });
function canViewFile(u, f, p) {
  if (u && (f.owner_id === u.id || isReviewer(u))) return true;
  if (f.org_id && !f.project_id) return !!u && !!orgRole(u.id, f.org_id) && f.visibility !== "reviewers";
  p = p || (f.project_id && S.get("projects", f.project_id));
  if (!p) return false;
  if (f.visibility === "public") return canView(u, p);
  if (f.visibility === "team") return isTeam(u, p);
  return isManager(u, p);
}
const coverPhoto = (pid) => { const f = S.where("files", (x) => x.project_id === pid && x.purpose === "need_photo" && x.visibility === "public").sort((a, b) => a.created_at.localeCompare(b.created_at))[0]; return f ? fileUrl(f) : null; };
function lastActivity(p) {
  const c = [p.published_at,
    ...S.where("updates", (u) => u.project_id === p.id && !u.is_hidden).map((u) => u.created_at),
    ...(p.milestones || []).map((m) => m.completed_at),
    ...commitsOf(p.id).filter((c) => COUNTED.includes(c.status)).map((c) => c.updated_at)].filter(Boolean);
  return c.length ? c.sort().at(-1) : null;
}
function supporterLabel(c) {
  if (c.org_id) { const o = S.get("orgs", c.org_id); if (o) return o.name; }
  const u = S.get("members", c.supporter_id);
  return u ? u.name.split(" ")[0] : "A supporter";
}
const effortLevel = (p) => {
  const d = p.duration_weeks, v = p.volunteers_required;
  if ((d || 0) > 8 || (v || 0) > 20) return "heavy";
  if ((d == null || d <= 2) && (v == null || v <= 5)) return "light";
  return "medium";
};
function summary(p, res) {
  res = res || resOf(p);
  return {
    id: p.id, title: p.title, status: p.status, cause: p.cause, cause_label: CAUSES[p.cause] || null,
    city: p.city, region: p.region, problem_excerpt: (p.problem_statement || "").slice(0, 220), story: (p.story || "").slice(0, 600),
    budget_required: p.budget_required ?? null, volunteers_required: p.volunteers_required ?? null,
    duration_weeks: p.duration_weeks ?? null, start_date: p.start_date ?? null, end_date: p.end_date ?? null,
    posted_by: orgSummary(p.org_id)?.name || (userSummary(p.owner_id)?.name || "").split(" ")[0], skills: p.skills || [], materials: p.materials || [],
    effort: effortLevel(p), time_commitment: p.time_commitment ?? null,
    need_verified: !!p.need_verified, completion_verified: !!p.completion_verified, financial_verified: !!p.financial_verified,
    allow_multiple_supporters: !!p.allow_multiple_supporters, is_demo: !!p.is_demo, organization: orgSummary(p.org_id),
    funding: { requested: res.money.requested, pledged: res.money.pledged, gap: res.money.gap },
    volunteers: { requested: res.volunteers.requested, pledged: res.volunteers.pledged, gap: res.volunteers.gap },
    supporter_count: res.supporter_count,
    supporters_preview: [...new Set(commitsOf(p.id).filter((c) => COUNTED.includes(c.status)).map(supporterLabel))].slice(0, 3),
    cover_photo: coverPhoto(p.id), updated_at: p.updated_at, published_at: p.published_at ?? null,
    last_activity_at: lastActivity(p),
    open_items: res.materials.filter((m) => m.gap === null || m.gap > 0).slice(0, 4).map((m) => ({ name: m.name, gap: m.gap, unit: m.unit })),
    open_skills: res.skills.filter((s) => !s.pledged).slice(0, 4).map((s) => s.skill),
  };
}
function serializeCommitment(c, u, p, manager) {
  manager = manager ?? isManager(u, p);
  const mine = !!u && c.supporter_id === u.id;
  const out = {};
  for (const k of ["id", "project_id", "kind", "quantity", "item", "unit", "hours", "description", "deadline", "status", "received_quantity", "spent_amount", "responsibility", "created_at", "updated_at"]) out[k] = c[k] ?? null;
  out.received_quantity = c.received_quantity || 0; out.spent_amount = c.spent_amount || 0;
  out.supporter = userSummary(c.supporter_id); out.organization = orgSummary(c.org_id); out.is_mine = mine;
  if (manager || mine || isReviewer(u)) out.owner_message = c.owner_message ?? null;
  return out;
}
function timeline(p, u) {
  const ev = [];
  if (p.published_at) ev.push({ at: p.published_at, kind: "published", title: "Project published", body: "Approved by a reviewer and opened for support." });
  for (const c of commitsOf(p.id).filter((c) => COUNTED.includes(c.status))) {
    const what = { money: "funding", volunteers: "volunteers", materials: "materials", equipment: "equipment", skills: "skills" }[c.kind];
    const done = c.status === "fulfilled";
    ev.push({ at: done ? c.updated_at : c.created_at, kind: done ? "delivered" : "pledge", title: `${supporterLabel(c)} ${done ? "delivered" : "committed"} ${what}`,
      commitment: { kind: c.kind, quantity: c.quantity, item: c.item, unit: c.unit, hours: c.hours } });
  }
  for (const m of (p.milestones || []).filter((m) => m.status === "done" && m.completed_at)) ev.push({ at: m.completed_at, kind: "milestone", title: `Milestone completed: ${m.title}`, body: m.description || "" });
  for (const up of S.where("updates", (x) => x.project_id === p.id && !x.is_hidden)) {
    const files = (up.file_ids || []).map((id) => S.get("files", id)).filter((f) => f && canViewFile(u, f, p)).map(publicFile);
    ev.push({ at: up.created_at, kind: "update", title: up.title, body: up.body, author: S.get("members", up.author_id)?.name || null, files });
  }
  for (const v of S.where("verifications", (v) => v.subject_type === "project" && v.subject_id === p.id && v.status === "approved")) {
    ev.push({ at: v.reviewed_at, kind: "verified", title: { project_need: "Need verified by a reviewer", project_financial: "Budget checked by a reviewer", project_completion: "Completion independently verified" }[v.kind] || "Verified", body: v.reviewer_notes || "" });
  }
  if (p.impact_report) ev.push({ at: p.impact_report.submitted_at, kind: "report", title: "Impact report submitted", body: (p.impact_report.summary || "").slice(0, 300) });
  return ev.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
}
function participants(commitments) {
  const seen = new Set(), out = [];
  for (const c of commitments.filter((c) => COUNTED.includes(c.status))) {
    const key = c.org_id || c.supporter_id;
    if (seen.has(key)) continue;
    seen.add(key);
    if (c.org_id) out.push({ type: "organization", ...(orgSummary(c.org_id) || {}) });
    else { const s = userSummary(c.supporter_id) || {}; out.push({ type: "individual", ...s }); }
  }
  return out;
}
function detail(p, u) {
  const commitments = commitsOf(p.id);
  const report = p.impact_report || null;
  const res = computeResources(p, commitments, report);
  const manager = isManager(u, p), team = isTeam(u, p), reviewer = isReviewer(u);
  const sensitive = p.involves_children || p.involves_vulnerable;
  const files = S.where("files", (f) => f.project_id === p.id).sort((a, b) => a.created_at.localeCompare(b.created_at)).filter((f) => canViewFile(u, f, p));
  const out = {
    ...summary(p, res), problem_statement: p.problem_statement, proposed_solution: p.proposed_solution, story: p.story || "", beneficiaries: p.beneficiaries,
    beneficiary_count: p.beneficiary_count ?? null, location_detail: team || !sensitive ? p.location_detail ?? null : null,
    location_detail_hidden: !!(sensitive && !team && p.location_detail), time_commitment: p.time_commitment ?? null, end_date: p.end_date ?? null,
    involves_children: !!p.involves_children, involves_vulnerable: !!p.involves_vulnerable, safeguarding_notes: team ? p.safeguarding_notes ?? null : null,
    ai_assisted: !!p.ai_assisted, owner: userSummary(p.owner_id), resources: res,
    milestones: [...(p.milestones || [])].sort((a, b) => (a.sort_order - b.sort_order) || String(a.due_date || "").localeCompare(String(b.due_date || ""))),
    outcomes: p.outcomes || [], checklist: p.checklist || [],
    updates: [], photos: files.filter((f) => f.purpose === "need_photo").map(publicFile),
    evidence: files.filter((f) => ["evidence", "impact"].includes(f.purpose)).map(publicFile),
    impact_report: report, timeline: timeline(p, u),
    verifications: manager || reviewer ? S.where("verifications", (v) => v.subject_type === "project" && v.subject_id === p.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((v) => ({ id: v.id, kind: v.kind, status: v.status, reviewer_notes: v.reviewer_notes ?? null, created_at: v.created_at, reviewed_at: v.reviewed_at ?? null })) : [],
    participants: participants(commitments),
    permissions: { is_manager: manager, is_team: team, is_reviewer: reviewer, can_edit: manager && EDITABLE.includes(p.status),
      can_support: !!u && CTX.canWrite && !manager && !reviewer && SUPPORTABLE.includes(p.status) },
  };
  out.interest = interestInfo(p, u);
  out.can_chat = chatAccess(u, p);
  if (manager || reviewer) Object.assign(out, { original_description: p.original_description || "", missing_info: p.missing_info || [], follow_up_questions: p.follow_up_questions || [], review_notes: p.review_notes ?? null });
  out.commitments = commitments.filter((c) => manager || reviewer || (u && c.supporter_id === u.id) || COUNTED.includes(c.status)).map((c) => serializeCommitment(c, u, p, manager));
  return out;
}

// ------------------------------------------------------------------ meta & auth
function integrations() {
  return {
    ai_structuring: { configured: !!CTX.platform.sample, provider: "claude", needs: "Uses the viewer's own Claude account." },
    semantic_search: { configured: false, provider: null, needs: "Not available in the hosted preview." },
    voice_transcription: { configured: false, provider: null, needs: "Use browser dictation." },
    email: { configured: false, provider: null, needs: "Not available in the hosted preview." },
    payments: { configured: false, provider: null, needs: "Money pledges are recorded, not collected online." },
  };
}
function mePayload(u) {
  const orgs = S.where("orgs", (o) => (o.members || []).some((m) => m.user_id === u.id)).map((o) => ({ id: o.id, name: o.name, org_type: o.org_type, verification_status: o.verification_status, member_role: orgRole(u.id, o.id) }));
  return { id: u.id, email: null, name: u.name, role: u.role, role_label: ROLE_LABELS[u.role] || u.role, phone: u.phone ?? null,
    city: u.city ?? null, region: u.region ?? null, bio: u.bio ?? null, skills: u.skills || [], email_notifications: false,
    organizations: orgs, unread_notifications: S.where("notifications", (n) => n.user_id === u.id && !n.is_read).length,
    created_at: u.created_at, is_owner: CTX.isOwner, hosted: true };
}
const ROLE_TO_ORG = { club: ["rotary", "rotaract"], csr: ["csr", "company"], ngo: ["ngo"], submitter: ["community", "ngo", "other"] };
function orgFields(o, field = "organization") {
  const name = str(o.name, { field: `${field}.name`, min: 2, max: 150, label: "Organization name" });
  if (!ORG_TYPES[o.org_type]) E(422, "Choose a valid organization type", `${field}.org_type`);
  let website = str(o.website, { field: "website", max: 200 });
  if (website && !/^https?:\/\//.test(website)) website = "https://" + website;
  return { name, org_type: o.org_type, description: str(o.description, { max: 3000 }), city: str(o.city, { max: 80 }), region: str(o.region, { max: 80 }),
    website, registration_number: str(o.registration_number, { max: 80 }), contact_email: str(o.contact_email, { max: 254 }) };
}
async function register(b) {
  if (!CTX.uid) E(401, "Sign in to Claude to create a profile.");
  if (!CTX.canWrite) E(403, "This is a view-only link. Ask the owner to invite you as an editor to take part.");
  if (S.get("members", CTX.uid)) E(409, "You already have a profile.");
  let role = b.role;
  const allowed = CTX.isOwner ? [...SELF_SERVICE_ROLES, "admin", "verifier"] : SELF_SERVICE_ROLES;
  if (!allowed.includes(role)) E(422, "Choose a valid account type", "role");
  if (!b.accept_terms) E(422, "Please accept the community guidelines and privacy terms", "accept_terms");
  const name = str(b.name, { field: "name", min: 2, max: 120, label: "Name" });
  const ts = now();
  const u = { id: CTX.uid, name, role, city: str(b.city, { max: 80 }), region: str(b.region, { max: 80 }), skills: [], bio: null, phone: null, is_suspended: false, created_at: ts, updated_at: ts };
  if (b.organization && b.organization.name) {
    const o = orgFields(b.organization);
    if (ROLE_TO_ORG[role] && !ROLE_TO_ORG[role].includes(o.org_type)) E(422, `For this account type the organization type must be one of: ${ROLE_TO_ORG[role].join(", ")}.`, "organization.org_type");
    const oid = newId();
    await S.put("orgs", { ...o, id: oid, city: o.city || u.city, region: o.region || u.region, verification_status: "unverified", created_by: u.id, members: [{ user_id: u.id, member_role: "owner", created_at: ts }], created_at: ts, updated_at: ts });
  }
  await S.put("members", u);
  await audit(u.id, "user.registered", "user", u.id, { role });
  return { user: mePayload(u) };
}
async function updateMe(b) {
  const u = requireUser();
  const ch = {};
  if ("name" in b) ch.name = str(b.name, { field: "name", min: 2, max: 120, label: "Name" });
  for (const k of ["phone", "city", "region"]) if (k in b) ch[k] = str(b[k], { field: k, max: 80 });
  if ("bio" in b) ch.bio = str(b.bio, { field: "bio", max: 2000 });
  if ("skills" in b) ch.skills = [...new Set((b.skills || []).map((s) => String(s).trim().slice(0, 80)).filter(Boolean))].slice(0, 30);
  if ("role" in b) {
    if (!CTX.isOwner) E(403, "Only the owner of this preview can switch roles.");
    if (!ROLE_LABELS[b.role]) E(422, "Unknown role.", "role");
    ch.role = b.role;
  }
  ch.updated_at = now();
  const nu = await S.patch("members", u.id, ch);
  return { user: mePayload(nu) };
}

// ------------------------------------------------------------------ organizations
const publicOrg = (o) => ({ id: o.id, name: o.name, org_type: o.org_type, description: o.description ?? null, city: o.city ?? null, region: o.region ?? null, website: o.website ?? null, verification_status: o.verification_status, verified_at: o.verified_at ?? null, is_demo: !!o.is_demo, created_at: o.created_at, org_type_label: ORG_TYPES[o.org_type] || o.org_type });
function getOrg(id) {
  const u = me(); const o = S.get("orgs", id) || E(404, "Organization not found.");
  const out = publicOrg(o);
  const role = u ? orgRole(u.id, o.id) : null;
  out.my_role = role;
  if (role || isReviewer(u)) {
    Object.assign(out, { registration_number: o.registration_number ?? null, contact_email: o.contact_email ?? null,
      members: (o.members || []).map((m) => { const mu = S.get("members", m.user_id); return { id: m.user_id, name: mu?.name || "Member", email: null, role: mu?.role, member_role: m.member_role }; }),
      verifications: S.where("verifications", (v) => v.subject_type === "organization" && v.subject_id === o.id).map((v) => ({ id: v.id, kind: v.kind, status: v.status, reviewer_notes: v.reviewer_notes ?? null, created_at: v.created_at, reviewed_at: v.reviewed_at ?? null })) });
  }
  const pub = (p) => !p.is_hidden && PUBLIC_STATUSES.includes(p.status);
  out.projects = S.where("projects", (p) => p.org_id === o.id && pub(p)).map((p) => summary(p));
  const supported = new Set(S.where("commitments", (c) => c.org_id === o.id && COUNTED.includes(c.status)).map((c) => c.project_id));
  out.supported_projects = [...supported].map((id) => S.get("projects", id)).filter((p) => p && pub(p)).map((p) => summary(p));
  return { organization: out };
}
const requireOrgAdmin = (u, o) => { if (!["owner", "admin"].includes(orgRole(u.id, o.id)) && !isReviewer(u)) E(403, "Only organization owners or admins can do this."); };
async function createOrg(b) {
  const u = requireUser(); const o = orgFields(b, "org"); const ts = now(); const id = newId();
  await S.put("orgs", { ...o, id, contact_email: o.contact_email, verification_status: "unverified", created_by: u.id, members: [{ user_id: u.id, member_role: "owner", created_at: ts }], created_at: ts, updated_at: ts });
  await audit(u.id, "org.created", "organization", id);
  return { organization: publicOrg(S.get("orgs", id)) };
}
async function updateOrg(id, b) {
  const u = requireUser(); const o = S.get("orgs", id) || E(404, "Organization not found."); requireOrgAdmin(u, o);
  const ch = {};
  if ("name" in b) ch.name = str(b.name, { field: "name", min: 2, max: 150, label: "Name" });
  for (const k of ["description", "city", "region", "website", "registration_number", "contact_email"]) if (k in b) ch[k] = str(b[k], { field: k, max: k === "description" ? 3000 : 254 });
  if (o.verification_status === "verified" && ["name", "registration_number"].some((k) => k in ch && ch[k] !== o[k])) Object.assign(ch, { verification_status: "unverified", verified_by: null, verified_at: null });
  await S.patch("orgs", id, { ...ch, updated_at: now() });
  await audit(u.id, "org.updated", "organization", id, { fields: Object.keys(ch) });
  return { organization: publicOrg(S.get("orgs", id)) };
}
async function addMember(id, b) {
  const u = requireUser(); const o = S.get("orgs", id) || E(404, "Organization not found."); requireOrgAdmin(u, o);
  const target = S.get("members", b.user_id) || E(404, "Choose someone who already has an ImpactBridge profile.", "user_id");
  if (orgRole(target.id, id)) E(409, "This person is already a member.");
  const role = b.member_role === "admin" ? "admin" : "member";
  await S.patch("orgs", id, { members: [...(o.members || []), { user_id: target.id, member_role: role, created_at: now() }] });
  await notify(target.id, "org_membership", `You were added to ${o.name}`, `${u.name} added you as ${role}.`, `/organizations/${id}`);
  return { ok: true };
}
async function removeMember(id, uid) {
  const u = requireUser(); const o = S.get("orgs", id) || E(404, "Organization not found.");
  if (uid !== u.id) requireOrgAdmin(u, o);
  const r = orgRole(uid, id); if (!r) E(404, "Member not found.");
  if (r === "owner" && (o.members || []).filter((m) => m.member_role === "owner").length <= 1) E(400, "An organization must keep at least one owner.");
  await S.patch("orgs", id, { members: o.members.filter((m) => m.user_id !== uid) });
  return { ok: true };
}

// ------------------------------------------------------------------ projects
function projectValues(b, u) {
  const v = {
    title: str(b.title, { field: "title", min: 5, max: 120, label: "Title" }),
    problem_statement: str(b.problem_statement, { field: "problem_statement", max: 6000 }) || "",
    proposed_solution: str(b.proposed_solution, { field: "proposed_solution", max: 6000 }) || "",
    story: str(b.story, { field: "story", max: 700 }) || "",
    beneficiaries: str(b.beneficiaries, { field: "beneficiaries", max: 2000 }) || "",
    beneficiary_count: numv(b.beneficiary_count, { field: "beneficiary_count", int: true, max: 1e8, label: "Beneficiary count" }),
    city: str(b.city, { field: "city", max: 80 }), region: str(b.region, { field: "region", max: 80 }),
    location_detail: str(b.location_detail, { field: "location_detail", max: 300 }),
    cause: b.cause ? (CAUSES[b.cause] ? b.cause : E(422, "Choose a valid cause", "cause")) : null,
    budget_required: numv(b.budget_required, { field: "budget_required", label: "Budget" }),
    volunteers_required: numv(b.volunteers_required, { field: "volunteers_required", int: true, max: 1e5, label: "Volunteers" }),
    materials: (b.materials || []).slice(0, 40).map((m, i) => ({ name: str(m.name, { field: `materials.${i}.name`, min: 1, max: 120, label: "Material name" }), quantity: numv(m.quantity, { field: `materials.${i}.quantity` }), unit: str(m.unit, { max: 40 }) })),
    skills: [...new Set((b.skills || []).map((s) => String(s).trim().slice(0, 80)).filter(Boolean))].slice(0, 30),
    time_commitment: str(b.time_commitment, { field: "time_commitment", max: 300 }),
    duration_weeks: numv(b.duration_weeks, { field: "duration_weeks", int: true, max: 520, label: "Duration" }),
    start_date: datev(b.start_date, "start_date"), end_date: datev(b.end_date, "end_date"),
    missing_info: (b.missing_info || []).slice(0, 30), follow_up_questions: (b.follow_up_questions || []).slice(0, 30),
    allow_multiple_supporters: b.allow_multiple_supporters !== false, involves_children: bool(b.involves_children),
    involves_vulnerable: bool(b.involves_vulnerable), safeguarding_notes: str(b.safeguarding_notes, { field: "safeguarding_notes", max: 2000 }),
    org_id: b.org_id || null,
  };
  if (v.start_date && v.end_date && v.end_date < v.start_date) E(422, "End date must be after the start date", "end_date");
  if (v.org_id && !orgRole(u.id, v.org_id)) E(403, "You can only post on behalf of organizations you belong to.", "org_id");
  if ((v.involves_children || v.involves_vulnerable) && !v.safeguarding_notes) E(422, "Projects involving children or vulnerable people need safeguarding notes (who supervises, how consent and privacy are handled).", "safeguarding_notes");
  return v;
}
function plan(b, existing) {
  const out = {};
  if (Array.isArray(b.milestones)) {
    const kept = (existing.milestones || []).filter((m) => m.status !== "pending");
    out.milestones = [...kept, ...b.milestones.slice(0, 30).map((m, i) => ({ id: newId(), title: str(m.title, { field: `milestones.${i}.title`, min: 2, max: 140, label: "Milestone" }), description: str(m.description, { max: 1000 }) || "", due_date: datev(m.due_date, "due_date"), status: "pending", responsible: null, sort_order: kept.length + i, completed_at: null, created_at: now() }))];
  }
  if (Array.isArray(b.outcomes)) {
    const kept = (existing.outcomes || []).filter((o) => o.reported_value !== null && o.reported_value !== undefined || o.verified_value !== null && o.verified_value !== undefined);
    out.outcomes = [...kept, ...b.outcomes.slice(0, 20).map((o, i) => ({ id: newId(), metric: str(o.metric, { field: `outcomes.${i}.metric`, min: 2, max: 160, label: "Measure" }), target: numv(o.target, {}), unit: str(o.unit, { max: 40 }), reported_value: null, verified_value: null, created_at: now() }))];
  }
  return out;
}
async function attachPhotos(ids, p, u) {
  for (const fid of ids || []) {
    const f = S.get("files", fid);
    if (!f || f.owner_id !== u.id) E(422, "One of the photos could not be found. Please upload it again.", "photo_file_ids");
    if (f.project_id && f.project_id !== p.id) E(422, "A photo belongs to another project.", "photo_file_ids");
    if ((p.involves_children || p.involves_vulnerable) && !f.consent_confirmed && f.visibility === "public") E(422, "Photos for projects involving children or vulnerable people must be uploaded with consent confirmed, or kept team-only.", "photo_file_ids");
    await S.patch("files", fid, { project_id: p.id });
  }
}
async function createProject(b) {
  const u = requireUser();
  if (isReviewer(u)) E(403, CTX.isOwner ? "Reviewer roles can't submit projects. Switch your role in Profile to try this." : "Reviewer accounts cannot submit projects; use a regular account.");
  const v = projectValues(b, u); const ts = now(); const id = newId();
  const p = { ...v, id, owner_id: u.id, status: "draft", original_description: str(b.original_description, { max: 20000 }) || "", ai_assisted: !!b.ai_assisted,
    ai_provider: b.ai_assisted ? b.ai_provider || "claude" : null, need_verified: false, financial_verified: false, completion_verified: false,
    is_hidden: false, is_demo: false, milestones: [], outcomes: [], checklist: [], impact_report: null, review_notes: null, created_at: ts, updated_at: ts,
    submitted_at: null, published_at: null, completed_at: null };
  Object.assign(p, plan(b, p));
  await attachPhotos(b.photo_file_ids, p, u);
  await S.put("projects", p);
  await audit(u.id, "project.created", "project", id, { ai_assisted: !!b.ai_assisted });
  return { project: detail(S.get("projects", id), u) };
}
async function updateProject(id, b) {
  const u = requireUser(); const p = getProject(id); requireManager(u, p);
  if (!EDITABLE.includes(p.status)) E(409, "This project can only be edited while it is a draft or when reviewers request more information.");
  const v = projectValues(b, u);
  const next = { ...p, ...v, ...plan(b, p), updated_at: now() };
  if (b.original_description && !p.original_description) next.original_description = b.original_description;
  await attachPhotos(b.photo_file_ids, next, u);
  await S.put("projects", next);
  await audit(u.id, "project.edited", "project", id);
  return { project: detail(S.get("projects", id), u) };
}
async function deleteProject(id) {
  const u = requireUser(); const p = getProject(id); requireManager(u, p);
  if (p.status !== "draft") E(409, "Only drafts can be deleted.");
  await S.del("projects", id); await audit(u.id, "project.deleted", "project", id);
  return { ok: true };
}
function submissionProblems(p) {
  const out = [];
  if ((p.problem_statement || "").trim().length < 30) out.push("Describe the problem in at least 30 characters.");
  if (!p.city) out.push("Add the city or town.");
  if (!p.cause) out.push("Choose a cause.");
  if (!(p.budget_required || p.volunteers_required || (p.materials || []).length || (p.skills || []).length)) out.push("Add at least one requirement: budget, volunteers, materials or skills.");
  if (!S.where("files", (f) => f.project_id === p.id && f.purpose === "need_photo").length) out.push("Add at least one real photo of the problem. Projects with photos get far more support.");
  return out;
}
const supporterIds = (pid) => [...new Set(commitsOf(pid).filter((c) => COUNTED.includes(c.status)).map((c) => c.supporter_id))];
async function transition(id, b) {
  const u = requireUser(); const p = getProject(id); const target = b.status; const notes = str(b.notes, { max: 3000 });
  if (target === "verified") E(409, "Projects become verified through a completion verification review.");
  const rule = TRANSITIONS[`${p.status}>${target}`];
  if (!rule) E(409, `A project cannot move from '${p.status}' to '${target}'.`);
  const manager = isManager(u, p), reviewer = isReviewer(u);
  const allowed = (rule === "owner" && manager) || (rule === "reviewer" && reviewer) || (rule === "owner_or_reviewer" && (manager || reviewer));
  if (!allowed) E(403, "You don't have permission to make this change.");
  const selfReview = rule === "reviewer" && p.owner_id === u.id;
  if (selfReview && !CTX.isOwner) E(403, "You cannot review your own project.");
  if (target === "submitted") { const pr = submissionProblems(p); if (pr.length) E(422, "Please complete the proposal before submitting.", null, pr.map((m) => ({ message: m }))); }
  if (["needs_information", "rejected"].includes(target) && !notes) E(422, "Please explain what is needed so the owner can act on it.", "notes");
  if (target === "completed" && !p.impact_report) E(422, "Submit an impact report before marking the project completed.");
  const ts = now(); const ch = { status: target, updated_at: ts };
  if (rule === "reviewer" || (rule === "owner_or_reviewer" && reviewer && !manager)) ch.review_notes = notes;
  if (target === "submitted") ch.submitted_at = ts;
  if (target === "published") ch.published_at = ts;
  if (target === "completed") ch.completed_at = ts;
  await S.patch("projects", id, ch);
  await audit(u.id, `project.${target}`, "project", id, { from_status: p.status, notes, ...(selfReview ? { owner_self_review: true } : {}) });
  const link = `/projects/${id}`;
  if (target === "submitted") await notifyMany(reviewers(), "review_needed", "New project awaiting review", p.title, "/admin");
  else if (["needs_information", "approved", "rejected"].includes(target)) await notify(p.owner_id, "review_decision", `Your project ${{ needs_information: "needs more information", approved: "was approved", rejected: "was not approved" }[target]}`, notes || p.title, link);
  else if (target === "published") { if (p.owner_id !== u.id) await notify(p.owner_id, "review_decision", "Your project is now public", p.title, link); }
  else if (["in_progress", "completed"].includes(target)) {
    await notifyMany(supporterIds(id), "project_status", `${p.title} is now ${target.replace("_", " ")}`, notes || "", link);
    if (target === "completed") await createVerification("project_completion", id, u.id, notes, []);
  }
  if (target === "in_progress" && p.status === "completed") await notify(p.owner_id, "review_decision", "Completion evidence needs more work", notes || "", link);
  return { project: detail(S.get("projects", id), me()) };
}

function keywordScore(p, terms) {
  const fields = [[p.title, 4], [p.problem_statement, 2], [p.proposed_solution, 1], [p.beneficiaries, 1], [CAUSES[p.cause] || "", 2], [p.city, 2], [p.region, 1], [(p.skills || []).join(" "), 2], [(p.materials || []).map((m) => m.name).join(" "), 2]];
  let score = 0;
  for (const t of terms) { let hit = 0; for (const [txt, w] of fields) if (txt && String(txt).toLowerCase().includes(t)) hit += w; if (!hit) return 0; score += hit; }
  return score;
}
function explore(q) {
  const statuses = (q.status || "").split(",").filter((s) => PUBLIC_STATUSES.includes(s));
  const st = statuses.length ? statuses : PUBLIC_STATUSES;
  const nb = (k) => (q[k] === undefined || q[k] === "" ? null : (Number.isNaN(Number(q[k])) ? E(422, `${k} must be a number.`, k) : Number(q[k])));
  const [minB, maxB, minV, maxV, maxD] = ["min_budget", "max_budget", "min_volunteers", "max_volunteers", "max_duration_weeks"].map(nb);
  let rows = S.where("projects", (p) => !p.is_hidden && st.includes(p.status))
    .filter((p) => !(q.cause && CAUSES[q.cause]) || p.cause === q.cause)
    .filter((p) => !q.city || (p.city || "").toLowerCase() === q.city.trim().toLowerCase())
    .filter((p) => !q.region || (p.region || "").toLowerCase() === q.region.trim().toLowerCase())
    .filter((p) => minB === null || (p.budget_required ?? -1) >= minB).filter((p) => maxB === null || (p.budget_required !== null && p.budget_required !== undefined && p.budget_required <= maxB))
    .filter((p) => minV === null || (p.volunteers_required ?? -1) >= minV).filter((p) => maxV === null || (p.volunteers_required !== null && p.volunteers_required !== undefined && p.volunteers_required <= maxV))
    .filter((p) => maxD === null || (p.duration_weeks !== null && p.duration_weeks !== undefined && p.duration_weeks <= maxD))
    .filter((p) => q.verified !== "need" || p.need_verified).filter((p) => q.verified !== "completion" || p.completion_verified)
    .filter((p) => q.verified !== "any" || p.need_verified || p.completion_verified)
    .filter((p) => q.include_demo !== "0" || !p.is_demo)
    .filter((p) => !["light", "medium", "heavy"].includes(q.effort) || effortLevel(p) === q.effort)
    .sort((a, b) => String(b.published_at || b.updated_at).localeCompare(String(a.published_at || a.updated_at)));
  const skill = (q.skill || "").trim().toLowerCase(), mat = (q.material || "").trim().toLowerCase();
  const af = q.available_from ? new Date(q.available_from) : null, at = q.available_until ? new Date(q.available_until) : null;
  let out = [];
  for (const p of rows) {
    if (skill && !(p.skills || []).some((s) => s.toLowerCase().includes(skill))) continue;
    if (mat && !(p.materials || []).some((m) => (m.name || "").toLowerCase().includes(mat))) continue;
    if (af || at) {
      const s = p.start_date ? new Date(p.start_date) : null;
      let e = p.end_date ? new Date(p.end_date) : null;
      if (s && !e && p.duration_weeks) e = new Date(s.getTime() + p.duration_weeks * 7 * 86400000);
      if ((at && s && s > at) || (af && e && e < af)) continue;
    }
    const res = resOf(p);
    if (q.needs === "money" && !res.money.gap) continue;
    if (q.needs === "volunteers" && !res.volunteers.gap) continue;
    if (q.needs === "any" && (res.fully_resourced || !SUPPORTABLE.includes(p.status))) continue;
    out.push([p, res]);
  }
  let mode = "browse";
  if ((q.q || "").trim()) {
    mode = "keyword";
    const terms = q.q.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    out = out.map(([p, r]) => [keywordScore(p, terms), p, r]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).map((x) => [x[1], x[2]]);
  }
  if (q.sort === "funding_gap") out.sort((a, b) => (b[1].money.gap || 0) - (a[1].money.gap || 0));
  if (q.sort === "starting_soon") out.sort((a, b) => String(a[0].start_date || "9999").localeCompare(String(b[0].start_date || "9999")));
  const page = Math.max(1, Number(q.page || 1)), per = Math.min(50, Math.max(1, Number(q.per_page || 12)));
  return { projects: out.slice((page - 1) * per, page * per).map(([p, r]) => summary(p, r)), total: out.length, page, per_page: per, search_mode: mode, semantic_available: false };
}
function myProjects(u) {
  return S.where("projects", (p) => isManager(u, p)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
function matchProjects(b) {
  const u = requireUser();
  if (!(b.budget || b.volunteers || (b.skills || []).length || (b.equipment || []).length)) E(422, "Enter at least one resource you can offer (budget, volunteers, skills or equipment)");
  const offer = { ...b, budget: numv(b.budget, { field: "budget" }), volunteers: numv(b.volunteers, { field: "volunteers", int: true }), available_from: datev(b.available_from, "available_from"), available_until: datev(b.available_until, "available_until") };
  const rows = S.where("projects", (p) => !p.is_hidden && SUPPORTABLE.includes(p.status) && !isManager(u, p));
  const matches = [], excluded = [];
  for (const p of rows) {
    const r = evaluate(p, offer, resOf(p), CURRENCY);
    if (r.feasible) matches.push({ project_id: p.id, ...r, project: summary(p) });
    else excluded.push({ project_id: p.id, title: p.title, reasons: r.excluded_because });
  }
  matches.sort((a, b) => b.score - a.score || a.project_id.localeCompare(b.project_id));
  return { matches, excluded, weights: WEIGHTS };
}

// ---- plan & progress
function managed(id) { const u = requireUser(); const p = getProject(id); requireManager(u, p); if (["verified", "rejected"].includes(p.status)) E(409, "This project is closed."); return [u, p]; }
async function saveMilestone(id, mid, b, del = false) {
  const [u, p] = managed(id);
  let ms = [...(p.milestones || [])];
  if (del) { if (!ms.some((m) => m.id === mid)) E(404, "Milestone not found."); ms = ms.filter((m) => m.id !== mid); await S.patch("projects", id, { milestones: ms }); return { ok: true }; }
  const v = { title: str(b.title, { field: "title", min: 2, max: 140, label: "Title" }), description: str(b.description, { max: 1000 }) || "", due_date: datev(b.due_date, "due_date"), responsible: str(b.responsible, { max: 140 }), status: ["pending", "in_progress", "done"].includes(b.status) ? b.status : "pending" };
  let m;
  if (mid) {
    const i = ms.findIndex((x) => x.id === mid); if (i < 0) E(404, "Milestone not found.");
    const prev = ms[i];
    m = { ...prev, ...v, completed_at: v.status === "done" ? prev.completed_at || now() : null };
    ms[i] = m;
    if (v.status === "done" && prev.status !== "done") await notifyMany(supporterIds(id).filter((x) => x !== u.id), "milestone", `Milestone completed: ${v.title}`, p.title, `/projects/${id}`);
  } else {
    m = { id: newId(), ...v, sort_order: ms.length + 1, completed_at: v.status === "done" ? now() : null, created_at: now() };
    ms.push(m);
  }
  await S.patch("projects", id, { milestones: ms, updated_at: now() });
  await audit(u.id, mid ? "milestone.updated" : "milestone.created", "project", id, { milestone: m.id, status: m.status });
  return { milestone: m };
}
async function saveOutcome(id, oid, b) {
  const [u, p] = managed(id);
  const os = [...(p.outcomes || [])];
  const v = { metric: str(b.metric, { field: "metric", min: 2, max: 160, label: "Measure" }), target: numv(b.target, { field: "target" }), unit: str(b.unit, { max: 40 }), reported_value: numv(b.reported_value, { field: "reported_value" }) };
  let o;
  if (oid) { const i = os.findIndex((x) => x.id === oid); if (i < 0) E(404, "Outcome not found."); o = { ...os[i], ...v }; os[i] = o; }
  else { o = { id: newId(), ...v, verified_value: null, created_at: now() }; os.push(o); }
  await S.patch("projects", id, { outcomes: os });
  await audit(u.id, "outcome.reported", "project", id, { outcome: o.id, reported: v.reported_value });
  return { outcome: o };
}
async function checklist(id, cid, b, op) {
  const [u, p] = managed(id);
  let items = [...(p.checklist || [])];
  if (op === "add") { const it = { id: newId(), text: str(b.text, { field: "text", min: 2, max: 300, label: "Item" }), done: false, done_by: null, done_at: null, created_at: now() }; items.push(it); await S.patch("projects", id, { checklist: items }); return { item: it }; }
  const i = items.findIndex((x) => x.id === cid); if (i < 0) E(404, "Checklist item not found.");
  if (op === "del") { items.splice(i, 1); await S.patch("projects", id, { checklist: items }); return { ok: true }; }
  items[i] = { ...items[i], done: !!b.done, done_by: b.done ? u.id : null, done_at: b.done ? now() : null };
  await S.patch("projects", id, { checklist: items });
  return { item: items[i] };
}
async function checkFiles(ids, u, p) {
  for (const fid of ids || []) {
    const f = S.get("files", fid);
    if (!f || f.owner_id !== u.id) E(422, "An attached file could not be found. Please upload it again.", "file_ids");
    if (f.project_id && f.project_id !== p.id) E(422, "An attached file belongs to another project.", "file_ids");
    await S.patch("files", fid, { project_id: p.id });
  }
}
async function postUpdate(id, b) {
  const u = requireUser(); const p = getProject(id);
  if (!(isManager(u, p) || isSupporter(u, p))) E(403, "Only the project team and accepted supporters can post updates.");
  if (!["published", "in_progress", "completed"].includes(p.status)) E(409, "Updates can be posted once a project is published.");
  const title = str(b.title, { field: "title", min: 3, max: 160, label: "Title" }), body = str(b.body, { field: "body", min: 10, max: 6000, label: "Update" });
  await checkFiles(b.file_ids, u, p);
  const uid = newId();
  await S.put("updates", { id: uid, project_id: id, author_id: u.id, kind: b.kind || "progress", title, body, file_ids: b.file_ids || [], is_hidden: false, created_at: now() });
  await audit(u.id, "update.posted", "project", id, { update: uid });
  await notifyMany([...supporterIds(id), p.owner_id].filter((x) => x !== u.id), "project_update", `Update on ${p.title}`, title, `/projects/${id}`);
  return { update: S.get("updates", uid) };
}
async function putImpact(id, b) {
  const u = requireUser(); const p = getProject(id); requireManager(u, p);
  if (!["in_progress", "completed"].includes(p.status)) E(409, "Impact reports can be submitted once a project is in progress.");
  if (p.impact_report?.verified) E(409, "This impact report has been verified and can no longer be changed.");
  const r = { people_reached: numv(b.people_reached, { field: "people_reached", int: true }), volunteers_involved: numv(b.volunteers_involved, { field: "volunteers_involved", int: true }),
    volunteer_hours: numv(b.volunteer_hours, { field: "volunteer_hours" }), materials_delivered: str(b.materials_delivered, { max: 3000 }), funds_spent: numv(b.funds_spent, { field: "funds_spent" }),
    summary: str(b.summary, { field: "summary", min: 20, max: 6000, label: "Summary" }), challenges: str(b.challenges, { max: 3000 }), file_ids: b.file_ids || [] };
  await checkFiles(r.file_ids, u, p);
  for (const fid of r.file_ids) { const f = S.get("files", fid); if (f && !["evidence", "impact"].includes(f.purpose)) await S.patch("files", fid, { purpose: "impact" }); }
  const report = { ...(p.impact_report || {}), ...r, submitted_by: u.id, submitted_at: now(), verified: false };
  await S.patch("projects", id, { impact_report: report });
  await audit(u.id, "impact_report.submitted", "project", id);
  return { impact_report: report };
}
function history(id) {
  const u = requireUser(); const p = getProject(id);
  if (!(isManager(u, p) || isReviewer(u))) E(403, "Only the project team and reviewers can view the history.");
  return { history: S.where("audit", (a) => a.subject_type === "project" && a.subject_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200)
    .map((a) => { const m = S.get("members", a.actor_id); return { action: a.action, details: a.details, created_at: a.created_at, actor_name: m?.name || null, actor_role: m?.role || null }; }) };
}

// ------------------------------------------------------------------ commitments
const describeC = (c) => c.kind === "money" ? `Funding: ${Number(c.quantity).toLocaleString("en-IN")}` : c.kind === "volunteers" ? `${c.quantity} volunteer(s)${c.hours ? `, ${c.hours} h each` : ""}` : `${COMMITMENT_KINDS[c.kind]}: ${c.quantity} ${c.unit || ""} ${c.item || ""}`.trim();
function commitmentFields(b) {
  if (!COMMITMENT_KINDS[b.kind]) E(422, "kind: Choose money, volunteers, materials, equipment or skills", "kind");
  const quantity = numv(b.quantity, { field: "quantity", gt: true, min: 0, label: "Quantity" });
  if (quantity === null) E(422, "quantity: Please fill this in.", "quantity");
  if (["materials", "equipment", "skills"].includes(b.kind) && !str(b.item, { max: 120 })) E(422, "Say which item or skill you are offering", "item");
  if (b.kind === "volunteers" && quantity !== Math.round(quantity)) E(422, "Volunteer count must be a whole number", "quantity");
  return { kind: b.kind, quantity, item: str(b.item, { max: 120 }), unit: b.kind === "money" ? null : str(b.unit, { max: 40 }), hours: numv(b.hours, { field: "hours", gt: true, min: 0, max: 10000 }),
    description: str(b.description, { max: 2000 }), deadline: datev(b.deadline, "deadline"), org_id: b.org_id || null };
}
async function propose(pid, b) {
  const u = requireUser(); const p = getProject(pid); requireView(u, p);
  if (isReviewer(u)) E(403, "Reviewer accounts cannot pledge support; use a regular account.");
  if (isManager(u, p)) E(403, "You manage this project, so you can't propose support to it.");
  if (!SUPPORTABLE.includes(p.status)) E(409, "This project is not accepting support right now.");
  const v = commitmentFields(b);
  if (v.org_id && !orgRole(u.id, v.org_id)) E(403, "You can only pledge on behalf of organizations you belong to.", "org_id");
  const ts = now(); const c = { ...v, id: newId(), project_id: pid, supporter_id: u.id, status: "proposed", owner_message: null, received_quantity: 0, spent_amount: 0, responsibility: null, created_at: ts, updated_at: ts };
  await S.put("commitments", c);
  await audit(u.id, "commitment.proposed", "project", pid, { commitment: c.id, kind: c.kind, quantity: c.quantity });
  const who = v.org_id ? S.get("orgs", v.org_id).name : u.name;
  await notify(p.owner_id, "support_proposal", `New support offer for ${p.title}`, `${who} offered ${describeC(c)}.`, `/projects/${pid}#commitments`);
  return { commitment: serializeCommitment(c, u, p) };
}
async function revise(cid, b) {
  const u = requireUser(); const c = S.get("commitments", cid) || E(404, "Support proposal not found."); const p = getProject(c.project_id);
  if (c.supporter_id !== u.id) E(403, "Only the supporter who made this offer can edit it.");
  if (!["proposed", "changes_requested"].includes(c.status)) E(409, "Only pending offers can be edited. Cancel and propose again if plans changed.");
  const v = commitmentFields(b);
  if (v.org_id && !orgRole(u.id, v.org_id)) E(403, "You can only pledge on behalf of organizations you belong to.", "org_id");
  const nc = await S.patch("commitments", cid, { ...v, status: "proposed", updated_at: now() });
  await notify(p.owner_id, "support_proposal", `Support offer updated for ${p.title}`, describeC(nc), `/projects/${p.id}#commitments`);
  return { commitment: serializeCommitment(nc, u, p) };
}
async function act(cid, b) {
  const u = requireUser(); const c = S.get("commitments", cid) || E(404, "Support proposal not found."); const p = getProject(c.project_id);
  const manager = isManager(u, p), supporter = c.supporter_id === u.id, a = b.action, msg = str(b.message, { max: 2000 });
  if (!["accept", "decline", "request_changes", "cancel", "withdraw", "fulfil"].includes(a)) E(422, "Unknown action.");
  if (["accept", "decline", "request_changes", "fulfil"].includes(a) && !manager) E(403, "Only the project owner can respond to support offers.");
  if (a === "withdraw" && !supporter) E(403, "Only the supporter can withdraw their offer.");
  if (a === "cancel" && !(supporter || manager)) E(403, "Only the supporter or project owner can cancel a commitment.");
  const from = { accept: ["proposed"], decline: ["proposed", "changes_requested"], request_changes: ["proposed"], withdraw: ["proposed", "changes_requested"], cancel: ["accepted"], fulfil: ["accepted"] }[a];
  if (!from.includes(c.status)) E(409, `This offer is '${c.status.replace("_", " ")}', so it can't be ${a.replace("_", " ")}ed.`);
  if (["decline", "request_changes", "cancel"].includes(a) && !msg) E(422, "Please add a short message explaining why.", "message");
  if (a === "accept") {
    if (!SUPPORTABLE.includes(p.status)) E(409, "Offers can only be accepted while the project is published or in progress.");
    if (!p.allow_multiple_supporters) {
      const key = c.org_id || c.supporter_id;
      if (commitsOf(p.id).some((o) => o.id !== c.id && COUNTED.includes(o.status) && (o.org_id || o.supporter_id) !== key)) E(409, "This project accepts a single supporter, and another supporter is already committed.");
    }
  }
  const ns = { accept: "accepted", decline: "declined", request_changes: "changes_requested", withdraw: "withdrawn", cancel: "cancelled", fulfil: "fulfilled" }[a];
  const ch = { status: ns, updated_at: now() };
  if (msg && manager) ch.owner_message = msg;
  if (a === "fulfil" && !c.received_quantity) ch.received_quantity = c.quantity;
  const nc = await S.patch("commitments", cid, ch);
  await audit(u.id, `commitment.${ns}`, "project", p.id, { commitment: cid, message: msg });
  const link = `/projects/${p.id}#commitments`;
  if (manager && !supporter) await notify(c.supporter_id, "commitment", { accepted: "Your support offer was accepted", declined: "Your support offer was declined", changes_requested: "Changes requested on your support offer", cancelled: "A commitment was cancelled by the project", fulfilled: "Your contribution was marked as received" }[ns], `${p.title}: ${describeC(c)}. ${msg || ""}`.trim(), link);
  else await notify(p.owner_id, "commitment", { withdrawn: "A support offer was withdrawn", cancelled: "A supporter cancelled their commitment" }[ns], `${p.title}: ${describeC(c)}. ${msg || ""}`.trim(), link);
  return { commitment: serializeCommitment(nc, u, p) };
}
async function progress(cid, b) {
  const u = requireUser(); const c = S.get("commitments", cid) || E(404, "Support proposal not found."); const p = getProject(c.project_id);
  if (!isManager(u, p)) E(403, "Only the project owner can record receipts and spending.");
  if (!COUNTED.includes(c.status)) E(409, "Only accepted commitments can be updated.");
  const ch = {};
  if ("received_quantity" in b) ch.received_quantity = numv(b.received_quantity, { field: "received_quantity" }) || 0;
  if ("spent_amount" in b) ch.spent_amount = numv(b.spent_amount, { field: "spent_amount" }) || 0;
  if ("responsibility" in b) ch.responsibility = str(b.responsibility, { max: 300 });
  if ("deadline" in b) ch.deadline = datev(b.deadline, "deadline");
  const rec = ch.received_quantity ?? c.received_quantity ?? 0, spent = ch.spent_amount ?? c.spent_amount ?? 0;
  if (rec > c.quantity + 1e-9) E(422, "Received amount can't exceed what was pledged.", "received_quantity");
  if (c.kind !== "money" && ch.spent_amount) E(422, "Spending is only tracked for funding commitments.", "spent_amount");
  if (spent > rec + 1e-9) E(422, "Spent amount can't exceed the amount received.", "spent_amount");
  const nc = await S.patch("commitments", cid, { ...ch, updated_at: now() });
  await audit(u.id, "commitment.progress", "project", p.id, { commitment: cid, ...ch });
  return { commitment: serializeCommitment(nc, u, p) };
}

// ------------------------------------------------------------------ files & AI
const MIME_OK = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
async function upload(form) {
  const u = requireUser();
  const file = form.get("file");
  if (!file || !file.size) E(422, "Choose a file to upload.", "file");
  if (file.size > 10 * 1024 * 1024) E(413, "Files must be 10 MB or smaller.");
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const sig = (...b) => b.every((x, i) => head[i] === x);
  const mime = sig(0xff, 0xd8, 0xff) ? "image/jpeg" : sig(0x89, 0x50, 0x4e, 0x47) ? "image/png" : (sig(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45) ? "image/webp" : sig(0x25, 0x50, 0x44, 0x46) ? "application/pdf" : null;
  if (!MIME_OK.includes(mime)) E(415, "Unsupported file type. Use JPG, PNG, WebP or PDF.");
  const purpose = String(form.get("purpose") || "evidence");
  let visibility = String(form.get("visibility") || "team");
  const project_id = form.get("project_id") || null, org_id = form.get("org_id") || null;
  const consent = ["1", "true", "yes", "on"].includes(String(form.get("consent") || "").toLowerCase());
  if (project_id) {
    const p = getProject(project_id);
    if (!(isManager(u, p) || isSupporter(u, p))) E(403, "Only the project team can upload files to this project.");
    if (visibility === "public" && (p.involves_children || p.involves_vulnerable) && !consent) E(422, "This project involves children or vulnerable people. Confirm you have consent before making a photo public, or choose team-only visibility.", "consent");
  }
  if (org_id && !orgRole(u.id, org_id)) E(403, "You are not a member of this organization.");
  if (purpose === "verification") visibility = "reviewers";
  const assets = CTX.platform.assets;
  if (!assets) E(403, "Uploading files is available to the owner and editors of this preview.");
  let blob = file;
  if (mime.startsWith("image/")) blob = await reencode(file, mime); // strips EXIF/GPS
  let up;
  try { up = await assets.upload(blob, { type: mime }); } catch (e) { E(e?.code === "too_large" ? 413 : 503, `Upload failed (${e?.code || "error"}).`); }
  const row = { id: newId(), asset_id: up.id, owner_id: u.id, project_id, org_id, original_name: String(file.name || "file").replace(/[^\w. -]/g, "").slice(0, 120) || "file", mime, size: up.sizeBytes, purpose, visibility, consent_confirmed: consent, created_at: now() };
  await S.put("files", row);
  return { file: publicFile(row) };
}
async function reencode(file, mime) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b || file), mime === "image/png" ? "image/png" : mime, 0.88));
  } catch { E(422, "The image could not be read. Please upload a valid JPG, PNG or WebP."); }
}
async function deleteFile(fid) {
  const u = requireUser(); const f = S.get("files", fid);
  if (!f || f.owner_id !== u.id) E(404, "File not found.");
  const p = f.project_id && S.get("projects", f.project_id);
  if (p && ["completed", "verified"].includes(p.status)) E(409, "Evidence on completed projects is kept for the audit trail.");
  try { await CTX.platform.assets?.delete(f.asset_id); } catch { /* keep going */ }
  await S.del("files", fid);
  return { ok: true };
}
async function structure(b) {
  const u = requireUser();
  const description = str(b.description, { field: "description", min: 30, max: 8000, label: "Description" });
  const sample = CTX.platform.sample;
  if (!sample) E(503, "AI drafting isn't available in this view. Fill in the proposal form yourself.");
  const ctx = [];
  if (b.city || b.region) ctx.push(`Location given by the person: ${[b.city, b.region].filter(Boolean).join(", ")}`);
  if (b.cause) ctx.push(`Cause suggested by the person: ${b.cause}`);
  const images = [];
  for (const fid of b.photo_file_ids || []) {
    const f = S.get("files", fid);
    if (f && f.owner_id === u.id && f.mime.startsWith("image/")) { try { images.push(await (await fetch(fileUrl(f))).blob()); } catch { /* skip */ } }
  }
  ctx.unshift(`OUTPUT LANGUAGE: ${{ hi: "Hindi (Devanagari script)", mr: "Marathi (Devanagari script)" }[b.language] || "English"}`);
  const prompt = `${AI_PROMPT(CURRENCY)}\n\nDESCRIPTION FROM THE PERSON:\n"""\n${description}\n"""\n${ctx.join("\n")}`;
  let raw;
  try {
    let canImages = false;
    try { canImages = !!(await sample.limits())?.images; } catch { /* no images */ }
    raw = await sample.json(prompt, images.length && canImages ? { images } : {});
  } catch (e) {
    const m = { not_granted: "You declined AI access for this page, so AI drafting is off. Fill in the form yourself.", rate_limited: "AI is busy or you've reached your Claude usage limit. Try again later or fill in the form yourself.", invalid_json: "The AI reply couldn't be read. Try again or fill in the form yourself.", refused: "The AI declined this description. Try rewording it." }[e?.code];
    E(502, m || `AI drafting failed (${e?.code || "error"}). You can fill in the form yourself.`);
  }
  if (!raw || typeof raw !== "object") E(502, "The AI returned an unexpected response. Please try again or fill the form manually.");
  const out = sanitize(raw, description + " " + [b.city, b.region].filter(Boolean).join(" "));
  if (b.city && !out.city) out.city = b.city;
  if (b.region && !out.region) out.region = b.region;
  if (CAUSES[b.cause] && !out.cause) out.cause = b.cause;
  out.provider = "claude";
  await audit(u.id, "ai.structured_need", "user", u.id, { removed: out.removed_unstated_values });
  return { proposal: out, original_description: description };
}

// ------------------------------------------------------------------ trust: verification, reports, admin
const KIND_LABELS = { organization_identity: "Organization identity", project_need: "Project need", project_financial: "Financial information", project_completion: "Project completion" };
async function createVerification(kind, subject_id, requester, notes, file_ids) {
  const subject_type = kind === "organization_identity" ? "organization" : "project";
  if (S.where("verifications", (v) => v.kind === kind && v.subject_id === subject_id && v.status === "pending").length) E(409, "A verification request of this type is already pending.");
  const id = newId();
  await S.put("verifications", { id, subject_type, subject_id, kind, requested_by: requester, notes: notes || null, file_ids: file_ids || [], status: "pending", reviewer_id: null, reviewer_notes: null, created_at: now(), reviewed_at: null });
  if (kind === "organization_identity") await S.patch("orgs", subject_id, { verification_status: "pending", updated_at: now() });
  await audit(requester, "verification.requested", subject_type, subject_id, { kind, verification: id });
  await notifyMany(reviewers(), "review_needed", `${KIND_LABELS[kind]} verification requested`, "", "/admin");
  return S.get("verifications", id);
}
async function requestVerification(b) {
  const u = requireUser();
  if (!KIND_LABELS[b.kind]) E(422, "Unknown verification type", "kind");
  for (const fid of b.file_ids || []) { const f = S.get("files", fid); if (!f || f.owner_id !== u.id) E(422, "An attached document could not be found.", "file_ids"); }
  if (b.kind === "organization_identity") {
    const o = S.get("orgs", b.subject_id) || E(404, "Organization not found.");
    if (!["owner", "admin"].includes(orgRole(u.id, o.id))) E(403, "Only organization owners or admins can request verification.");
    if (o.verification_status === "verified") E(409, "This organization is already verified.");
    if (!(b.file_ids || []).length && !o.registration_number) E(422, "Add a registration number or upload a registration document so reviewers can check your identity.", "file_ids");
  } else {
    const p = getProject(b.subject_id); requireManager(u, p);
    if (b.kind === "project_need") { if (["draft", "rejected"].includes(p.status)) E(409, "Submit the project before requesting need verification."); if (p.need_verified) E(409, "The need is already verified."); }
    if (b.kind === "project_financial") { if (!p.budget_required) E(422, "Add a budget before requesting financial verification."); if (!(b.file_ids || []).length) E(422, "Upload a budget breakdown, quotation or receipts for financial verification.", "file_ids"); }
    if (b.kind === "project_completion" && p.status !== "completed") E(409, "Mark the project completed (with an impact report) first.");
  }
  for (const fid of b.file_ids || []) await S.patch("files", fid, { purpose: "verification", visibility: "reviewers" });
  return { verification: await createVerification(b.kind, b.subject_id, u.id, str(b.notes, { max: 3000 }), b.file_ids || []) };
}
function verificationView(v) {
  const out = { ...v, kind_label: KIND_LABELS[v.kind], requested_by_name: S.get("members", v.requested_by)?.name || null };
  if (v.subject_type === "organization") { const o = S.get("orgs", v.subject_id); out.subject = o ? { id: o.id, name: o.name, org_type: o.org_type, city: o.city, registration_number: o.registration_number, website: o.website, contact_email: o.contact_email } : null; }
  else {
    const p = S.get("projects", v.subject_id);
    out.subject = p ? { ...summary(p), budget_required: p.budget_required } : null;
    if (p && v.kind === "project_completion") { out.impact_report = p.impact_report; out.outcomes = p.outcomes || []; }
  }
  out.files = (v.file_ids || []).map((id) => { const f = S.get("files", id); return f ? { id, url: fileUrl(f), name: f.original_name } : null; }).filter(Boolean);
  return out;
}
function conflict(r, v) {
  if (v.requested_by === r.id) return true;
  if (v.subject_type === "organization") return !!orgRole(r.id, v.subject_id);
  const p = S.get("projects", v.subject_id);
  return !!p && (isManager(r, p) || isSupporter(r, p));
}
async function decide(vid, b) {
  const r = requireRoles("admin", "verifier"); const v = S.get("verifications", vid) || E(404, "Verification request not found.");
  if (v.status !== "pending") E(409, "This request has already been decided.");
  const selfReview = conflict(r, v);
  if (selfReview && !CTX.isOwner) E(403, "You are involved with this subject, so another reviewer must decide.");
  const notes = str(b.notes, { field: "notes", min: 5, max: 3000, label: "Notes" });
  const approve = b.decision === "approve"; if (!["approve", "reject"].includes(b.decision)) E(422, "Choose approve or reject.");
  const ts = now(); let link = "/dashboard";
  if (v.kind === "organization_identity") {
    await S.patch("orgs", v.subject_id, { verification_status: approve ? "verified" : "rejected", verified_by: approve ? r.id : null, verified_at: approve ? ts : null, updated_at: ts });
    link = `/organizations/${v.subject_id}`;
  } else {
    const p = getProject(v.subject_id); link = `/projects/${p.id}`;
    if (v.kind === "project_need" && approve) await S.patch("projects", p.id, { need_verified: true, updated_at: ts });
    if (v.kind === "project_financial" && approve) await S.patch("projects", p.id, { financial_verified: true, updated_at: ts });
    if (v.kind === "project_completion") {
      if (approve) {
        if (p.status !== "completed" || !p.impact_report) E(409, "The project must be completed with an impact report to verify completion.");
        const n = (k) => numv(b[k], { field: k });
        const report = { ...p.impact_report, verified: true, verified_people_reached: n("verified_people_reached"), verified_volunteers_involved: n("verified_volunteers_involved"), verified_volunteer_hours: n("verified_volunteer_hours"), verified_funds_spent: n("verified_funds_spent"), verification_notes: notes, verified_by: r.id, verified_at: ts };
        const outs = (p.outcomes || []).map((o) => (b.verified_outcomes && o.id in b.verified_outcomes ? { ...o, verified_value: Number(b.verified_outcomes[o.id]) } : o));
        await S.patch("projects", p.id, { impact_report: report, outcomes: outs, status: "verified", completion_verified: true, review_notes: notes, updated_at: ts });
        await audit(r.id, "project.verified", "project", p.id);
      } else {
        await S.patch("projects", p.id, { status: "in_progress", review_notes: notes, updated_at: ts });
        await audit(r.id, "project.in_progress", "project", p.id, { reason: "completion not verified" });
      }
    }
  }
  await S.patch("verifications", vid, { status: approve ? "approved" : "rejected", reviewer_id: r.id, reviewer_notes: notes, reviewed_at: ts });
  await audit(r.id, `verification.${approve ? "approved" : "rejected"}`, v.subject_type, v.subject_id, { kind: v.kind, notes, ...(selfReview ? { owner_self_review: true } : {}) });
  await notify(v.requested_by, "review_decision", `${KIND_LABELS[v.kind]} verification ${approve ? "approved" : "not approved"}`, notes, link);
  if (v.kind === "project_completion" && approve) await notifyMany(supporterIds(v.subject_id), "project_status", "A project you supported was independently verified", "", link);
  return { verification: verificationView(S.get("verifications", vid)) };
}
async function createReport(b) {
  const u = requireUser();
  const coll = { project: "projects", organization: "orgs", user: "members", update: "updates" }[b.subject_type] || E(422, "Unknown subject.");
  if (!REPORT_REASONS[b.reason]) E(422, "reason: Choose a reason", "reason");
  if (!S.get(coll, b.subject_id)) E(404, "The item you're reporting no longer exists.");
  if (S.where("reports", (r) => r.reporter_id === u.id && r.subject_id === b.subject_id && ["open", "reviewing"].includes(r.status)).length) E(409, "You've already reported this. Our reviewers will look at it.");
  const id = newId();
  await S.put("reports", { id, reporter_id: u.id, subject_type: b.subject_type, subject_id: b.subject_id, reason: b.reason, details: str(b.details, { max: 3000 }), status: "open", resolution: null, handled_by: null, created_at: now(), handled_at: null });
  await audit(u.id, "report.created", b.subject_type, b.subject_id, { report: id, reason: b.reason });
  await notifyMany(reviewers(), "report", `${b.reason === "safeguarding" ? "URGENT safeguarding report" : "New report"} on a ${b.subject_type}`, REPORT_REASONS[b.reason], "/admin#reports");
  return { report: { id, status: "open" } };
}
function subjectTitle(t, id) { const coll = { project: "projects", organization: "orgs", user: "members", update: "updates" }[t]; const x = S.get(coll, id); return x ? x.title || x.name : null; }
function listReports(q) {
  requireRoles("admin", "verifier");
  const st = q.status || "open";
  return { reports: S.where("reports", (r) => st === "all" || (st === "open" ? ["open", "reviewing"].includes(r.status) : r.status === st))
    .sort((a, b) => (b.reason === "safeguarding") - (a.reason === "safeguarding") || a.created_at.localeCompare(b.created_at))
    .map((r) => ({ ...r, reporter_name: S.get("members", r.reporter_id)?.name || "Someone", reason_label: REPORT_REASONS[r.reason], subject_title: subjectTitle(r.subject_type, r.subject_id) })) };
}
async function resolveReport(rid, b) {
  const rv = requireRoles("admin", "verifier"); const r = S.get("reports", rid) || E(404, "Report not found.");
  if (!["reviewing", "resolved", "dismissed"].includes(b.status)) E(422, "Choose a status.", "status");
  const resolution = str(b.resolution, { field: "resolution", min: 3, max: 3000, label: "Resolution" });
  if (b.hide_subject) {
    if (rv.role !== "admin") E(403, "Only administrators can hide content or suspend accounts.");
    if (r.subject_type === "project") await S.patch("projects", r.subject_id, { is_hidden: true, updated_at: now() });
    else if (r.subject_type === "update") await S.patch("updates", r.subject_id, { is_hidden: true });
    else if (r.subject_type === "user") { if (r.subject_id === rv.id) E(400, "You can't suspend your own account."); await S.patch("members", r.subject_id, { is_suspended: true }); }
    else if (r.subject_type === "organization") await S.patch("orgs", r.subject_id, { verification_status: "rejected" });
  }
  await S.patch("reports", rid, { status: b.status, resolution, handled_by: rv.id, handled_at: now() });
  await audit(rv.id, `report.${b.status}`, r.subject_type, r.subject_id, { report: rid, hidden: !!b.hide_subject, resolution });
  if (["resolved", "dismissed"].includes(b.status)) await notify(r.reporter_id, "report", "Your report was reviewed", resolution, "");
  return { ok: true };
}
function signals() {
  const out = [], week = new Date(Date.now() - 7 * 864e5).toISOString(), day = new Date(Date.now() - 864e5).toISOString();
  for (const p of S.where("projects", (p) => !["draft", "rejected", "verified"].includes(p.status) && !p.is_hidden)) {
    const reasons = [], owner = S.get("members", p.owner_id);
    const reps = S.where("reports", (r) => r.subject_id === p.id && ["open", "reviewing"].includes(r.status)).length;
    if (reps >= 2) reasons.push(`${reps} open reports`);
    if (owner && owner.created_at > week && (p.budget_required || 0) >= 1e6) reasons.push("Large budget requested by an account less than 7 days old");
    if (S.where("projects", (x) => x.id !== p.id && x.owner_id !== p.owner_id && x.title.toLowerCase() === p.title.toLowerCase()).length) reasons.push("Same title as a project from another account");
    const recent = S.where("projects", (x) => x.owner_id === p.owner_id && x.submitted_at && x.submitted_at > day).length;
    if (recent >= 3) reasons.push(`Owner submitted ${recent} projects in the last 24 hours`);
    if (p.budget_required && p.beneficiary_count && p.budget_required / Math.max(p.beneficiary_count, 1) > 200000) reasons.push("Very high budget per stated beneficiary");
    if (reasons.length) out.push({ project: summary(p), signals: reasons });
  }
  return out;
}
function overview() {
  requireRoles("admin", "verifier");
  const by = (s) => S.where("projects", (p) => p.status === s);
  const sub = by("submitted").sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
  return { counts: { projects_to_review: sub.length, pending_verifications: S.where("verifications", (v) => v.status === "pending").length,
      open_reports: S.where("reports", (r) => ["open", "reviewing"].includes(r.status)).length, completed_awaiting_verification: by("completed").length,
      users: S.all("members").length, organizations: S.all("orgs").length },
    review_queue: sub.map((p) => ({ ...summary(p), submitted_at: p.submitted_at, original_description: p.original_description, owner_id: p.owner_id })),
    approved_unpublished: by("approved").map((p) => summary(p)), signals: signals() };
}
function listUsers(q) {
  requireRoles("admin");
  const s = (q.q || "").toLowerCase();
  return { users: S.where("members", (m) => !s || m.name.toLowerCase().includes(s)).sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((m) => ({ id: m.id, name: m.name, email: "", role: m.role, city: m.city, is_suspended: !!m.is_suspended, is_demo: !!m.is_demo, created_at: m.created_at })), roles: ROLE_LABELS };
}
async function editUser(uid, b) {
  const a = requireRoles("admin"); const t = S.get("members", uid) || E(404, "User not found.");
  if (t.id === a.id) E(400, "You can't change your own role or suspend yourself here.");
  const ch = {};
  if (b.role !== undefined) { if (!ROLE_LABELS[b.role]) E(422, "Unknown role.", "role"); ch.role = b.role; }
  if (b.is_suspended !== undefined) ch.is_suspended = !!b.is_suspended;
  await S.patch("members", uid, { ...ch, updated_at: now() });
  await audit(a.id, "user.admin_updated", "user", uid, ch);
  return { ok: true };
}
function auditLog(q) {
  requireRoles("admin", "verifier");
  return { entries: S.where("audit", (x) => (!q.subject_type || x.subject_type === q.subject_type) && (!q.subject_id || x.subject_id === q.subject_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 300).map((x) => ({ ...x, actor_name: S.get("members", x.actor_id)?.name || null })) };
}

// ------------------------------------------------------------------ dashboard, notifications, impact, activity
async function sweepDeadlines() {
  if (!me() || !CTX.canWrite) return;
  const t = today(), horizon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  for (const p of S.where("projects", (p) => SUPPORTABLE.includes(p.status))) {
    for (const m of (p.milestones || []).filter((m) => m.status !== "done" && m.due_date && m.due_date <= horizon && m.due_date >= t)) {
      for (const uid of new Set([p.owner_id, ...supporterIds(p.id)])) await notify(uid, "deadline", `Milestone due ${m.due_date}: ${m.title}`, `Project: ${p.title}`, `/projects/${p.id}`, `ms-${m.id}-${uid}-${m.due_date}`);
    }
  }
  for (const c of S.where("commitments", (c) => c.status === "accepted" && c.deadline && c.deadline <= horizon && c.deadline >= t)) {
    const p = S.get("projects", c.project_id); if (!p) continue;
    for (const uid of new Set([c.supporter_id, p.owner_id])) await notify(uid, "deadline", `Commitment due ${c.deadline}`, `${COMMITMENT_KINDS[c.kind]} commitment for ${p.title}`, `/projects/${p.id}`, `cm-${c.id}-${uid}-${c.deadline}`);
  }
}
async function dashboard() {
  const u = requireUser();
  await sweepDeadlines();
  const t = today(), horizon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const mine = myProjects(u);
  const incoming = [], gaps = [];
  for (const p of mine) {
    const r = resOf(p);
    if (SUPPORTABLE.includes(p.status) && r.open_gaps.length) gaps.push({ project: { id: p.id, title: p.title }, gaps: r.open_gaps });
    for (const c of commitsOf(p.id).filter((c) => c.status === "proposed")) incoming.push({ ...serializeCommitment(c, u, p, true), project: { id: p.id, title: p.title } });
  }
  const myC = S.where("commitments", (c) => c.supporter_id === u.id).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const supportedIds = [...new Set(myC.filter((c) => COUNTED.includes(c.status)).map((c) => c.project_id))];
  const related = new Set([...mine.map((p) => p.id), ...supportedIds]);
  const upcoming = [];
  for (const id of related) {
    const p = S.get("projects", id); if (!p || !SUPPORTABLE.includes(p.status)) continue;
    for (const m of (p.milestones || []).filter((m) => m.status !== "done" && m.due_date && m.due_date <= horizon)) upcoming.push({ type: "milestone", title: m.title, date: m.due_date, overdue: m.due_date < t, project: { id, title: p.title } });
  }
  for (const c of S.where("commitments", (c) => related.has(c.project_id) && c.status === "accepted" && c.deadline && c.deadline <= horizon)) {
    const p = S.get("projects", c.project_id); upcoming.push({ type: "commitment", title: `${COMMITMENT_KINDS[c.kind]} due`, date: c.deadline, overdue: c.deadline < t, project: { id: p.id, title: p.title } });
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  const completed = [...mine.filter((p) => ["completed", "verified"].includes(p.status)).map((p) => summary(p)),
    ...supportedIds.map((id) => S.get("projects", id)).filter((p) => p && ["completed", "verified"].includes(p.status)).map((p) => ({ ...summary(p), as_supporter: true }))];
  const accepted = myC.filter((c) => COUNTED.includes(c.status));
  const out = {
    role: u.role, my_projects: mine.map((p) => ({ ...summary(p), review_notes: p.review_notes })), incoming_proposals: incoming,
    my_commitments: myC.map((c) => { const p = S.get("projects", c.project_id); return { id: c.id, kind: c.kind, quantity: c.quantity, item: c.item, unit: c.unit, status: c.status, deadline: c.deadline, received_quantity: c.received_quantity, owner_message: c.owner_message, project: { id: c.project_id, title: p?.title || "Project", status: p?.status } }; }),
    resource_gaps: gaps, upcoming, completed,
    notifications: S.where("notifications", (n) => n.user_id === u.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8),
    organizations: S.where("orgs", (o) => (o.members || []).some((m) => m.user_id === u.id)).map((o) => ({ id: o.id, name: o.name, org_type: o.org_type, verification_status: o.verification_status, member_role: orgRole(u.id, o.id) })),
    stats: { money_pledged: accepted.filter((c) => c.kind === "money").reduce((t, c) => t + c.quantity, 0), money_delivered: accepted.filter((c) => c.kind === "money").reduce((t, c) => t + (c.received_quantity || 0), 0),
      volunteer_places: accepted.filter((c) => c.kind === "volunteers").reduce((t, c) => t + c.quantity, 0), projects_supported: supportedIds.length, projects_managed: mine.length,
      projects_completed: new Set(completed.map((p) => p.id)).size, pending_offers: incoming.length },
    volunteer_hours_pledged: accepted.filter((c) => c.kind === "volunteers").reduce((t, c) => t + (c.hours || 0) * c.quantity, 0),
  };
  if (isReviewer(u)) out.review_counts = { projects_to_review: S.where("projects", (p) => p.status === "submitted").length, pending_verifications: S.where("verifications", (v) => v.status === "pending").length, open_reports: S.where("reports", (r) => ["open", "reviewing"].includes(r.status)).length };
  return out;
}
function impact(q) {
  const demoOk = q.include_demo === "1";
  const vis = S.where("projects", (p) => !p.is_hidden && (demoOk || !p.is_demo));
  const reports = vis.filter((p) => ["completed", "verified"].includes(p.status) && p.impact_report).map((p) => p.impact_report);
  const ver = reports.filter((r) => r.verified);
  const s = (rs, k) => rs.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  const pubIds = new Set(vis.filter((p) => PUBLIC_STATUSES.includes(p.status)).map((p) => p.id));
  const cc = S.where("commitments", (c) => pubIds.has(c.project_id) && COUNTED.includes(c.status));
  return { includes_demo: demoOk, projects: { active: vis.filter((p) => SUPPORTABLE.includes(p.status)).length, completed: vis.filter((p) => p.status === "completed").length, verified: vis.filter((p) => p.status === "verified").length },
    pledged: { money: cc.filter((c) => c.kind === "money").reduce((t, c) => t + c.quantity, 0), volunteers: cc.filter((c) => c.kind === "volunteers").reduce((t, c) => t + c.quantity, 0), money_received: cc.filter((c) => c.kind === "money").reduce((t, c) => t + (c.received_quantity || 0), 0) },
    reported: { projects: reports.length, people_reached: s(reports, "people_reached"), volunteers_involved: s(reports, "volunteers_involved"), volunteer_hours: s(reports, "volunteer_hours"), funds_spent: s(reports, "funds_spent") },
    verified: { projects: ver.length, people_reached: s(ver, "verified_people_reached"), volunteers_involved: s(ver, "verified_volunteers_involved"), volunteer_hours: s(ver, "verified_volunteer_hours"), funds_spent: s(ver, "verified_funds_spent") }, currency: CURRENCY };
}
function activity() {
  const pub = (p) => p && !p.is_hidden && PUBLIC_STATUSES.includes(p.status);
  const pj = (p) => ({ id: p.id, title: p.title, city: p.city, is_demo: !!p.is_demo });
  const ev = [];
  for (const p of S.where("projects", (p) => pub(p) && p.published_at)) ev.push({ kind: "published", at: p.published_at, text: `New need in ${p.city || "a community"}`, project: pj(p) });
  for (const c of S.where("commitments", (c) => COUNTED.includes(c.status))) { const p = S.get("projects", c.project_id); if (!pub(p)) continue;
    const what = { money: "funding", volunteers: `${c.quantity} volunteer(s)`, materials: c.item || "materials", equipment: c.item || "equipment", skills: c.item || "skills" }[c.kind];
    ev.push({ kind: "pledge", at: c.updated_at, text: `${supporterLabel(c)} committed ${what}`, project: pj(p) }); }
  for (const u of S.where("updates", (u) => !u.is_hidden)) { const p = S.get("projects", u.project_id); if (pub(p)) ev.push({ kind: "update", at: u.created_at, text: `Update: ${u.title}`, project: pj(p) }); }
  for (const v of S.where("verifications", (v) => v.subject_type === "project" && v.status === "approved")) { const p = S.get("projects", v.subject_id); if (pub(p)) ev.push({ kind: "verified", at: v.reviewed_at, text: { project_need: "Need verified", project_financial: "Budget checked", project_completion: "Completion verified" }[v.kind] || "Verified", project: pj(p) }); }
  const rank = { verified: 3, pledge: 2, update: 1, published: 0 };
  return { events: ev.sort((a, b) => String(b.at).localeCompare(String(a.at)) || (rank[b.kind] || 0) - (rank[a.kind] || 0)).slice(0, 10) };
}

// ------------------------------------------------------------------ demo data (labelled)
export async function seedDemoIfEmpty() {
  if (!CTX.isOwner || S.all("projects").length || !me()) return false;
  const { DEMO } = await import("./demo.js");
  const ts = now(), oid = "demo-org";
  await S.put("orgs", { id: oid, name: "Demo Neighbourhood Association", org_type: "community", city: "Pune", region: "Maharashtra", description: "Demo organization for trying ImpactBridge. Not a real organization.", verification_status: "unverified", is_demo: true, created_by: me().id, members: [], created_at: ts, updated_at: ts });
  const start = Date.now() + 14 * 864e5;
  for (const [i, d] of DEMO.entries()) {
    const id = `demo-${i + 1}`;
    await S.put("projects", { ...d.p, id, owner_id: "demo-owner", org_id: oid, original_description: d.p.problem_statement, status: "published", start_date: new Date(start + i * 7 * 864e5).toISOString().slice(0, 10),
      allow_multiple_supporters: true, is_demo: true, is_hidden: false, need_verified: false, financial_verified: false, completion_verified: false, impact_report: null, checklist: [],
      milestones: d.ms.map((t, j) => ({ id: `${id}-m${j}`, title: t, description: "", due_date: new Date(start + (i * 7 + j * 10) * 864e5).toISOString().slice(0, 10), status: "pending", responsible: null, sort_order: j, completed_at: null, created_at: ts })),
      outcomes: d.out.map(([metric, target, unit], j) => ({ id: `${id}-o${j}`, metric, target, unit, reported_value: null, verified_value: null, created_at: ts })),
      created_at: ts, updated_at: ts, submitted_at: ts, published_at: ts, completed_at: null, review_notes: null });
  }
  await S.put("members", { id: "demo-owner", name: "Demo Community Group", role: "submitter", is_demo: true, city: "Pune", region: "Maharashtra", skills: [], created_at: ts, updated_at: ts });
  return true;
}

// ------------------------------------------------------------------ router
// ------------------------------------------------------------------ interest, chat, recommendations, certificates
const interestKey = (pid, uid) => `${pid}_${uid}`;
function interestInfo(p, u) {
  const list = S.where("interests", (i) => i.project_id === p.id);
  const out = { count: list.length, mine: !!u && list.some((i) => i.user_id === u.id) };
  if (u && (isManager(u, p) || isReviewer(u))) out.people = list.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((i) => { const m = S.get("members", i.user_id); return m ? { id: m.id, name: m.name, city: m.city ?? null, skills: m.skills || [], created_at: i.created_at } : null; }).filter(Boolean);
  return out;
}
function chatAccess(u, p) {
  if (!u) return false;
  if (isManager(u, p) || isReviewer(u)) return true;
  return S.where("interests", (i) => i.project_id === p.id && i.user_id === u.id).length > 0
    || commitsOf(p.id).some((c) => c.supporter_id === u.id && !["withdrawn", "declined"].includes(c.status));
}
async function addInterest(pid) {
  const u = requireUser(); const p = getProject(pid); requireView(u, p);
  if (isManager(u, p)) E(409, "This is your own project.");
  if (!SUPPORTABLE.includes(p.status)) E(409, "This project is not accepting support right now.");
  if (!S.get("interests", interestKey(p.id, u.id))) {
    await S.put("interests", { id: interestKey(p.id, u.id), project_id: p.id, user_id: u.id, created_at: now() });
    await notify(p.owner_id, "interest", "Someone is interested in your project", `${u.name.split(" ")[0]} is interested in ${p.title}. Say hello in the project chat.`, `/projects/${p.id}#chat`, `interest:${p.id}:${u.id}`);
  }
  return { interest: interestInfo(p, u) };
}
async function removeInterest(pid) {
  const u = requireUser(); const p = getProject(pid);
  if (S.get("interests", interestKey(p.id, u.id))) await S.del("interests", interestKey(p.id, u.id));
  return { interest: interestInfo(p, u) };
}
function listMessages(pid) {
  const u = requireUser(); const p = getProject(pid);
  if (!chatAccess(u, p)) E(403, "Tap \u201cI'm interested\u201d or offer support to join this project's conversation.");
  return { messages: S.where("messages", (m) => m.project_id === p.id && !m.is_hidden).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((m) => {
    const a = S.get("members", m.author_id);
    return { id: m.id, body: m.body, created_at: m.created_at, mine: m.author_id === u.id,
      author: { id: m.author_id, name: a?.name || "Someone", is_team: m.author_id === p.owner_id || ["owner", "admin"].includes(orgRole(m.author_id, p.org_id)), is_reviewer: !!a && REVIEWERS.includes(a.role) } };
  }) };
}
async function postMessage(pid, b) {
  const u = requireUser(); const p = getProject(pid);
  if (!chatAccess(u, p)) E(403, "Tap \u201cI'm interested\u201d or offer support to join this project's conversation.");
  const body = str(b.body, { field: "body", min: 1, max: 2000, label: "Message" });
  const m = await S.put("messages", { id: newId(), project_id: p.id, author_id: u.id, body, is_hidden: false, created_at: now() });
  const ids = new Set([p.owner_id, ...S.where("interests", (i) => i.project_id === p.id).map((i) => i.user_id), ...commitsOf(p.id).filter((c) => !["withdrawn", "declined"].includes(c.status)).map((c) => c.supporter_id)]);
  ids.delete(u.id);
  for (const id of ids) await notify(id, "message", `New message on ${p.title}`, `${u.name.split(" ")[0]}: ${body.slice(0, 140)}`, `/projects/${p.id}#chat`, `msg:${m.id}:${id}`);
  return { id: m.id };
}
async function hideMessage(mid) {
  const u = requireUser(); const m = S.get("messages", mid) || E(404, "Message not found.");
  const p = getProject(m.project_id);
  if (!(m.author_id === u.id || isManager(u, p) || isReviewer(u))) E(403, "You can only remove your own messages.");
  await S.patch("messages", m.id, { is_hidden: true });
  return { ok: true };
}
function recommendations() {
  const u = requireUser();
  const skills = (u.skills || []).map((s) => s.toLowerCase());
  const past = new Set(S.where("commitments", (c) => c.supporter_id === u.id && COUNTED.includes(c.status)).map((c) => S.get("projects", c.project_id)?.cause));
  const out = [];
  for (const p of S.where("projects", (p) => !p.is_hidden && SUPPORTABLE.includes(p.status) && p.owner_id !== u.id)) {
    const res = resOf(p);
    if (res.fully_resourced) continue;
    let score = 0; const reasons = [];
    if (u.city && p.city && p.city.toLowerCase() === u.city.toLowerCase()) { score += 3; reasons.push("In your city"); }
    else if (u.region && p.region && p.region.toLowerCase() === u.region.toLowerCase()) { score += 1; reasons.push("In your state"); }
    const overlap = (p.skills || []).filter((s) => skills.some((k) => s.toLowerCase().includes(k) || k.includes(s.toLowerCase())));
    if (overlap.length) { score += 2 * overlap.length; reasons.push("Needs your skill: " + overlap.slice(0, 2).join(", ")); }
    if (past.has(p.cause)) { score += 1; reasons.push(`A cause you've supported: ${CAUSES[p.cause] || p.cause}`); }
    if (p.need_verified) { score += 0.5; reasons.push("Need verified"); }
    if (effortLevel(p) === "light") { score += 0.3; reasons.push("Light effort"); }
    if (!p.is_demo) score += 0.2;
    if (score > 0) out.push([score, p, res, reasons]);
  }
  out.sort((a, b) => b[0] - a[0]);
  return { projects: out.slice(0, 6).map(([, p, res, reasons]) => ({ ...summary(p, res), reasons: reasons.slice(0, 3) })) };
}
function certificateOf(c) {
  const p = S.get("projects", c.project_id);
  if (!p || p.is_hidden || !["completed", "verified"].includes(p.status) || !COUNTED.includes(c.status)) E(404, "Certificate not found.");
  const r = p.impact_report || null;
  const org = c.org_id ? S.get("orgs", c.org_id) : null, sup = S.get("members", c.supporter_id);
  const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k] ?? null]));
  return { id: c.id, number: "IB-" + c.id.slice(0, 8).toUpperCase(),
    sponsor: { name: org ? org.name : sup?.name || "A supporter", type: org ? org.org_type : "individual", verified: org?.verification_status === "verified" },
    project: { id: p.id, title: p.title, city: p.city ?? null, region: p.region ?? null, cause: p.cause, cause_label: CAUSES[p.cause] || null, status: p.status,
      completion_verified: !!p.completion_verified, completed_at: p.completed_at ?? null, is_demo: !!p.is_demo },
    contribution: pick(c, ["kind", "quantity", "item", "unit", "hours", "received_quantity"]),
    report: r ? pick(r, ["people_reached", "volunteers_involved", "volunteer_hours", "funds_spent", "summary", "verified", "verified_people_reached", "verified_volunteers_involved", "verified_volunteer_hours", "verified_funds_spent", "submitted_at", "verified_at"]) : null,
    issued_at: r?.verified_at || p.completed_at || p.updated_at };
}
function myCertificates() {
  const u = requireUser();
  const orgs = new Set(S.where("orgs", (o) => orgRole(u.id, o.id)).map((o) => o.id));
  return { certificates: S.where("commitments", (c) => COUNTED.includes(c.status) && (c.supporter_id === u.id || orgs.has(c.org_id)))
    .filter((c) => { const p = S.get("projects", c.project_id); return p && !p.is_hidden && ["completed", "verified"].includes(p.status); }).map(certificateOf) };
}

const routes = [];
const R = (method, pattern, fn) => routes.push({ method, re: new RegExp("^" + pattern.replace(/\{(\w+)\}/g, "(?<$1>[^/]+)") + "$"), fn });
R("GET", "/api/meta", () => ({ causes: CAUSES, org_types: ORG_TYPES, commitment_kinds: COMMITMENT_KINDS, statuses: PROJECT_STATUSES, report_reasons: REPORT_REASONS, currency: CURRENCY,
  roles: Object.fromEntries(SELF_SERVICE_ROLES.map((r) => [r, ROLE_LABELS[r]])), integrations: integrations(), hosted: true }));
R("GET", "/api/auth/me", () => { const u = me(); return { user: u ? mePayload(u) : null, identity: { signed_in: !!CTX.uid, is_owner: CTX.isOwner, can_write: CTX.canWrite } }; });
R("POST", "/api/auth/register", (_, b) => register(b));
R("PATCH", "/api/auth/me", (_, b) => updateMe(b));
R("POST", "/api/auth/logout", () => ({ ok: true }));
R("GET", "/api/organizations", (_, __, q) => ({ organizations: S.where("orgs", (o) => !q.q || o.name.toLowerCase().includes(q.q.toLowerCase())).map(publicOrg) }));
R("POST", "/api/organizations", (_, b) => createOrg(b));
R("GET", "/api/organizations/{id}", (p) => getOrg(p.id));
R("PATCH", "/api/organizations/{id}", (p, b) => updateOrg(p.id, b));
R("POST", "/api/organizations/{id}/members", (p, b) => addMember(p.id, b));
R("DELETE", "/api/organizations/{id}/members/{uid}", (p) => removeMember(p.id, p.uid));
R("GET", "/api/members", () => { requireUser(); return { members: S.where("members", (m) => !m.is_demo && !m.is_suspended).map((m) => ({ id: m.id, name: m.name, role: m.role })) }; });
R("GET", "/api/projects", (_, __, q) => explore(q));
R("POST", "/api/projects", (_, b) => createProject(b));
R("GET", "/api/projects/mine", () => { const u = requireUser(); return { projects: myProjects(u).map((p) => ({ ...summary(p), review_notes: p.review_notes })) }; });
R("POST", "/api/match", (_, b) => matchProjects(b));
R("GET", "/api/projects/{id}", (p) => { const u = me(); const pr = getProject(p.id); requireView(u, pr); return { project: detail(pr, u) }; });
R("PUT", "/api/projects/{id}", (p, b) => updateProject(p.id, b));
R("DELETE", "/api/projects/{id}", (p) => deleteProject(p.id));
R("POST", "/api/projects/{id}/transition", (p, b) => transition(p.id, b));
R("POST", "/api/projects/{id}/milestones", (p, b) => saveMilestone(p.id, null, b));
R("PUT", "/api/projects/{id}/milestones/{mid}", (p, b) => saveMilestone(p.id, p.mid, b));
R("DELETE", "/api/projects/{id}/milestones/{mid}", (p) => saveMilestone(p.id, p.mid, null, true));
R("POST", "/api/projects/{id}/outcomes", (p, b) => saveOutcome(p.id, null, b));
R("PUT", "/api/projects/{id}/outcomes/{oid}", (p, b) => saveOutcome(p.id, p.oid, b));
R("POST", "/api/projects/{id}/checklist", (p, b) => checklist(p.id, null, b, "add"));
R("PATCH", "/api/projects/{id}/checklist/{cid}", (p, b) => checklist(p.id, p.cid, b, "toggle"));
R("DELETE", "/api/projects/{id}/checklist/{cid}", (p) => checklist(p.id, p.cid, null, "del"));
R("POST", "/api/projects/{id}/updates", (p, b) => postUpdate(p.id, b));
R("PUT", "/api/projects/{id}/impact-report", (p, b) => putImpact(p.id, b));
R("GET", "/api/projects/{id}/history", (p) => history(p.id));
R("POST", "/api/projects/{id}/commitments", (p, b) => propose(p.id, b));
R("GET", "/api/commitments/mine", () => { const u = requireUser(); return { commitments: S.where("commitments", (c) => c.supporter_id === u.id).map((c) => { const p = S.get("projects", c.project_id); return { ...serializeCommitment(c, u, p), project: { id: p.id, title: p.title, status: p.status, city: p.city } }; }) }; });
R("PUT", "/api/commitments/{id}", (p, b) => revise(p.id, b));
R("POST", "/api/commitments/{id}/action", (p, b) => act(p.id, b));
R("PATCH", "/api/commitments/{id}/progress", (p, b) => progress(p.id, b));
R("POST", "/api/files", (_, b) => upload(b));
R("DELETE", "/api/files/{id}", (p) => deleteFile(p.id));
R("POST", "/api/ai/structure", (_, b) => structure(b));
R("POST", "/api/projects/{id}/interest", (p) => addInterest(p.id));
R("DELETE", "/api/projects/{id}/interest", (p) => removeInterest(p.id));
R("GET", "/api/projects/{id}/messages", (p) => listMessages(p.id));
R("POST", "/api/projects/{id}/messages", (p, b) => postMessage(p.id, b));
R("DELETE", "/api/messages/{mid}", (p) => hideMessage(p.mid));
R("GET", "/api/recommendations", () => recommendations());
R("GET", "/api/certificates/{id}", (p) => { const c = S.get("commitments", p.id) || E(404, "Certificate not found."); return { certificate: certificateOf(c) }; });
R("GET", "/api/my/certificates", () => myCertificates());
R("POST", "/api/ai/transcribe", () => E(503, "Recorded voice notes aren't available here. Use browser dictation."));
R("POST", "/api/verifications", (_, b) => requestVerification(b));
R("GET", "/api/admin/verifications", (_, __, q) => { requireRoles("admin", "verifier"); const st = q.status || "pending"; return { verifications: S.where("verifications", (v) => st === "all" || v.status === st).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(verificationView) }; });
R("POST", "/api/admin/verifications/{id}/decide", (p, b) => decide(p.id, b));
R("POST", "/api/reports", (_, b) => createReport(b));
R("GET", "/api/admin/reports", (_, __, q) => listReports(q));
R("POST", "/api/admin/reports/{id}", (p, b) => resolveReport(p.id, b));
R("GET", "/api/admin/overview", () => overview());
R("GET", "/api/admin/users", (_, __, q) => listUsers(q));
R("PATCH", "/api/admin/users/{id}", (p, b) => editUser(p.id, b));
R("GET", "/api/admin/audit", (_, __, q) => auditLog(q));
R("DELETE", "/api/admin/demo", async () => {
  requireRoles("admin");
  for (const p of S.where("projects", (p) => p.is_demo)) {
    for (const c of commitsOf(p.id)) await S.del("commitments", c.id);
    for (const u of S.where("updates", (u) => u.project_id === p.id)) await S.del("updates", u.id);
    await S.del("projects", p.id);
  }
  for (const o of S.where("orgs", (o) => o.is_demo)) await S.del("orgs", o.id);
  for (const m of S.where("members", (m) => m.is_demo)) await S.del("members", m.id);
  return { ok: true };
});
R("GET", "/api/notifications", () => { const u = requireUser(); const l = S.where("notifications", (n) => n.user_id === u.id).sort((a, b) => b.created_at.localeCompare(a.created_at)); return { notifications: l.slice(0, 100), unread: l.filter((n) => !n.is_read).length }; });
R("POST", "/api/notifications/read", async (_, b) => { const u = requireUser(); for (const n of S.where("notifications", (n) => n.user_id === u.id && !n.is_read && (b.all || (b.ids || []).includes(n.id)))) await S.patch("notifications", n.id, { is_read: true }); return { ok: true }; });
R("GET", "/api/dashboard", () => dashboard());
R("GET", "/api/impact", (_, __, q) => impact(q));
R("GET", "/api/activity", () => activity());

export async function handle(method, path, { body, form, query } = {}) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = path.match(r.re);
    if (!m) continue;
    try {
      return { status: 200, data: await r.fn(m.groups || {}, form || body || {}, query || {}) };
    } catch (e) {
      if (e instanceof HErr) return { status: e.status, data: e.body };
      if (e?.code === "invalid_argument") return { status: 403, data: { error: "You can browse this preview, but your access level can't save changes. Ask the owner to invite you as an editor." } };
      if (e?.code === "quota_exceeded") return { status: 507, data: { error: "This preview's storage is full." } };
      console.error(e);
      return { status: 500, data: { error: "Something went wrong. Please try again." } };
    }
  }
  return { status: 404, data: { error: "Not found" } };
}
