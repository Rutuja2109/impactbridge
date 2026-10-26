"""Multi-account browser journey for ImpactBridge (Playwright, Python).

Prerequisites: the server running at BASE_URL with staff accounts
admin@test.org and verifier@test.org (password Secure#pass1) - see README "Testing".
    pip install playwright && playwright install chromium
    python tests_ui/ui_journey.py
"""
import io
from PIL import Image
_buf = io.BytesIO(); Image.new("RGB", (64, 48), (46, 140, 100)).save(_buf, "PNG"); PNG = _buf.getvalue()
os_ = __import__("os"); os_.makedirs("screenshots", exist_ok=True)
import asyncio, re, time
from datetime import date, timedelta
from playwright.async_api import async_playwright, expect
import os, sys
BASE=os.environ.get("BASE_URL","http://127.0.0.1:8000"); CH=os.environ.get("CHROME_PATH") or None
U=str(int(time.time()))[-6:]
log=[]
def ok(m): log.append("PASS "+m); print("PASS",m, flush=True)
async def ctx(b, mobile=False):
    c = await b.new_context(viewport={"width":390,"height":844} if mobile else {"width":1280,"height":900}, is_mobile=mobile, has_touch=mobile)
    await c.add_init_script("try{localStorage.setItem('ib-lang','en')}catch(e){}")
    pg = await c.new_page(); errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type=="error" and "TUNNEL" not in m.text and "status of 4" not in m.text else None)
    pg.errs=errs; return pg
async def shot(pg,n): await pg.screenshot(path=f"screenshots/j_{n}.png", full_page=True)
async def to_submit_page(pg):
    for _ in range(4):
        nxt = pg.locator(".wiz-page:not([hidden]) button", has_text=re.compile("^Next"))
        if await nxt.count() == 0: break
        await nxt.first.click()
async def toast(pg, text): await expect(pg.locator(".toast", has_text=text).first).to_be_visible(timeout=8000)

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CH)
    # 1. Community member registers on mobile and shares a need (manual form; AI not configured)
    m = await ctx(b, True)
    await m.goto(BASE+"/"); await m.locator(".tabbar").get_by_role("button", name="More").click()
    await m.locator("#drawer").get_by_role("link", name="Create an account").click()
    await m.get_by_label("Your full name").fill("Sunita Patil"); await m.get_by_label("Email").fill(f"sunita{U}@test.org")
    await m.get_by_label("Password").fill("Secure#pass1"); await m.get_by_role("button", name="Continue").click(); await m.get_by_label("City or town").fill("Pune"); await m.get_by_label("State").select_option("Maharashtra")
    await expect(m.get_by_label("Organization name")).to_be_hidden(); ok("organization box is off by default for a community member")
    await m.get_by_text("registering on behalf").click()
    await m.get_by_label("Organization name").fill(f"Kasarwadi Residents {U}")
    await m.get_by_role("button", name="Create account").click()
    await expect(m.locator(".form-error")).to_contain_text("accept", timeout=5000); ok("terms must be accepted")
    await m.get_by_label(re.compile("I agree")).check(); await m.get_by_role("button", name="Create account").click()
    await expect(m.get_by_role("heading", name="Hello, Sunita")).to_be_visible(timeout=8000); ok("community member registered (mobile) and lands on role dashboard")
    await m.goto(BASE+"/share-a-need")
    await m.get_by_label("What is the problem").fill("The public toilet block near Kasarwadi market has no working water connection, so about 300 women vendors avoid using it all day.")
    await m.get_by_role("button", name="Next: photos and place").click()
    await expect(m.get_by_text("AI drafting isn't configured")).to_have_count(0); ok("no server-setup jargon shown to end users")
    await m.get_by_role("button", name="Next: the proposal").click()
    await expect(m.locator(".form-error")).to_contain_text("at least one real photo"); ok("step 2 blocks Next until a photo is added")
    await m.locator("#photos").set_input_files({"name":"toilet.png","mimeType":"image/png","buffer":PNG})
    await expect(m.locator("#thumbs img")).to_have_count(1, timeout=8000); ok("photo uploaded in need creator")
    await m.get_by_role("button", name="Next: the proposal").click()
    await expect(m.get_by_text("Step 3 of 6")).to_be_visible()
    await m.get_by_label("Project title").fill(f"Water connection for Kasarwadi market toilets {U}")
    await m.get_by_label("Problem statement").fill("The public toilet block near Kasarwadi market has no working water connection. About 300 women vendors avoid using it all day.")
    await m.get_by_role("button", name="Make it more impactful").click()
    await expect(m.locator(".imp7-card")).to_contain_text("Please check every detail"); ok("'Make it more impactful' offers a reviewable rewrite")
    await m.get_by_role("button", name="Use this").click()
    await expect(m.get_by_label(re.compile("The story"))).not_to_have_value(""); ok("accepted story fills the field")
    await m.get_by_label("Cause", exact=True).select_option("water_sanitation")
    await m.get_by_role("button", name="Next: what's needed").click()
    await m.get_by_label("Budget needed").fill("40000"); await m.get_by_label("Volunteers needed").fill("4")
    await m.get_by_label("Expected duration").fill("4")
    await m.get_by_role("button", name="Add material").click(); await m.locator("#mn0").fill("PVC pipe"); await m.locator("#mq0").fill("60"); await m.locator("#mu0").fill("metres")
    await m.locator("#skill-in").fill("Plumbing"); await m.get_by_role("button", name="Add", exact=True).click()
    await m.get_by_role("button", name="Next: plan and safety").click()
    await m.get_by_role("button", name="Add milestone").click(); await m.locator("#ms0").fill("Get ward office permission"); await m.locator("#md0").fill((date.today()+timedelta(days=2)).isoformat())
    await m.get_by_role("button", name="Next: check and submit").click()
    await expect(m.locator("#summary")).to_contain_text("PVC pipe"); ok("wizard summary shows what was entered")
    await m.get_by_role("button", name="Submit for review").click()
    await expect(m.locator(".status")).to_contain_text("Submitted for review", timeout=8000); ok("need saved and submitted for review")
    pid = m.url.split("/projects/")[1].split("#")[0]
    await shot(m,"1_submitted_mobile")
    # anonymous can't see it
    a = await ctx(b); await a.goto(BASE+f"/projects/{pid}")
    await expect(a.get_by_text("Create a free account to see this need")).to_be_visible(); ok("signed-out visitors are asked to create an account first")

    # 2. Verifier asks for info, then approves
    v = await ctx(b)
    await v.goto(BASE+"/login"); await v.get_by_label("Email").fill("verifier@test.org"); await v.get_by_label("Password").fill("Secure#pass1"); await v.get_by_role("button", name="Sign in").click()
    await expect(v.get_by_role("heading", name="Hello, Vik")).to_be_visible(timeout=8000)
    await v.goto(BASE+"/admin"); card = v.locator("article.panel", has_text=f"Kasarwadi market toilets {U}")
    await card.get_by_role("button", name="Ask for information").click()
    await v.get_by_role("button", name="Confirm").click(); await expect(v.locator("dialog .form-error")).to_be_visible(); ok("reviewer must give notes when asking for information")
    await v.get_by_label("Notes for the owner").fill("Please add the market committee contact."); await v.get_by_role("button", name="Confirm").click(); await toast(v,"Decision saved")
    await m.goto(BASE+f"/projects/{pid}"); await expect(m.get_by_text("Reviewers asked for more information")).to_be_visible(); ok("owner sees reviewer request")
    await m.get_by_role("link", name="Edit proposal").click()
    await m.get_by_label("Exact location or landmark").fill("Market committee: contact via ward office")
    await to_submit_page(m); await m.get_by_role("button", name="Submit for review").click(); await expect(m.locator(".status")).to_contain_text("Submitted", timeout=8000)
    await v.goto(BASE+"/admin"); await v.locator("article.panel", has_text=f"toilets {U}").get_by_role("button", name="Approve").click()
    await v.get_by_role("button", name="Confirm").click(); await toast(v,"Decision saved"); ok("reviewer approved after resubmission")

    # 3. Owner publishes
    await m.goto(BASE+f"/projects/{pid}"); await m.get_by_role("button", name="Publish project").click(); await toast(m,"Published")
    await m.goto(BASE+f"/explore?q=Kasarwadi+{U}"); await expect(m.locator(".pcard", has_text=U)).to_have_count(1, timeout=8000); ok("published project is searchable publicly")
    await shot(m,"2_explore")

    # 4. Club registers, matches resources, offers support
    c = await ctx(b)
    await c.goto(BASE+"/register"); await c.get_by_label(re.compile("Rotary or Rotaract")).check()
    await c.get_by_label("Your full name").fill("Rahul Deshmukh"); await c.get_by_label("Email").fill(f"rahul{U}@test.org"); await c.get_by_label("Password").fill("Secure#pass1"); await c.get_by_role("button", name="Continue").click()
    await c.get_by_label("City or town").fill("Pune"); await c.get_by_label("Organization name").fill(f"Rotaract Club of Pimpri {U}"); await c.get_by_label("Type").select_option("rotaract")
    await c.get_by_label(re.compile("I agree")).check(); await c.get_by_role("button", name="Create account").click()
    await expect(c.get_by_role("heading", name="Hello, Rahul")).to_be_visible(timeout=8000)
    await c.get_by_role("link", name="Match my resources").first.click()
    await c.get_by_label("Budget available").fill("25000"); await c.get_by_label("Volunteers available").fill("4"); await c.get_by_label("Skills").fill("plumbing")
    await c.get_by_label("City", exact=True).fill("Pune"); await c.get_by_label("How far can you work?").select_option("city")
    await c.get_by_role("button", name="Find matching projects").click()
    mcard = c.locator("article.panel", has_text=f"toilets {U}")
    await expect(mcard).to_contain_text("62%", timeout=8000); await expect(mcard).to_contain_text("₹15,000 in funding"); ok("match explains coverage and missing resources")
    await expect(c.get_by_text("ruled out")).to_be_visible(); ok("infeasible projects listed as ruled out with reasons")
    await shot(c,"3_match")
    await mcard.get_by_role("link", name="Offer support").click()
    await c.get_by_label("What are you offering?").select_option("money"); await c.get_by_label("On behalf of").select_option(label=f"Rotaract Club of Pimpri {U}")
    await c.get_by_label(re.compile("Amount")).fill("25000"); await c.get_by_role("button", name="Send offer").click(); await toast(c,"Offer sent")
    await c.get_by_label("What are you offering?").select_option("volunteers"); await c.get_by_label("Number of volunteers").fill("4"); await c.get_by_label("Hours per volunteer").fill("6")
    await c.get_by_role("button", name="Send offer").click(); await toast(c,"Offer sent"); ok("club offered funding and volunteers")

    # 5. Owner sees notification, accepts funding, asks changes for volunteers
    await m.reload(); await expect(m.locator(".tabbar .dot")).to_be_visible(); ok("owner gets notification badge in the tab bar")
    await m.goto(BASE+"/dashboard"); await expect(m.get_by_text("Offers waiting for your answer")).to_be_visible()
    await m.goto(BASE+f"/projects/{pid}#support")
    fund = m.locator(".commit", has_text="Funding"); await fund.get_by_role("button", name="Accept").click(); await toast(m,"Offer accepted")
    vol = m.locator(".commit", has_text="Volunteers"); await vol.get_by_role("button", name="Ask for changes").click()
    await m.get_by_label("Message", exact=True).fill("Can two of them come on Sunday?"); await m.locator("dialog").get_by_role("button", name="Ask for changes").click(); await toast(m,"Changes requested")
    await m.get_by_role("tab", name="Resources").click()
    await expect(m.locator("table.ledger tr", has_text="Funding")).to_contain_text("₹25,000"); ok("pledged funding total updates after acceptance")
    # club revises
    await c.goto(BASE+f"/projects/{pid}#support"); await c.get_by_role("button", name="Update your offer").click()
    await c.get_by_label("Message", exact=True).fill("Yes, Sunday works."); await c.get_by_role("button", name="Send updated offer").click(); await toast(c,"Updated offer sent")
    await m.goto(BASE+f"/projects/{pid}#support"); await m.locator(".commit", has_text="Volunteers").get_by_role("button", name="Accept").click(); await toast(m,"Offer accepted"); ok("change request, revision and acceptance round-trip")
    # club cancels funding -> totals drop
    await c.goto(BASE+f"/projects/{pid}#support"); await c.locator(".commit", has_text="Funding").get_by_role("button", name="Cancel commitment").click()
    await c.get_by_label("Message", exact=True).fill("Re-pledging next month after board approval"); await c.locator("dialog").get_by_role("button", name="Cancel this commitment").click(); await toast(c,"Commitment cancelled")
    await c.get_by_role("tab", name="Resources").click(); await expect(c.locator("table.ledger tr", has_text="Funding")).to_contain_text("₹0"); ok("cancelling a commitment reduces pledged totals")
    await c.get_by_role("tab", name="Support").click()
    await c.get_by_label("What are you offering?").select_option("money"); await c.get_by_label(re.compile("Amount")).fill("40000"); await c.get_by_role("button", name="Send offer").click(); await toast(c,"Offer sent")
    await m.goto(BASE+f"/projects/{pid}#support"); await m.locator(".commit", has_text="Awaiting response").get_by_role("button", name="Accept").click(); await toast(m,"Offer accepted")

    # 6. Execution: start, record receipt, milestone, update, impact report, complete
    await m.get_by_role("button", name="Mark as started").click(); await toast(m,"Marked as started")
    await m.locator(".commit", has_text="₹40,000").get_by_role("button", name="Record receipt or spending").click()
    await m.get_by_label(re.compile("Received so far")).fill("40000"); await m.get_by_label(re.compile("Spent so far")).fill("38500"); await m.get_by_role("button", name="Save").click(); await toast(m,"Saved")
    await m.get_by_role("tab", name="Plan & progress").click(); await m.get_by_role("button", name="Start").click(); await toast(m,"Milestone updated")
    await m.get_by_role("button", name="Mark done").click(); await toast(m,"Milestone updated"); ok("milestone progressed to done")
    await m.get_by_role("tab", name="Updates").click(); await m.get_by_label("Title").fill("Pipes laid"); await m.get_by_label("What happened?").fill("Plumbers from the club laid 60 m of pipe on Sunday.")
    await m.get_by_role("button", name="Post update").click(); await toast(m,"Update posted")
    await m.get_by_role("button", name="Mark as completed").click(); await toast(m,"impact report first"); ok("completion blocked until impact report exists")
    await m.get_by_label("People reached").fill("300"); await m.get_by_label("Volunteer hours").fill("24")
    await m.get_by_label("Summary of what was done").fill("Water connection installed; toilets usable from 1 Nov.")
    await m.get_by_role("button", name="Submit report").click(); await toast(m,"Impact report saved")
    await m.get_by_role("button", name="Mark as completed").click(); await toast(m,"Marked completed")
    await shot(m,"4_completed_mobile")

    # 7. Verifier verifies completion with lower verified count
    await v.goto(BASE+"/admin#verifications"); vc = v.locator("article.panel", has_text="Project completion")
    await vc.get_by_role("button", name="Approve").click()
    await v.get_by_label(re.compile("How did you check")).fill("Visited market 2 Nov; spoke to committee.")
    await v.get_by_label("People reached (verified)").fill("250"); await v.get_by_role("button", name="Confirm decision").click(); await toast(v,"Decision recorded")
    await m.goto(BASE+f"/projects/{pid}#impact")
    await expect(m.locator(".badge.verified", has_text="Completion verified")).to_be_visible(); await expect(m.locator(".status")).to_have_text("Completed")
    row = m.locator("tr", has_text="People reached"); await expect(row).to_contain_text("300"); await expect(row).to_contain_text("250")
    await expect(m.locator("tr", has_text="Volunteers involved")).to_contain_text("Not checked"); ok("public sees reported (300) vs verified (250); unchecked figures say 'Not checked'")
    await shot(m,"5_impact")
    # 8. Unauthorized: club cannot reach admin; stranger cannot see team action
    await c.goto(BASE+"/admin"); await expect(c.get_by_text("Reviewers only")).to_be_visible(); ok("non-reviewer blocked from admin UI")
    await a.goto(BASE+"/dashboard"); await expect(a).to_have_url(re.compile("/login")); ok("anonymous user redirected to sign in")
    await a.goto(BASE+"/"); await expect(a.locator(".stats5")).to_be_visible(); ok("home shows real impact figures once data exists")
    # 9. Redesign features
    await m.goto(BASE+f"/projects/{pid}"); await expect(m.locator(".journey li.done")).to_have_count(7); ok("journey tracker shows all 7 steps done on a verified project")
    await expect(m.locator(".ph5-share-row a.wa")).to_have_attribute("href", re.compile("wa.me")); ok("WhatsApp share link present")
    await m.get_by_role("tab", name="Proof & updates").click()
    await expect(m.locator(".proof li", has_text="Completion independently verified")).to_be_visible()
    await expect(m.locator(".proof li", has_text="Milestone completed")).to_be_visible()
    await expect(m.locator(".proof li", has_text="Rahul committed")).to_have_count(2); ok("proof timeline lists pledges, milestones, verification (individuals by first name)")
    await shot(a,"6_home")
    import json as _j
    demo = [x for x in _j.loads(await (await c.request.get(BASE+"/api/projects")).text())["projects"] if x["is_demo"] and x["materials"]][0]
    await c.goto(BASE+f"/projects/{demo['id']}")
    await c.locator(".need", has_text=demo["materials"][0]["name"]).get_by_role("button", name="I can give this").click()
    await expect(c.get_by_label("What are you offering?")).to_have_value("materials")
    await expect(c.get_by_label("Item or skill")).to_have_value(demo["materials"][0]["name"])
    await expect(c.get_by_label("Quantity")).to_have_value(re.compile(r"\d")); ok("'I can give this' prefills the offer form with item and remaining quantity")
    mm = m; await mm.goto(BASE+f"/projects/{demo['id']}")
    await expect(mm.locator(".sticky-cta")).to_be_visible(); ok("sticky support bar on mobile")
    await shot(mm,"7_project_mobile"); await shot(c,"8_project_desktop")
    await mm.goto(BASE+"/explore"); await expect(mm.locator(".sticky-cta")).to_have_count(0); ok("sticky bar removed after navigating away")
    for pg,n in ((m,"mobile owner"),(v,"verifier"),(c,"club"),(a,"anon")):
        print(n, "page errors:", pg.errs[:5])
    await b.close()
asyncio.run(main())
