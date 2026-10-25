import { $, HOSTED, api, busy, confirmDialog, dialog, date, formData, html, mount, showErrors, state, toast, uploadFile } from "../core.js";
import { projectTile } from "../components.js";
import { refreshUser } from "../app.js";

const VS = { verified: ["✓ Verified organization", "verified"], pending: ["Verification pending", "info"], rejected: ["Not verified", "bad"], unverified: ["Not yet verified", ""] };

export default async function orgView({ el, params }) {
  const load = async () => {
    const { organization: o } = await api(`/api/organizations/${params.id}`);
    document.title = `${o.name} — ImpactBridge`;
    const admin = ["owner", "admin"].includes(o.my_role);
    const members = admin && HOSTED ? (await api("/api/members").catch(() => ({ members: [] }))).members : [];
    const [vl, vc] = VS[o.verification_status] || VS.unverified;
    mount(el, html`<div class="wrap">
      <div class="page-head"><div class="row">${o.is_demo ? html`<span class="badge demo">Demo data</span>` : ""}<span class="badge ${vc}">${vl}</span></div>
        <h1 style="margin-top:var(--s3)">${o.name}</h1>
        <p class="muted">${o.org_type_label}${o.city ? ` in ${[o.city, o.region].filter(Boolean).join(", ")}` : ""}${o.verified_at ? `. Verified ${date(o.verified_at)}.` : "."}
          ${o.website ? html` <a href="${o.website}" target="_blank" rel="noopener nofollow">Website</a>` : ""}</p>
        ${o.description ? html`<p class="prose">${o.description}</p>` : ""}</div>
      ${admin ? html`<div class="split" style="margin-bottom:var(--s6)"><div>
        <form id="ef" class="panel" novalidate><h2>Organization details</h2><div class="form-error notice bad" hidden></div>
          ${o.verification_status === "verified" ? html`<p class="notice warn small">Changing the name or registration number removes the verified badge until it's checked again.</p>` : ""}
          <div class="form-grid">
            <div class="field full"><label for="n">Name</label><input id="n" name="name" value="${o.name}"></div>
            <div class="field"><label for="reg">Registration number (private)</label><input id="reg" name="registration_number" value="${o.registration_number || ""}"></div>
            <div class="field"><label for="ce">Contact email (private)</label><input id="ce" name="contact_email" type="email" value="${o.contact_email || ""}"></div>
            <div class="field"><label for="c">City</label><input id="c" name="city" value="${o.city || ""}"></div>
            <div class="field"><label for="w">Website</label><input id="w" name="website" value="${o.website || ""}"></div>
            <div class="field full"><label for="d">Description</label><textarea id="d" name="description" rows="3">${o.description || ""}</textarea></div>
          </div><button class="btn ink" type="submit">Save</button></form>
        <section class="panel"><h2>Members</h2><ul class="list">${o.members.map((m) => html`<li class="row between"><span>${m.name} <span class="small muted">${m.email ? m.email + ", " : ""}${m.member_role}</span></span>
          ${m.member_role !== "owner" ? html`<button class="btn small danger" data-rm="${m.id}">Remove</button>` : ""}</li>`)}</ul>
          <form id="mf" class="row" novalidate style="margin-top:var(--s3)"><div class="form-error notice bad" hidden style="width:100%"></div>
            ${HOSTED ? html`<div class="field" style="flex:1;margin:0"><label for="me">Add a member</label><select id="me" name="user_id"><option value="">Choose someone with an ImpactBridge profile</option>
              ${(members || []).filter((m) => !o.members.some((x) => x.id === m.id)).map((m) => html`<option value="${m.id}">${m.name}</option>`)}</select></div>`
            : html`<div class="field" style="flex:1;margin:0"><label for="me">Add a member by email</label><input id="me" name="email" type="email" placeholder="They need an ImpactBridge account"></div>`}
            <div class="field" style="margin:0"><label for="mr">Role</label><select id="mr" name="member_role"><option value="member">Member</option><option value="admin">Admin</option></select></div>
            <button class="btn" type="submit" style="align-self:flex-end">Add</button></form></section>
        </div><aside>
        ${["unverified", "rejected"].includes(o.verification_status) ? html`<form id="vf" class="panel" novalidate><h2>Get verified</h2>
          <p class="small muted">Upload a registration certificate (trust deed, society or Section 8 registration, or a club charter/letter from the district). Only reviewers see it.</p>
          <div class="form-error notice bad" hidden></div>
          <div class="field"><label for="vfile">Document</label><input id="vfile" type="file" accept="application/pdf,image/*"></div>
          <div class="field"><label for="vn">Notes</label><textarea id="vn" name="notes" rows="2"></textarea></div>
          <button class="btn primary" type="submit">Request verification</button></form>`
          : o.verification_status === "pending" ? html`<p class="notice">Verification requested. Reviewers will be in touch.</p>` : ""}
        ${o.verifications?.length ? html`<div class="panel"><h3>Verification history</h3><ul class="list small">${o.verifications.map((v) => html`<li>${v.status} on ${date(v.reviewed_at || v.created_at)}${v.reviewer_notes ? `: ${v.reviewer_notes}` : ""}</li>`)}</ul></div>` : ""}
        </aside></div>` : ""}
      <h2>Projects posted</h2>
      ${o.projects.length ? html`<div class="tiles">${o.projects.map(projectTile)}</div>` : html`<p class="muted">No public projects yet.</p>`}
      <h2 style="margin-top:var(--s6)">Projects supported</h2>
      ${o.supported_projects.length ? html`<div class="tiles">${o.supported_projects.map(projectTile)}</div>` : html`<p class="muted">No accepted commitments yet.</p>`}
      ${state.user && !o.my_role ? html`<p style="margin-top:var(--s6)"><button class="btn small ghost" id="rep">Report a concern about this organization</button></p>` : ""}
    </div>`);

    $("#ef", el)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await api(`/api/organizations/${o.id}`, { method: "PATCH", body: formData(e.target) }); toast("Saved"); refreshUser(); load(); }
      catch (err) { showErrors(e.target, err); }
    });
    $("#mf", el)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await api(`/api/organizations/${o.id}/members`, { method: "POST", body: formData(e.target) }); toast("Member added"); load(); }
      catch (err) { showErrors(e.target, err); }
    });
    el.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmDialog("Remove this member from the organization?", { confirmLabel: "Remove", danger: true }))) return;
      try { await api(`/api/organizations/${o.id}/members/${b.dataset.rm}`, { method: "DELETE" }); load(); } catch (err) { toast(err.message, "bad"); }
    }));
    $("#vf", el)?.addEventListener("submit", async (e) => {
      e.preventDefault(); const btn = e.submitter; busy(btn);
      try {
        const ids = [];
        const file = $("#vfile", el).files[0];
        if (file) ids.push((await uploadFile(file, { purpose: "verification", visibility: "reviewers", org_id: o.id })).id);
        await api("/api/verifications", { method: "POST", body: { kind: "organization_identity", subject_id: o.id, notes: $("#vn", el).value, file_ids: ids } });
        toast("Verification requested"); refreshUser(); load();
      } catch (err) { showErrors(e.target, err); busy(btn, false); }
    });
    $("#rep", el)?.addEventListener("click", async () => {
      dialog(html`<h2>Report a concern</h2><p class="muted">Reports go to ImpactBridge reviewers.</p>
        <form id="rf" novalidate><div class="form-error notice bad" hidden></div>
        <div class="field"><label for="rd">What's the concern?</label><textarea id="rd" name="details" rows="4"></textarea></div>
        <div class="row"><button class="btn ink" type="submit">Send report</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form>`, {
        onMount: (d) => d.querySelector("#rf").addEventListener("submit", async (e) => {
          e.preventDefault();
          try { await api("/api/reports", { method: "POST", body: { subject_type: "organization", subject_id: o.id, reason: "suspicious", details: d.querySelector("#rd").value } }); d.close(); toast("Report sent to reviewers"); }
          catch (err) { showErrors(e.target, err); }
        }),
      });
    });
  };
  await load();
}
