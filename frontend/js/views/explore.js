import { icon } from "../art.js";
import { $, setUrl, api, emptyState, errorState, html, mount, skeletonTiles, state, toast } from "../core.js";
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
  const inp = (name, label, type = "text", extra = "") => html`<div class="field"><label for="f-${name}">${label}</label>
    <input id="f-${name}" name="${name}" type="${type}" value="${q[name] || ""}" ${extra}></div>`;

  mount(el, html`<div class="wrap">
    <div class="page-head ex5-head"><h1>Explore</h1></div>
    <div class="ex5-bar">
      <form id="search" class="searchbar s5" role="search">
        <label class="sr-only" for="f-q">Search projects</label>
        <svg class="s5-ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="f-q" name="q" type="search" placeholder="Search problems, places, skills" value="${q.q || ""}">
        <button class="btn primary" type="submit">Search</button>
      </form>
      <div class="qchips" role="group" aria-label="Quick filters">
        <button class="qchip" type="button" id="nearme" aria-pressed="${q.city && state.user?.city && q.city.toLowerCase() === state.user.city.toLowerCase() ? "true" : "false"}">${icon("pin")} Near me${state.user?.city ? html` (${state.user.city})` : ""}</button>
        <button class="qchip" type="button" data-quick="needs=money" aria-pressed="${q.needs === "money"}">Needs funding</button>
        <button class="qchip" type="button" data-quick="needs=volunteers" aria-pressed="${q.needs === "volunteers"}">Needs volunteers</button>
        <button class="qchip" type="button" data-quick="effort=light" aria-pressed="${q.effort === "light"}">Quick to help</button>
        <button class="qchip" type="button" data-quick="verified=any" aria-pressed="${q.verified === "any"}">Verified</button>
        <button class="qchip" type="button" data-quick="status=completed,verified" aria-pressed="${q.status === "completed,verified"}">Finished</button>
        <button class="qchip more filter-toggle" type="button" id="ftoggle" aria-expanded="false" aria-controls="filters">More filters</button>
      </div>
      ${semanticOK ? html`<label class="check" style="margin:0"><input type="checkbox" id="f-semantic" ${q.semantic === "1" ? "checked" : ""}>
        <span>Search by meaning (AI)</span></label>` : ""}
    </div>
    <div class="explore-layout">
      <aside class="filters-panel panel tight" id="filters" aria-label="Filters">
        <form id="filterform" class="filters">
          ${sel("cause", [["", "All causes"], ...causes], "Cause")}
          ${inp("city", "City or town")}
          ${inp("region", "State / region")}
          ${sel("needs", [["", "Any"], ["any", "Still needs support"], ["money", "Needs funding"], ["volunteers", "Needs volunteers"]], "Open needs")}
          <div class="form-grid">${inp("min_budget", "Budget from", "number", 'min="0" inputmode="numeric"')}${inp("max_budget", "Budget to", "number", 'min="0" inputmode="numeric"')}</div>
          <div class="form-grid">${inp("min_volunteers", "Volunteers from", "number", 'min="0"')}${inp("max_volunteers", "Volunteers to", "number", 'min="0"')}</div>
          ${sel("effort", [["", "Any effort"], ["light", "Light: up to 2 weeks, a few people"], ["medium", "Medium"], ["heavy", "Big: over 2 months or 20+ people"]], "Effort required")}
          ${inp("max_duration_weeks", "Maximum duration (weeks)", "number", 'min="1"')}
          <div class="form-grid">${inp("available_from", "I'm available from", "date")}${inp("available_until", "until", "date")}</div>
          ${inp("skill", "Skill needed", "text", 'placeholder="e.g. plumbing, teaching"')}
          ${inp("material", "Material needed", "text", 'placeholder="e.g. saplings, gloves"')}
          ${sel("verified", [["", "Any"], ["any", "Any verification"], ["need", "Need verified"], ["completion", "Completion verified"]], "Verification")}
          ${sel("status", [["", "All public stages"], ["published,in_progress", "Open or in progress"], ["published", "Open for support"], ["in_progress", "In progress"], ["completed,verified", "Finished"]], "Stage")}
          ${sel("sort", [["", "Most recent"], ["funding_gap", "Largest funding gap"], ["starting_soon", "Starting soonest"]], "Sort by")}
          <label class="check"><input type="checkbox" name="include_demo" ${q.include_demo === "0" ? "" : "checked"}><span>Show demo projects</span></label>
          <div class="row"><button class="btn ink small" type="submit">Apply filters</button><button class="btn small ghost" type="button" id="clear">Clear all</button></div>
        </form>
      </aside>
      <section aria-live="polite" aria-busy="false" id="results-wrap"><p id="count" class="muted small"></p><div id="results">${skeletonTiles(6)}</div></section>
    </div></div>`);

  const filterForm = $("#filterform", el);
  const collect = (page = 1) => {
    const out = {};
    for (const elx of filterForm.elements) {
      if (!elx.name) continue;
      if (elx.type === "checkbox") { if (!elx.checked) out[elx.name] = "0"; }
      else if (elx.value) out[elx.name] = elx.value;
    }
    const qv = $("#f-q", el).value.trim();
    if (qv) out.q = qv;
    if ($("#f-semantic", el)?.checked) out.semantic = "1";
    if (page > 1) out.page = String(page);
    return out;
  };

  async function load(params) {
    const qs = new URLSearchParams(Object.entries(params).filter(([k]) => FIELDS.includes(k)));
    setUrl("/explore" + (qs.toString() ? "?" + qs : ""));
    const box = $("#results", el);
    $("#results-wrap", el).setAttribute("aria-busy", "true");
    try {
      const r = await api("/api/projects", { query: { ...params, per_page: 12 } });
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
    for (const x of filterForm.elements) { if (x.type === "checkbox") x.checked = true; else if (x.name) x.value = ""; }
    load({});
  }

  $("#search", el).addEventListener("submit", (e) => { e.preventDefault(); load(collect()); });
  filterForm.addEventListener("submit", (e) => {
    e.preventDefault(); load(collect());
    if (window.innerWidth < 960) { $("#filters", el).classList.remove("open"); $("#ftoggle", el).setAttribute("aria-expanded", "false"); }
  });
  filterForm.addEventListener("change", (e) => { if (e.target.tagName === "SELECT" || e.target.type === "checkbox") load(collect()); });
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
    $("#f-city", el).value = on ? city : "";
    load(collect());
  });
  $("#f-semantic", el)?.addEventListener("change", () => { if ($("#f-q", el).value) load(collect()); });
  $("#ftoggle", el).addEventListener("click", (e) => {
    const open = $("#filters", el).classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", String(open));
  });
  load(Object.fromEntries(Object.entries(q).filter(([k]) => FIELDS.includes(k))));
}
