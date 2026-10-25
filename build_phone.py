"""Build the phone-emulator preview into dist/phone/: a device frame page + the hosted app inside it."""
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
FE = ROOT / "frontend"
OUT = ROOT / "dist" / "phone"
SHARE_URL = "https://claude.ai/artifact/JtHXRxZ3F8HucPKtKKfXJj"
if OUT.exists():
    shutil.rmtree(OUT)
(OUT / "js").mkdir(parents=True)
for f in (FE / "js").rglob("*.js"):
    dest = OUT / "js" / f.relative_to(FE / "js")
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(f, dest)
for f in ("icon-192.png",):
    shutil.copy(FE / "img" / "icons" / f, OUT / f)

# Local fallback runtime (used only if the frame can't reach Claude's runtime): data stays in this browser.
mock = (ROOT / "tests_ui" / "claude_mock.js").read_text()
safe_ls = ("const LS=(()=>{try{localStorage.setItem('_ib','1');localStorage.removeItem('_ib');return localStorage}catch(e){"
           "const m=new Map();return{get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.has(k)?m.get(k):null,"
           "setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}})();\n")
mock = mock.replace("localStorage", "LS")
mock = mock.replace("(() => {", "(() => {\n" + safe_ls, 1)
mock = mock.replace("const caps = { db, user, sample, assets };", "const caps = { db, user, sample: null, assets: null };")
mock = mock.replace("window.claude = {", "window.IB_LOCAL_RUNTIME = {")
(OUT / "js" / "local-runtime.js").write_text(mock)

css = (FE / "css" / "styles.css").read_text()
app = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ImpactBridge</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,800&family=Noto+Sans+Devanagari:wght@400;500;700&display=swap">
<style>
{css}
html,body{{scrollbar-width:none}} ::-webkit-scrollbar{{display:none}}
</style>
<script>window.IB_HOSTED = true; window.IB_SHARE_URL = "{SHARE_URL}";</script>
<script src="js/local-runtime.js"></script>
</head><body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header" id="header"></header>
<div class="drawer" id="drawer" aria-label="Menu"></div>
<main id="main" tabindex="-1"><div class="wrap state"><p>Loading ImpactBridge…</p></div></main>
<footer class="site-footer" id="footer"></footer>
<div class="toasts" id="toasts" role="status" aria-live="polite"></div>
<script type="module" src="js/app.js"></script>
</body></html>
"""
(OUT / "app.html").write_text(app)

frame = r"""<title>ImpactBridge Phone Preview</title>
<style>
:root{--bg:#eef3f0;--panel:#ffffff;--ink:#0b2a1f;--muted:#4b5f57;--line:#d6e2dc;--accent:#065f46;--body:#121614;--bezel:#1d2320}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0d1411;--panel:#16201c;--ink:#e6f2ec;--muted:#9db3a8;--line:#2a3833;--accent:#34d399;--body:#000;--bezel:#2b3430}}
:root[data-theme="dark"]{--bg:#0d1411;--panel:#16201c;--ink:#e6f2ec;--muted:#9db3a8;--line:#2a3833;--accent:#34d399;--body:#000;--bezel:#2b3430}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column;align-items:center;overflow:hidden}
.bar{width:100%;max-width:960px;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:10px 16px}
.bar b{font-weight:700;margin-right:6px}
select,button.tb{font:inherit;font-size:14px;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px 10px;cursor:pointer}
button.tb:hover,select:hover{border-color:var(--accent)}
.stage{flex:1;width:100%;display:grid;place-items:center;min-height:0;padding:4px 16px 16px}
.phone{position:relative;background:var(--body);border-radius:calc(46px*var(--k));padding:calc(12px*var(--k));box-shadow:0 0 0 calc(2px*var(--k)) var(--bezel),0 30px 70px rgba(0,0,0,.28);transform-origin:center}
.screen{position:relative;width:calc(var(--w)*1px*var(--k));height:calc(var(--h)*1px*var(--k));border-radius:calc(36px*var(--k));overflow:hidden;background:#fff;display:flex;flex-direction:column}
.status{height:calc(30px*var(--k));flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 calc(22px*var(--k));font-size:calc(13px*var(--k));font-weight:600;color:#fff;background:#065f46;position:relative;z-index:2}
.status .icons{display:flex;gap:calc(6px*var(--k));align-items:center}
.status svg{width:calc(15px*var(--k));height:calc(15px*var(--k));fill:#fff}
.punch{position:absolute;left:50%;top:calc(8px*var(--k));width:calc(14px*var(--k));height:calc(14px*var(--k));margin-left:calc(-7px*var(--k));border-radius:50%;background:#000}
.viewport{flex:1;position:relative;overflow:hidden}
.viewport iframe{position:absolute;left:0;top:0;border:0;width:calc(var(--w)*1px);height:calc((var(--h) - 30 - 44)*1px);transform:scale(var(--k));transform-origin:0 0;background:#fff}
.nav{height:calc(44px*var(--k));flex:none;display:flex;align-items:center;justify-content:space-around;background:#f4f7f5;border-top:1px solid #e3ebe7;z-index:2}
.nav button{background:none;border:0;cursor:pointer;width:calc(56px*var(--k));height:calc(36px*var(--k));display:grid;place-items:center;border-radius:12px}
.nav button:hover{background:#e3ebe7}
.nav svg{width:calc(20px*var(--k));height:calc(20px*var(--k));fill:none;stroke:#2d3b35;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.home{position:absolute;inset:0;background:linear-gradient(160deg,#064e3b,#047857 60%,#10b981);display:none;flex-direction:column;align-items:center;padding-top:calc(90px*var(--k));color:#fff;z-index:1}
.home.on{display:flex}
.clock{font-size:calc(54px*var(--k));font-weight:300;letter-spacing:-.02em}
.date{font-size:calc(14px*var(--k));opacity:.85;margin-bottom:calc(60px*var(--k))}
.appicon{background:none;border:0;color:#fff;cursor:pointer;display:grid;justify-items:center;gap:calc(8px*var(--k));font:inherit;font-size:calc(13px*var(--k))}
.appicon img{width:calc(64px*var(--k));height:calc(64px*var(--k));border-radius:calc(18px*var(--k));box-shadow:0 8px 20px rgba(0,0,0,.25)}
.splash{position:absolute;inset:0;background:#f7faf8;display:none;place-items:center;z-index:3}
.splash.on{display:grid}
.splash img{width:calc(96px*var(--k));height:calc(96px*var(--k));border-radius:calc(24px*var(--k))}
.note{font-size:13px;color:var(--muted);text-align:center;max-width:560px;padding:0 16px 10px}
.phone.land .screen{width:calc(var(--h)*1px*var(--k));height:calc(var(--w)*1px*var(--k))}
.phone.land .viewport iframe{width:calc(var(--h)*1px);height:calc((var(--w) - 30 - 44)*1px)}
</style>
<div class="bar">
  <b>ImpactBridge on a phone</b>
  <select id="dev" aria-label="Device">
    <option value="412x915" selected>Pixel 7 (412x915)</option>
    <option value="360x800">Small Android (360x800)</option>
    <option value="384x854">Galaxy A-series (384x854)</option>
    <option value="430x932">Large phone (430x932)</option>
  </select>
  <button class="tb" id="rot" type="button">Rotate</button>
  <button class="tb" id="reload" type="button">Restart app</button>
</div>
<div class="stage" id="stage">
  <div class="phone" id="phone">
    <div class="screen">
      <div class="status"><span id="time">9:41</span><span class="punch"></span>
        <span class="icons"><svg viewBox="0 0 24 24"><path d="M12 18.5 2 7.6C4.8 5.3 8.3 4 12 4s7.2 1.3 10 3.6z"/></svg><svg viewBox="0 0 24 24"><path d="M2 22h20V2z"/></svg><svg viewBox="0 0 24 24"><path d="M16 4h-2V2h-4v2H8a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z"/></svg></span></div>
      <div class="viewport" id="vp">
        <iframe id="app" title="ImpactBridge app" src="app.html"></iframe>
        <div class="home" id="home"><div class="clock" id="clock">9:41</div><div class="date" id="date"></div>
          <button class="appicon" id="launch" type="button"><img src="icon-192.png" alt="">ImpactBridge</button></div>
        <div class="splash" id="splash"><img src="icon-192.png" alt="ImpactBridge"></div>
      </div>
      <div class="nav">
        <button id="back" type="button" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7"/></svg></button>
        <button id="homeb" type="button" aria-label="Home"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/></svg></button>
        <button id="recent" type="button" aria-label="Restart app"><svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>
      </div>
    </div>
  </div>
</div>
<p class="note">Use it like a phone: the arrow goes back, the circle goes to the home screen, the square restarts the app. This is the ImpactBridge app at real phone size.</p>
<script>
// Resolve Claude's runtime here (the page Claude serves) and share it with the app in the frame.
window.IB_CAPS = (async () => {
  for (let i = 0; i < 40 && !window.claude?.use; i++) await new Promise((r) => setTimeout(r, 100));
  if (!window.claude?.use) return null;
  const [db, user, sample, assets] = await Promise.all(["db", "user", "sample", "assets"].map((n) => window.claude.use(n).catch(() => null)));
  if (!db) return null;
  // The app runs in the frame, so its objects belong to another JavaScript realm. Copy every argument into this
  // page's realm before handing it to Claude's runtime, which only accepts plain objects from its own page.
  const c = (v) => (v === undefined ? undefined : structuredClone(v));
  const opt = (o) => (o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "function" ? v : c(v)])) : undefined);
  const wdb = {
    collection: (p) => db.collection(String(p)),
    doc: (p) => {
      const r = db.doc(String(p));
      return { get: () => r.get(), delete: () => r.delete(), onSnapshot: (...a) => r.onSnapshot(...a),
               set: (d, o) => r.set(c(d), opt(o)), update: (d) => r.update(c(d)) };
    },
  };
  const wsample = sample && Object.assign((input, o) => sample(c(input), opt(o)), {
    json: (input, o) => sample.json(c(input), opt(o)), limits: () => sample.limits(),
  });
  const wassets = assets && { upload: (b, o) => assets.upload(c(b), opt(o)), delete: (id) => assets.delete(String(id)), list: () => assets.list() };
  const wuser = user && { id: () => user.id(), isOwner: () => user.isOwner(), canEdit: () => user.canEdit(),
    can: (n) => user.can(String(n)), me: () => user.me(), profiles: (ids) => user.profiles(c(ids)) };
  return { db: wdb, user: wuser, sample: wsample, assets: wassets };
})();
const $ = (id) => document.getElementById(id);
const phone = $("phone"), frame = $("app");
let land = false;
function fit() {
  const [w, h] = $("dev").value.split("x").map(Number);
  const W = land ? h : w, H = land ? w : h;
  const st = $("stage").getBoundingClientRect();
  const k = Math.min(1, (st.height - 24) / (H + 24), (st.width - 8) / (W + 24));
  phone.style.setProperty("--w", w); phone.style.setProperty("--h", h); phone.style.setProperty("--k", Math.max(.35, k).toFixed(3));
  phone.classList.toggle("land", land);
}
function tick() {
  const d = new Date();
  const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/i, "");
  $("time").textContent = t; $("clock").textContent = t;
  $("date").textContent = d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}
function launch() {
  $("home").classList.remove("on"); $("splash").classList.add("on");
  setTimeout(() => $("splash").classList.remove("on"), 700);
}
function restart() { frame.src = "app.html"; launch(); }
$("dev").addEventListener("change", fit);
$("rot").addEventListener("click", () => { land = !land; fit(); });
$("reload").addEventListener("click", restart);
$("recent").addEventListener("click", restart);
$("homeb").addEventListener("click", () => $("home").classList.add("on"));
$("launch").addEventListener("click", launch);
$("back").addEventListener("click", () => {
  if ($("home").classList.contains("on")) return;
  try { frame.contentWindow.history.back(); } catch (e) {}
});
addEventListener("resize", fit);
fit(); tick(); setInterval(tick, 15000); launch();
</script>
"""
(OUT / "index.html").write_text(frame)
print("built", OUT)
