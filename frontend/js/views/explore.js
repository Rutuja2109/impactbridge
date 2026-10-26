import { CAUSE_EMOJI, icon } from "../art.js";
import { $, $$, setUrl, api, emptyState, errorState, html, mount, skeletonTiles, state, toast } from "../core.js";
import { projectTile } from "../components.js";

const FIELDS = ["q", "cause", "city", "region", "min_budget", "max_budget", "min_volunteers", "max_volunteers",
  "max_duration_weeks", "available_from", "available_until", "skill", "material", "verified", "needs", "status",
  "sort", "include_demo", "semantic", "page", "effort"];

export default async function explore({ el, query }) {
  document.title = "Explore projects — ImpactBridge";
  const q = { ...query };
  const causes = Object.entries(state.meta?.causes || {});
  const semanticOK = state.meta?.integrations?.semantic_search?.configured;
  const sel = (name, opts, label) => html`<div class="field"><label for="f-${name}">${label}</label>
    <select id="f-${name}" name="${name}">${opts.map(([v, t]) => html`<option value="${v}" ${q[name] === v ? "selected" : ""}>${t}</option>`)}</select></div>`;
  const rad = (name, opts) => html`<div class="fs7-opts" role="radiogroup">${opts.map(([v, t]) => html`<label class="fs7-opt"><input type="radio" name="${name}" value="${v}" ${(q[name] || "") === v ? "checked" : ""}><span>${t}</span></label>`)}</div>`;
  const inp = (name, label, type = "text", extra = "") => html`<div class="field"><label for="f-${name}">${label}</label>
    <input id="f-${name}" name="${name}" type="${type}" value="${q[name] || ""}" ${extra}></div>`;

  const EMO = CAUSE_EMOJI;
  const sortOpts = [["", "Newest"], ["funding_gap", "Biggest gap"], ["starting_soon", "Starting soon"]];

  mount(el, html`<div class="wrap ex6">
    <div class="ex6-bar">
      <form id="search" class="searchbar s5" role="search">
        <label class="sr-only" for="f-q">Search projects</label>
        <svg class="s5-ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="f-q" name="q" type="search" placeholder="Search problems, places, skills" value="${q.q || ""}">
        <button class="sr-only" type="submit">Search</button>
      </form>
    </div>
    <div class="ex6-cats" role="group" aria-label="Browse by cause">
      <button type="button" class="ex6-cat" data-cause="" aria-pressed="${!q.cause}"><span class="ex6-dot">✨</span><span>All</span></button>
      ${causes.map(([k, t]) => html`<button type="button" class="ex6-cat" data-cause="${k}" aria-pressed="${q.cause === k}"><span class="ex6-dot">${EMO[k] || "💛"}</span><span>${t.split(/ & |, /)[0]}</span></button>`)}
    </div>
    <div class="qchips" role="group" aria-label="Quick filters">
      <button class="qchip" type="button" id="nearme" aria-pressed="${q.city && state.user?.city && q.city.toLowerCase() === state.user.city.toLowerCase() ? "true" : "false"}">${icon("pin")} Near me</button>
      <button class="qchip" type="button" data-quick="needs=money" aria-pressed="${q.needs === "money"}">Needs funding</button>
      <button class="qchip" type="button" data-quick="needs=volunteers" aria-pressed="${q.needs === "volunteers"}">Needs volunteers</button>
      <button class="qchip" type="button" data-quick="effort=light" aria-pressed="${q.effort === "light"}">Quick to help</button>
      <button class="qchip" type="button" data-quick="verified=any" aria-pressed="${q.verified === "any"}">Verified</button>
      <button class="qchip" type="button" data-quick="status=completed,verified" aria-pressed="${q.status === "completed,verified"}">Finished</button>
    </div>
    ${semanticOK ? html`<label class="check" style="margin:6px 0 0"><input type="checkbox" id="f-semantic" ${q.semantic === "1" ? "checked" : ""}>
      <span>Search by meaning (AI)</span></label>` : ""}
    <div class="ex6-active" id="active" aria-label="Active filters"></div>
    <section aria-live="polite" aria-busy="false" id="results-wrap">
      <div class="ex6-row"><p id="count" class="muted small"></p>
</div>
      <div id="results">${skeletonTiles(6)}</div></section>
    <nav class="sf7" aria-label="Sort and filter">
      <button type="button" id="stoggle"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/></svg> Sort</button>
      <button type="button" id="ftoggle" aria-expanded="false" aria-controls="filters"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg> Filter <span class="ex6-n" id="fcount" hidden></span></button>
    </nav>
    <div class="fs6" id="sortsheet" role="dialog" aria-modal="true" aria-label="Sort by" hidden>
      <div class="fs6-back" data-sclose></div>
      <div class="fs6-card"><div class="fs6-head"><h2>Sort by</h2><button class="qp5-x" type="button" data-sclose aria-label="Close">×</button></div>
        <div class="fs6-body"><div class="fs7-opts" role="radiogroup">${sortOpts.map(([v, t]) => html`<label class="fs7-opt"><input type="radio" name="sortopt" value="${v}" ${(q.sort || "") === v ? "checked" : ""}><span>${t}</span></label>`)}</div></div></div>
    </div>
    <div class="fs6" id="filters" role="dialog" aria-modal="true" aria-label="Filters" hidden>
      <div class="fs6-back" data-fclose></div>
      <div class="fs6-card fs7-card">
        <div class="fs6-head"><h2>Filters</h2><button class="qp5-x" type="button" data-fclose aria-label="Close">×</button></div>
        <div class="fs7-split">
          <div class="fs7-nav" role="tablist" aria-label="Filter groups">
            ${[["cause", "Cause"], ["where", "Location"], ["needs", "What's needed"], ["money", "Budget & people"], ["when", "Time"], ["skills", "Skills & items"], ["trust", "Trust & stage"]].map(([g, t], i) =>
              html`<button type="button" role="tab" data-g="${g}" aria-selected="${i === 0}">${t}<i class="fs7-dot" hidden></i></button>`)}
          </div>
          <form id="filterform" class="filters fs7-pane">
            <input type="hidden" name="sort" value="${q.sort || ""}">
            <div data-pane="cause">${rad("cause", [["", "All causes"], ...causes])}</div>
            <div data-pane="where" hidden>${inp("city", "City or town")}${inp("region", "State / region")}</div>
            <div data-pane="needs" hidden><h3 class="fs7-h">Open needs</h3>${rad("needs", [["", "Any"], ["any", "Still needs support"], ["money", "Needs funding"], ["volunteers", "Needs volunteers"]])}
              <h3 class="fs7-h">Effort</h3>${rad("effort", [["", "Any effort"], ["light", "Light: up to 2 weeks, a few people"], ["medium", "Medium"], ["heavy", "Big: over 2 months or 20+ people"]])}</div>
            <div data-pane="money" hidden><div class="form-grid">${inp("min_budget", "Budget from (₹)", "number", 'min="0" inputmode="numeric"')}${inp("max_budget", "Budget to (₹)", "number", 'min="0" inputmode="numeric"')}</div>
              <div class="form-grid">${inp("min_volunteers", "Volunteers from", "number", 'min="0"')}${inp("max_volunteers", "Volunteers to", "number", 'min="0"')}</div></div>
            <div data-pane="when" hidden>${inp("max_duration_weeks", "Maximum duration (weeks)", "number", 'min="1"')}
              <div class="form-grid">${inp("available_from", "I'm available from", "date")}${inp("available_until", "until", "date")}</div></div>
            <div data-pane="skills" hidden>${inp("skill", "Skill needed", "text", 'placeholder="e.g. plumbing, teaching"')}${inp("material", "Material needed", "text", 'placeholder="e.g. saplings, gloves"')}</div>
            <div data-pane="trust" hidden><h3 class="fs7-h">Verification</h3>${rad("verified", [["", "Any"], ["any", "Any verification"], ["need", "Need verified"], ["completion", "Completion verified"]])}
              <h3 class="fs7-h">Stage</h3>${rad("status", [["", "All public stages"], ["published,in_progress", "Open or in progress"], ["published", "Open for support"], ["in_progress", "In progress"], ["completed,verified", "Finished"]])}
              <label class="check"><input type="checkbox" name="include_demo" ${q.include_demo === "0" ? "" : "checked"}><span>Show sample projects</span></label></div>
          </form>
        </div>
        <div class="fs6-foot"><button class="btn ghost" type="button" id="clear">Clear all</button><button class="btn primary" type="button" id="fshow" data-fclose>Show projects</button></div>
      </div>
    </div>
    </div></div>`);

  const filterForm = $("#filterform", el);
  const collect = (page = 1) => {
    const out = {};
    for (const elx of filterForm.elements) {
      if (!elx.name) continue;
      if (elx.type === "checkbox") { if (!elx.checked) out[elx.name] = "0"; }
      else if (elx.type === "radio") { if (elx.checked && elx.value) out[elx.name] = elx.value; }
      else if (elx.value) out[elx.name] = elx.value;
    }
    const qv = $("#f-q", el).value.trim();
    if (qv) out.q = qv;
    if ($("#f-semantic", el)?.checked) out.semantic = "1";
    if (page > 1) out.page = String(page);
    return out;
  };

  const LBL = { city: "City", region: "State", min_budget: "Budget from ₹", max_budget: "Budget to ₹", min_volunteers: "Volunteers from",
    max_volunteers: "Volunteers up to", max_duration_weeks: "Max weeks", available_from: "From", available_until: "Until", skill: "Skill", material: "Material" };
  function syncUI(params, total) {
    const catVal = params.cause || "";
    el.querySelectorAll(".ex6-cat").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cause === catVal)));
    const pills = [];
    for (const [k, v] of Object.entries(params)) {
      if (["q", "page", "semantic", "include_demo"].includes(k) || !v) continue;
      if (k === "sort" && !v) continue;
      const f = filterForm.elements[k];
      const radio = f && !f.tagName ? [...f].find((x) => x.checked) : null;
      let text = radio ? radio.parentElement.textContent.trim() : `${LBL[k] || k}: ${v}`;
      if (k === "cause") text = (state.meta?.causes || {})[v] || v;
      if (k === "sort") text = "Sorted: " + (sortOpts.find(([x]) => x === v)?.[1] || v);
      pills.push([k, text]);
    }
    if (params.include_demo === "0") pills.push(["include_demo", "Hiding samples"]);
    const n = $("#fcount", el); n.hidden = !pills.length; n.textContent = pills.length;
    mount($("#active", el), html`${pills.map(([k, t]) => html`<button type="button" class="ex6-pill" data-rm="${k}">${t} <span aria-hidden="true">×</span><span class="sr-only">Remove filter</span></button>`)}`);
    $("#active", el).querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
      const f = filterForm.elements[b.dataset.rm];
      if (f?.type === "checkbox") f.checked = true; else if (f) f.value = "";
      if (b.dataset.rm === "sort") $$("[name=sortopt]", el).forEach((x) => { x.checked = x.value === ""; });
      load(collect());
    }));
    el.querySelectorAll("[name=sortopt]").forEach((x) => { x.checked = x.value === (params.sort || ""); });
    const groups = { cause: ["cause"], where: ["city", "region"], needs: ["needs", "effort"], money: ["min_budget", "max_budget", "min_volunteers", "max_volunteers"],
      when: ["max_duration_weeks", "available_from", "available_until"], skills: ["skill", "material"], trust: ["verified", "status", "include_demo"] };
    el.querySelectorAll(".fs7-nav [data-g]").forEach((b) => { b.querySelector(".fs7-dot").hidden = !groups[b.dataset.g].some((k) => params[k]); });
    $("#fshow", el).textContent = `Show ${total} project${total === 1 ? "" : "s"}`;
  }

  async function load(params) {
    const qs = new URLSearchParams(Object.entries(params).filter(([k]) => FIELDS.includes(k)));
    setUrl("/explore" + (qs.toString() ? "?" + qs : ""));
    const box = $("#results", el);
    $("#results-wrap", el).setAttribute("aria-busy", "true");
    try {
      const r = await api("/api/projects", { query: { ...params, per_page: 12 } });
      syncUI(params, r.total);
      $("#count", el).textContent = `${r.total} project${r.total === 1 ? "" : "s"}` +
        (params.q ? ` matching “${params.q}”${r.search_mode === "semantic" ? " (by meaning)" : ""}` : "");
      if (!r.projects.length) {
        mount(box, emptyState("No projects match these filters", "Try removing a filter or searching for a broader term.",
          html`<button class="btn" id="clear2">Clear filters</button>`));
        $("#clear2", el)?.addEventListener("click", () => { filterForm.reset(); $("#f-q", el).value = ""; resetAll(); });
      } else {
        const pages = Math.ceil(r.total / r.per_page);
        mount(box, html`<div class="tiles">${r.projects.map(projectTile)}</div>
          ${pages > 1 ? html`<nav class="pager" aria-label="Pages">
            <button class="btn small" data-page="${r.page - 1}" ${r.page <= 1 ? "disabled" : ""}>Previous</button>
            <span class="muted" style="align-self:center">Page ${r.page} of ${pages}</span>
            <button class="btn small" data-page="${r.page + 1}" ${r.page >= pages ? "disabled" : ""}>Next</button></nav>` : ""}`);
        box.querySelectorAll("[data-page]").forEach((b) => b.addEventListener("click", () => {
          load(collect(Number(b.dataset.page))); window.scrollTo({ top: 0 });
        }));
      }
    } catch (err) {
      mount(box, errorState(err, false));
    } finally {
      $("#results-wrap", el).setAttribute("aria-busy", "false");
    }
  }
  function resetAll() {
    for (const x of filterForm.elements) {
      if (x.type === "checkbox") x.checked = true;
      else if (x.type === "radio") x.checked = x.value === "";
      else if (x.name) x.value = "";
    }
    el.querySelectorAll("[name=sortopt]").forEach((x) => { x.checked = x.value === ""; });
    load({});
  }

  $("#search", el).addEventListener("submit", (e) => { e.preventDefault(); load(collect()); });
  filterForm.addEventListener("submit", (e) => {
    e.preventDefault(); load(collect()); openSheet(false);
  });
  filterForm.addEventListener("change", (e) => { if (e.target.type === "radio" || e.target.type === "checkbox") load(collect()); });
  $("#clear", el).addEventListener("click", resetAll);
  el.querySelectorAll("[data-quick]").forEach((b) => b.addEventListener("click", () => {
    const [k, v] = b.dataset.quick.split("=");
    const on = b.getAttribute("aria-pressed") !== "true";
    el.querySelectorAll(`[data-quick^="${k}="]`).forEach((x) => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", String(on));
    const field = filterForm.elements[k];
    if (field) field.value = on ? v : "";
    load(collect());
  }));
  $("#nearme", el).addEventListener("click", (e) => {
    const city = state.user?.city;
    if (!city) {
      toast(state.user ? "Add your city in your profile to use Near me." : "Sign in and add your city to use Near me.");
      return;
    }
    const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
    e.currentTarget.setAttribute("aria-pressed", String(on));
    filterForm.elements.city.value = on ? city : "";
    load(collect());
  });
  $("#f-semantic", el)?.addEventListener("change", () => { if ($("#f-q", el).value) load(collect()); });
  const sheet = $("#filters", el), sortSheet = $("#sortsheet", el);
  const openSheet = (on, which = sheet) => {
    which.hidden = !on; document.body.classList.toggle("qp-open", on);
    $("#ftoggle", el).setAttribute("aria-expanded", String(on && which === sheet));
    if (on) requestAnimationFrame(() => which.classList.add("in")); else which.classList.remove("in");
  };
  $("#ftoggle", el).addEventListener("click", () => openSheet(true));
  $("#stoggle", el).addEventListener("click", () => openSheet(true, sortSheet));
  sheet.querySelectorAll("[data-fclose]").forEach((b) => b.addEventListener("click", () => { if (b.id === "fshow") load(collect()); openSheet(false); }));
  sortSheet.querySelectorAll("[data-sclose]").forEach((b) => b.addEventListener("click", () => openSheet(false, sortSheet)));
  sortSheet.addEventListener("change", (e) => { filterForm.elements.sort.value = e.target.value; load(collect()); openSheet(false, sortSheet); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!sheet.hidden) openSheet(false); if (!sortSheet.hidden) openSheet(false, sortSheet); } });
  el.querySelectorAll(".fs7-nav [data-g]").forEach((b) => b.addEventListener("click", () => {
    el.querySelectorAll(".fs7-nav [data-g]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    el.querySelectorAll("[data-pane]").forEach((x) => { x.hidden = x.dataset.pane !== b.dataset.g; });
  }));
  el.querySelectorAll(".ex6-cat").forEach((b) => b.addEventListener("click", () => {
    const r = [...filterForm.elements.cause].find((x) => x.value === b.dataset.cause); if (r) r.checked = true; load(collect());
  }));
  load(Object.fromEntries(Object.entries(q).filter(([k]) => FIELDS.includes(k))));
}
