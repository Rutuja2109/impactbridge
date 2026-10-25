"""Build the Claude-hosted bundle into dist/hosted/: one page (inline CSS) + JS module files."""
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
FE = ROOT / "frontend"
OUT = ROOT / "dist" / "hosted"
if OUT.exists():
    shutil.rmtree(OUT)
(OUT / "js").mkdir(parents=True)
for f in (FE / "js").rglob("*.js"):
    dest = OUT / "js" / f.relative_to(FE / "js")
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(f, dest)
css = (FE / "css" / "styles.css").read_text()
page = f"""<title>ImpactBridge</title>
<meta name="description" content="Turn community problems into collective action: community needs matched with Rotary and Rotaract clubs, NGOs, CSR teams and volunteers.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,800&family=Noto+Sans+Devanagari:wght@400;500;700&display=swap">
<style>
{css}
</style>
<script>window.IB_HOSTED = true; window.IB_SHARE_URL = "https://claude.ai/artifact/Mrot9eRKir29ZSdo5KS3D9";</script>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header" id="header"></header>
<div class="drawer" id="drawer" aria-label="Menu"></div>
<main id="main" tabindex="-1"><div class="wrap state"><p>Loading ImpactBridge…</p></div></main>
<footer class="site-footer" id="footer"></footer>
<div class="toasts" id="toasts" role="status" aria-live="polite"></div>
<script type="module" src="js/app.js"></script>
"""
(OUT / "index.html").write_text(page)
files = sorted(str(p.relative_to(OUT)) for p in (OUT / "js").rglob("*.js"))
print("built", OUT, len(files), "js files")
