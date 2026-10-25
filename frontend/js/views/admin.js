import { $, $$, HOSTED, confirmDialog, loc, setAnchor, api, ago, causeLabel, date, dialog, emptyState, formData, html, money, mount, num, showErrors, state, toast } from "../core.js";

export default async function admin({ el }) {
  document.title = "Review — ImpactBridge";
  const isAdmin = state.user.role === "admin";
  let section = loc().anchor || "queue";
  const SECTIONS = [["queue", "Projects to review"], ["verifications", "Verification requests"], ["reports", "Reports"], ["signals", "Signals"],
    ...(isAdmin ? [["users", "Users"]] : []), ["audit", "Audit log"], ...(isAdmin && !HOSTED ? [["errors", "App errors"]] : [])];

  async function draw() {
    const ov = await api("/api/admin/overview");
    const c = ov.counts;
    mount(el, html`<div class="wrap">
      <div class="page-head"><h1>Review & moderation</h1>
        <p class="muted">Check each claim on its own merits. You can't decide on anything you submitted, manage or support.</p>
        ${isAdmin && HOSTED ? html`<button class="btn small" id="rm-demo">Remove demo projects</button>` : ""}</div>
      <div class="counts" style="margin-bottom:var(--s4)">
        <div><b>${c.projects_to_review}</b>projects to review</div><div><b>${c.pending_verifications}</b>verification requests</div>
        <div><b>${c.open_reports}</b>open reports</div><div><b>${c.completed_awaiting_verification}</b>completed, awaiting verification</div></div>
      <div class="tabs" role="tablist">${SECTIONS.map(([k, t]) => html`<button role="tab" aria-selected="${section === k}" data-sec="${k}">${t}</button>`)}</div>
      <div id="sec"></div></div>`);
    $$("[data-sec]", el).forEach((b) => b.addEventListener("click", () => { section = b.dataset.sec; setAnchor(section); draw(); }));
    $("#rm-demo", el)?.addEventListener("click", async () => {
      if (!(await confirmDialog("Remove all demo projects and demo organizations? Your real data stays.", { confirmLabel: "Remove demo data", danger: true }))) return;
      try { await api("/api/admin/demo", { method: "DELETE" }); toast("Demo data removed"); } catch (err) { toast(err.message, "bad"); }
    });
    const box = $("#sec", el);
    ({ queue: () => queue(box, ov), verifications: () => verifications(box), reports: () => reports(box), signals: () => signals(box, ov),
      users: () => users(box), audit: () => audit(box), errors: () => appErrors(box) })[section]();
  }

  function queue(box, ov) {
    mount(box, html`${ov.review_queue.length ? ov.review_queue.map((p) => html`<article class="panel">
      <div class="row between"><h3 style="margin:0"><a href="/projects/${p.id}">${p.title}</a></h3><span class="small muted">Submitted ${ago(p.submitted_at)}</span></div>
      <p class="small muted">${causeLabel(p.cause)}, ${p.city || "no city"}. Budget ${money(p.budget_required)}, ${p.volunteers_required ?? "—"} volunteers.${p.organization ? ` Organization: ${p.organization.name} (${p.organization.verification_status}).` : ""}</p>
      <p>${p.problem_excerpt}</p>
      <details><summary class="small">Owner's original description</summary><div class="original">${p.original_description || "—"}</div></details>
      <div class="row" style="margin-top:var(--s3)"><button class="btn small good" data-dec="approved" data-pid="${p.id}">Approve</button>
        <button class="btn small" data-dec="needs_information" data-pid="${p.id}">Ask for information</button>
        <button class="btn small danger" data-dec="rejected" data-pid="${p.id}">Reject</button>
        <a class="btn small ghost" href="/projects/${p.id}">Open full proposal</a></div></article>`)
      : emptyState("No projects waiting", "Submitted projects appear here for review.")}
      ${ov.approved_unpublished.length ? html`<h2 style="margin-top:var(--s5)">Approved, not yet published by owner</h2><ul class="list panel">${ov.approved_unpublished.map((p) => html`<li><a href="/projects/${p.id}">${p.title}</a></li>`)}</ul>` : ""}`);
    $$("[data-dec]", box).forEach((b) => b.addEventListener("click", () => {
      const st = b.dataset.dec;
      dialog(html`<h2>${{ approved: "Approve", needs_information: "Ask for information", rejected: "Reject" }[st]}</h2>
        <form id="df" novalidate><div class="form-error notice bad" hidden></div>
        <div class="field"><label for="dn">Notes for the owner${st === "approved" ? " (optional)" : ""}</label><textarea id="dn" name="notes" rows="4"></textarea></div>
        <div class="row"><button class="btn ink" type="submit">Confirm</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form>`, {
        onMount: (d) => $("#df", d).addEventListener("submit", async (e) => {
          e.preventDefault();
          try { await api(`/api/projects/${b.dataset.pid}/transition`, { method: "POST", body: { status: st, notes: formData(e.target).notes } }); d.close(); toast("Decision saved"); draw(); }
          catch (err) { showErrors(e.target, err); }
        }),
      });
    }));
  }

  async function verifications(box) {
    const { verifications: list } = await api("/api/admin/verifications");
    mount(box, list.length ? html`${list.map((v) => html`<article class="panel">
      <div class="row between"><h3 style="margin:0">${v.kind_label}</h3><span class="small muted">Requested by ${v.requested_by_name}, ${ago(v.created_at)}</span></div>
      ${v.subject_type === "organization" ? html`<p><a href="/organizations/${v.subject?.id}">${v.subject?.name}</a> (${v.subject?.org_type})<br>
          <span class="small">Registration: ${v.subject?.registration_number || "not given"}. Contact: ${v.subject?.contact_email || "—"}. Website: ${v.subject?.website || "—"}</span></p>`
        : html`<p><a href="/projects/${v.subject?.id}">${v.subject?.title}</a><br><span class="small muted">${v.subject?.city}. Budget ${money(v.subject?.budget_required)}</span></p>`}
      ${v.notes ? html`<p class="small"><strong>Requester notes:</strong> ${v.notes}</p>` : ""}
      ${v.files.length ? html`<p class="row">${v.files.map((f) => html`<a class="btn small" href="${f.url}" target="_blank" rel="noopener">${f.name || "Document"}</a>`)}</p>` : ""}
      ${v.impact_report ? html`<div class="notice"><p><strong>Reported:</strong> ${num(v.impact_report.people_reached)} people reached, ${num(v.impact_report.volunteers_involved)} volunteers, ${num(v.impact_report.volunteer_hours)} hours, ${money(v.impact_report.funds_spent)} spent.</p><p class="small">${v.impact_report.summary}</p></div>` : ""}
      <div class="row"><button class="btn small good" data-v="${v.id}" data-d="approve">Approve</button><button class="btn small danger" data-v="${v.id}" data-d="reject">Reject</button></div>
    </article>`)}` : emptyState("No pending requests", "Organization, need, budget and completion verification requests appear here."));
    $$("[data-v]", box).forEach((b) => b.addEventListener("click", () => decide(list.find((x) => x.id === b.dataset.v), b.dataset.d)));
  }

  function decide(v, decision) {
    const completion = v.kind === "project_completion" && decision === "approve";
    dialog(html`<h2>${decision === "approve" ? "Approve" : "Reject"}: ${v.kind_label}</h2>
      <form id="vf" novalidate><div class="form-error notice bad" hidden></div>
      <div class="field"><label for="vn">How did you check this? (required)</label><textarea id="vn" name="notes" rows="3" placeholder="e.g. Called the headmaster on 12 Oct; visited site; checked receipts"></textarea></div>
      ${completion ? html`<p class="small muted">Enter only the figures you independently confirmed. Leave a field empty if you couldn't check it — it will show as "not checked", never as the reported value.</p>
        <div class="form-grid">
          <div class="field"><label for="a1">People reached (verified)</label><input id="a1" name="verified_people_reached" type="number" min="0"></div>
          <div class="field"><label for="a2">Volunteers (verified)</label><input id="a2" name="verified_volunteers_involved" type="number" min="0"></div>
          <div class="field"><label for="a3">Volunteer hours (verified)</label><input id="a3" name="verified_volunteer_hours" type="number" min="0"></div>
          <div class="field"><label for="a4">Funds spent (verified)</label><input id="a4" name="verified_funds_spent" type="number" min="0"></div>
          ${(v.outcomes || []).map((o) => html`<div class="field full"><label for="o-${o.id}">${o.metric} (verified; reported ${o.reported_value ?? "—"})</label><input id="o-${o.id}" data-outcome="${o.id}" type="number" min="0" step="any"></div>`)}
        </div>` : ""}
      <div class="row"><button class="btn ink" type="submit">Confirm decision</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form>`, {
      onMount: (d) => $("#vf", d).addEventListener("submit", async (e) => {
        e.preventDefault();
        const body = { decision, ...formData(e.target) };
        const outs = {};
        $$("[data-outcome]", d).forEach((i) => { if (i.value !== "") outs[i.dataset.outcome] = Number(i.value); });
        if (Object.keys(outs).length) body.verified_outcomes = outs;
        try { await api(`/api/admin/verifications/${v.id}/decide`, { method: "POST", body }); d.close(); toast("Decision recorded"); draw(); }
        catch (err) { showErrors(e.target, err); }
      }),
    });
  }

  async function reports(box) {
    const { reports: list } = await api("/api/admin/reports");
    mount(box, list.length ? html`${list.map((r) => html`<article class="panel">
      <div class="row between"><h3 style="margin:0">${r.reason === "safeguarding" ? "⚠ " : ""}${r.reason_label}</h3><span class="small muted">${ago(r.created_at)} by ${r.reporter_name}</span></div>
      <p>About ${r.subject_type}: ${r.subject_type === "project" ? html`<a href="/projects/${r.subject_id}">${r.subject_title}</a>` : r.subject_type === "organization" ? html`<a href="/organizations/${r.subject_id}">${r.subject_title}</a>` : r.subject_title}</p>
      ${r.details ? html`<p class="small">${r.details}</p>` : ""}<p class="small muted">Status: ${r.status}</p>
      <div class="row"><button class="btn small" data-r="${r.id}">Resolve</button></div></article>`)}`
      : emptyState("No open reports", "Reports from users about projects, organizations or updates appear here."));
    $$("[data-r]", box).forEach((b) => b.addEventListener("click", () => {
      const r = list.find((x) => x.id === b.dataset.r);
      dialog(html`<h2>Resolve report</h2><form id="rf" novalidate><div class="form-error notice bad" hidden></div>
        <div class="field"><label for="rs">Outcome</label><select id="rs" name="status"><option value="resolved">Resolved</option><option value="dismissed">Dismissed (no issue found)</option><option value="reviewing">Still reviewing</option></select></div>
        <div class="field"><label for="rr">What was done</label><textarea id="rr" name="resolution" rows="3"></textarea><span class="hint">The reporter is told the outcome.</span></div>
        ${isAdmin ? html`<label class="check"><input type="checkbox" name="hide_subject"><span>${{ project: "Hide this project from the public", update: "Hide this update", user: "Suspend this user", organization: "Mark the organization as not verified" }[r.subject_type]}</span></label>` : ""}
        <div class="row"><button class="btn ink" type="submit">Save</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form>`, {
        onMount: (d) => $("#rf", d).addEventListener("submit", async (e) => {
          e.preventDefault();
          try { await api(`/api/admin/reports/${r.id}`, { method: "POST", body: formData(e.target) }); d.close(); toast("Report updated"); draw(); }
          catch (err) { showErrors(e.target, err); }
        }),
      });
    }));
  }

  function signals(box, ov) {
    mount(box, html`<p class="muted">Automatic checks that suggest a closer look. They are not accusations and never act on their own.</p>
      ${ov.signals.length ? html`<ul class="list panel">${ov.signals.map((s) => html`<li><a href="/projects/${s.project.id}"><strong>${s.project.title}</strong></a>
        <ul class="small">${s.signals.map((x) => html`<li>${x}</li>`)}</ul></li>`)}</ul>` : emptyState("No signals", "Nothing unusual detected right now.")}`);
  }

  async function users(box) {
    const drawUsers = async (q = "") => {
      const { users: list, roles } = await api("/api/admin/users", { query: { q } });
      mount(box, html`<form id="uq" class="searchbar" role="search"><label class="sr-only" for="uqi">Search users</label><input id="uqi" type="search" placeholder="Search name or email" value="${q}"><button class="btn" type="submit">Search</button></form>
        <div class="table-scroll panel tight"><table class="ledger"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead>
        <tbody>${list.map((u) => html`<tr><td>${u.name}${u.is_demo ? html` <span class="badge demo">Demo</span>` : ""}</td><td>${u.email}</td>
          <td><label class="sr-only" for="role-${u.id}">Role</label><select id="role-${u.id}" data-role="${u.id}" ${u.id === state.user.id ? "disabled" : ""}>${Object.entries(roles).map(([k, t]) => html`<option value="${k}" ${u.role === k ? "selected" : ""}>${t}</option>`)}</select></td>
          <td>${u.id === state.user.id ? "You" : html`<button class="btn small ${u.is_suspended ? "" : "danger"}" data-susp="${u.id}" data-val="${u.is_suspended ? "0" : "1"}">${u.is_suspended ? "Reinstate" : "Suspend"}</button>`}</td>
          <td class="small">${date(u.created_at)}</td></tr>`)}</tbody></table></div>`);
      $("#uq", box).addEventListener("submit", (e) => { e.preventDefault(); drawUsers($("#uqi", box).value); });
      $$("[data-role]", box).forEach((s) => s.addEventListener("change", async () => {
        if (!(await confirmDialog(`Change this user's role to ${roles[s.value]}?`, { confirmLabel: "Change role" }))) { drawUsers(q); return; }
        try { await api(`/api/admin/users/${s.dataset.role}`, { method: "PATCH", body: { role: s.value } }); toast("Role updated"); } catch (err) { toast(err.message, "bad"); }
      }));
      $$("[data-susp]", box).forEach((b) => b.addEventListener("click", async () => {
        try { await api(`/api/admin/users/${b.dataset.susp}`, { method: "PATCH", body: { is_suspended: b.dataset.val === "1" } }); toast("Updated"); drawUsers(q); } catch (err) { toast(err.message, "bad"); }
      }));
    };
    await drawUsers();
  }

  async function audit(box) {
    const { entries } = await api("/api/admin/audit");
    mount(box, html`<div class="table-scroll panel tight"><table class="ledger"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Subject</th></tr></thead>
      <tbody>${entries.map((x) => html`<tr><td class="small">${ago(x.created_at)}</td><td>${x.actor_name || "system"}</td><td>${x.action}</td>
        <td class="small">${x.subject_type === "project" ? html`<a href="/projects/${x.subject_id}">project</a>` : x.subject_type}</td></tr>`)}</tbody></table></div>`);
  }

  async function appErrors(box) {
    const { errors } = await api("/api/admin/client-errors");
    mount(box, errors.length ? html`<p class="small muted">Crashes reported by the app, grouped. They contain no personal data: the message, file and screen only.</p>
      <div class="table-scroll panel tight"><table class="ledger"><thead><tr><th>Error</th><th>Where</th><th>Times</th><th>Last seen</th></tr></thead>
      <tbody>${errors.map((x) => html`<tr><td translate="no">${x.message}</td><td class="small" translate="no">${x.source || ""} ${x.path || ""}</td><td>${x.count}</td><td class="small">${ago(x.last_seen)}</td></tr>`)}</tbody></table></div>`
      : emptyState("No app errors reported", "Crashes in the app are reported here automatically."));
  }

  await draw();
}
