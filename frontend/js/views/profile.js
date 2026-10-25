import { $, HOSTED, api, busy, confirmDialog, formData, html, mount, setUser, showErrors, state, toast } from "../core.js";
import { go, refreshUser } from "../app.js";
import { LANGS, disablePush, enablePush, getLang, getTheme, pushState, pushSupported, setTheme } from "../prefs.js";
import { setLanguage } from "../i18n.js";

export default async function profile({ el }) {
  document.title = "Profile — ImpactBridge";
  const draw = () => {
    const u = state.user;
    mount(el, html`<div class="wrap" style="max-width:860px">
      <div class="page-head"><h1>Profile</h1><p class="muted">${HOSTED ? html`Signed in with your Claude account as ${u.role_label}.` : html`Signed in as ${u.email || u.phone} (${u.role_label}).`} Your phone number is never shown publicly.</p></div>
      ${!HOSTED && u.needs_verification ? html`<div class="notice warn row between" id="verify-box"><span><strong>Confirm your email.</strong> We sent a link to ${u.email}. You need it to share needs or offer support.</span>
        <button class="btn small" type="button" id="resend">Resend link</button></div>` : ""}
      <section class="panel" id="settings"><h2>App settings</h2>
        <div class="form-grid">
          <div class="field"><label for="lang">Language</label><select id="lang">${LANGS.map(([k, t]) => html`<option value="${k}" ${getLang() === k ? "selected" : ""}>${t}</option>`)}</select></div>
          <div class="field"><label for="theme">Appearance</label><select id="theme">
            ${[["system", "Match my phone"], ["light", "Light"], ["dark", "Dark"]].map(([k, t]) => html`<option value="${k}" ${getTheme() === k ? "selected" : ""}>${t}</option>`)}</select></div>
        </div>
        ${pushSupported() ? html`<div class="row between" style="margin-top:var(--s3)"><span><strong>Notifications on this device</strong><br><span class="small muted" id="push-state">Checking…</span></span>
          <button class="btn small" type="button" id="push-btn" hidden></button></div>` : ""}
        <nav class="set-links" aria-label="Help and information"><a href="/help">Help & support</a><a href="/how-it-works">How it works</a><a href="/guidelines">Community guidelines</a><a href="/privacy">Privacy policy</a></nav>
      </section>
      ${HOSTED && u.is_owner ? html`<form id="rolef" class="panel"><h2>Try another role</h2>
        <p class="small muted">As the owner of this preview you can switch roles to walk through every journey yourself: share a need as a community group, support it as a club, then review it as an administrator.</p>
        <div class="row"><label class="sr-only" for="rolesel">Role</label><select id="rolesel" name="role" style="max-width:360px">
          ${Object.entries({ submitter: "Community group / need submitter", club: "Rotary or Rotaract club", csr: "Corporate CSR team", ngo: "NGO", volunteer: "Individual volunteer", verifier: "Project verifier", admin: "Administrator" }).map(([k, t]) => html`<option value="${k}" ${u.role === k ? "selected" : ""}>${t}</option>`)}</select>
        <button class="btn ink" type="submit">Switch role</button></div>
        <p class="small muted" style="margin:8px 0 0">Normally nobody may review their own project. In this preview the owner is allowed to, so you can test alone; each such decision is recorded in the history as an owner self-review.</p></form>` : ""}
      <form id="pf" class="panel" novalidate><h2>Your details</h2><div class="form-error notice bad" hidden></div>
        <div class="form-grid">
          <div class="field"><label for="n">Name</label><input id="n" name="name" value="${u.name}"></div>
          <div class="field"><label for="ph">Mobile number (private)</label><input id="ph" name="phone" type="tel" inputmode="tel" value="${u.phone || ""}" ${!HOSTED && u.phone_verified && !u.has_password ? "readonly" : ""}>
            ${HOSTED ? "" : u.phone && u.phone_verified ? html`<span class="hint">✓ Verified${u.has_password ? "" : ". You sign in with this number."}</span>`
              : html`<span class="hint"><button type="button" class="linklike" id="verify-phone">Verify this number</button> to sign in with a code.</span>`}</div>
          <div class="field"><label for="c">City</label><input id="c" name="city" value="${u.city || ""}"></div>
          <div class="field"><label for="r">State / region</label><input id="r" name="region" value="${u.region || ""}"></div>
          <div class="field full"><label for="sk">Skills you can offer</label><input id="sk" name="skills" value="${(u.skills || []).join(", ")}"><span class="hint">Separate with commas.</span></div>
          <div class="field full"><label for="b">About you</label><textarea id="b" name="bio" rows="3">${u.bio || ""}</textarea></div>
        </div>
        ${HOSTED ? "" : html`<label class="check"><input type="checkbox" name="email_notifications" ${u.email_notifications ? "checked" : ""}><span>Also send important notifications by email${state.meta.integrations?.email?.configured ? "" : " (email isn't configured on this server yet)"}</span></label>`}
        <button class="btn ink" type="submit">Save profile</button></form>

      <section class="panel" id="orgs"><h2>Organizations</h2>
        ${u.organizations.length ? html`<ul class="list">${u.organizations.map((o) => html`<li class="row between"><span><a href="/organizations/${o.id}">${o.name}</a> <span class="small muted">(${o.member_role})</span></span>
          <span class="badge ${o.verification_status === "verified" ? "verified" : ""}">${{ verified: "✓ Verified", pending: "Verification pending", rejected: "Not verified", unverified: "Unverified" }[o.verification_status]}</span></li>`)}</ul>`
          : html`<p class="muted">You're not part of an organization yet. Ask an organization owner to add you by email, or create one.</p>`}
        <details style="margin-top:var(--s4)"><summary><strong>Create an organization</strong></summary>
          <form id="of" novalidate style="margin-top:var(--s3)"><div class="form-error notice bad" hidden></div><div class="form-grid">
            <div class="field full"><label for="on">Name</label><input id="on" name="name"></div>
            <div class="field"><label for="ot">Type</label><select id="ot" name="org_type">${Object.entries(state.meta.org_types).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div>
            <div class="field"><label for="oreg">Registration number (private)</label><input id="oreg" name="registration_number"></div>
            <div class="field"><label for="oc">City</label><input id="oc" name="city" value="${u.city || ""}"></div>
            <div class="field"><label for="ow">Website</label><input id="ow" name="website"></div>
            <div class="field full"><label for="od">Description</label><textarea id="od" name="description" rows="3"></textarea></div>
          </div><button class="btn ink" type="submit">Create organization</button></form></details>
      </section>

      ${HOSTED ? "" : html`<section class="panel" id="blocked"><h2>Blocked people</h2><div id="blocked-list"><p class="muted small">Loading…</p></div>
        <p class="small muted">People you block can't send offers to your projects, and you won't see their projects or updates.</p></section>`}

      ${HOSTED || !u.has_password ? "" : html`<form id="pw" class="panel" novalidate><h2>Change password</h2><div class="form-error notice bad" hidden></div>
        <div class="form-grid"><div class="field"><label for="cp">Current password</label><input id="cp" name="current_password" type="password" autocomplete="current-password"></div>
        <div class="field"><label for="np">New password</label><input id="np" name="new_password" type="password" autocomplete="new-password"></div></div>
        <button class="btn" type="submit">Change password</button></form>`}


    </div>`);

    $("#pf", el).addEventListener("submit", async (e) => {
      e.preventDefault(); const d = formData(e.target); const btn = e.submitter; busy(btn);
      d.skills = (d.skills || "").split(",").map((x) => x.trim()).filter(Boolean);
      try { await api("/api/auth/me", { method: "PATCH", body: d }); await refreshUser(); toast("Profile saved"); draw(); }
      catch (err) { showErrors(e.target, err); busy(btn, false); }
    });
    $("#of", el).addEventListener("submit", async (e) => {
      e.preventDefault();
      try { const r = await api("/api/organizations", { method: "POST", body: formData(e.target) }); await refreshUser(); toast(`${r.organization.name} created`); draw(); }
      catch (err) { showErrors(e.target, err); }
    });
    $("#rolef", el)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await api("/api/auth/me", { method: "PATCH", body: { role: $("#rolesel", el).value } }); await refreshUser(); toast("Role switched"); draw(); }
      catch (err) { toast(err.message, "bad"); }
    });
    $("#pw", el)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await api("/api/auth/password", { method: "POST", body: formData(e.target) }); e.target.reset(); toast("Password changed"); }
      catch (err) { showErrors(e.target, err); }
    });

    $("#lang", el).addEventListener("change", async (e) => {
      const l = e.target.value;
      await setLanguage(l);
      if (!HOSTED) api("/api/auth/me", { method: "PATCH", body: { language: l } }).catch(() => {});
    });
    $("#theme", el).addEventListener("change", (e) => setTheme(e.target.value));
    $("#resend", el)?.addEventListener("click", async (e) => {
      busy(e.target);
      try { const r = await api("/api/auth/resend-verification", { method: "POST" }); toast(r.sent ? "Link sent. Check your inbox." : "Email isn't set up on this server yet."); }
      catch (err) { toast(err.message, "bad"); } finally { busy(e.target, false); }
    });
    $("#verify-phone", el)?.addEventListener("click", () => verifyPhoneDialog($("#ph", el).value));
    const pb = $("#push-btn", el);
    if (pb) {
      const sync = async () => {
        const st = await pushState();
        const label = { on: "On: you'll get alerts for offers, reviews and updates.", off: "Off", denied: "Blocked in your phone's settings", unsupported: "Not supported on this device" }[st];
        $("#push-state", el).textContent = label;
        pb.hidden = !["on", "off"].includes(st) || !state.meta?.integrations?.push?.configured;
        pb.textContent = st === "on" ? "Turn off" : "Turn on";
        pb.dataset.state = st;
        if (!state.meta?.integrations?.push?.configured && st !== "on") $("#push-state", el).textContent = "Not set up on this server yet";
      };
      pb.addEventListener("click", async () => {
        busy(pb);
        try { if (pb.dataset.state === "on") await disablePush(); else { await enablePush(); toast("Notifications turned on"); } }
        catch (err) { toast(err.message, "bad"); } finally { busy(pb, false); sync(); }
      });
      sync();
    }
    const bl = $("#blocked-list", el);
    if (bl) {
      const loadBlocks = async () => {
        const r = await api("/api/blocks").catch(() => ({ blocked: [] }));
        mount(bl, r.blocked.length ? html`<ul class="list">${r.blocked.map((b) => html`<li class="row between"><span>${b.name}</span>
            <button class="btn small" type="button" data-unblock="${b.id}">Unblock</button></li>`)}</ul>` : html`<p class="muted">You haven't blocked anyone.</p>`);
      };
      bl.addEventListener("click", async (e) => {
        const id = e.target.closest("[data-unblock]")?.dataset.unblock;
        if (!id) return;
        await api(`/api/users/${id}/block`, { method: "DELETE" }); toast("Unblocked"); loadBlocks();
      });
      loadBlocks();
    }
  };
  await refreshUser();
  draw();
}

async function verifyPhoneDialog(phone) {
  const { dialog } = await import("../core.js");
  dialog(html`<h2>Verify your mobile number</h2><form id="vp" novalidate><div class="form-error notice bad" hidden></div>
      <div class="field"><label for="vphone">Mobile number</label><input id="vphone" name="phone" type="tel" inputmode="tel" value="${phone || ""}" required></div>
      <div class="field" id="vcode-f" hidden><label for="vcode">6-digit code</label><input id="vcode" name="code" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
      <p class="notice" id="vdev" hidden></p>
      <div class="row"><button class="btn ink" type="submit" id="vgo">Send code</button><button class="btn" type="button" data-close>Cancel</button></div></form>`, {
    onMount(d) {
      const f = d.querySelector("#vp"); let sent = null;
      f.addEventListener("submit", async (e) => {
        e.preventDefault(); const btn = d.querySelector("#vgo"); busy(btn);
        const v = formData(f);
        try {
          if (!sent) {
            const r = await api("/api/auth/otp/start", { method: "POST", body: { phone: v.phone, purpose: "verify" } });
            sent = r.phone; d.querySelector("#vcode-f").hidden = false; btn.textContent = "Verify";
            if (r.dev_code) { const p = d.querySelector("#vdev"); p.hidden = false; p.textContent = `Test mode: no SMS service is set up, so here is the code: ${r.dev_code}`; }
            d.querySelector("#vcode").focus();
          } else {
            await api("/api/auth/otp/verify", { method: "POST", body: { phone: sent, code: v.code, purpose: "verify" } });
            d.close(); toast("Number verified"); await refreshUser(); go("/profile", true);
          }
        } catch (err) { showErrors(f, err); } finally { busy(btn, false); }
      });
    },
  });
}
