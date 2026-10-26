// ImpactBridge service worker: caches the app shell so the app opens offline.
// Live data wins: project lists and pages are fetched fresh and a copy is kept only as an offline fallback.
const VERSION = "ib-v11";
const API_CACHE = "ib-api-v1"; // last public project lists and pages, so Explore still shows something offline
const SHELL = [
  "/", "/offline", "/static/css/styles.css", "/static/js/app.js", "/static/js/core.js", "/static/js/art.js",
  "/static/js/components.js", "/static/img/icons/icon-192.png", "/static/img/icon.svg",
  "/static/js/views/home.js", "/static/js/views/explore.js", "/static/js/views/project.js", "/static/js/views/dashboard.js",
  "/static/js/views/auth.js", "/static/js/views/create.js", "/static/js/views/info.js", "/static/js/views/match.js",
  "/static/js/views/notifications.js", "/static/js/views/profile.js", "/static/js/views/org.js", "/static/js/views/admin.js",
  "/static/js/views/report.js", "/static/js/share.js", "/static/js/prefs.js", "/static/js/i18n.js", "/static/js/i18n/hi.js", "/static/js/i18n/mr.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== API_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    if (/^\/api\/(projects(\/[^/]+)?|meta|stats|activity)$/.test(url.pathname)) {
      e.respondWith(fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(API_CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(async () => {
        const hit = await caches.match(req, { cacheName: API_CACHE });
        if (!hit) return new Response(JSON.stringify({ error: "You appear to be offline. Check your connection and try again." }), { status: 503, headers: { "Content-Type": "application/json" } });
        const h = new Headers(hit.headers); h.set("x-ib-offline", "1");
        return new Response(await hit.blob(), { status: 200, headers: h });
      }));
    }
    return; // everything else: live data only
  }
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put("/", copy)); }
      return res;
    }).catch(async () => (await caches.match("/")) || (await caches.match("/offline")) ||
      new Response("<h1>You're offline</h1><p>Reconnect to use ImpactBridge.</p>", { status: 200, headers: { "Content-Type": "text/html" } })));
    return;
  }
  if (url.pathname.startsWith("/static/")) {
    // stale-while-revalidate for the app shell
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const cached = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => cached);
      return cached || net;
    }));
  }
});

self.addEventListener("message", (e) => { if (e.data === "clear-api") e.waitUntil(caches.delete(API_CACHE)); });

// Push notifications carry no content: on a push, fetch the newest notification and show it.
self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let title = "ImpactBridge", body = "You have a new update.", link = "/notifications", tag = "ib";
    try {
      const r = await fetch("/api/notifications?limit=1", { credentials: "include", headers: { Accept: "application/json" } });
      if (r.ok) {
        const n = (await r.json()).notifications?.[0];
        if (n) { title = n.title || title; body = n.body || body; link = n.link || link; tag = n.id; }
      }
    } catch { /* show the generic message */ }
    await self.registration.showNotification(title, { body, tag, data: { link }, icon: "/static/img/icons/icon-192.png",
      badge: "/static/img/icons/icon-192.png" });
  })());
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const link = e.notification.data?.link || "/notifications";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { await c.focus(); c.navigate?.(link); return; } }
    await self.clients.openWindow(link);
  })());
});
