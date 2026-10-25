import { $, HOSTED, api, busy, formData, html, mount, navigate, raw, setUser, showErrors, state, toast } from "../core.js";

const ROLES = [
  ["submitter", "Community group or need submitter", "You want to share a problem in your area and find help."],
  ["club", "Rotary or Rotaract club", "Your club wants to find and support local projects."],
  ["csr", "Corporate CSR team", "Your company has budget, employee volunteers or equipment to give."],
  ["ngo", "NGO", "You run programmes and may post needs or support others."],
  ["volunteer", "Individual volunteer", "You want to give your time or a professional skill."],
];
const ORG_TYPES = {
  club: [["rotary", "Rotary club"], ["rotaract", "Rotaract club"]],
  csr: [["csr", "Corporate CSR team"], ["company", "Company"]],
  ngo: [["ngo", "NGO"]],
  submitter: [["community", "Community organization"], ["ngo", "NGO"], ["other", "Other group"]],
};

export default async function auth({ el, opts, query }) {
  const next = query.next && query.next.startsWith("/") && !query.next.startsWith("//") ? query.next : "/";
  if (opts.page === "verify") return verifyEmail(el, query);
  if (HOSTED) return onboarding(el, next);
  if (opts.page === "login") return login(el, next, query.method === "phone" ? "phone" : "email");
  if (opts.page === "forgot") return forgot(el);
  if (opts.page === "reset") return resetPassword(el, query);
  return register(el, next);
}

const TERMS = html`I agree to the <a href="/terms" target="_blank" rel="noopener">terms of use</a>, <a href="/guidelines" target="_blank" rel="noopener">community guidelines</a> and <a href="/privacy" target="_blank" rel="noopener">privacy policy</a>.`;
const qs = (next) => (next !== "/" ? `?next=${encodeURIComponent(next)}` : "");

function signedIn(user, next, msg) {
  setUser(user);
  toast(msg || `Welcome, ${user.name.split(" ")[0]}`);
  navigate(next);
}

function login(el, next, method) {
  document.title = "Sign in — ImpactBridge";
  mount(el, html`<div class="wrap"><div class="auth-card panel">
    <h1>Sign in</h1>
    <div class="seg" role="tablist" aria-label="Sign-in method">
      <button type="button" role="tab" data-m="phone" aria-selected="${method === "phone"}">Mobile number</button>
      <button type="button" role="tab" data-m="email" aria-selected="${method === "email"}">Email</button>
    </div>
    <div id="pane"></div>
    <p class="muted" style="margin-top:var(--s4)">New to ImpactBridge? <a href="/register${qs(next)}">Create an account</a></p>
  </div></div>`);
  const pane = $("#pane", el);
  const show = (m) => {
    el.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.m === m)));
    if (m === "phone") phoneFlow(pane, next); else emailLogin(pane, next);
  };
  el.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => show(b.dataset.m)));
  show(method);
}

function emailLogin(pane, next) {
  mount(pane, html`<form id="f" novalidate>
      <div class="form-error notice bad" hidden></div>
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
      <p class="small" style="margin:-4px 0 var(--s3)"><a href="/forgot-password">Forgot password?</a></p>
      <button class="btn ink" type="submit" style="width:100%">Sign in</button>
    </form>`);
  const f = $("#f", pane);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button[type=submit]");
    busy(btn);
    try {
      const r = await api("/api/auth/login", { method: "POST", body: formData(f) });
      signedIn(r.user, next, `Welcome back, ${r.user.name.split(" ")[0]}`);
    } catch (err) { showErrors(f, err); } finally { busy(btn, false); }
  });
}

/** Phone sign-in: number -> 6-digit code -> signed in, or a short sign-up form for new numbers. */
function phoneFlow(pane, next) {
  mount(pane, html`<form id="pf" novalidate>
      <div class="form-error notice bad" hidden></div>
      <div class="field"><label for="phone">Mobile number</label>
        <div class="phone-input"><span>+91</span><input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="98765 43210" required></div>
        <span class="hint">We'll text you a 6-digit code. Standard SMS rates may apply.</span></div>
      <button class="btn ink" type="submit" style="width:100%">Send code</button>
    </form>`);
  const f = $("#pf", pane);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button[type=submit]"); busy(btn);
    const phone = formData(f).phone;
    try {
      const r = await api("/api/auth/otp/start", { method: "POST", body: { phone, purpose: "login" } });
      codeStep(pane, next, r.phone, r.dev_code);
    } catch (err) { showErrors(f, err); busy(btn, false); }
  });
}

function codeStep(pane, next, phone, devCode) {
  mount(pane, html`<form id="cf" novalidate>
      <div class="form-error notice bad" hidden></div>
      <p>Enter the code we sent to <strong>${phone}</strong>.</p>
      ${devCode ? html`<p class="notice">Test mode: no SMS service is set up, so here is the code: <strong>${devCode}</strong></p>` : ""}
      <div class="field"><label for="code">6-digit code</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" class="otp" required></div>
      <button class="btn ink" type="submit" style="width:100%">Continue</button>
      <p class="small" style="margin-top:var(--s3)"><button type="button" class="linklike" id="again">Use a different number</button></p>
    </form>`);
  const f = $("#cf", pane);
  $("#code", pane).focus();
  $("#again", pane).addEventListener("click", () => phoneFlow(pane, next));
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button[type=submit]"); busy(btn);
    try {
      const r = await api("/api/auth/otp/verify", { method: "POST", body: { phone, code: formData(f).code, purpose: "login" } });
      if (r.needs_signup) return phoneSignup(pane, next, r.ticket, phone);
      signedIn(r.user, next, `Welcome back, ${r.user.name.split(" ")[0]}`);
    } catch (err) { showErrors(f, err); busy(btn, false); }
  });
}

function profileFields(withOrgToggle = true) {
  return html`<fieldset><legend>I am joining as</legend><div class="role-options">
        ${ROLES.map(([v, t, d], i) => html`<label><input type="radio" name="role" value="${v}" ${i === 0 ? "checked" : ""}>
          <span><strong>${t}</strong><br><span class="small muted">${d}</span></span></label>`)}
      </div></fieldset>
      <div class="form-grid">
        <div class="field full"><label for="name">Your name</label><input id="name" name="name" autocomplete="name" required></div>
        __CREDENTIALS__
        <div class="field"><label for="city">City or town</label><input id="city" name="city" autocomplete="address-level2"></div>
        <div class="field"><label for="region">State / region</label><input id="region" name="region" autocomplete="address-level1"></div>
      </div>
      <fieldset id="orgset"><legend>Your organization</legend>
        <label class="check" id="org-optional"><input type="checkbox" id="has-org" checked><span>I'm registering on behalf of an organization or group</span></label>
        <div id="orgfields" class="form-grid">
          <div class="field full"><label for="org-name">Organization name</label><input id="org-name" name="organization.name"></div>
          <div class="field"><label for="org-type">Type</label><select id="org-type" name="organization.org_type"></select></div>
          <div class="field"><label for="org-reg">Registration number (optional)</label><input id="org-reg" name="organization.registration_number">
            <span class="hint">Only reviewers and your members see this.</span></div>
        </div>
      </fieldset>
      <label class="check"><input type="checkbox" name="accept_terms"><span>${TERMS}</span></label>`;
}

function wireOrg(f, el) {
  const syncOrg = () => {
    const role = f.querySelector("input[name=role]:checked").value;
    const set = $("#orgset", el);
    set.hidden = role === "volunteer";
    const types = ORG_TYPES[role] || [];
    mount($("#org-type", el), html`${types.map(([v, t]) => html`<option value="${v}">${t}</option>`)}`);
    $("#org-optional", el).hidden = role !== "submitter";
    if (role !== "submitter") $("#has-org", el).checked = true;
    $("#orgfields", el).hidden = !$("#has-org", el).checked;
  };
  f.addEventListener("change", (e) => { if (e.target.name === "role" || e.target.id === "has-org") syncOrg(); });
  syncOrg();
}

function bodyFrom(f, el, extra) {
  const d = formData(f);
  const body = { name: d.name, role: d.role, city: d.city, region: d.region, accept_terms: d.accept_terms, ...extra(d) };
  if (!$("#orgset", el).hidden && $("#has-org", el).checked) {
    body.organization = { name: d["organization.name"], org_type: d["organization.org_type"],
      registration_number: d["organization.registration_number"], city: d.city, region: d.region };
  }
  return body;
}

function phoneSignup(pane, next, ticket, phone) {
  const fields = String(profileFields()).replace("__CREDENTIALS__", "");
  mount(pane, html`<form id="sf" novalidate>
      <div class="notice good">Number confirmed: <strong>${phone}</strong>. Tell us a little about you to finish.</div>
      <div class="form-error notice bad" hidden></div>
      ${raw(fields)}
      <button class="btn primary" type="submit" style="width:100%">Create account</button>
    </form>`);
  const f = $("#sf", pane);
  wireOrg(f, pane);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button[type=submit]"); busy(btn);
    try {
      const r = await api("/api/auth/register-phone", { method: "POST", body: bodyFrom(f, pane, () => ({ ticket })) });
      signedIn(r.user, next, "Your account is ready");
    } catch (err) { showErrors(f, err); busy(btn, false); }
  });
}

function register(el, next) {
  document.title = "Create an account — ImpactBridge";
  const creds = `<div class="field full"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
        <div class="field full"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required>
          <span class="hint">At least 8 characters, mixing letters with numbers or symbols.</span></div>`;
  const fields = String(profileFields()).replace("__CREDENTIALS__", creds);
  mount(el, html`<div class="wrap"><div class="auth-card panel" style="max-width:620px">
    <h1>Create your account</h1>
    <p class="muted">Choose what describes you best. Administrators and reviewers are added by the ImpactBridge team.</p>
    <a class="btn" style="width:100%;margin-bottom:var(--s4)" href="/login?method=phone${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}">Sign up with your mobile number instead</a>
    <form id="f" novalidate>
      <div class="form-error notice bad" hidden></div>
      ${raw(fields)}
      <button class="btn primary" type="submit" style="width:100%">Create account</button>
    </form>
    <p class="muted" style="margin-top:var(--s4)">Already registered? <a href="/login${qs(next)}">Sign in</a></p>
  </div></div>`);
  const f = $("#f", el);
  wireOrg(f, el);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button[type=submit]");
    busy(btn);
    try {
      const r = await api("/api/auth/register", { method: "POST", body: bodyFrom(f, el, (d) => ({ email: d.email, password: d.password })) });
      signedIn(r.user, next, "Your account is ready");
    } catch (err) { showErrors(f, err); } finally { busy(btn, false); }
  });
}

function forgot(el) {
  document.title = "Reset your password — ImpactBridge";
  mount(el, html`<div class="wrap"><div class="auth-card panel">
    <h1>Forgot your password?</h1>
    <p class="muted">Enter your account's email address and we'll send you a link to choose a new password.</p>
    <form id="f" novalidate>
      <div class="form-error notice bad" hidden></div>
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
      <button class="btn ink" type="submit" style="width:100%">Send reset link</button>
    </form>
    <div id="done" hidden></div>
    <p class="muted" style="margin-top:var(--s4)">Signed up with your mobile number? <a href="/login?method=phone">Sign in with a code instead</a>.</p>
  </div></div>`);
  const f = $("#f", el);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button[type=submit]"); busy(btn);
    try {
      const r = await api("/api/auth/forgot", { method: "POST", body: formData(f) });
      f.hidden = true;
      const done = $("#done", el); done.hidden = false;
      mount(done, html`<div class="notice good">If an account uses that email, a reset link is on its way. Check your inbox and spam folder; the link works for 1 hour.</div>
        ${r.email_configured === false ? html`<div class="notice">Email isn't set up on this server yet, so no message can be sent. Contact ${state.meta?.support_email || "the ImpactBridge team"} for help.</div>` : ""}
        ${r.dev_link ? html`<p class="notice">Test mode: <a href="${r.dev_link.replace(/^https?:\/\/[^/]+/, "")}">open the reset link</a></p>` : ""}`);
    } catch (err) { showErrors(f, err); busy(btn, false); }
  });
}

function resetPassword(el, query) {
  document.title = "Choose a new password — ImpactBridge";
  mount(el, html`<div class="wrap"><div class="auth-card panel">
    <h1>Choose a new password</h1>
    <form id="f" novalidate>
      <div class="form-error notice bad" hidden></div>
      <div class="field"><label for="password">New password</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required>
        <span class="hint">At least 8 characters, mixing letters with numbers or symbols.</span></div>
      <button class="btn ink" type="submit" style="width:100%">Save new password</button>
    </form></div></div>`);
  const f = $("#f", el);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button[type=submit]"); busy(btn);
    try {
      await api("/api/auth/reset", { method: "POST", body: { token: query.token || "", password: formData(f).password } });
      toast("Password changed. Please sign in.");
      navigate("/login");
    } catch (err) { showErrors(f, err); busy(btn, false); }
  });
}

async function verifyEmail(el, query) {
  document.title = "Confirm your email — ImpactBridge";
  mount(el, html`<div class="wrap"><div class="auth-card panel"><p>Confirming your email…</p></div></div>`);
  try {
    await api("/api/auth/verify-email", { method: "POST", body: { token: query.token || "" } });
    if (state.user) { const { refreshUser } = await import("../app.js"); await refreshUser(); }
    mount(el, html`<div class="wrap"><div class="auth-card panel"><h1>Email confirmed</h1>
      <p>Thanks! You can now share needs and offer support.</p><a class="btn primary" href="/">Continue</a></div></div>`);
  } catch (err) {
    mount(el, html`<div class="wrap"><div class="auth-card panel"><h1>Link expired</h1><p>${err.message}</p>
      <a class="btn" href="/profile">Go to your profile to resend it</a></div></div>`);
  }
}

function onboarding(el, next) {
  document.title = "Create your profile — ImpactBridge";
  if (state.user) { navigate(next); return; }
  const id = state.identity || {};
  if (!id.signed_in || !id.can_write) {
    mount(el, html`<div class="wrap"><div class="auth-card panel"><h1>Browse-only access</h1>
      <p>You can explore every project here. To share a need or offer support, ask the owner of this ImpactBridge preview to invite you as an editor.</p>
      <a class="btn" href="/explore">Explore projects</a></div></div>`);
    return;
  }
  const roles = id.is_owner ? [...ROLES, ["admin", "Administrator (owner)", "Review projects, verify needs and results, moderate. You can switch roles later from your profile to try every journey."]] : ROLES;
  mount(el, html`<div class="wrap"><div class="auth-card panel" style="max-width:620px">
    <h1>Create your ImpactBridge profile</h1>
    <p class="muted">You're signed in with your Claude account, so there's no password to remember.${id.is_owner ? " As the owner of this preview you also get reviewer tools." : ""}</p>
    <form id="f" novalidate>
      <div class="form-error notice bad" hidden></div>
      <fieldset><legend>I am joining as</legend><div class="role-options">
        ${roles.map(([v, t, d], i) => html`<label><input type="radio" name="role" value="${v}" ${(id.is_owner ? v === "admin" : i === 0) ? "checked" : ""}>
          <span><strong>${t}</strong><br><span class="small muted">${d}</span></span></label>`)}
      </div></fieldset>
      <div class="form-grid">
        <div class="field full"><label for="name">Name shown to others</label><input id="name" name="name" autocomplete="name" required></div>
        <div class="field"><label for="city">City or town</label><input id="city" name="city"></div>
        <div class="field"><label for="region">State / region</label><input id="region" name="region"></div>
      </div>
      <fieldset id="orgset"><legend>Your organization (optional)</legend>
        <div id="orgfields" class="form-grid">
          <div class="field full"><label for="org-name">Organization name</label><input id="org-name" name="organization.name"></div>
          <div class="field"><label for="org-type">Type</label><select id="org-type" name="organization.org_type"></select></div>
          <div class="field"><label for="org-reg">Registration number (optional)</label><input id="org-reg" name="organization.registration_number"></div>
        </div>
      </fieldset>
      <label class="check"><input type="checkbox" name="accept_terms"><span>${TERMS}</span></label>
      <button class="btn primary" type="submit" style="width:100%">Create profile</button>
    </form></div></div>`);
  const f = $("#f", el);
  const sync = () => {
    const role = f.querySelector("input[name=role]:checked").value;
    $("#orgset", el).hidden = ["volunteer", "admin", "verifier"].includes(role);
    mount($("#org-type", el), html`${(ORG_TYPES[role] || []).map(([v, t]) => html`<option value="${v}">${t}</option>`)}`);
  };
  f.addEventListener("change", (e) => { if (e.target.name === "role") sync(); });
  sync();
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = formData(f);
    const body = { name: d.name, role: d.role, city: d.city, region: d.region, accept_terms: d.accept_terms };
    if (!$("#orgset", el).hidden && d["organization.name"]) body.organization = { name: d["organization.name"], org_type: d["organization.org_type"], registration_number: d["organization.registration_number"], city: d.city, region: d.region };
    const btn = f.querySelector("button[type=submit]"); busy(btn);
    try {
      const r = await api("/api/auth/register", { method: "POST", body });
      if (state.identity?.is_owner) {
        const { seedDemoIfEmpty } = await import("../hosted/server.js");
        await seedDemoIfEmpty();
      }
      setUser(r.user);
      toast("Your profile is ready");
      navigate(next === "/dashboard" || next === "/" ? "/dashboard" : next);
    } catch (err) { showErrors(f, err); busy(btn, false); }
  });
}
