"""Build the production web app: bundle and minify the scripts and styles so phones load a few small files.

    python build_web.py            # writes frontend-dist/

Needs esbuild (`npm install -g esbuild`, or set ESBUILD=/path/to/esbuild). The server uses frontend-dist/ when
FRONTEND_DIR points at it (the Dockerfile does this); in development it serves frontend/ directly, unbundled.
"""
import json, os, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC, OUT = ROOT / "frontend", ROOT / "frontend-dist"


def esbuild() -> list[str]:
    if os.environ.get("ESBUILD"):
        return [os.environ["ESBUILD"]]
    for cand in ("esbuild", "/opt/npm-tools/node_modules/esbuild/bin/esbuild"):
        if shutil.which(cand) or Path(cand).exists():
            return [cand]
    return ["npx", "--yes", "esbuild@0.24.2"]


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    # Everything except the scripts and styles is copied as is (images, manifest, fonts, index.html, sw.js).
    shutil.copytree(SRC, OUT, ignore=shutil.ignore_patterns("js", "css"))
    (OUT / "css").mkdir()
    eb = esbuild()
    subprocess.run(eb + [str(SRC / "js" / "app.js"), "--bundle", "--splitting", "--format=esm", "--minify",
                         "--target=es2020", "--charset=utf8", f"--outdir={OUT / 'js'}", "--entry-names=[name]",
                         "--chunk-names=chunks/[name]-[hash]", "--log-level=warning"], check=True)
    subprocess.run(eb + [str(SRC / "css" / "styles.css"), "--minify", "--loader:.css=css",
                         f"--outfile={OUT / 'css' / 'styles.css'}", "--log-level=warning"], check=True)

    # Service worker: precache the files that now exist.
    files = sorted("/static/" + p.relative_to(OUT).as_posix() for p in OUT.rglob("*")
                   if p.is_file() and p.suffix in {".js", ".css"} and p.name != "sw.js"
                   and not re.match(r"(server|demo|logic|store|hi|mr|admin)-", p.name))  # fetched only when needed
    shell = ["/", "/offline", "/static/img/icons/icon-192.png", "/static/img/icon.svg", *files]
    sw = (SRC / "sw.js").read_text()
    sw = re.sub(r"const SHELL = \[.*?\];", "const SHELL = " + json.dumps(shell) + ";", sw, count=1, flags=re.S)
    (OUT / "sw.js").write_text(sw)

    size = sum(p.stat().st_size for p in (OUT / "js").rglob("*.js"))
    src_size = sum(p.stat().st_size for p in (SRC / "js").rglob("*.js"))
    print(f"built {OUT.relative_to(ROOT)}: {len(files)} script/style files, "
          f"scripts {src_size // 1024} KB -> {size // 1024} KB")


if __name__ == "__main__":
    sys.exit(main())
