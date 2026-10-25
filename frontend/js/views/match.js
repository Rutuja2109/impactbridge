import { $, api, busy, causeLabel, emptyState, html, mount, money, num, showErrors, state, statusBadge, verifiedBadges } from "../core.js";

const COMPONENT_LABEL = { cause: "Cause alignment", resources: "Covers remaining needs", location: "Location", timing: "Timing", collaboration: "Collaboration fit" };

export default async function match({ el }) {
  document.title = "Find projects for my resources — ImpactBridge";
  const u = state.user;
  const orgCity = u.city || "", orgRegion = u.region || "";
  mount(el, html`<div class="wrap">
    <div class="page-head"><h1>Find projects for my resources</h1>
      <p class="lede">Tell us what your club, team or company can offer. We first rule out projects you can't realistically help,
        then rank the rest and explain each match — including what would still be missing.</p></div>
    <div class="split">
      <form id="mf" class="panel" novalidate style="order:0"><div class="form-error notice bad" hidden></div>
        <h2>What you can offer</h2>
        <div class="form-grid">
          <div class="field"><label for="b">Budget available (${state.meta.currency})</label><input id="b" name="budget" type="number" min="0" inputmode="numeric"></div>
          <div class="field"><label for="v">Volunteers available</label><input id="v" name="volunteers" type="number" min="0"></div>
          <div class="field full"><label for="sk">Skills</label><input id="sk" name="skills" value="${(u.skills || []).join(", ")}" placeholder="e.g. plumbing, teaching, accounting"><span class="hint">Separate with commas.</span></div>
          <div class="field full"><label for="eq">Equipment or materials</label><input id="eq" name="equipment" placeholder="e.g. projector, gloves, saplings"></div>
        </div>
        <h2>Where and when</h2>
        <div class="form-grid">
          <div class="field"><label for="c">City</label><input id="c" name="city" value="${orgCity}"></div>
          <div class="field"><label for="r">State / region</label><input id="r" name="region" value="${orgRegion}"></div>
          <div class="field full"><label for="ls">How far can you work?</label><select id="ls" name="location_scope">
            <option value="city">Only in my city</option><option value="region" selected>Anywhere in my state/region</option><option value="anywhere">Anywhere</option></select></div>
          <div class="field"><label for="af">Available from</label><input id="af" name="available_from" type="date"></div>
          <div class="field"><label for="au">Available until</label><input id="au" name="available_until" type="date"></div>
        </div>
        <fieldset><legend>Preferred causes</legend>
          ${Object.entries(state.meta.causes).map(([k, t]) => html`<label class="check"><input type="checkbox" name="causes" value="${k}"><span>${t}</span></label>`)}
          <p class="small muted" style="margin:0">Leave all unticked to consider every cause.</p></fieldset>
        <label class="check"><input type="checkbox" name="open_to_partnering" checked><span>We're happy to combine our contribution with other supporters</span></label>
        <button class="btn primary" type="submit" style="width:100%">Find matching projects</button>
      </form>
      <section id="results" aria-live="polite" style="order:-1">${emptyState("Your matches will appear here", "Fill in at least one resource: budget, volunteers, skills or equipment.")}</section>
    </div></div>`);

  const f = $("#mf", el);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const list = (n) => (f.elements[n].value || "").split(",").map((x) => x.trim()).filter(Boolean);
    const numv = (n) => (f.elements[n].value === "" ? null : Number(f.elements[n].value));
    const body = {
      budget: numv("budget"), volunteers: numv("volunteers"), skills: list("skills"), equipment: list("equipment"),
      city: f.city.value.trim() || null, region: f.region.value.trim() || null, location_scope: f.location_scope.value,
      available_from: f.available_from.value || null, available_until: f.available_until.value || null,
      causes: [...f.querySelectorAll("input[name=causes]:checked")].map((x) => x.value),
      open_to_partnering: f.open_to_partnering.checked,
    };
    const btn = e.submitter; busy(btn);
    try {
      const r = await api("/api/match", { method: "POST", body });
      render(r);
      if (window.innerWidth < 960) $("#results", el).scrollIntoView({ behavior: "smooth" });
    } catch (err) { showErrors(f, err); } finally { busy(btn, false); }
  });

  function render(r) {
    const box = $("#results", el);
    mount(box, html`
      <h2>${r.matches.length ? `${r.matches.length} project${r.matches.length === 1 ? "" : "s"} you could help` : "No feasible matches right now"}</h2>
      <p class="small muted">Scores are calculated only from what you entered and each project's recorded needs:
        ${Object.entries(r.weights).map(([k, w], i, a) => `${COMPONENT_LABEL[k].toLowerCase()} ${Math.round(w * 100)}%${i < a.length - 1 ? ", " : "."}`).join("")}</p>
      ${r.matches.map((m) => html`<article class="panel" style="margin-top:var(--s4)"><div class="match-card">
        <div>
          <div class="row">${statusBadge(m.project.status)} ${verifiedBadges(m.project)}</div>
          <h3 style="margin-top:var(--s3)"><a href="/projects/${m.project.id}">${m.project.title}</a></h3>
          <p class="small muted">${causeLabel(m.project.cause)}, ${[m.project.city, m.project.region].filter(Boolean).join(", ")}</p>
          <h4>Why it matches</h4><ul class="small">${m.reasons.map((x) => html`<li>${x}</li>`)}</ul>
          ${m.still_missing.length ? html`<h4>Still missing after your contribution</h4><ul class="small">${m.still_missing.map((x) => html`<li>${x}</li>`)}</ul>`
            : html`<p class="notice good small">Your offer would cover all of this project's listed needs.</p>`}
          <a class="btn small primary" href="/projects/${m.project.id}#support">Offer support</a>
        </div>
        <div><div class="score">${m.score}<span class="small muted"> / 100</span></div>
          <div class="components">${Object.entries(m.components).map(([k, v]) => html`<div><div class="row between"><span>${COMPONENT_LABEL[k]}</span><span>${Math.round(v * 100)}%</span></div>
            <div class="bar"><span style="width:${Math.round(v * 100)}%"></span></div></div>`)}</div>
          <p class="small muted" style="margin-top:var(--s3)">Funding gap: ${m.project.funding.gap === null ? "not specified" : money(m.project.funding.gap)}<br>
            Volunteer gap: ${m.project.volunteers.gap === null ? "not specified" : num(m.project.volunteers.gap)}</p></div>
      </div></article>`)}
      ${!r.matches.length ? html`<p>Try widening your location, adding skills, or ticking "happy to combine". You can also <a href="/explore?needs=any">browse all projects that need support</a>.</p>` : ""}
      ${r.excluded.length ? html`<details class="panel" style="margin-top:var(--s4)"><summary><strong>${r.excluded.length} project${r.excluded.length === 1 ? " was" : "s were"} ruled out</strong></summary>
        <ul class="list small" style="margin-top:var(--s3)">${r.excluded.map((x) => html`<li><a href="/projects/${x.project_id}">${x.title}</a>: ${x.reasons.join(" ")}</li>`)}</ul></details>` : ""}`);
  }
}
