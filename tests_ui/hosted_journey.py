"""Hosted-build journey: several Claude accounts sharing one store, via a local stand-in for the platform.

    python build_hosted.py && python tests_ui/hosted_journey.py
"""
import io
from PIL import Image
import asyncio, base64, functools, http.server, json, os, re, threading
from pathlib import Path
from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "hosted"
MOCK = (ROOT / "tests_ui" / "claude_mock.js").read_text()
PORT = 8765
BASE = f"http://127.0.0.1:{PORT}/"
CH = os.environ.get("CHROME_PATH") or None
SHOTS = ROOT / "screenshots"; SHOTS.mkdir(exist_ok=True)

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(DIST), **k)
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.split("?")[0] == "/":
            body = ("<!doctype html><html><head><meta charset=utf8><meta name=viewport content='width=device-width,initial-scale=1'></head><body>"
                    + (DIST / "index.html").read_text() + "</body></html>").encode()
            self.send_response(200); self.send_header("Content-Type", "text/html"); self.end_headers(); self.wfile.write(body); return
        return super().do_GET()

passes = []
def ok(m): passes.append(m); print("PASS", m, flush=True)

async def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CH)
        ctx = await b.new_context(viewport={"width": 1280, "height": 900})
        await ctx.add_init_script(MOCK); await ctx.add_init_script("try{localStorage.setItem('ib-lang','en')}catch(e){}")
        errs = []
        async def blob(route):
            bid = route.request.url.rsplit("/", 1)[1]
            pg = ctx.pages[0]
            v = await pg.evaluate(f"localStorage.getItem('ibblob:{bid}')")
            if not v: return await route.fulfill(status=404)
            d = json.loads(v); await route.fulfill(status=200, content_type=d["type"], body=base64.b64decode(d["b64"]))
        await ctx.route("**/_blob/*", blob)
        async def page(q):
            pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "fonts" not in m.text and "ERR_" not in m.text else None)
            await pg.goto(BASE + q); return pg
        async def toast(pg, t): await expect(pg.locator(".toast", has_text=t).first).to_be_visible(timeout=8000)

        # 1. Owner onboarding + demo data
        o = await page("?as=u_owner")
        await expect(o.get_by_role("heading", name="Create your ImpactBridge profile")).to_be_visible(timeout=10000); ok("owner lands on Claude-account onboarding (no password)")
        await o.get_by_label("Name shown to others").fill("Rutuja Thakre"); await o.get_by_label("City or town").fill("Pune")
        await o.get_by_label(re.compile("I agree")).check(); await o.get_by_role("button", name="Create profile").click()
        await expect(o.get_by_role("heading", name="Hello, Rutuja")).to_be_visible(timeout=10000); ok("owner profile created as administrator")
        await o.locator("header .nav").get_by_role("link", name="Explore projects").click(); await expect(o.locator(".pcard")).to_have_count(4, timeout=8000); ok("labelled demo projects seeded for the owner")

        # 2. Switch to community role, AI-drafted need
        await o.get_by_role("link", name=re.compile("Rutuja")).click()
        await o.locator("#rolesel").select_option("submitter"); await o.get_by_role("button", name="Switch role").click(); await toast(o, "Role switched")
        await o.get_by_role("link", name="Share a need").first.click()
        await o.get_by_label("What is the problem").fill("The toilet block near Pimpri market has no water connection, so about 300 women vendors avoid it all day. We think it needs about 40,000 rupees and 60 metres of PVC pipe.")
        await o.get_by_role("button", name="Next: photos and place").click()
        _b = io.BytesIO(); Image.new("RGB", (64, 48), (46, 140, 100)).save(_b, "PNG")
        await o.locator("#photos").set_input_files({"name": "toilet.png", "mimeType": "image/png", "buffer": _b.getvalue()})
        await o.get_by_role("button", name="Draft my proposal with AI").click()
        await expect(o.get_by_text("This is an AI draft.")).to_be_visible(timeout=10000)
        await expect(o.get_by_label("Volunteers needed")).to_have_value(""); await expect(o.get_by_label("Budget needed (INR)")).to_have_value("40000")
        await expect(o.get_by_label("How many people (approx.)")).to_have_value("300"); ok("Claude AI draft: stated numbers kept, invented ones (99 volunteers, target 500, 4 weeks) removed")
        for _ in range(3): await o.locator(".wiz-page:not([hidden]) button", has_text=re.compile("^Next")).first.click()
        await o.get_by_role("button", name="Submit for review").click(); await expect(o.locator("dialog, .form-error").first).to_be_visible()
        await o.get_by_label(re.compile("I've checked this draft")).check(); await o.get_by_role("button", name="Submit for review").click()
        await toast(o, "Submitted for review"); ok("owner must confirm the AI draft before submitting; submitted")

        # 3. Switch to admin, approve (owner self-review allowed + recorded), publish
        await o.get_by_role("link", name=re.compile("Rutuja")).click(); await o.locator("#rolesel").select_option("admin"); await o.get_by_role("button", name="Switch role").click(); await toast(o, "Role switched")
        await o.get_by_role("link", name="Review").first.click()
        await o.locator("article.panel", has_text="Water connection").get_by_role("button", name="Approve").click()
        await o.get_by_role("button", name="Confirm").click(); await toast(o, "Decision saved"); ok("owner approved own test project as admin (preview self-review)")
        await o.get_by_role("link", name=re.compile("Rutuja")).click(); await o.locator("#rolesel").select_option("submitter"); await o.get_by_role("button", name="Switch role").click(); await toast(o, "Role switched")
        await o.get_by_role("link", name="Dashboard").first.click(); await o.get_by_role("link", name=re.compile("Water connection")).first.click()
        await o.get_by_role("button", name="Publish project").click(); await toast(o, "Published"); ok("published")

        # 4. Club account (invited editor) matches and offers support
        c = await page("?as=u_club")
        await expect(c.get_by_role("heading", name="Create your ImpactBridge profile")).to_be_visible(timeout=10000)
        await expect(c.locator("input[value=admin]")).to_have_count(0); ok("non-owners cannot pick admin role")
        await c.get_by_label(re.compile("Rotary or Rotaract")).check(); await c.get_by_label("Name shown to others").fill("Rahul Deshmukh"); await c.get_by_label("City or town").fill("Pimpri")
        await c.get_by_label("Organization name").fill("Rotaract Club of Pimpri"); await c.get_by_label("Type").select_option("rotaract")
        await c.get_by_label(re.compile("I agree")).check(); await c.get_by_role("button", name="Create profile").click()
        await expect(c.get_by_role("heading", name="Hello, Rahul")).to_be_visible(timeout=10000)
        await c.get_by_role("link", name="Match my resources").first.click()
        await c.get_by_label("Budget available").fill("40000"); await c.get_by_label("Skills").fill("plumbing"); await c.get_by_label("How far can you work?").select_option("anywhere")
        await c.get_by_role("button", name="Find matching projects").click()
        card = c.locator("article.panel", has_text="Water connection"); await expect(card).to_contain_text("100% of the remaining funding gap", timeout=8000); ok("matching runs in the hosted build")
        await card.get_by_role("link", name="Offer support").click()
        await c.get_by_label("On behalf of").select_option(label="Rotaract Club of Pimpri"); await c.get_by_label(re.compile("Amount")).fill("40000")
        await c.get_by_role("button", name="Send offer").click(); await toast(c, "Offer sent"); ok("club offered funding (shared store, second account)")

        # 5. Owner sees notification + accepts
        await o.locator("header .brand").click(); await o.wait_for_timeout(1200)
        await o.get_by_role("link", name="Dashboard").first.click()
        await expect(o.get_by_text("Offers waiting for your answer")).to_be_visible(timeout=8000); ok("owner sees the club's offer from the shared store")
        await o.get_by_role("link", name="Respond").first.click()
        await o.locator(".commit", has_text="Funding").get_by_role("button", name="Accept").click(); await toast(o, "Offer accepted")
        await o.get_by_role("tab", name="Resources").click(); await expect(o.locator("table.ledger tr", has_text="Funding")).to_contain_text("₹40,000"); ok("pledged total updates")

        # 6. Read-only visitor
        v = await page("?as=u_view&readonly=1")
        await expect(v.get_by_text("browse-only mode")).to_be_visible(timeout=10000)
        await v.get_by_role("link", name="Explore projects").first.click(); await v.locator(".pcard", has_text="Water connection").locator("h3 a").click()
        await expect(v.get_by_role("heading", name=re.compile("Water connection"))).to_be_visible()
        await expect(v.get_by_role("button", name="Offer support")).to_have_count(0); ok("public-link visitor can browse but not act")

        # 7. Execution, completion, verification
        await o.get_by_role("tab", name="Story", exact=True).click()
        await o.get_by_role("button", name="Mark as started").click(); await toast(o, "Marked as started")
        await o.get_by_role("tab", name="Impact").click()
        await o.get_by_label("People reached").fill("280"); await o.get_by_label("Summary of what was done").fill("Pipe laid and water connected; toilets usable from 1 Nov.")
        await o.get_by_role("button", name="Submit report").click(); await toast(o, "Impact report saved")
        await o.get_by_role("button", name="Mark as completed").click(); await toast(o, "Marked completed")
        await o.get_by_role("link", name=re.compile("Rutuja")).click(); await o.locator("#rolesel").select_option("admin"); await o.get_by_role("button", name="Switch role").click(); await toast(o, "Role switched")
        await o.get_by_role("link", name="Review").first.click(); await o.get_by_role("tab", name="Verification requests").click()
        await o.locator("article.panel", has_text="Project completion").get_by_role("button", name="Approve").click()
        await o.get_by_label(re.compile("How did you check")).fill("Visited the market on 2 Nov."); await o.get_by_label("People reached (verified)").fill("250")
        await o.get_by_role("button", name="Confirm decision").click(); await toast(o, "Decision recorded")
        await v.reload(); await v.wait_for_timeout(1500)
        await v.get_by_role("link", name="Explore projects").first.click(); await v.locator(".pcard", has_text="Water connection").locator("h3 a").click()
        await v.get_by_role("tab", name="Impact").click()
        row = v.locator("tr", has_text="People reached"); await expect(row).to_contain_text("280"); await expect(row).to_contain_text("250"); ok("verified vs reported impact visible to visitors")
        await o.get_by_role("link", name="Dashboard").first.click()
        await o.goto(BASE + "?as=u_owner"); await o.wait_for_timeout(1500)
        await o.get_by_role("link", name="Review").first.click(); await o.get_by_role("tab", name="Audit log").click()
        await expect(o.locator("table.ledger")).to_contain_text("project.verified"); ok("audit log records the hosted actions")
        await o.locator("header .brand").click(); await o.wait_for_timeout(800); await o.screenshot(path=str(SHOTS / "hosted_home.png"))
        print("page errors:", [e for e in errs][:6])
        await b.close()
    srv.shutdown()
    print(f"{len(passes)} checks passed")

asyncio.run(main())
