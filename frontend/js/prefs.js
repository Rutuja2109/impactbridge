// Per-device preferences (theme, language) and push notification helpers.
import { HOSTED, api, toast } from "./core.js";

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: keep for this visit only */ } },
};

// ------------------------------------------------------------------ theme
export function getTheme() { return store.get("ib-theme") || "system"; }
export function applyTheme(t = getTheme()) {
  const root = document.documentElement;
  if (t === "light" || t === "dark") root.setAttribute("data-theme", t); else root.removeAttribute("data-theme");
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#121414" : "#00918F");
}
export function setTheme(t) { store.set("ib-theme", t); applyTheme(t); }
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme());

// ------------------------------------------------------------------ language
export const LANGS = [["en", "English"], ["hi", "हिन्दी"], ["mr", "मराठी"]];
export function getLang() {
  const saved = store.get("ib-lang");
  if (saved) return saved;
  const nav = (navigator.language || "en").slice(0, 2);
  return ["hi", "mr"].includes(nav) ? nav : "en";
}
export function hasChosenLang() { return !!store.get("ib-lang"); }
export function saveLang(l) { store.set("ib-lang", l); }

// ------------------------------------------------------------------ push
export function pushSupported() {
  return !HOSTED && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
const b64ToBytes = (s) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
export async function pushState() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}
export async function enablePush() {
  const { key } = await api("/api/push/key");
  if (!key) throw new Error("Push notifications aren't set up on this server yet.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications are blocked. Allow them in your phone's settings for ImpactBridge.");
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await api("/api/push/subscribe", { method: "POST", body: { endpoint: sub.endpoint } });
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api("/api/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
}

/**
 * The polite notification ask (the ImpactGuru pattern, done gently): shown right after someone helps, when they
 * want to know what happens next — never on first launch, at most once a fortnight, and only if push is set up.
 */
export async function askForUpdates(reason = "We'll let you know when the team replies and when the work is done.") {
  try {
    if (!pushSupported() || Notification.permission === "denied") return;
    if (Notification.permission === "granted") { if ((await pushState()) === "off") await enablePush(); return; }
    const last = Number(store.get("ib-push-ask") || 0);
    if (Date.now() - last < 14 * 86400000) return;
    const { key } = await api("/api/push/key").catch(() => ({}));
    if (!key) return;
  } catch { return; }
  store.set("ib-push-ask", String(Date.now()));
  const d = document.createElement("div");
  d.className = "ask5"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-labelledby", "ask5-t");
  d.innerHTML = `<div class="ask5-card">
    <span class="ask5-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></span>
    <h2 id="ask5-t">Get updates on this?</h2><p></p>
    <p class="small muted">Only about projects you chose. No ads, no calls. Turn it off any time in Profile.</p>
    <div class="ask5-row"><button type="button" class="btn ghost" data-no>Not now</button><button type="button" class="btn primary" data-yes>Yes, keep me posted</button></div></div>`;
  d.querySelector("p").textContent = reason;
  document.body.appendChild(d);
  const close = () => d.remove();
  d.querySelector("[data-no]").addEventListener("click", close);
  d.addEventListener("click", (e) => { if (e.target === d) close(); });
  d.querySelector("[data-yes]").addEventListener("click", async () => {
    close();
    try { await enablePush(); toast("Updates turned on"); } catch (err) { toast(err.message, "bad"); }
  });
  d.querySelector("[data-yes]").focus();
}
