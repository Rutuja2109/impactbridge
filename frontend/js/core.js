// Core helpers: safe HTML templating, API client, app state, formatting, UI primitives.

// ---------- safe HTML ------------------------------------------------------
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Safe(String(s));
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
function render(v) {
  if (v === null || v === undefined || v === false) return "";
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(render).join("");
  return esc(v);
}
/** Tagged template: every interpolation is escaped unless it is html``/raw(). */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Safe(out);
}

// ---------- URL handling (path routing on our server, hash routing when hosted in Claude) ----
export const HOSTED = !!window.IB_HOSTED;
let memRoute = "/";
export function loc() {
  if (!HOSTED) return { path: location.pathname, search: location.search, anchor: location.hash.slice(1) };
  const h = memRoute || "/";
  const i = h.indexOf("#");
  const before = i >= 0 ? h.slice(0, i) : h, anchor = i >= 0 ? h.slice(i + 1) : "";
  const [path, qs = ""] = before.split("?");
  return { path: path || "/", search: qs ? "?" + qs : "", anchor };
}
export function setUrl(full, replace = true) {
  if (HOSTED) {
    // Hosted pages can't change their address; keep the route in memory and use history state for Back.
    memRoute = full;
    try { if (replace) history.replaceState({ ib: full }, ""); else history.pushState({ ib: full }, ""); } catch { /* sandbox */ }
    return;
  }
  if (replace) history.replaceState({}, "", full); else history.pushState({}, "", full);
}
export function restoreRoute(st) { if (HOSTED) memRoute = st?.ib || "/"; }
export function setAnchor(a) { const l = loc(); setUrl(l.path + l.search + (a ? "#" + a : "")); }
export function shareUrl(path) { return HOSTED ? (window.IB_SHARE_URL || location.href.split("#")[0]) : location.origin + path; }

// ---------- state ----------------------------------------------------------
export const state = { user: null, meta: null, listeners: new Set() };
export function setUser(u) {
  // Saved offline copies may include things only this person should see, so drop them whenever the signed-in person changes.
  if ((state.user?.id || null) !== (u?.id || null)) navigator.serviceWorker?.controller?.postMessage("clear-api");
  state.user = u; state.listeners.forEach((fn) => fn());
}
export function onUserChange(fn) { state.listeners.add(fn); }

// ---------- API ------------------------------------------------------------
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status; this.field = body?.field; this.details = body?.details || [];
  }
}
export async function api(path, { method = "GET", body, form, query } = {}) {
  if (HOSTED) {
    const { handle } = await import("./hosted/server.js");
    const q = {};
    if (query) Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") q[k] = String(v); });
    const r = await handle(method, path, { body: body ? JSON.parse(JSON.stringify(body)) : body, form, query: q });
    if (r.status >= 400) throw new ApiError(r.status, r.data);
    return r.data;
  }
  let url = path;
  if (query) {
    const q = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") q.set(k, v); });
    const s = q.toString();
    if (s) url += "?" + s;
  }
  const opts = { method, credentials: "same-origin", headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined || method !== "GET") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body ?? {});
  }
  let res;
  try { res = await fetch(url, opts); } catch {
    throw new ApiError(0, { error: "You appear to be offline. Check your connection and try again." });
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (res.headers.get("x-ib-offline") && !state.offlineNoted) { state.offlineNoted = true; toast("Showing saved projects. You're offline."); }
  if (!res.headers.get("x-ib-offline")) state.offlineNoted = false;
  if (!res.ok) {
    if (res.status === 401 && state.user && path !== "/api/auth/login") { setUser(null); }
    throw new ApiError(res.status, data);
  }
  return data;
}

// ---------- formatting -----------------------------------------------------
const SYMBOL = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
export function money(v) {
  if (v === null || v === undefined) return "—";
  const cur = state.meta?.currency || "INR";
  const locale = cur === "INR" ? "en-IN" : undefined;
  return (SYMBOL[cur] || cur + " ") + Number(v).toLocaleString(locale, { maximumFractionDigits: 0 });
}
export const num = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 1 }));
export function date(d) {
  if (!d) return "—";
  const dt = new Date(d.length === 10 ? d + "T00:00:00" : d);
  const loc = { hi: "hi-IN", mr: "mr-IN" }[document.documentElement.lang] || "en-IN";
  return dt.toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });
}
export function ago(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return date(d);
}
export const causeLabel = (c) => state.meta?.causes?.[c] || (c ? c.replace(/_/g, " ") : "Uncategorised");
export const STATUS_LABEL = {
  draft: "Draft", submitted: "Submitted for review", needs_information: "Needs information", approved: "Approved",
  published: "Open for support", in_progress: "In progress", completed: "Completed — awaiting verification",
  verified: "Completed", rejected: "Not approved",
};
export const statusBadge = (s) => html`<span class="status s-${s}">${STATUS_LABEL[s] || s}</span>`;
export const KIND_LABEL = { money: "Funding", volunteers: "Volunteers", materials: "Materials", equipment: "Equipment", skills: "Professional skills" };
export const COMMIT_STATUS = {
  proposed: ["Awaiting response", "info"], changes_requested: ["Changes requested", "warn"], accepted: ["Accepted", "verified"],
  declined: ["Declined", "bad"], withdrawn: ["Withdrawn", ""], cancelled: ["Cancelled", "bad"], fulfilled: ["Received", "verified"],
};
export function describeCommitment(c) {
  if (c.kind === "money") return money(c.quantity);
  if (c.kind === "volunteers") return `${c.quantity} volunteer${c.quantity == 1 ? "" : "s"}${c.hours ? `, ${c.hours} h each` : ""}`;
  return `${c.kind === "skills" ? "" : num(c.quantity) + " "}${c.unit ? c.unit + " " : ""}${c.item || ""}`.trim();
}

// ---------- DOM & UI primitives -------------------------------------------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function mount(target, content) {
  const el = typeof target === "string" ? $(target) : target;
  el.innerHTML = render(content);
  return el;
}
export function toast(msg, kind = "") {
  const t = document.createElement("div");
  t.className = "toast " + kind;
  t.textContent = msg;
  $("#toasts").append(t);
  setTimeout(() => t.remove(), kind === "bad" ? 6500 : 3800);
}
export const loading = (label = "Loading") => html`<div class="state" aria-busy="true"><p>${label}…</p></div>`;
export const skeletonTiles = (n = 3) => html`<div class="tiles">${Array.from({ length: n }, () => html`<div class="skeleton"></div>`)}</div>`;
export const errorState = (err, retry = true) => err.status === 404
  ? html`<div class="state" role="alert"><h3>We couldn't find that</h3><p>${err.message}</p>
      <p class="small muted">The link may be old, or the project isn't public yet.</p>
      <a class="btn primary" href="/explore">Browse projects</a></div>`
  : html`<div class="state" role="alert"><h3>That didn't load</h3><p>${err.message}</p>
      ${retry ? html`<button class="btn" data-action="reload">Try again</button>` : ""}</div>`;
export const emptyState = (title, body, action = "") => html`<div class="state"><h3>${title}</h3><p>${body}</p>${action}</div>`;

/** Bridge meter: requested vs pledged vs received. */
export function meter({ requested, pledged = 0, received = 0, fmt = money, label }) {
  if (requested === null || requested === undefined) {
    return html`<div class="meter"><div class="legend"><span>${label ? label + ": " : ""}amount not specified yet</span>
      ${pledged ? html`<span><b>${fmt(pledged)}</b> pledged</span>` : ""}</div></div>`;
  }
  const pct = (v) => (requested > 0 ? Math.min(100, (v / requested) * 100) : 0);
  const gap = Math.max(0, requested - pledged);
  return html`<div class="meter">
    <div class="track" role="img" aria-label="${label || "Progress"}: ${fmt(pledged)} pledged of ${fmt(requested)} needed, ${fmt(received)} received">
      <span class="pledged" style="width:${pct(pledged).toFixed(1)}%"></span>
      <span class="received" style="width:${pct(received).toFixed(1)}%"></span>
    </div>
    <div class="legend">
      ${label ? html`<span>${label}</span>` : ""}
      <span><b>${fmt(pledged)}</b> pledged of ${fmt(requested)}</span>
      ${gap > 0 ? html`<span>${fmt(gap)} still needed</span>` : html`<span><b>Fully pledged</b></span>`}
    </div></div>`;
}

export function verifiedBadges(p) {
  return html`
    ${p.is_demo ? html`<button type="button" class="badge demo" data-explain="demo">Demo data</button>` : ""}
    ${p.need_verified ? html`<button type="button" class="badge verified" data-explain="need">✓ Need verified</button>` : ""}
    ${p.financial_verified ? html`<button type="button" class="badge verified" data-explain="budget">✓ Budget checked</button>` : ""}
    ${p.completion_verified ? html`<button type="button" class="badge verified" data-explain="completion">✓ Completion verified</button>` : ""}
    ${p.organization?.verification_status === "verified" ? html`<button type="button" class="badge verified" data-explain="org">✓ Verified organization</button>` : ""}`;
}

const EXPLAIN = {
  demo: ["Demo data", "This is a sample project for trying ImpactBridge. It isn't a real need, and pledges to it aren't real commitments."],
  need: ["Need verified", "An ImpactBridge reviewer checked that this need is genuine: they looked at the photos and details, and spoke to or met the people who posted it. Reviewers never review their own projects."],
  budget: ["Budget checked", "A reviewer compared the budget with quotes, bills or other documents the team uploaded. It means the amounts asked for are reasonable, not that the money has been spent."],
  completion: ["Completion verified", "After the project reported its results, a reviewer independently checked the evidence (photos, receipts, attendance) before marking it complete. Reported and verified numbers are always shown separately."],
  org: ["Verified organization", "A reviewer checked this organization's registration or club charter and confirmed the people managing it belong to it."],
};
document.addEventListener("click", (e) => {
  const ph = e.target.closest("[data-lightbox]");
  if (ph) {
    e.preventDefault();
    const d = dialog(html`<div class="lightbox"><img src="${ph.dataset.lightbox}" alt="Photo"><button class="btn small" type="button" data-close>Close</button></div>`);
    d.classList.add("lb");
  }
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-explain]");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const [title, body] = EXPLAIN[b.dataset.explain] || [];
  if (title) dialog(html`<h2>${title}</h2><p>${body}</p><p class="small muted">Who reviews? People appointed by the ImpactBridge team, who must not be involved with the project. Every decision is recorded in the project's history.</p>
    <div class="row"><button class="btn ink" type="button" data-close>OK</button><a class="btn ghost" href="/how-it-works" data-close>How verification works</a></div>`);
}, true);

export function projectTile(p) {
  const photo = p.cover_photo
    ? html`<img class="photo" src="${p.cover_photo}" alt="" loading="lazy">`
    : html`<div class="photo none" aria-hidden="true">${causeIcon()}</div>`;
  return html`<article class="tile">
    ${photo}
    <div class="body">
      <div class="badges">${statusBadge(p.status)} ${verifiedBadges(p)}</div>
      <h3><a href="/projects/${p.id}">${p.title}</a></h3>
      <div class="where">${causeLabel(p.cause)}, ${[p.city, p.region].filter(Boolean).join(", ") || "location not set"}</div>
      <p class="small muted" style="margin:0">${p.problem_excerpt}${p.problem_excerpt?.length >= 220 ? "…" : ""}</p>
      <div class="foot stack">
        ${meter({ requested: p.funding.requested, pledged: p.funding.pledged, label: "Funding" })}
        ${p.volunteers.requested ? html`<div class="small muted">${p.volunteers.pledged} of ${p.volunteers.requested} volunteers pledged</div>` : ""}
      </div>
    </div></article>`;
}

function causeIcon() {
  return raw(`<svg width="56" height="40" viewBox="0 0 56 40" fill="none"><path d="M4 32c10-22 38-22 48 0" stroke="#10b981" stroke-width="3" stroke-linecap="round"/><path d="M4 32h48M16 32V22M28 32V18M40 32V22" stroke="#065f46" stroke-width="2.5" stroke-linecap="round"/></svg>`);
}

export function busy(btn, on = true) {
  if (!btn) return;
  btn.setAttribute("aria-busy", on ? "true" : "false");
  btn.disabled = on;
}

/** Show server validation errors next to fields (name attributes match API fields). */
export function showErrors(form, err) {
  $$(".err", form).forEach((e) => e.remove());
  $$("[aria-invalid]", form).forEach((e) => e.removeAttribute("aria-invalid"));
  const box = $(".form-error", form);
  const items = err.details?.length ? err.details : [{ field: err.field, message: err.message }];
  let placedAll = true;
  for (const d of items) {
    const input = d.field && form.querySelector(`[name="${CSS.escape(d.field)}"]`);
    if (input) {
      input.setAttribute("aria-invalid", "true");
      const m = document.createElement("div");
      m.className = "err"; m.textContent = d.message;
      input.closest(".field")?.append(m);
    } else placedAll = false;
  }
  if (box) {
    box.hidden = false;
    box.innerHTML = render(html`<p><strong>${err.message}</strong></p>${!placedAll && err.details?.length > 1
      ? html`<ul>${err.details.map((d) => html`<li>${d.message}</li>`)}</ul>` : ""}`);
    box.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  form.querySelector("[aria-invalid=true]")?.focus();
}

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === "checkbox") out[el.name] = el.checked;
    else if (el.type === "radio") { if (el.checked) out[el.name] = el.value; }
    else if (el.type === "number") out[el.name] = el.value === "" ? null : Number(el.value);
    else out[el.name] = el.value.trim() === "" ? null : el.value.trim();
  }
  return out;
}

/** In-page confirmation (native confirm() is unavailable in some hosts). Resolves true/false. */
export function confirmDialog(message, { confirmLabel = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const d = dialog(html`<p style="font-size:1.05rem;margin-bottom:var(--s4)">${message}</p>
      <div class="row"><button class="btn ${danger ? "danger" : "ink"}" data-yes>${confirmLabel}</button><button class="btn ghost" data-close>Cancel</button></div>`, {
      onMount: (dl) => dl.querySelector("[data-yes]").addEventListener("click", () => { answered = true; resolve(true); dl.close(); }),
    });
    d.addEventListener("close", () => { if (!answered) resolve(false); });
  });
}

export function dialog(content, { onMount } = {}) {
  const d = document.createElement("dialog");
  d.innerHTML = `<div class="dlg">${render(content)}</div>`;
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  d.addEventListener("click", (e) => {
    if (e.target === d || e.target.closest("[data-close]")) d.close();
  });
  d.showModal();
  onMount?.(d);
  return d;
}

export async function uploadFile(file, fields) {
  const fd = new FormData();
  fd.append("file", file);
  Object.entries(fields).forEach(([k, v]) => v !== undefined && v !== null && fd.append(k, v));
  return (await api("/api/files", { method: "POST", form: fd })).file;
}

export const navigate = (path) => window.dispatchEvent(new CustomEvent("ib:navigate", { detail: path }));

/** A short celebration after a meaningful action (pledge sent, project published). Skipped with reduced motion. */
export function celebrate(title, body = "", action = null) {
  const box = document.createElement("div");
  box.className = "cele5"; box.setAttribute("role", "status");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const colors = ["#F4B63E", "#1E9BBF", "#E8505B", "#3FA34D", "#9C6ADE", "#F07A2B"];
  const bits = reduce ? "" : Array.from({ length: 36 }, (_, i) =>
    `<i style="left:${(i * 37) % 100}%;background:${colors[i % colors.length]};animation-delay:${(i % 9) * 45}ms;--dx:${((i * 53) % 120) - 60}px;--r:${(i * 47) % 360}deg"></i>`).join("");
  box.innerHTML = `<div class="cele5-bits" aria-hidden="true">${bits}</div><div class="cele5-card"><span class="cele5-ic" aria-hidden="true">🎉</span><strong>${esc(title)}</strong>${body ? `<span>${esc(body)}</span>` : ""}${action ? `<a class="btn primary cele5-act" target="_blank" rel="noopener" href="${esc(action.href)}">${esc(action.label)}</a><button type="button" class="cele5-skip">Not now</button>` : ""}</div>`;
  document.body.appendChild(box);
  const life = action ? 9000 : 2200;
  setTimeout(() => box.classList.add("out"), life);
  setTimeout(() => box.remove(), life + 500);
  box.querySelector(".cele5-skip")?.addEventListener("click", (e) => { e.stopPropagation(); box.remove(); });
  box.addEventListener("click", () => box.remove());
}
