// Story circles on the home screen: short updates from projects, the ones you backed first.
import { ago, api, html, money, mount, state } from "../core.js";
import { go } from "../app.js";
import { causeIcon, styleFor } from "../art.js";

export async function storiesRail(target) {
  if (!state.user) return;
  let list = [];
  try { list = (await api("/api/stories")).stories; } catch { return; }
  if (!list.length) return;
  mount(target, html`<section class="st6" aria-label="Updates from projects">
    <div class="st6-track">${list.map((s, i) => html`<button type="button" class="st6-item" data-i="${i}" aria-label="Update from ${s.project.title}">
      <span class="st6-ring ${s.backed ? "backed" : ""}" style="--cc:${styleFor(s.project.cause).soft};--ci:${styleFor(s.project.cause).deep}">${causeIcon(s.project.cause, 26)}</span>
      <span class="st6-name" translate="no">${s.backed ? "You backed" : s.project.city || "Update"}</span>
      <span class="st6-t" translate="no">${s.project.title}</span></button>`)}</div></section>`);
  target.querySelectorAll(".st6-item").forEach((b) => b.addEventListener("click", () => view(list, Number(b.dataset.i))));
}

function view(list, start) {
  let si = start, ui = 0, timer = null;
  const d = document.createElement("div");
  d.className = "sv6"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "Project update");
  document.body.append(d); document.body.classList.add("qp-open");
  const close = () => { clearTimeout(timer); d.remove(); document.body.classList.remove("qp-open"); document.removeEventListener("keydown", key); };
  const key = (e) => { if (e.key === "Escape") close(); if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft") prev(); };
  document.addEventListener("keydown", key);
  const next = () => { const s = list[si]; if (ui < s.updates.length - 1) ui++; else if (si < list.length - 1) { si++; ui = 0; } else return close(); draw(); };
  const prev = () => { if (ui > 0) ui--; else if (si > 0) { si--; ui = 0; } draw(); };
  function draw() {
    clearTimeout(timer);
    const s = list[si], u = s.updates[ui], p = s.project;
    const pctv = p.resources?.money?.requested ? Math.min(100, Math.round(100 * p.resources.money.pledged / p.resources.money.requested)) : null;
    mount(d, html`<div class="sv6-card" style="--cc:${styleFor(p.cause).soft};--ci:${styleFor(p.cause).deep}">
      <div class="sv6-bars">${s.updates.map((_, i) => html`<i class="${i < ui ? "done" : i === ui ? "now" : ""}"></i>`)}</div>
      <div class="sv6-head"><span translate="no">${p.title}</span><button type="button" data-x aria-label="Close">×</button></div>
      <div class="sv6-body"><span class="sv6-ic" aria-hidden="true">${causeIcon(p.cause, 44)}</span>
        <h2 translate="no">${u.title}</h2><p translate="no">${u.body}</p><small>${ago(u.created_at)}</small></div>
      ${pctv !== null ? html`<div class="sv6-prog"><span style="width:${pctv}%"></span></div><p class="sv6-pt">${money(p.resources.money.pledged)} of ${money(p.resources.money.requested)} pledged</p>` : ""}
      <button class="btn primary sv6-go" type="button" data-open>${s.backed ? "See your project" : "Help this need"}</button>
      <button class="sv6-l" type="button" data-prev aria-label="Previous"></button><button class="sv6-r" type="button" data-next aria-label="Next"></button></div>`);
    d.querySelector("[data-x]").addEventListener("click", close);
    d.querySelector("[data-next]").addEventListener("click", next);
    d.querySelector("[data-prev]").addEventListener("click", prev);
    d.querySelector("[data-open]").addEventListener("click", () => { close(); go(`/projects/${p.id}`); });
    timer = setTimeout(next, 6000);
  }
  draw();
}
