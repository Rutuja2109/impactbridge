# ImpactBridge

**Turn community problems into collective action.**

ImpactBridge connects real community needs with Rotary and Rotaract clubs, NGOs, CSR teams and individual
volunteers: *share a need → AI structures it → verify → match resources → collaborate → track → measure impact.*

---

## Quick start

Requires Python 3.11+. No Node build step — the frontend is plain JavaScript modules served by the backend.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                     # then edit: at least ADMIN_EMAIL / ADMIN_PASSWORD
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000. The administrator from `.env` is created on first start.

Optional, clearly-labelled sample data (four demo projects, demo accounts with a printed password):

```bash
python -m app.cli seed-demo      # remove later with: python -m app.cli remove-demo
```

Other admin commands:

```bash
python -m app.cli create-admin you@example.org "Your Name"   # prompts for password
python -m app.cli set-role person@example.org verifier       # admin | verifier | submitter | club | csr | ngo | volunteer
```

Verifiers can also be appointed in the app: **Review → Users**.

## Configuration and integrations

All external services are optional. When one isn't configured the app says so in the interface and keeps working.

| Feature | Needs | Without it |
|---|---|---|
| AI drafting of community needs (text + photos) | `ANTHROPIC_API_KEY` (default model `claude-sonnet-5-5`), **or** `GEMINI_API_KEY`, **or** `OPENAI_API_KEY` | People fill in the proposal form themselves; the original description is still stored |
| Voice notes → text | `OPENAI_API_KEY` (Whisper) | Browser dictation (Chrome/Edge/Safari) still works with no key |
| Semantic ("search by meaning") search | `OPENAI_API_KEY` or `GEMINI_API_KEY` (embeddings) | Keyword search |
| Email notifications | `RESEND_API_KEY`, `EMAIL_FROM` | In-app notifications only |
| Online payments | **Not implemented** | Money pledges are recorded commitments; funds move outside the platform |

Model names are configurable (`ANTHROPIC_MODEL`, `GEMINI_MODEL`, `OPENAI_MODEL`, …) in `.env`.

## What's in the app

**Roles:** community organization / need submitter, Rotary/Rotaract club, corporate CSR team, NGO, individual
volunteer (self-registration), plus verifier and administrator (appointed only). Users can belong to
organizations as owner, admin or member.

**Need creator** (`/share-a-need`): describe the problem by typing, browser dictation or a recorded voice note; attach
up to 4 photos (GPS/EXIF metadata is stripped). AI turns it into an editable proposal (title, problem, solution,
beneficiaries, location, cause, budget, volunteers, materials, skills, time, duration, milestones, outcome measures,
missing information and follow-up questions). Server-side guardrails remove any number the person didn't state
(budgets, beneficiary counts, volunteer counts, quantities, targets) and turn it into a question instead. The original
text is preserved and can't be overwritten; AI-filled fields are highlighted and the owner must confirm they reviewed
the draft.

**Statuses:** draft → submitted → needs information / approved / rejected → published → in progress → completed →
verified. Each transition is permission-checked on the server (owner vs reviewer; reviewers can't review their own work).

**Explore** (`/explore`): keyword or semantic search; filters for cause, city, region, budget range, volunteer range,
max duration, availability dates, skill, material, verification, open needs, stage; sort; pagination; demo toggle.

**Find projects for my resources** (`/match`): stage 1 rules out infeasible projects (no overlap with remaining
needs, outside location scope, dates don't overlap, single-supporter projects the offer can't fully cover, partnering
preference). Stage 2 ranks with a transparent score (cause 25%, resource coverage 35%, location 20%, timing 10%,
collaboration 10%), shows each component, the reasons, and what would still be missing. Ruled-out projects are listed
with reasons.

**Collaboration:** supporters offer funding, volunteers (+hours), materials, equipment or skills, personally or for
their organization. Owners accept, decline (with reason) or request changes; supporters revise or withdraw; either side
can cancel an accepted commitment (with reason). Owners record received and spent amounts (validated: received ≤
pledged, spent ≤ received), responsibilities and deadlines. Single-supporter projects are enforced. All totals are
recomputed from records, so they stay correct when commitments change.

**Project page:** problem, solution, photos, location (exact location hidden from the public for projects involving
children or vulnerable people), verification badges, resource ledger distinguishing **requested / offers pending /
pledged / received / spent / reported / verified**, participants, milestones, completion checklist, outcome measures
(target / reported / verified), updates with evidence, impact report, and full history.

**Trust & administration** (`/admin`): review queue; separate verification for organization identity, project need,
financial information and project completion (documents are reviewer-only); reports with safeguarding reports
prioritised; rule-based signals for suspicious requests (multiple reports, new account + large budget, duplicate
titles, burst submissions, very high budget per beneficiary); hiding content and suspending accounts (admins only);
user/role management; audit log. Completion verification records reviewer-confirmed figures separately — anything not
independently checked shows as "Not checked", never as the reported value.

**Dashboards & notifications:** role-specific dashboard (projects you manage, offers awaiting response, your
commitments, next-30-day milestones and deadlines incl. overdue, resource gaps, completed work, organizations,
reviewer queue counts). In-app notifications for review decisions, support offers, commitment changes, deadlines
(hourly sweep, deduplicated), milestones and updates; optional email via Resend.

**Proof & trust-first design (v2):** every project shows a 7-step journey tracker, a dated proof timeline (pledges, deliveries, milestones, updates, reviewer checks), "what's needed" cards with one-tap "I can give this", freshness on every card ("quiet for 45 days" warnings), WhatsApp/LinkedIn/copy-link sharing and a sticky support bar on phones. The home page has a live feed of real events and four plain promises (no sales calls, we never hold money, checkable totals, human-verified results). Individuals appear by first name only on public surfaces. Email notifications are opt-in.

**Impact:** platform figures on the home page are computed from records, exclude demo data, and appear only once real
data exists, split into reported vs verified.

**Security & privacy:** scrypt password hashing; JWT in an httpOnly SameSite=Strict cookie (Bearer tokens also accepted
for a future mobile app); JSON-only mutations (CSRF protection); login throttling; server-side validation of every
input; file type detection by content, size limits, random storage names, permission-checked downloads; CSP and
security headers; email/phone/registration numbers never exposed publicly.

**SEO & performance:** server-rendered title/description per project page, `sitemap.xml`, `robots.txt`, gzip,
lazy-loaded images, route-level code splitting.

## Architecture

```
backend/app/
  main.py            app, middleware, SPA + SEO routes
  config.py db.py    settings (.env), SQLite data layer (WAL)
  security.py        hashing, JWT, roles, throttling
  models.py          request validation (Pydantic)
  domain.py          causes, statuses, transition rules
  routes/            auth, orgs, projects, commitments, files_ai, trust (verification/reports/admin), misc
  services/          ai (providers + anti-fabrication guard), matching, resources (ledger), projects, storage, notify
  cli.py seed.py     admin commands, demo data
  tests/             API journey tests
frontend/            index.html, css/styles.css, js/core.js, js/app.js (router), js/views/*
tests_ui/            browser journey test (Playwright)
```

The API is JSON over `/api/*` and works with Bearer tokens, so a mobile app can use it directly. SQL is confined to
`db.py` and the route/service modules; moving to PostgreSQL is a contained change if you outgrow SQLite.

## Testing

API journeys (34 tests, separate accounts per role, fresh database):

```bash
cd backend && pip install httpx && python -m unittest discover -s tests -v
```

Browser journey (30 checks, four accounts, mobile + desktop viewports). Start the server, create staff accounts
`admin@test.org` and `verifier@test.org` with password `Secure#pass1` (e.g. `create-admin`, then `set-role … verifier`),
then:

```bash
pip install playwright && playwright install chromium
python tests_ui/ui_journey.py
```

## What's in v5

- **Languages:** English, Hindi and Marathi (`frontend/js/i18n.js`, tables in `frontend/js/i18n/`). Interface text is
  translated; what people type is never translated. Voice input and AI drafting work in all three languages.
- **App shell:** bottom tab bar on phones, dark mode, pull to refresh in the installed app, step-by-step need form with
  an autosaved draft, AI budget *estimate* shown as a labelled suggestion (never filled in automatically).
- **Accounts:** sign in with a mobile number and SMS code (MSG91 or Twilio), forgot password, email verification
  (enforced for submitting and pledging once email is configured), account deletion.
- **Safety:** block users, terms of use page, crash reports (no personal data) in Review → App errors.
- **Coordination:** "I'm interested", per-project chat, recommendations, effort filter, push notifications (VAPID).
- **Impact:** final impact report page `/projects/:id/report`, sponsor certificates `/certificates/:id` with image download.

## Android app (Google Play)

The site is an installable PWA (`frontend/manifest.webmanifest`, `frontend/sw.js`) and is packaged for Play as a
Trusted Web Activity with PWABuilder. `/.well-known/assetlinks.json` is generated from `ANDROID_PACKAGE_NAME` and
`ANDROID_CERT_SHA256`. Play requirements covered: privacy policy (`/privacy`), in-app account deletion
(Profile → Delete my account, `POST /api/auth/delete-account`) and a public deletion page (`/delete-account`).
Listing graphics are in `store/`.

## Deploying

Docker: `docker build -t impactbridge . && docker run -p 8000:8000 -v ibdata:/data -e JWT_SECRET=... -e PUBLIC_URL=... impactbridge`.
Render: New → Blueprint uses `render.yaml` (Starter plan with a persistent disk).


Set `APP_ENV=production`, a strong `JWT_SECRET`, `PUBLIC_URL`, run behind HTTPS (cookies become `Secure`), e.g.
`uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1` behind nginx/Caddy. Back up `backend/data/`
(database + uploads). SQLite with one worker comfortably serves a pilot; use PostgreSQL and object storage for scale.
