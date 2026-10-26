// Shared visual components built on core + art.
import { causeLabel, html, money, num, raw, shareUrl, statusBadge, verifiedBadges, STATUS_LABEL } from "./core.js";
import { causeCover, causeIcon, icon, styleFor } from "./art.js";

export function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function freshness(p) {
  const d = daysSince(p.last_activity_at);
  if (d === null) return html`<span class="fresh muted">${icon("clock")} No activity yet</span>`;
  const active = ["published", "in_progress"].includes(p.status);
  const label = d === 0 ? "Active today" : d === 1 ? "Active yesterday" : `Active ${d} days ago`;
  if (active && d > 30) return html`<span class="fresh stale" title="No update, milestone or pledge in over 30 days">${icon("clock")} Quiet for ${d} days</span>`;
  return html`<span class="fresh">${icon("clock")} ${label}</span>`;
}

export function pct(p) {
  const r = p.funding.requested;
  if (!r) return null;
  return Math.min(100, Math.round((p.funding.pledged / r) * 100));
}

export function needChips(p) {
  const chips = [];
  if (p.funding.gap) chips.push(`${money(p.funding.gap)} needed`);
  if (p.volunteers.gap) chips.push(`${num(p.volunteers.gap)} volunteer${p.volunteers.gap == 1 ? "" : "s"}`);
  (p.open_items || []).slice(0, 2).forEach((m) => chips.push(m.name));
  (p.open_skills || []).slice(0, 1).forEach((s) => chips.push(s));
  return chips.slice(0, 4);
}

/** Small round initials for supporters (organisations or first names). */
export function avatars(names = [], { size = 28, more = 0 } = {}) {
  const hue = (t) => { let h = 0; for (const c of t) h = (h * 33 + c.charCodeAt(0)) % 360; return h; };
  const ini = (t) => t.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return html`<span class="avs" style="--av:${size}px">${names.map((n) => html`<span class="av" translate="no" title="${n}"
    style="background:hsl(${hue(n)} 55% 88%);color:hsl(${hue(n)} 60% 28%)">${ini(n)}</span>`)}${more > 0 ? html`<span class="av more">+${more}</span>` : ""}</span>`;
}

const daysLeft = (p) => (p.end_date ? Math.ceil((new Date(`${p.end_date}T23:59:59`) - Date.now()) / 86400000) : null);
const initials = (t = "") => t.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

/** The number block every card leads with (Ketto pattern): big amount, "pledged of" target, one bar. */
function amountBlock(p) {
  const percent = pct(p);
  if (percent !== null) {
    return html`<div class="kc-amt">${percent > 0
      ? html`<strong>${money(p.funding.pledged)}</strong> <span>pledged of ${money(p.funding.requested)}</span><b class="kc-pct">${percent}%</b>`
      : html`<strong>${money(p.funding.requested)}</strong> <span>needed</span>`}</div>
      <div class="pc-bar" role="img" aria-label="${percent}% of funding pledged"><span style="width:${Math.max(percent, 2)}%"></span></div>`;
  }
  if (p.volunteers.requested) {
    const v = Math.min(100, Math.round((p.volunteers.pledged / p.volunteers.requested) * 100));
    return html`<div class="kc-amt"><strong>${num(p.volunteers.pledged)} of ${num(p.volunteers.requested)}</strong> <span>volunteers</span></div>
      <div class="pc-bar" role="img" aria-label="${v}% of volunteers pledged"><span style="width:${Math.max(v, 2)}%"></span></div>`;
  }
  return "";
}

function metaRow(p) {
  const d = daysLeft(p);
  const when = d !== null && d >= 0 && ["published", "in_progress"].includes(p.status)
    ? html`<span class="kc-when">${icon("clock")} <strong>${d}</strong> ${d === 1 ? "day left" : "days left"}</span>`
    : freshness(p);
  const supportable = ["published", "in_progress"].includes(p.status);
  return html`<div class="kc-meta">${when}${p.supporter_count
    ? html`<span class="kc-sup"><span class="kc-heart" aria-hidden="true">♥</span> <strong>${p.supporter_count}</strong> ${p.supporter_count === 1 ? "supporter" : "supporters"}</span>`
    : supportable ? html`<span class="pc-first">Be the first to help</span>` : ""}</div>`;
}

function actions(p) {
  if (!["published", "in_progress"].includes(p.status)) return html`<a class="btn kc-help ghost" href="/projects/${p.id}">See the result</a>`;
  const text = `${p.title}: help this community need on ImpactBridge ${shareUrl(`/projects/${p.id}`)}`;
  return html`<div class="kc-actions"><a class="btn kc-share" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}" aria-label="Share on WhatsApp">${icon("whatsapp")} Share</a>
    <a class="btn primary kc-help" href="/projects/${p.id}">Help now</a></div>`;
}

function coverOf(p, height) {
  return p.cover_photo
    ? html`<img src="${p.cover_photo}" alt="Photo shared by the project team" loading="lazy">`
    : causeCover(p.cause, { height, seed: p.id, label: `${causeLabel(p.cause)} illustration` });
}

/** Full project card used in lists and grids: photo, headline, who posted it, amount, bar, time and supporters, Share + Help. */
export function projectTile(p) {
  const verified = p.completion_verified || p.need_verified;
  const who = p.posted_by || p.organization?.name || "";
  return html`<article class="pcard kcard">
    <a class="pc-cover" href="/projects/${p.id}" tabindex="-1" aria-hidden="true">${coverOf(p, 190)}
      <span class="pc-tags">${p.status !== "published" ? statusBadge(p.status) : ""}${p.is_demo ? html`<span class="badge demo">Sample</span>` : ""}</span>
      <span class="pc-cause">${causeIcon(p.cause, 16)}${causeLabel(p.cause)}</span>
      ${p.city ? html`<span class="pc-city" translate="no">${icon("pin")}${p.city}</span>` : ""}</a>
    <div class="pc-body">
      <h3 translate="no"><a href="/projects/${p.id}">${p.title}</a></h3>
      <p class="kc-by">${who ? html`<span class="kc-av" aria-hidden="true" translate="no">${initials(who)}</span><span class="kc-byw">by</span><span translate="no">${who}</span>` : ""}
        ${verified ? html`<span class="kc-tick" title="${p.completion_verified ? "Completion verified" : "Need verified"}">${icon("check")} Checked</span>` : ""}</p>
      ${p.story ? html`<p class="pc-story" translate="no">${p.story}</p>` : ""}
      ${amountBlock(p)}
      ${metaRow(p)}
      ${actions(p)}
    </div></article>`;
}

/** Compact card for horizontal carousels: the same anatomy, without the story. */
export function projectMini(p) {
  const who = p.posted_by || p.organization?.name || "";
  return html`<article class="pmini kcard">
    <a class="pm-cover" href="/projects/${p.id}" tabindex="-1" aria-hidden="true">${coverOf(p, 150)}${p.is_demo ? html`<span class="badge demo">Sample</span>` : ""}</a>
    <div class="pm-body"><span class="pm-cause" style="color:${styleFor(p.cause).deep}">${causeLabel(p.cause)}</span>
      <a class="pm-title" href="/projects/${p.id}" translate="no">${p.title}</a>
      ${who ? html`<span class="kc-by small"><span class="kc-av" aria-hidden="true" translate="no">${initials(who)}</span><span class="kc-byw">by</span><span translate="no">${who}</span></span>` : ""}
      ${amountBlock(p)}
      ${metaRow(p)}
      ${actions(p)}</div></article>`;
}

/** Horizontal scrolling row with a heading and a "See all" link. */
export function carousel(title, items, { href = "", render = projectMini, empty = "" } = {}) {
  if (!items.length && !empty) return "";
  return html`<section class="rail"><div class="rail-head"><h2>${title}</h2>${href ? html`<a href="${href}">See all</a>` : ""}</div>
    ${items.length ? html`<div class="rail-track">${items.map(render)}</div>` : html`<p class="muted small">${empty}</p>`}</section>`;
}

// 7-step journey, the same steps as the home page bridge
export const STEPS = ["Share", "Structure", "Verify", "Match", "Collaborate", "Track", "Measure"];
export function stageIndex(p) {
  const hasPledges = (p.resources?.supporter_count || p.supporter_count || 0) > 0;
  return {
    draft: 1, needs_information: 2, submitted: 2, rejected: 2, approved: 3,
    published: hasPledges ? 4 : 3, in_progress: 5, completed: 6, verified: 7,
  }[p.status] ?? 0;
}
const STEP_LINE = ["Need shared", "Proposal written", "Being checked by reviewers", "Looking for supporters",
  "Supporters working together", "Work in progress", "Results reported", "Results verified"];
export function journey(p) {
  const cur = stageIndex(p);
  const n = Math.min(cur + 1, STEPS.length);
  return html`<p class="journey-line"><span class="jl-step">Step ${n} of ${STEPS.length}</span> <span class="jl-name">${STEP_LINE[cur] || STEP_LINE[0]}</span>
      <span class="jl-bar" aria-hidden="true"><span style="width:${Math.round((Math.min(cur, 7) / 7) * 100)}%"></span></span></p>
    <ol class="journey" aria-label="Project journey: ${STATUS_LABEL[p.status] || p.status}">
    ${STEPS.map((s, i) => {
      const state = i < cur ? "done" : i === cur ? "current" : "";
      return html`<li class="${state}" ${i === cur ? raw('aria-current="step"') : ""}><span class="dot">${i < cur ? icon("check") : i + 1}</span><span class="lbl">${s}</span></li>`;
    })}</ol>`;
}
