import { $, HOSTED, api, html, loc, mount, restoreRoute, onUserChange, raw, setUrl, setUser, state, toast, errorState } from "./core.js";
import { LANGS, applyTheme, getLang, hasChosenLang, saveLang } from "./prefs.js";
import { initI18n, setLanguage } from "./i18n.js";
import { causeCover } from "./art.js";

const routes = [
  ["/", () => import("./views/home.js")],
  ["/explore", () => import("./views/explore.js")],
  ["/match", () => import("./views/match.js"), { auth: true }],
  ["/how-it-works", () => import("./views/info.js"), { page: "how" }],
  ["/guidelines", () => import("./views/info.js"), { page: "guidelines" }],
  ["/privacy", () => import("./views/info.js"), { page: "privacy" }],
  ["/delete-account", () => import("./views/info.js"), { page: "delete" }],
  ["/offline", () => import("./views/info.js"), { page: "offline" }],
  ["/terms", () => import("./views/info.js"), { page: "terms" }],
  ["/help", () => import("./views/info.js"), { page: "help" }],
  ["/login", () => import("./views/auth.js"), { page: "login" }],
  ["/forgot-password", () => import("./views/auth.js"), { page: "forgot" }],
  ["/reset-password", () => import("./views/auth.js"), { page: "reset" }],
  ["/verify-email", () => import("./views/auth.js"), { page: "verify" }],
  ["/register", () => import("./views/auth.js"), { page: "register" }],
  ["/share-a-need", () => import("./views/create.js"), { auth: true }],
  ["/projects/:id/edit", () => import("./views/create.js"), { auth: true, edit: true }],
  ["/projects/:id/report", () => import("./views/report.js"), { page: "report" }],
  ["/projects/:id", () => import("./views/project.js")],
  ["/certificates/:id", () => import("./views/report.js"), { page: "certificate" }],
  ["/dashboard", () => import("./views/dashboard.js"), { auth: true }],
  ["/notifications", () => import("./views/notifications.js"), { auth: true }],
  ["/profile", () => import("./views/profile.js"), { auth: true }],
  ["/organizations/:id", () => import("./views/org.js")],
  ["/admin", () => import("./views/admin.js"), { auth: true, reviewer: true }],
];

function match(path) {
  for (const [pattern, loader, opts = {}] of routes) {
    const keys = [];
    const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "/?$");
    const m = path.match(re);
    if (m) return { loader, opts, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

let navToken = 0;
let navBack = false;
async function router() {
  const token = ++navToken;
  const { path, search, anchor } = loc();
  const query = Object.fromEntries(new URLSearchParams(search));
  renderHeader();
  closeDrawer();
  document.body.classList.remove("has-sticky");
  const main = $("#main");
  const r = match(path);
  if (!r) {
    mount(main, html`<div class="wrap state"><h1>Page not found</h1><p>The page you're looking for doesn't exist.</p>
      <a class="btn" href="/explore">Explore projects</a></div>`);
    document.title = "Not found — ImpactBridge";
    return;
  }
  if (r.opts.auth && !state.user) {
    go(`/login?next=${encodeURIComponent(path + search)}`, true);
    return;
  }
  if (r.opts.reviewer && !["admin", "verifier"].includes(state.user.role)) {
    mount(main, html`<div class="wrap state"><h1>Reviewers only</h1><p>This area is for ImpactBridge reviewers and administrators.</p></div>`);
    return;
  }
  const el = document.createElement("div");
  el.className = "route-in" + (navBack ? " back" : "");
  navBack = false;
  main.replaceChildren(el);
  try {
    const mod = await r.loader();
    if (token !== navToken) return;
    await mod.default({ el, params: r.params, query, opts: r.opts });
  } catch (err) {
    if (token !== navToken) return;
    if (![403, 404].includes(err.status)) console.error(err);
    mount(el, html`<div class="wrap">${errorState(err)}</div>`);
  }
  if (anchor) document.getElementById(anchor)?.scrollIntoView();
  else window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

export function go(path, replace = false) {
  setUrl(path, replace);
  router();
}
window.addEventListener("ib:navigate", (e) => go(e.detail));
window.addEventListener("popstate", (e) => { navBack = true; restoreRoute(e.state); router(); });

document.addEventListener("click", (e) => {
  if (e.target.closest(".tabbar a, .tabbar button, .btn.primary")) { try { navigator.vibrate?.(8); } catch { /* not supported */ } }
  const a = e.target.closest("a[href]");
  const href = a?.getAttribute("href") || "";
  if (a && href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/_blob/") && !href.startsWith("/api/")
      && !a.hasAttribute("download") && !a.target && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    const target = href.split("#")[0], cur = loc();
    if (target === cur.path + cur.search && href.includes("#")) {
      const id = href.split("#")[1];
      document.getElementById(id)?.scrollIntoView();
      return;
    }
    go(href);
    return;
  }
  const act = e.target.closest("[data-action]");
  const setL = e.target.closest("[data-set-lang]")?.dataset.setLang;
  if (setL) changeLang(setL);
  if (act?.dataset.action === "reload") router();
  if (act?.dataset.action === "menu") toggleDrawer();
  if (act?.dataset.action === "logout") logout();
  if (act?.dataset.action === "install" && installPrompt) {
    installPrompt.prompt();
    installPrompt.userChoice.finally(() => { installPrompt = null; renderHeader(); });
  }
});

document.addEventListener("change", (e) => { if (e.target.matches("[data-lang-pick]")) changeLang(e.target.value); });
async function changeLang(l) {
  await setLanguage(l);
  closeDrawer();
  renderHeader();
  renderFooter();
  router();
  if (state.user && !HOSTED) api("/api/auth/me", { method: "PATCH", body: { language: l } }).catch(() => {});
}

/** First visit: language, then three short slides about what the app does (once per device). */
function maybeAskLanguage() {
  if (hasChosenLang()) return;
  let seen = false; try { seen = !!localStorage.getItem("ib-onboarded"); } catch { /* ignore */ }
  const d = document.createElement("div");
  d.id = "onboard"; d.className = "ob5"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "Welcome to ImpactBridge");
  const slides = [
    ["#1E9BBF", "water_sanitation", "Share a problem in your own words", "Type it, say it in Hindi, Marathi or English, or add a photo. AI turns it into a clear plan and you check every line."],
    ["#F4B63E", "education", "People nearby step in", "Rotary and Rotaract clubs, NGOs, companies and volunteers pledge money, time, materials or skills."],
    ["#3FA34D", "environment", "See proof, not promises", "Every need and every result is checked by a person. Photos and receipts show what really happened."],
  ];
  let i = 0;
  const draw = () => {
    if (i === 0) {
      d.innerHTML = `<div class="ob5-card" translate="no"><div class="ob5-logo">${LOGO}<strong>ImpactBridge</strong></div>
        <h2>Choose your language</h2><p>भाषा चुनें · भाषा निवडा</p>
        <div class="ob5-langs">${LANGS.map(([k, t]) => `<button type="button" class="btn ${k === getLang() ? "primary" : ""}" data-ob-lang="${k}">${t}</button>`).join("")}</div></div>`;
      return;
    }
    const [col, cause, title, body] = slides[i - 1];
    d.innerHTML = `<div class="ob5-card slide"><div class="ob5-art" style="background:${col}">${causeCover(cause, { height: 220, seed: "ob" + i })}</div>
      <h2>${title}</h2><p>${body}</p>
      <div class="ob5-dots" aria-hidden="true">${slides.map((_, k) => `<span class="${k === i - 1 ? "on" : ""}"></span>`).join("")}</div>
      <div class="ob5-nav">${i < slides.length ? `<button type="button" class="btn ghost" data-ob="skip">Skip</button><button type="button" class="btn primary" data-ob="next">Next</button>`
        : `<button type="button" class="btn ghost" data-ob="browse">Look around first</button><button type="button" class="btn primary" data-ob="join">${HOSTED ? "Create my profile" : "Create a free account"}</button>`}</div></div>`;
  };
  const finish = (to) => { try { localStorage.setItem("ib-onboarded", "1"); } catch { /* ignore */ } d.remove(); if (to) go(to); };
  d.addEventListener("click", async (e) => {
    const l = e.target.closest("[data-ob-lang]")?.dataset.obLang;
    if (l) { await changeLang(l); if (seen) { finish(); return; } i = 1; draw(); return; }
    const a = e.target.closest("[data-ob]")?.dataset.ob;
    if (a === "next") { i++; draw(); }
    if (a === "skip" || a === "browse") finish();
    if (a === "join") finish("/register");
  });
  draw();
  document.body.appendChild(d);
  d.querySelector("button")?.focus();
}

let installPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; renderHeader(); });
window.addEventListener("appinstalled", () => { installPrompt = null; renderHeader(); toast("ImpactBridge installed"); });
if (!HOSTED && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
window.addEventListener("offline", () => toast("You're offline. Changes can't be saved until you reconnect.", "bad"));
window.addEventListener("online", () => toast("Back online"));

// ------------------------------------------------------------ crash reports (no personal data) ---
const APP_VERSION = "4.0";
let reported = 0;
function reportError(message, source) {
  if (HOSTED || reported >= 5 || !message) return;
  reported++;
  fetch("/api/client-errors", { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
    body: JSON.stringify({ message: String(message).slice(0, 480), source: source ? String(source).slice(0, 280) : null,
      path: loc().path, app_version: APP_VERSION }) }).catch(() => {});
}
window.addEventListener("error", (e) => reportError(e.message, e.filename ? `${e.filename.split("/").pop()}:${e.lineno}` : null));
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  if (r && typeof r.status === "number") return; // API answers are handled on screen
  reportError(r?.message || String(r), r?.stack?.split("\n")[1]?.trim());
});

// ------------------------------------------------------------ pull to refresh (installed app) ---
const inShell = /ImpactBridgeApp/.test(navigator.userAgent);   // the Expo / Play Store app shell
if (inShell) document.documentElement.classList.add("in-app");
const standalone = () => inShell || matchMedia("(display-mode: standalone)").matches || document.referrer.startsWith("android-app://");
let pull = null;
window.addEventListener("touchstart", (e) => {
  if (!standalone() || window.scrollY > 0 || document.querySelector("dialog[open], .drawer.open")) return;
  pull = { y: e.touches[0].clientY, dy: 0 };
}, { passive: true });
window.addEventListener("touchmove", (e) => {
  if (!pull) return;
  pull.dy = e.touches[0].clientY - pull.y;
  let ind = document.getElementById("ptr");
  if (pull.dy > 10) {
    if (!ind) { ind = document.createElement("div"); ind.id = "ptr"; ind.className = "ptr"; ind.textContent = "↓"; document.body.appendChild(ind); }
    ind.style.transform = `translate(-50%, ${Math.min(pull.dy, 110) - 50}px) rotate(${Math.min(pull.dy, 110) * 2}deg)`;
    ind.classList.toggle("ready", pull.dy > 80);
  }
}, { passive: true });
window.addEventListener("touchend", async () => {
  const p = pull; pull = null;
  const ind = document.getElementById("ptr");
  if (!p) return;
  if (p.dy > 80) {
    ind?.classList.add("spin");
    await refreshUser().catch(() => {});
    await router();
  }
  ind?.remove();
});

async function logout() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  setUser(null);
  toast("Signed out");
  go("/");
}

// ------------------------------------------------------------- chrome ---
export const LOGO = `<svg class="ib-logo" width="34" height="34" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="iblg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14C8C5"/><stop offset="1" stop-color="#00807E"/></linearGradient></defs><rect width="512" height="512" rx="120" fill="url(#iblg)"/><path class="lg-heart" d="M256 268C256 268 174 220 174 164C174 134 197 112 225 112C241 112 252 121 256 133C260 121 271 112 287 112C315 112 338 134 338 164C338 220 256 268 256 268Z" fill="#FFB938"/><g fill="none" stroke="#fff" stroke-linecap="round"><path class="lg-arch" pathLength="1" d="M108 372A168.5 168.5 0 0 1 404 372" stroke-width="34"/><path class="lg-deck" pathLength="1" d="M84 372H428" stroke-width="32"/></g></svg>`;

function navLinks() {
  const u = state.user;
  const links = [["/explore", "Explore projects"], ["/share-a-need", "Share a need"]];
  if (u && ["club", "csr", "ngo", "volunteer"].includes(u.role)) links.push(["/match", "Match my resources"]);
  if (!u) links.push(["/how-it-works", "How it works"]);
  if (u) links.push(["/dashboard", "Dashboard"]);
  if (u && ["admin", "verifier"].includes(u.role)) links.push(["/admin", "Review"]);
  return links;
}

function renderHeader() {
  const u = state.user;
  const here = loc().path;
  const links = navLinks();
  mount("#header", html`<div class="wrap">
    <a class="brand" href="/">${raw(LOGO)}<span>ImpactBridge</span></a>
    <nav class="nav" aria-label="Main">${links.map(([h, t]) =>
      html`<a href="${h}" ${here === h || (h !== "/" && here.startsWith(h + "/")) ? raw('aria-current="page"') : ""}>${t}</a>`)}</nav>
    <div class="header-actions">
      ${u ? html`
        <a class="bell" href="/notifications" aria-label="Notifications${u.unread_notifications ? `, ${u.unread_notifications} unread` : ""}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
          ${u.unread_notifications ? html`<span class="count">${u.unread_notifications > 99 ? "99+" : u.unread_notifications}</span>` : ""}</a>
        <a class="btn small desktop-only" href="/profile">${u.name.split(" ")[0]}${u.is_owner ? " (owner)" : ""}</a>
        ${HOSTED ? "" : html`<button class="btn small ghost desktop-only" data-action="logout">Sign out</button>`}`
      : HOSTED ? (state.identity?.can_write && state.identity?.signed_in ? html`<a class="btn small primary desktop-only" href="/register">Create your profile</a>` : "")
      : html`<a class="btn small desktop-only" href="/login">Sign in</a><a class="btn small primary desktop-only" href="/register">Join</a>`}
      ${installPrompt ? html`<button class="btn small pill desktop-only" data-action="install">Install app</button>` : ""}
      <label class="sr-only" for="lang-top">Language</label>
      <select id="lang-top" class="lang-pick" data-lang-pick aria-label="Language">${LANGS.map(([k, t]) => html`<option value="${k}" ${getLang() === k ? "selected" : ""}>${k === "en" ? "EN" : k === "hi" ? "हि" : "म"}</option>`)}</select>
      <button class="icon-btn menu-btn" data-action="menu" aria-expanded="false" aria-controls="drawer" aria-label="Menu"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h10"/></svg></button>
    </div></div>`);
  renderTabbar();
  mount("#drawer", html`<nav aria-label="Mobile">${links.map(([h, t]) => html`<a href="${h}">${t}</a>`)}
    ${u ? html`<a href="/notifications">Notifications${u.unread_notifications ? ` (${u.unread_notifications})` : ""}</a>
      <a href="/profile">Profile & organizations</a><a href="/help">Help & support</a>${HOSTED ? "" : html`<button class="linklike" data-action="logout">Sign out</button>`}`
      : HOSTED ? html`<a href="/how-it-works">How it works</a>${state.identity?.can_write && state.identity?.signed_in ? html`<a href="/register">Create your profile</a>` : ""}`
      : html`<a href="/help">Help & support</a><a href="/login">Sign in</a><a href="/register">Create an account</a>`}
    ${installPrompt ? html`<button class="linklike" data-action="install">Install the ImpactBridge app</button>` : ""}
    <div class="drawer-lang"><span>Language</span>${LANGS.map(([k, t]) => html`<button type="button" class="chip-btn" data-set-lang="${k}" aria-pressed="${getLang() === k}" translate="no">${t}</button>`)}</div></nav>`);
}

const TAB_ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
  explore: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
};
function renderTabbar() {
  let bar = $("#tabbar");
  if (!bar) {
    bar = document.createElement("nav");
    bar.id = "tabbar"; bar.className = "tabbar"; bar.setAttribute("aria-label", "App");
    document.body.appendChild(bar);
    document.body.classList.add("has-tabbar");
  }
  const u = state.user, here = loc().path;
  const unread = u?.unread_notifications || 0;
  const tabs = [
    ["/", "Home", "home"],
    ["/explore", "Explore", "explore"],
    ["/share-a-need", "Get help", "plus", "share"],
    u ? ["/notifications", "Alerts", "bell"] : ["#more", "More", "more"],
    u ? ["/profile", "Profile", "user"] : (HOSTED ? ["/register", "Join", "user"] : ["/login", "Sign in", "user"]),
  ];
  const active = (h) => (h === "/" ? here === "/" || here === "/dashboard" : here === h || here.startsWith(h + "/"));
  const inner = (label, icon) => html`<span class="ti"><svg viewBox="0 0 24 24" aria-hidden="true">${raw(TAB_ICONS[icon])}</svg>${icon === "bell" && unread ? html`<span class="dot">${unread > 9 ? "9+" : unread}</span>` : ""}</span>
    <span class="tl">${label}</span>`;
  mount(bar, html`${tabs.map(([h, label, icon, cls]) => h === "#more"
    ? html`<button type="button" class="more" data-action="menu" aria-expanded="false" aria-controls="drawer">${inner(label, icon)}</button>`
    : html`<a href="${h}" class="${cls || ""}" ${active(h) ? raw('aria-current="page"') : ""}>${inner(label, icon)}</a>`)}`);
}

function toggleDrawer() {
  const d = $("#drawer");
  const open = !d.classList.contains("open");
  d.classList.toggle("open", open);
  $(".menu-btn")?.setAttribute("aria-expanded", String(open));
  $(".tabbar .more")?.setAttribute("aria-expanded", String(open));
  $(".menu-btn")?.setAttribute("aria-label", open ? "Close menu" : "Menu");
}
function closeDrawer() { $("#drawer").classList.remove("open"); }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

function renderFooter() {
  mount("#footer", html`<div class="wrap footer-grid">
    <div class="foot-brand"><a class="brand" href="/">${raw(LOGO)}<span>ImpactBridge</span></a>
      <p class="muted">Turn community problems into collective action, with clubs, companies and volunteers. Every number comes from recorded data; demo projects are labelled.</p></div>
    <div><h4>Platform</h4><a href="/explore">Explore projects</a><a href="/match">Match my resources</a><a href="/share-a-need">Share a community need</a><a href="/how-it-works">How it works</a></div>
    <div><h4>For</h4><a href="/register">Community organizations</a><a href="/register">Rotary &amp; Rotaract clubs</a><a href="/register">Corporate CSR teams</a><a href="/register">Individual volunteers</a></div>
    <div><h4>Trust &amp; safety</h4><a href="/help">Help &amp; support</a><a href="/guidelines">Community guidelines</a><a href="/terms">Terms of use</a><a href="/privacy">Privacy policy</a><a href="/delete-account">Delete your account</a><a href="/guidelines#reporting">Report a concern</a></div>
    <p class="foot-note">Reported is not the same as verified. Always check the verification badges.</p>
  </div>
  <div class="wrap foot-compact"><a href="/help">Help</a><a href="/how-it-works">How it works</a><a href="/guidelines">Guidelines</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/delete-account">Delete account</a></div>`);
}

export async function refreshUser() {
  try { const r = await api("/api/auth/me"); state.identity = r.identity || null; setUser(r.user); } catch { setUser(null); }
}

onUserChange(renderHeader);

async function bootHosted() {
  mount("#main", html`<div class="wrap state"><p>Loading ImpactBridge…</p></div>`);
  const getCaps = async (c) => {
    if (!c?.use) return null;
    const [db, user, sample, assets] = await Promise.all(["db", "user", "sample", "assets"].map((n) => c.use(n).catch(() => null)));
    return db ? { db, user, sample, assets } : null;
  };
  // Inside the phone preview frame, the parent page (which Claude serves) resolves the capabilities and shares them.
  let caps = null;
  try { if (window.parent !== window && window.parent.IB_CAPS) caps = await window.parent.IB_CAPS; } catch { /* cross-origin */ }
  if (!caps) caps = await getCaps(window.claude);
  if (!caps && window.IB_LOCAL_RUNTIME) { caps = await getCaps(window.IB_LOCAL_RUNTIME); state.localPreview = !!caps; }
  const { db, user, sample, assets } = caps || {};
  if (!db) {
    mount("#main", html`<div class="wrap state"><h1>Open this page in Claude</h1>
      <p>ImpactBridge's hosted preview stores its data with Claude. Open the link while signed in to Claude to use it.</p></div>`);
    return false;
  }
  const server = await import("./hosted/server.js");
  await server.boot({ db, user, sample, assets });
  let t;
  server.onDataChange(() => { clearTimeout(t); t = setTimeout(refreshUser, 800); });
  return true;
}

async function boot() {
  applyTheme();
  // Launch splash: the logo draws itself while the app loads (held briefly only in the installed app).
  const started = Date.now();
  document.body.insertAdjacentHTML("beforeend", `<div id="ib-splash" class="splash5" aria-hidden="true">${LOGO.replace('width="34" height="34"', 'width="96" height="96"')}<strong>ImpactBridge</strong></div>`);
  const hideSplash = async () => {
    const wait = standalone() ? 900 - (Date.now() - started) : 0;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const sp = document.getElementById("ib-splash");
    if (!sp) return;
    sp.classList.add("out"); setTimeout(() => sp.remove(), 350);
  };
  await initI18n();
  renderFooter();
  if (HOSTED) { setUrl("/", true); if (!(await bootHosted())) { hideSplash(); return; } }
  const [me, meta] = await Promise.allSettled([api("/api/auth/me"), api("/api/meta")]);
  state.meta = meta.status === "fulfilled" ? meta.value : { causes: {}, currency: "INR", integrations: {} };
  state.user = me.status === "fulfilled" ? me.value.user : null;
  state.identity = me.status === "fulfilled" ? me.value.identity || null : null;
  if (HOSTED && !state.user && state.identity?.signed_in && state.identity?.can_write && loc().path === "/") setUrl("/register");
  if (HOSTED && !(state.identity?.can_write)) {
    document.body.insertAdjacentHTML("afterbegin", `<div class="notice" style="margin:0;border-radius:0;text-align:center">You're viewing ImpactBridge in browse-only mode. To share a need or offer support, ask the owner to invite you as an editor.</div>`);
  }
  await router();
  hideSplash();
  maybeAskLanguage();
  if (!HOSTED) setInterval(() => { if (state.user && document.visibilityState === "visible") refreshUser(); }, 60000);
}
boot();
