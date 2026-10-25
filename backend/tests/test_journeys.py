"""End-to-end API journeys across separate accounts and roles.

Run from backend/:  python -m unittest discover -s tests -v
"""
from __future__ import annotations

import io
import json
import os
import shutil
import tempfile
import unittest
from datetime import date, timedelta

TMP = tempfile.mkdtemp(prefix="ib-test-")
os.environ["DATA_DIR"] = TMP
os.environ["REQUIRE_PROJECT_PHOTO"] = "0"  # most journeys skip photos; one test turns the rule on
os.environ.pop("ANTHROPIC_API_KEY", None)
os.environ.pop("OPENAI_API_KEY", None)
os.environ.pop("GEMINI_API_KEY", None)

from starlette.testclient import TestClient  # noqa: E402

from app import config, db  # noqa: E402
from app.main import create_app  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.services import ai  # noqa: E402
from app.services.notify import sweep_deadlines  # noqa: E402

PNG = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
       b"\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03\x01\x01\x00\xc9\xfe\x92\xef\x00\x00\x00\x00IEND\xaeB`\x82")
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


def fresh_db(name: str) -> None:
    os.environ["DATA_DIR"] = os.path.join(TMP, name)
    config.reload_settings()
    db.reset_connection()
    db.init_db()


class Api:
    """A logged-in (or anonymous) user with their own client and token."""

    def __init__(self, app, token: str | None = None, user: dict | None = None):
        self.c = TestClient(app)
        self.token = token
        self.user = user

    def _h(self):
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    def get(self, url, **kw):
        return self.c.get(url, headers=self._h(), **kw)

    def post(self, url, body=None):
        return self.c.post(url, json=body or {}, headers=self._h())

    def put(self, url, body):
        return self.c.put(url, json=body, headers=self._h())

    def patch(self, url, body):
        return self.c.patch(url, json=body, headers=self._h())

    def delete(self, url):
        return self.c.delete(url, headers=self._h())

    def upload(self, data: bytes, name: str, **fields):
        return self.c.post("/api/files", files={"file": (name, data)}, data={k: str(v) for k, v in fields.items()},
                           headers=self._h())


class Base(unittest.TestCase):
    db_name = "base"

    @classmethod
    def setUpClass(cls):
        fresh_db(cls.db_name)
        cls.app = create_app()
        cls.anon = Api(cls.app)
        ai.set_test_hooks()

    @classmethod
    def tearDownClass(cls):
        ai.set_test_hooks()
        db.reset_connection()

    def register(self, email, role="submitter", org=None, name=None, city="Pune"):
        body = {"email": email, "password": "Secure#pass1", "name": name or email.split("@")[0].title(),
                "role": role, "city": city, "region": "Maharashtra", "accept_terms": True}
        if org:
            body["organization"] = org
        r = TestClient(self.app).post("/api/auth/register", json=body)
        self.assertEqual(r.status_code, 201, r.text)
        data = r.json()
        return Api(self.app, data["token"], data["user"])

    def make_staff(self, email, role="admin"):
        ts = db.now()
        uid = db.new_id()
        db.insert("users", {"id": uid, "email": email, "password_hash": hash_password("Secure#pass1"), "name": role.title(),
                            "role": role, "skills": "[]", "created_at": ts, "updated_at": ts})
        r = TestClient(self.app).post("/api/auth/login", json={"email": email, "password": "Secure#pass1"})
        self.assertEqual(r.status_code, 200, r.text)
        return Api(self.app, r.json()["token"], r.json()["user"])

    def project_body(self, **over):
        body = {
            "title": "Handwashing stations for Ward 12 school",
            "problem_statement": "The school has one tap for 180 children so most cannot wash hands before lunch.",
            "proposed_solution": "Install four handwashing stations and run hygiene sessions.",
            "beneficiaries": "Students", "beneficiary_count": 180, "city": "Pune", "region": "Maharashtra",
            "cause": "water_sanitation", "budget_required": 90000, "volunteers_required": 6,
            "materials": [{"name": "Handwash unit", "quantity": 4, "unit": "units"}],
            "skills": ["Plumbing"], "duration_weeks": 6,
            "start_date": (date.today() + timedelta(days=10)).isoformat(),
            "original_description": "One tap for 180 kids. Need handwash stations.",
            "milestones": [{"title": "Procure units", "due_date": (date.today() + timedelta(days=2)).isoformat()}],
            "outcomes": [{"metric": "Students with handwashing access", "target": 180, "unit": "students"}],
        }
        body.update(over)
        return body

    def published_project(self, owner, reviewer, **over):
        r = owner.post("/api/projects", self.project_body(**over))
        self.assertEqual(r.status_code, 201, r.text)
        pid = r.json()["project"]["id"]
        for actor, status in ((owner, "submitted"), (reviewer, "approved"), (owner, "published")):
            r = actor.post(f"/api/projects/{pid}/transition", {"status": status})
            self.assertEqual(r.status_code, 200, r.text)
        return pid


# ---------------------------------------------------------------------------
class AuthTests(Base):
    db_name = "auth"

    def setUp(self):
        self.anon = Api(self.app)

    def test_validation_messages_are_plain_sentences(self):
        r = self.anon.post("/api/auth/register", {"email": "x@example.org", "password": "abc", "name": "Xy", "role": "submitter",
                                                  "accept_terms": True, "organization": {"name": None, "org_type": "community"}})
        self.assertEqual(r.status_code, 422)
        text = r.text
        for jargon in ("valid string", "String should", "Input should", "Field required"):
            self.assertNotIn(jargon, text)
        fields = {d["field"]: d["message"] for d in r.json()["details"]}
        self.assertIn("Use at least 8 characters.", fields.get("password", ""))
        self.assertEqual(fields.get("organization.name"), "Please fill this in.")
        self.assertEqual(r.json()["error"], "Please fix the highlighted fields.")

    def test_registration_login_and_roles(self):
        u = self.register("asha@example.org", "submitter",
                          org={"name": "Ward 12 Residents", "org_type": "community"})
        self.assertEqual(u.user["role"], "submitter")
        self.assertEqual(u.user["organizations"][0]["member_role"], "owner")
        me = u.get("/api/auth/me").json()["user"]
        self.assertEqual(me["email"], "asha@example.org")
        self.assertNotIn("password_hash", me)

        r = self.anon.c.post("/api/auth/register", json={"email": "ASHA@example.org", "password": "Secure#pass1",
                                                         "name": "Dup", "role": "volunteer", "accept_terms": True})
        self.assertEqual(r.status_code, 409)
        r = self.anon.c.post("/api/auth/register", json={"email": "x@example.org", "password": "Secure#pass1",
                                                         "name": "Sneaky", "role": "admin", "accept_terms": True})
        self.assertEqual(r.status_code, 422, "admin role must not be self-assignable")
        r = self.anon.c.post("/api/auth/register", json={"email": "y@example.org", "password": "allletters",
                                                         "name": "Weak", "role": "volunteer", "accept_terms": True})
        self.assertEqual(r.status_code, 422)
        r = self.anon.c.post("/api/auth/register", json={"email": "z@example.org", "password": "Secure#pass1",
                                                         "name": "Club", "role": "club", "accept_terms": True,
                                                         "organization": {"name": "X", "org_type": "csr"}})
        self.assertEqual(r.status_code, 422, "club accounts must create a Rotary/Rotaract organization")

    def test_login_failures_throttle_and_suspension(self):
        u = self.register("ravi@example.org", "volunteer")
        bad = {"email": "ravi@example.org", "password": "wrong-pass1"}
        self.assertEqual(self.anon.c.post("/api/auth/login", json=bad).status_code, 401)
        ok = self.anon.c.post("/api/auth/login", json={"email": "ravi@example.org", "password": "Secure#pass1"})
        self.assertEqual(ok.status_code, 200)
        for _ in range(8):
            self.anon.c.post("/api/auth/login", json=bad)
        self.assertEqual(self.anon.c.post("/api/auth/login", json=bad).status_code, 429)

        admin = self.make_staff("admin1@example.org")
        self.assertEqual(admin.patch(f"/api/admin/users/{u.user['id']}", {"is_suspended": True}).status_code, 200)
        self.assertEqual(u.get("/api/dashboard").status_code, 401, "suspended user's token must stop working")

    def test_non_json_mutation_rejected(self):
        r = self.anon.c.post("/api/auth/login", data={"email": "a@b.org", "password": "x"})
        self.assertEqual(r.status_code, 415)

    def test_cookie_session(self):
        self.register("cookie@example.org", "volunteer")
        c = TestClient(self.app)
        r = c.post("/api/auth/login", json={"email": "cookie@example.org", "password": "Secure#pass1"})
        self.assertIn("httponly", r.headers["set-cookie"].lower())
        self.assertEqual(c.get("/api/auth/me").json()["user"]["email"], "cookie@example.org")
        c.post("/api/auth/logout")
        self.assertIsNone(c.get("/api/auth/me").json()["user"])


# ---------------------------------------------------------------------------
class ProjectLifecycleTests(Base):
    db_name = "lifecycle"

    def test_full_review_and_publication_flow(self):
        owner = self.register("owner@example.org", "submitter")
        stranger = self.register("stranger@example.org", "volunteer")
        reviewer = self.make_staff("verifier@example.org", "verifier")

        r = owner.post("/api/projects", self.project_body(budget_required=None, volunteers_required=None,
                                                          materials=[], skills=[], cause=None))
        self.assertEqual(r.status_code, 201)
        p = r.json()["project"]
        pid = p["id"]
        self.assertEqual(p["status"], "draft")
        self.assertEqual(p["original_description"], "One tap for 180 kids. Need handwash stations.")

        # drafts are private
        self.assertEqual(self.anon.get(f"/api/projects/{pid}").status_code, 404)
        self.assertEqual(stranger.get(f"/api/projects/{pid}").status_code, 404)
        self.assertEqual(stranger.put(f"/api/projects/{pid}", self.project_body()).status_code, 403)

        # incomplete proposals cannot be submitted
        r = owner.post(f"/api/projects/{pid}/transition", {"status": "submitted"})
        self.assertEqual(r.status_code, 422)
        self.assertTrue(any("cause" in d["message"].lower() for d in r.json()["details"]))

        body = self.project_body(original_description="attempt to overwrite")
        self.assertEqual(owner.put(f"/api/projects/{pid}", body).status_code, 200)
        self.assertEqual(owner.get(f"/api/projects/{pid}").json()["project"]["original_description"],
                         "One tap for 180 kids. Need handwash stations.", "original description must be preserved")
        from app import config as _cfg
        _cfg.settings.require_project_photo = True
        try:
            r = owner.post(f"/api/projects/{pid}/transition", {"status": "submitted"})
            self.assertEqual(r.status_code, 422, "a need without a photo cannot be sent for review")
            self.assertTrue(any("photo" in d["message"].lower() for d in r.json()["details"]))
        finally:
            _cfg.settings.require_project_photo = False
        self.assertEqual(owner.post(f"/api/projects/{pid}/transition", {"status": "submitted"}).status_code, 200)
        self.assertEqual(owner.put(f"/api/projects/{pid}", body).status_code, 409, "submitted projects are locked")

        # only reviewers can review, and not their own
        self.assertEqual(owner.post(f"/api/projects/{pid}/transition", {"status": "approved"}).status_code, 403)
        self.assertEqual(stranger.post(f"/api/projects/{pid}/transition", {"status": "approved"}).status_code, 403)
        rv_notes = reviewer.get("/api/notifications").json()
        self.assertTrue(any(n["type"] == "review_needed" for n in rv_notes["notifications"]))

        r = reviewer.post(f"/api/projects/{pid}/transition", {"status": "needs_information"})
        self.assertEqual(r.status_code, 422, "needs-information requires notes")
        r = reviewer.post(f"/api/projects/{pid}/transition",
                          {"status": "needs_information", "notes": "Please share the school's contact."})
        self.assertEqual(r.status_code, 200)
        n = owner.get("/api/notifications").json()["notifications"]
        self.assertEqual(n[0]["type"], "review_decision")

        self.assertEqual(owner.put(f"/api/projects/{pid}", body).status_code, 200)
        self.assertEqual(owner.post(f"/api/projects/{pid}/transition", {"status": "submitted"}).status_code, 200)
        self.assertEqual(reviewer.post(f"/api/projects/{pid}/transition", {"status": "approved"}).status_code, 200)
        self.assertEqual(self.anon.get(f"/api/projects/{pid}").status_code, 404, "approved is not yet public")
        self.assertEqual(stranger.post(f"/api/projects/{pid}/transition", {"status": "published"}).status_code, 403)
        self.assertEqual(owner.post(f"/api/projects/{pid}/transition", {"status": "published"}).status_code, 200)

        pub = self.anon.get(f"/api/projects/{pid}").json()["project"]
        self.assertEqual(pub["status"], "published")
        self.assertNotIn("original_description", pub, "original description is visible to owner/reviewers only")
        self.assertFalse(pub["need_verified"])
        self.assertIn(pid, [p["id"] for p in self.anon.get("/api/projects").json()["projects"]])

        # illegal jumps are rejected
        self.assertEqual(owner.post(f"/api/projects/{pid}/transition", {"status": "verified"}).status_code, 409)
        self.assertEqual(owner.post(f"/api/projects/{pid}/transition", {"status": "completed"}).status_code, 409)
        self.assertEqual(owner.delete(f"/api/projects/{pid}").status_code, 409, "only drafts can be deleted")

        hist = owner.get(f"/api/projects/{pid}/history").json()["history"]
        self.assertGreaterEqual(len(hist), 7)
        self.assertEqual(stranger.get(f"/api/projects/{pid}/history").status_code, 403)

    def test_safeguarding_rules(self):
        owner = self.register("sg@example.org", "ngo")
        r = owner.post("/api/projects", self.project_body(involves_children=True))
        self.assertEqual(r.status_code, 422)
        self.assertEqual(r.json()["field"], "safeguarding_notes")
        r = owner.post("/api/projects", self.project_body(
            involves_children=True, safeguarding_notes="Teachers present; no faces photographed.",
            location_detail="Behind the temple, Lane 4"))
        self.assertEqual(r.status_code, 201)
        pid = r.json()["project"]["id"]
        up = owner.upload(PNG, "kids.png", purpose="need_photo", visibility="public", project_id=pid)
        self.assertEqual(up.status_code, 422, "public photos on child-related projects need consent")
        up = owner.upload(PNG, "kids.png", purpose="need_photo", visibility="public", project_id=pid, consent="true")
        self.assertEqual(up.status_code, 201)
        reviewer = self.make_staff("sg-rev@example.org", "verifier")
        for actor, st in ((owner, "submitted"), (reviewer, "approved"), (owner, "published")):
            self.assertEqual(actor.post(f"/api/projects/{pid}/transition", {"status": st}).status_code, 200)
        pub = self.anon.get(f"/api/projects/{pid}").json()["project"]
        self.assertIsNone(pub["location_detail"], "exact location hidden from the public on sensitive projects")
        self.assertTrue(pub["location_detail_hidden"])
        self.assertIsNone(pub["safeguarding_notes"])
        self.assertEqual(owner.get(f"/api/projects/{pid}").json()["project"]["location_detail"], "Behind the temple, Lane 4")


# ---------------------------------------------------------------------------
class AiTests(Base):
    db_name = "ai"

    def test_not_configured_is_reported(self):
        u = self.register("ai0@example.org")
        r = u.post("/api/ai/structure", {"description": "Our lane floods every monsoon because drains are blocked badly."})
        self.assertEqual(r.status_code, 503)
        self.assertIn("not configured", r.json()["error"])
        meta = self.anon.get("/api/meta").json()
        self.assertFalse(meta["integrations"]["ai_structuring"]["configured"])

    def test_invented_numbers_are_removed(self):
        def fake(system, text, images):
            self.assertIn("Never invent", system)
            return "```json\n" + json.dumps({
                "title": "Fix flooding drains", "problem_statement": "Drains in the lane are blocked.",
                "story": "Every monsoon, water walks into the homes of our lane in Pimpri! 300 families lose a week of work. "
                         "With clean drains, the lane stays dry.",
                "proposed_solution": "Clean drains", "beneficiaries": "Residents", "beneficiary_count": 500,
                "city": "Pimpri", "cause": "made_up_cause", "budget_required": 120000, "volunteers_required": 25,
                "materials": [{"name": "Gloves", "quantity": 40, "unit": "pairs"}, {"name": "Shovels", "quantity": 99}],
                "skills": ["Mobilisation"], "duration_weeks": 8,
                "milestones": [{"title": "Clean-up day", "description": ""}],
                "outcomes": [{"metric": "Homes protected", "target": 1000, "unit": "homes"}],
                "missing_information": [], "follow_up_questions": []}) + "\n```"
        ai.set_test_hooks(provider=fake)
        u = self.register("ai1@example.org")
        desc = ("Our lane in Pimpri floods every monsoon. We think it needs about 1.2 lakh rupees and 25 "
                "volunteers for two months. We need 40 pairs of gloves.")
        r = u.post("/api/ai/structure", {"description": desc})
        self.assertEqual(r.status_code, 200, r.text)
        p = r.json()["proposal"]
        self.assertEqual(r.json()["original_description"], desc)
        self.assertEqual(p["budget_required"], 120000.0, "1.2 lakh is stated")
        self.assertEqual(p["volunteers_required"], 25)
        self.assertEqual(p["duration_weeks"], 8, "two months ≈ 8-9 weeks is derived from stated text")
        self.assertIsNone(p["beneficiary_count"], "500 was never stated")
        self.assertIsNone(p["cause"], "invalid cause dropped")
        self.assertEqual(p["materials"][0]["quantity"], 40)
        self.assertIsNone(p["materials"][1]["quantity"], "99 shovels was invented")
        self.assertIsNone(p["outcomes"][0]["target"], "outcome targets are never invented")
        self.assertIn("beneficiary_count", p["removed_unstated_values"])
        self.assertEqual(p["story"], "Every monsoon, water walks into the homes of our lane in Pimpri. With clean drains, the lane stays dry.",
                         "story keeps stated facts, drops the sentence with an invented number, and calms '!'")
        self.assertIn("story", p["removed_unstated_values"])
        self.assertTrue(any("beneficiaries" in m.lower() for m in p["missing_information"]))

        def fake2(system, text, images):
            return json.dumps({"title": "x", "budget_required": 50000, "missing_information": []})
        ai.set_test_hooks(provider=fake2)
        r = u.post("/api/ai/structure", {"description": "Our community hall roof leaks badly and needs repair soon."})
        self.assertIsNone(r.json()["proposal"]["budget_required"])
        self.assertTrue(any("budget" in q.lower() for q in r.json()["proposal"]["follow_up_questions"]))

        ai.set_test_hooks(provider=lambda *a: "sorry I can't")
        r = u.post("/api/ai/structure", {"description": "Our community hall roof leaks badly and needs repair soon."})
        self.assertEqual(r.status_code, 502)
        ai.set_test_hooks()

    def test_transcription(self):
        u = self.register("voice@example.org")
        wav = b"RIFF\x24\x00\x00\x00WAVEfmt " + b"\x00" * 30
        r = u.c.post("/api/ai/transcribe", files={"file": ("a.wav", wav)}, headers=u._h())
        self.assertEqual(r.status_code, 503)
        ai.set_test_hooks(transcriber=lambda audio, mime: "the lane floods")
        r = u.c.post("/api/ai/transcribe", files={"file": ("a.wav", wav)}, headers=u._h())
        self.assertEqual(r.json()["text"], "the lane floods")
        ai.set_test_hooks()


# ---------------------------------------------------------------------------
class CommitmentTests(Base):
    db_name = "commitments"

    def setUp(self):
        n = self._testMethodName
        self.owner = self.register(f"owner-{n}@example.org", "submitter")
        self.club = self.register(f"club-{n}@example.org", "club",
                                  org={"name": f"Rotaract {n}", "org_type": "rotaract"})
        self.csr = self.register(f"csr-{n}@example.org", "csr", org={"name": f"Acme CSR {n}", "org_type": "csr"})
        self.vol = self.register(f"vol-{n}@example.org", "volunteer")
        self.reviewer = self.make_staff(f"rev-{n}@example.org", "verifier")
        self.club_org = self.club.user["organizations"][0]["id"]
        self.csr_org = self.csr.user["organizations"][0]["id"]

    def money(self, pid):
        return self.anon.get(f"/api/projects/{pid}").json()["project"]["resources"]["money"]

    def test_totals_follow_commitment_changes(self):
        pid = self.published_project(self.owner, self.reviewer)
        r = self.club.post(f"/api/projects/{pid}/commitments", {"kind": "money", "quantity": 30000, "org_id": self.club_org})
        self.assertEqual(r.status_code, 201, r.text)
        c1 = r.json()["commitment"]["id"]
        r = self.club.post(f"/api/projects/{pid}/commitments", {"kind": "money", "quantity": 1, "org_id": self.csr_org})
        self.assertEqual(r.status_code, 403, "cannot pledge for an org you don't belong to")
        c2 = self.csr.post(f"/api/projects/{pid}/commitments",
                           {"kind": "money", "quantity": 60000, "org_id": self.csr_org}).json()["commitment"]["id"]
        c3 = self.vol.post(f"/api/projects/{pid}/commitments",
                           {"kind": "volunteers", "quantity": 4, "hours": 6}).json()["commitment"]["id"]
        mat = self.club.post(f"/api/projects/{pid}/commitments",
                             {"kind": "materials", "quantity": 2, "item": "handwash units", "unit": "units",
                              "org_id": self.club_org}).json()["commitment"]["id"]

        m = self.money(pid)
        self.assertEqual((m["requested"], m["proposed"], m["pledged"], m["gap"]), (90000, 90000, 0, 90000))
        self.assertTrue(any(n["type"] == "support_proposal" for n in self.owner.get("/api/notifications").json()["notifications"]))

        # only the owner can accept
        self.assertEqual(self.vol.post(f"/api/commitments/{c1}/action", {"action": "accept"}).status_code, 403)
        self.assertEqual(self.club.post(f"/api/commitments/{c1}/action", {"action": "accept"}).status_code, 403)
        for cid in (c1, c2, c3, mat):
            self.assertEqual(self.owner.post(f"/api/commitments/{cid}/action", {"action": "accept"}).status_code, 200)
        m = self.money(pid)
        self.assertEqual((m["pledged"], m["gap"], m["proposed"]), (90000, 0, 0))
        res = self.anon.get(f"/api/projects/{pid}").json()["project"]["resources"]
        self.assertEqual(res["volunteers"]["pledged"], 4)
        self.assertEqual(res["volunteers"]["gap"], 2)
        self.assertEqual(res["volunteers"]["pledged_hours"], 24)
        self.assertEqual(res["materials"][0]["pledged"], 2, "fuzzy item matching: 'handwash units' ~ 'Handwash unit'")
        self.assertEqual(res["materials"][0]["gap"], 2)
        self.assertEqual(res["supporter_count"], 3)
        self.assertEqual(len(self.anon.get(f"/api/projects/{pid}").json()["project"]["participants"]), 3)
        self.assertEqual(self.club.get("/api/notifications").json()["notifications"][0]["title"],
                         "Your support offer was accepted")

        # cancellation reduces the totals
        self.assertEqual(self.csr.post(f"/api/commitments/{c2}/action", {"action": "cancel"}).status_code, 422)
        self.assertEqual(self.csr.post(f"/api/commitments/{c2}/action",
                                       {"action": "cancel", "message": "Budget frozen this quarter"}).status_code, 200)
        m = self.money(pid)
        self.assertEqual((m["pledged"], m["gap"]), (30000, 60000))

        # receipts and spending
        self.assertEqual(self.owner.patch(f"/api/commitments/{c1}/progress", {"received_quantity": 40000}).status_code, 422)
        self.assertEqual(self.owner.patch(f"/api/commitments/{c1}/progress", {"received_quantity": 20000}).status_code, 200)
        self.assertEqual(self.owner.patch(f"/api/commitments/{c1}/progress", {"spent_amount": 25000}).status_code, 422)
        self.assertEqual(self.owner.patch(f"/api/commitments/{c1}/progress", {"spent_amount": 15000}).status_code, 200)
        self.assertEqual(self.club.patch(f"/api/commitments/{c1}/progress", {"spent_amount": 1}).status_code, 403)
        m = self.money(pid)
        self.assertEqual((m["pledged"], m["received"], m["spent"]), (30000, 20000, 15000))
        self.assertEqual(self.owner.post(f"/api/commitments/{c3}/action", {"action": "fulfil"}).status_code, 200)
        res = self.anon.get(f"/api/projects/{pid}").json()["project"]["resources"]
        self.assertEqual(res["volunteers"]["received"], 4)
        self.assertEqual(res["volunteers"]["pledged"], 4, "fulfilled commitments still count")

    def test_request_changes_revise_decline_withdraw(self):
        pid = self.published_project(self.owner, self.reviewer)
        cid = self.vol.post(f"/api/projects/{pid}/commitments", {"kind": "volunteers", "quantity": 2}).json()["commitment"]["id"]
        self.assertEqual(self.owner.post(f"/api/commitments/{cid}/action", {"action": "request_changes"}).status_code, 422)
        r = self.owner.post(f"/api/commitments/{cid}/action", {"action": "request_changes", "message": "Can you do Sundays?"})
        self.assertEqual(r.json()["commitment"]["status"], "changes_requested")
        self.assertEqual(self.owner.post(f"/api/commitments/{cid}/action", {"action": "accept"}).status_code, 409)
        self.assertEqual(self.club.put(f"/api/commitments/{cid}", {"kind": "volunteers", "quantity": 3}).status_code, 403)
        r = self.vol.put(f"/api/commitments/{cid}", {"kind": "volunteers", "quantity": 3, "description": "Sundays OK"})
        self.assertEqual(r.json()["commitment"]["status"], "proposed")
        self.assertEqual(self.owner.post(f"/api/commitments/{cid}/action", {"action": "accept"}).status_code, 200)
        self.assertEqual(self.vol.put(f"/api/commitments/{cid}", {"kind": "volunteers", "quantity": 9}).status_code, 409,
                         "accepted commitments can't be silently changed")
        self.assertEqual(self.anon.get(f"/api/projects/{pid}").json()["project"]["resources"]["volunteers"]["pledged"], 3)

        c2 = self.club.post(f"/api/projects/{pid}/commitments", {"kind": "skills", "quantity": 1, "item": "Plumbing"}).json()["commitment"]["id"]
        self.assertEqual(self.owner.post(f"/api/commitments/{c2}/action", {"action": "decline", "message": "Already covered"}).status_code, 200)
        c3 = self.club.post(f"/api/projects/{pid}/commitments", {"kind": "money", "quantity": 500}).json()["commitment"]["id"]
        self.assertEqual(self.owner.post(f"/api/commitments/{c3}/action", {"action": "withdraw"}).status_code, 403)
        self.assertEqual(self.club.post(f"/api/commitments/{c3}/action", {"action": "withdraw"}).status_code, 200)
        self.assertEqual(self.money(pid)["proposed"], 0)

        mine = self.club.get("/api/commitments/mine").json()["commitments"]
        self.assertEqual({c["status"] for c in mine}, {"declined", "withdrawn"})

    def test_guards(self):
        pid = self.published_project(self.owner, self.reviewer, allow_multiple_supporters=False)
        self.assertEqual(self.owner.post(f"/api/projects/{pid}/commitments", {"kind": "money", "quantity": 5}).status_code, 403)
        self.assertEqual(self.reviewer.post(f"/api/projects/{pid}/commitments", {"kind": "money", "quantity": 5}).status_code, 403)
        self.assertEqual(self.anon.post(f"/api/projects/{pid}/commitments", {"kind": "money", "quantity": 5}).status_code, 401)
        r = self.vol.post(f"/api/projects/{pid}/commitments", {"kind": "materials", "quantity": 5})
        self.assertEqual(r.status_code, 422)
        self.assertEqual(self.vol.post(f"/api/projects/{pid}/commitments", {"kind": "money", "quantity": -5}).status_code, 422)
        a = self.club.post(f"/api/projects/{pid}/commitments", {"kind": "money", "quantity": 90000, "org_id": self.club_org}).json()["commitment"]["id"]
        b = self.csr.post(f"/api/projects/{pid}/commitments", {"kind": "money", "quantity": 1000, "org_id": self.csr_org}).json()["commitment"]["id"]
        self.assertEqual(self.owner.post(f"/api/commitments/{a}/action", {"action": "accept"}).status_code, 200)
        r = self.owner.post(f"/api/commitments/{b}/action", {"action": "accept"})
        self.assertEqual(r.status_code, 409, "single-supporter projects reject a second supporter")
        # same org may add more
        a2 = self.club.post(f"/api/projects/{pid}/commitments", {"kind": "volunteers", "quantity": 6, "org_id": self.club_org}).json()["commitment"]["id"]
        self.assertEqual(self.owner.post(f"/api/commitments/{a2}/action", {"action": "accept"}).status_code, 200)

        draft = self.owner.post("/api/projects", self.project_body()).json()["project"]["id"]
        self.assertEqual(self.vol.post(f"/api/projects/{draft}/commitments", {"kind": "money", "quantity": 5}).status_code, 404)


# ---------------------------------------------------------------------------
class DiscoveryAndMatchingTests(Base):
    db_name = "matching"

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

    def test_explore_filters_and_matching(self):
        owner = self.register("m-owner@example.org")
        rev = self.make_staff("m-rev@example.org", "verifier")
        p_pune = self.published_project(owner, rev, title="Library corner for Hadapsar school", cause="education",
                                        budget_required=20000, volunteers_required=4, skills=["Teaching"],
                                        materials=[{"name": "Bookshelves", "quantity": 3, "unit": "units"}])
        p_mumbai = self.published_project(owner, rev, title="Mangrove clean-up drive", cause="environment",
                                          city="Mumbai", budget_required=50000, volunteers_required=30,
                                          skills=[], materials=[])
        p_nagpur = self.published_project(owner, rev, title="Solar lamps for night school", cause="education",
                                          city="Nagpur", region="Maharashtra", budget_required=200000,
                                          volunteers_required=None, skills=["Electrical"], materials=[],
                                          start_date=(date.today() + timedelta(days=200)).isoformat(),
                                          allow_multiple_supporters=False)
        draft = owner.post("/api/projects", self.project_body(title="Secret draft library")).json()["project"]["id"]

        all_ids = [p["id"] for p in self.anon.get("/api/projects").json()["projects"]]
        self.assertEqual(set(all_ids), {p_pune, p_mumbai, p_nagpur})
        self.assertNotIn(draft, all_ids)
        r = self.anon.get("/api/projects", params={"q": "library"}).json()
        self.assertEqual([p["id"] for p in r["projects"]], [p_pune])
        self.assertEqual(r["search_mode"], "keyword")
        self.assertEqual([p["id"] for p in self.anon.get("/api/projects", params={"cause": "environment"}).json()["projects"]], [p_mumbai])
        self.assertEqual([p["id"] for p in self.anon.get("/api/projects", params={"city": "pune"}).json()["projects"]], [p_pune])
        self.assertEqual({p["id"] for p in self.anon.get("/api/projects", params={"max_budget": 60000}).json()["projects"]}, {p_pune, p_mumbai})
        self.assertEqual([p["id"] for p in self.anon.get("/api/projects", params={"min_volunteers": 10}).json()["projects"]], [p_mumbai])
        self.assertEqual([p["id"] for p in self.anon.get("/api/projects", params={"skill": "electr"}).json()["projects"]], [p_nagpur])
        self.assertEqual([p["id"] for p in self.anon.get("/api/projects", params={"material": "shelves"}).json()["projects"]], [p_pune])
        until = (date.today() + timedelta(days=60)).isoformat()
        self.assertNotIn(p_nagpur, [p["id"] for p in self.anon.get("/api/projects", params={"available_until": until}).json()["projects"]])
        self.assertEqual(self.anon.get("/api/projects", params={"verified": "need"}).json()["total"], 0)
        self.assertEqual(self.anon.get("/api/projects", params={"min_budget": "abc"}).status_code, 422)

        club = self.register("m-club@example.org", "club", org={"name": "RC Pune", "org_type": "rotary"})
        r = club.post("/api/match", {})
        self.assertEqual(r.status_code, 422, "must offer at least one resource")

        # Pune club, city scope, education preference, 10k + 2 volunteers + teaching
        r = club.post("/api/match", {"budget": 10000, "volunteers": 2, "skills": ["teaching"], "city": "Pune",
                                     "region": "Maharashtra", "location_scope": "city", "causes": ["education"]})
        self.assertEqual(r.status_code, 200, r.text)
        data = r.json()
        self.assertEqual([m["project_id"] for m in data["matches"]], [p_pune])
        m = data["matches"][0]
        self.assertEqual(m["components"]["cause"], 1.0)
        self.assertEqual(m["components"]["location"], 1.0)
        self.assertTrue(any("50%" in reason for reason in m["reasons"]), m["reasons"])
        self.assertIn("2 volunteer(s)", m["still_missing"])
        self.assertTrue(any("Bookshelves" in s for s in m["still_missing"]))
        excluded = {e["project_id"]: e["reasons"] for e in data["excluded"]}
        self.assertIn("Outside your city.", excluded[p_mumbai])

        # anywhere scope: single-supporter project excluded when offer can't cover it alone
        r = club.post("/api/match", {"budget": 50000, "skills": ["electrical"], "location_scope": "anywhere"}).json()
        ex = {e["project_id"]: e["reasons"] for e in r["excluded"]}
        self.assertTrue(any("single supporter" in x for x in ex[p_nagpur]))
        r = club.post("/api/match", {"budget": 250000, "skills": ["electrical"], "location_scope": "anywhere"}).json()
        ids = [m["project_id"] for m in r["matches"]]
        self.assertIn(p_nagpur, ids)
        # no overlap → never matched
        r = club.post("/api/match", {"equipment": ["tractor"], "location_scope": "anywhere"}).json()
        self.assertEqual(r["matches"], [])

        # owner's own projects are not suggested to them
        self.assertEqual(owner.post("/api/match", {"budget": 1000}).json()["matches"], [])

    def test_semantic_search_when_configured(self):
        vocab = ["water", "school", "tree", "river", "children", "hygiene", "library", "clean"]

        def embed(text):
            t = text.lower()
            return [float(t.count(w)) + 0.01 for w in vocab]
        ai.set_test_hooks(embedder=embed)
        owner = self.register("s-owner@example.org")
        rev = self.make_staff("s-rev@example.org", "verifier")
        p1 = self.published_project(owner, rev, title="River bank tree plantation", cause="environment",
                                    problem_statement="The river bank is eroding; we want to plant a tree line along the river.")
        r = self.anon.get("/api/projects", params={"q": "plant trees near the river", "semantic": "1"}).json()
        self.assertEqual(r["search_mode"], "semantic")
        self.assertEqual(r["projects"][0]["id"], p1)
        ai.set_test_hooks()


# ---------------------------------------------------------------------------
class ExecutionVerificationTests(Base):
    db_name = "execution"

    def test_progress_completion_and_verification(self):
        owner = self.register("e-owner@example.org", "submitter",
                              org={"name": "Ward Group", "org_type": "community"})
        supporter = self.register("e-club@example.org", "club", org={"name": "RC East", "org_type": "rotary"})
        stranger = self.register("e-stranger@example.org", "volunteer")
        verifier = self.make_staff("e-ver@example.org", "verifier")
        admin = self.make_staff("e-admin@example.org", "admin")
        pid = self.published_project(owner, verifier)

        # milestones
        ms = owner.get(f"/api/projects/{pid}").json()["project"]["milestones"]
        self.assertEqual(len(ms), 1)
        self.assertEqual(stranger.post(f"/api/projects/{pid}/milestones", {"title": "Hack"}).status_code, 403)
        r = owner.post(f"/api/projects/{pid}/milestones", {"title": "Hygiene session",
                                                           "due_date": (date.today() + timedelta(days=20)).isoformat()})
        self.assertEqual(r.status_code, 201)
        mid = r.json()["milestone"]["id"]

        cid = supporter.post(f"/api/projects/{pid}/commitments", {"kind": "money", "quantity": 90000,
                                                                   "deadline": (date.today() + timedelta(days=1)).isoformat()}).json()["commitment"]["id"]
        owner.post(f"/api/commitments/{cid}/action", {"action": "accept"})

        # deadline sweep notifies about the milestone due in 2 days and the commitment due tomorrow; idempotent
        created = sweep_deadlines()
        self.assertGreaterEqual(created, 3)
        self.assertEqual(sweep_deadlines(), 0)
        self.assertTrue(any(n["type"] == "deadline" for n in supporter.get("/api/notifications").json()["notifications"]))

        # updates: team & supporters only
        self.assertEqual(stranger.post(f"/api/projects/{pid}/updates", {"title": "Spam", "body": "Totally legit update"}).status_code, 403)
        self.assertEqual(supporter.post(f"/api/projects/{pid}/updates",
                                        {"title": "Funds transferred", "body": "We transferred the first tranche."}).status_code, 201)
        self.assertTrue(any(n["type"] == "project_update" for n in owner.get("/api/notifications").json()["notifications"]))

        self.assertEqual(owner.post(f"/api/projects/{pid}/transition", {"status": "in_progress"}).status_code, 200)
        r = owner.put(f"/api/projects/{pid}/milestones/{mid}", {"title": "Hygiene session", "status": "done"})
        self.assertEqual(r.status_code, 200)
        self.assertIsNotNone(r.json()["milestone"]["completed_at"])
        self.assertTrue(any(n["type"] == "milestone" for n in supporter.get("/api/notifications").json()["notifications"]))

        ch = owner.post(f"/api/projects/{pid}/checklist", {"text": "Photos of installed stations"}).json()["item"]
        self.assertTrue(owner.patch(f"/api/projects/{pid}/checklist/{ch['id']}", {"done": True}).json()["item"]["done"])

        ev = owner.upload(PNG, "installed.png", purpose="evidence", visibility="public", project_id=pid).json()["file"]
        self.assertEqual(self.anon.get(ev["url"]).status_code, 200)
        team_doc = owner.upload(PDF, "receipts.pdf", purpose="evidence", visibility="team", project_id=pid).json()["file"]
        self.assertEqual(self.anon.get(team_doc["url"]).status_code, 404)
        self.assertEqual(stranger.get(team_doc["url"]).status_code, 404)
        self.assertEqual(supporter.get(team_doc["url"]).status_code, 200)

        # completion requires an impact report
        self.assertEqual(owner.post(f"/api/projects/{pid}/transition", {"status": "completed"}).status_code, 422)
        self.assertEqual(stranger.put(f"/api/projects/{pid}/impact-report", {"summary": "x" * 30}).status_code, 403)
        outcome_id = owner.get(f"/api/projects/{pid}").json()["project"]["outcomes"][0]["id"]
        owner.put(f"/api/projects/{pid}/outcomes/{outcome_id}", {"metric": "Students with handwashing access",
                                                                  "target": 180, "reported_value": 175})
        r = owner.put(f"/api/projects/{pid}/impact-report", {
            "people_reached": 175, "volunteers_involved": 6, "volunteer_hours": 48, "funds_spent": 88000,
            "summary": "Four stations installed and teachers trained on hygiene sessions.", "file_ids": [ev["id"]]})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(owner.post(f"/api/projects/{pid}/transition", {"status": "completed"}).status_code, 200)

        # a completion verification request is created automatically
        pending = verifier.get("/api/admin/verifications").json()["verifications"]
        comp = [v for v in pending if v["kind"] == "project_completion"]
        self.assertEqual(len(comp), 1)
        vid = comp[0]["id"]
        self.assertEqual(stranger.get("/api/admin/verifications").status_code, 403)
        self.assertEqual(owner.post(f"/api/admin/verifications/{vid}/decide", {"decision": "approve", "notes": "self-approve"}).status_code, 403)

        imp = self.anon.get("/api/impact").json()
        self.assertEqual(imp["reported"]["people_reached"], 175)
        self.assertEqual(imp["verified"]["people_reached"], 0, "nothing is verified yet")

        # reviewer rejects first → back to in progress; resubmits; then approve with independently verified values
        r = verifier.post(f"/api/admin/verifications/{vid}/decide", {"decision": "reject", "notes": "Please add receipts photo."})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(owner.get(f"/api/projects/{pid}").json()["project"]["status"], "in_progress")
        owner.post(f"/api/projects/{pid}/transition", {"status": "completed"})
        vid = [v for v in verifier.get("/api/admin/verifications").json()["verifications"] if v["kind"] == "project_completion"][0]["id"]
        r = verifier.post(f"/api/admin/verifications/{vid}/decide", {
            "decision": "approve", "notes": "Site visit on 12 Oct confirmed four stations.",
            "verified_people_reached": 160, "verified_funds_spent": 88000,
            "verified_outcomes": {outcome_id: 160}})
        self.assertEqual(r.status_code, 200, r.text)
        p = self.anon.get(f"/api/projects/{pid}").json()["project"]
        self.assertEqual(p["status"], "verified")
        self.assertTrue(p["completion_verified"])
        self.assertEqual(p["impact_report"]["people_reached"], 175)
        self.assertEqual(p["impact_report"]["verified_people_reached"], 160)
        self.assertEqual(p["outcomes"][0]["reported_value"], 175)
        self.assertEqual(p["outcomes"][0]["verified_value"], 160)
        self.assertEqual(p["resources"]["money"]["verified_spent"], 88000)
        self.assertEqual(owner.put(f"/api/projects/{pid}/impact-report", {"summary": "Changing after verification!!"}).status_code, 409)
        imp = self.anon.get("/api/impact").json()
        self.assertEqual((imp["reported"]["people_reached"], imp["verified"]["people_reached"]), (175, 160))
        self.assertEqual(imp["projects"]["verified"], 1)
        self.assertTrue(any("independently verified" in n["title"] for n in supporter.get("/api/notifications").json()["notifications"]))

        # organization identity verification with a reviewers-only document
        org_id = owner.user["organizations"][0]["id"]
        doc = owner.upload(PDF, "registration.pdf", purpose="verification", visibility="public", org_id=org_id).json()["file"]
        self.assertEqual(doc["visibility"], "reviewers", "verification documents are forced private")
        self.assertEqual(supporter.post("/api/verifications", {"kind": "organization_identity", "subject_id": org_id}).status_code, 403)
        r = owner.post("/api/verifications", {"kind": "organization_identity", "subject_id": org_id, "file_ids": [doc["id"]]})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(owner.post("/api/verifications", {"kind": "organization_identity", "subject_id": org_id,
                                                           "file_ids": [doc["id"]]}).status_code, 409)
        self.assertEqual(stranger.get(doc["url"]).status_code, 404)
        self.assertEqual(verifier.get(doc["url"]).status_code, 200)
        ov = [v for v in admin.get("/api/admin/verifications").json()["verifications"] if v["kind"] == "organization_identity"][0]
        self.assertEqual(admin.post(f"/api/admin/verifications/{ov['id']}/decide", {"decision": "approve"}).status_code, 422,
                         "decisions require notes")
        admin.post(f"/api/admin/verifications/{ov['id']}/decide", {"decision": "approve", "notes": "Registration certificate checked."})
        self.assertEqual(self.anon.get(f"/api/organizations/{org_id}").json()["organization"]["verification_status"], "verified")
        # changing identity details drops verification
        owner.patch(f"/api/organizations/{org_id}", {"name": "Ward Group Renamed"})
        self.assertEqual(self.anon.get(f"/api/organizations/{org_id}").json()["organization"]["verification_status"], "unverified")

        audit = admin.get("/api/admin/audit", params={"subject_type": "project", "subject_id": pid}).json()["entries"]
        actions = {e["action"] for e in audit}
        self.assertTrue({"project.created", "project.published", "commitment.accepted", "project.verified"} <= actions)

    def test_need_and_financial_verification(self):
        owner = self.register("f-owner@example.org")
        ver = self.make_staff("f-ver@example.org", "verifier")
        pid = self.published_project(owner, ver)
        r = owner.post("/api/verifications", {"kind": "project_financial", "subject_id": pid})
        self.assertEqual(r.status_code, 422, "financial verification needs documents")
        quote = owner.upload(PDF, "quote.pdf", purpose="evidence", visibility="team", project_id=pid).json()["file"]
        self.assertEqual(owner.post("/api/verifications", {"kind": "project_financial", "subject_id": pid,
                                                           "file_ids": [quote["id"]]}).status_code, 201)
        self.assertEqual(owner.post("/api/verifications", {"kind": "project_need", "subject_id": pid}).status_code, 201)
        for v in ver.get("/api/admin/verifications").json()["verifications"]:
            ver.post(f"/api/admin/verifications/{v['id']}/decide", {"decision": "approve", "notes": "Checked on call with school."})
        p = self.anon.get(f"/api/projects/{pid}").json()["project"]
        self.assertTrue(p["need_verified"] and p["financial_verified"])
        self.assertEqual(self.anon.get("/api/projects", params={"verified": "need"}).json()["total"], 1)


# ---------------------------------------------------------------------------
class ModerationTests(Base):
    db_name = "moderation"

    def test_reports_hiding_and_signals(self):
        owner = self.register("x-owner@example.org")
        reporter = self.register("x-rep@example.org", "volunteer")
        reporter2 = self.register("x-rep2@example.org", "volunteer")
        ver = self.make_staff("x-ver@example.org", "verifier")
        admin = self.make_staff("x-admin@example.org", "admin")
        pid = self.published_project(owner, ver, budget_required=5_000_000, beneficiary_count=5)

        self.assertEqual(self.anon.post("/api/reports", {"subject_type": "project", "subject_id": pid, "reason": "suspicious"}).status_code, 401)
        self.assertEqual(reporter.post("/api/reports", {"subject_type": "project", "subject_id": pid, "reason": "nope"}).status_code, 422)
        r = reporter.post("/api/reports", {"subject_type": "project", "subject_id": pid, "reason": "suspicious", "details": "Budget seems inflated"})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(reporter.post("/api/reports", {"subject_type": "project", "subject_id": pid, "reason": "suspicious"}).status_code, 409)
        reporter2.post("/api/reports", {"subject_type": "project", "subject_id": pid, "reason": "safeguarding"})

        reports = ver.get("/api/admin/reports").json()["reports"]
        self.assertEqual(reports[0]["reason"], "safeguarding", "safeguarding reports are prioritised")
        signals = ver.get("/api/admin/overview").json()["signals"]
        sig = [s for s in signals if s["project"]["id"] == pid][0]["signals"]
        self.assertTrue(any("open reports" in s for s in sig))
        self.assertTrue(any("account less than 7 days" in s for s in sig))

        rid = reports[0]["id"]
        r = ver.post(f"/api/admin/reports/{rid}", {"status": "resolved", "resolution": "Hidden", "hide_subject": True})
        self.assertEqual(r.status_code, 403, "verifiers can't hide content")
        r = admin.post(f"/api/admin/reports/{rid}", {"status": "resolved", "resolution": "Hidden pending checks", "hide_subject": True})
        self.assertEqual(r.status_code, 200)
        self.assertNotIn(pid, [p["id"] for p in self.anon.get("/api/projects").json()["projects"]])
        self.assertEqual(self.anon.get(f"/api/projects/{pid}").status_code, 404)
        self.assertEqual(owner.get(f"/api/projects/{pid}").status_code, 200, "owner can still see it")
        self.assertTrue(any(n["type"] == "report" for n in reporter2.get("/api/notifications").json()["notifications"]))

        # admin user management
        self.assertEqual(ver.get("/api/admin/users").status_code, 403)
        users = admin.get("/api/admin/users", params={"q": "x-rep@"}).json()["users"]
        self.assertEqual(len(users), 1)
        self.assertEqual(admin.patch(f"/api/admin/users/{admin.user['id']}", {"role": "volunteer"}).status_code, 400)
        self.assertEqual(admin.patch(f"/api/admin/users/{users[0]['id']}", {"role": "verifier"}).status_code, 200)
        self.assertEqual(admin.patch(f"/api/admin/users/{users[0]['id']}", {"role": "superuser"}).status_code, 422)


# ---------------------------------------------------------------------------
class FilesNotificationsDashboardTests(Base):
    db_name = "files"

    def test_upload_validation_and_exif_strip(self):
        u = self.register("f@example.org", name="Fatima")
        self.assertEqual(u.upload(b"MZ\x90\x00 fake exe", "photo.jpg", purpose="need_photo").status_code, 415)
        self.assertEqual(u.upload(b"", "e.png", purpose="need_photo").status_code, 422)
        self.assertEqual(self.anon.upload(PNG, "a.png", purpose="need_photo").status_code, 401)
        from PIL import Image
        img = Image.new("RGB", (40, 30), "red")
        exif = Image.Exif()
        exif[0x010F] = "SecretCam"
        exif[0x8825] = {1: "N", 2: (18.0, 31.0, 0.0)}  # GPS latitude
        buf = io.BytesIO()
        img.save(buf, format="JPEG", exif=exif.tobytes())
        self.assertIn(b"SecretCam", buf.getvalue())
        r = u.upload(buf.getvalue(), "geo.jpg", purpose="need_photo", visibility="public")
        self.assertEqual(r.status_code, 201)
        stored = db.get("files", r.json()["file"]["id"])
        data = (config.settings.upload_dir / stored["stored_name"]).read_bytes()
        self.assertNotIn(b"SecretCam", data, "EXIF metadata must be stripped")
        # unattached file only visible to its owner
        self.assertEqual(self.anon.get(r.json()["file"]["url"]).status_code, 404)
        self.assertEqual(u.get(r.json()["file"]["url"]).status_code, 200)

        other = self.register("f2@example.org")
        body = self.project_body(photo_file_ids=[r.json()["file"]["id"]])
        self.assertEqual(other.post("/api/projects", body).status_code, 422, "can't attach someone else's photo")
        self.assertEqual(u.post("/api/projects", body).status_code, 201)

    def test_dashboard_and_notifications(self):
        owner = self.register("d-owner@example.org")
        vol = self.register("d-vol@example.org", "volunteer")
        rev = self.make_staff("d-rev@example.org", "verifier")
        pid = self.published_project(owner, rev)
        c = vol.post(f"/api/projects/{pid}/commitments", {"kind": "volunteers", "quantity": 2, "hours": 5}).json()["commitment"]["id"]
        d = owner.get("/api/dashboard").json()
        self.assertEqual(len(d["incoming_proposals"]), 1)
        self.assertEqual(d["my_projects"][0]["id"], pid)
        self.assertTrue(d["resource_gaps"])
        self.assertTrue(any(u["type"] == "milestone" for u in d["upcoming"]))
        owner.post(f"/api/commitments/{c}/action", {"action": "accept"})
        dv = vol.get("/api/dashboard").json()
        self.assertEqual(dv["my_commitments"][0]["status"], "accepted")
        self.assertEqual(dv["volunteer_hours_pledged"], 10)
        self.assertTrue(any(u["project"]["id"] == pid for u in dv["upcoming"]))
        self.assertIn("review_counts", rev.get("/api/dashboard").json())

        n = vol.get("/api/notifications").json()
        self.assertGreaterEqual(n["unread"], 1)
        vol.post("/api/notifications/read", {"all": True})
        self.assertEqual(vol.get("/api/notifications").json()["unread"], 0)
        # cannot mark others' notifications
        on = owner.get("/api/notifications").json()
        vol.post("/api/notifications/read", {"ids": [x["id"] for x in on["notifications"]]})
        self.assertEqual(owner.get("/api/notifications").json()["unread"], on["unread"])

    def test_org_membership(self):
        a = self.register("o-a@example.org", "ngo", org={"name": "Seva NGO", "org_type": "ngo"})
        b = self.register("o-b@example.org", "volunteer")
        org = a.user["organizations"][0]["id"]
        self.assertEqual(b.post(f"/api/organizations/{org}/members", {"email": "o-a@example.org"}).status_code, 403)
        self.assertEqual(a.post(f"/api/organizations/{org}/members", {"email": "nobody@example.org"}).status_code, 404)
        self.assertEqual(a.post(f"/api/organizations/{org}/members", {"email": "o-b@example.org"}).status_code, 201)
        detail = b.get(f"/api/organizations/{org}").json()["organization"]
        self.assertEqual(detail["my_role"], "member")
        public = self.anon.get(f"/api/organizations/{org}").json()["organization"]
        self.assertNotIn("members", public)
        self.assertNotIn("registration_number", public)
        # a member (non-admin) can post a project under the org but can't manage others' org projects
        pid = b.post("/api/projects", self.project_body(org_id=org)).json()["project"]["id"]
        self.assertEqual(a.put(f"/api/projects/{pid}", self.project_body(org_id=org)).status_code, 200,
                         "org owners can manage org projects")
        self.assertEqual(a.delete(f"/api/organizations/{org}/members/{a.user['id']}").status_code, 400, "last owner stays")
        self.assertEqual(b.delete(f"/api/organizations/{org}/members/{b.user['id']}").status_code, 200, "members can leave")

    def test_demo_data_is_labelled_and_excluded_from_impact(self):
        from app.seed import remove_demo, seed_demo
        seed_demo()
        projects = self.anon.get("/api/projects").json()["projects"]
        demo = [p for p in projects if p["is_demo"]]
        self.assertGreaterEqual(len(demo), 4)
        self.assertTrue(all(not p["need_verified"] and not p["completion_verified"] for p in demo))
        self.assertTrue(all(p["organization"]["verification_status"] != "verified" for p in demo))
        self.assertEqual(self.anon.get("/api/projects", params={"include_demo": "0"}).json()["total"],
                         len(projects) - len(demo))
        imp = self.anon.get("/api/impact").json()
        self.assertFalse(imp["includes_demo"])
        from app import config as _cfg
        _cfg.settings.show_demo_publicly = False   # production default: samples never shown to the public
        try:
            self.assertFalse([p for p in self.anon.get("/api/projects").json()["projects"] if p["is_demo"]])
            self.assertFalse([e for e in self.anon.get("/api/activity").json()["events"] if e["project"]["is_demo"]])
        finally:
            _cfg.settings.show_demo_publicly = True
        remove_demo()
        self.assertFalse([p for p in self.anon.get("/api/projects").json()["projects"] if p["is_demo"]])

    def test_spa_seo_and_security_headers(self):
        r = self.anon.get("/explore")
        self.assertEqual(r.status_code, 200)
        self.assertIn("X-Frame-Options", r.headers)
        self.assertIn("Content-Security-Policy", r.headers)
        self.assertIn("Sitemap:", self.anon.get("/robots.txt").text)
        self.assertIn("<urlset", self.anon.get("/sitemap.xml").text)
        self.assertEqual(self.anon.get("/api/nope").status_code, 404)


class ProofAndActivityTests(Base):
    db_name = "proof"

    def test_timeline_activity_and_stats(self):
        owner = self.register("t-owner@example.org")
        vol = self.register("t-vol@example.org", "volunteer", name="Priya Kulkarni")
        club = self.register("t-club@example.org", "club", org={"name": "RC Akurdi", "org_type": "rotary"})
        rev = self.make_staff("t-rev@example.org", "verifier")
        pid = self.published_project(owner, rev)
        c1 = vol.post(f"/api/projects/{pid}/commitments", {"kind": "volunteers", "quantity": 2, "hours": 4}).json()["commitment"]["id"]
        org = club.user["organizations"][0]["id"]
        c2 = club.post(f"/api/projects/{pid}/commitments", {"kind": "money", "quantity": 30000, "org_id": org}).json()["commitment"]["id"]
        c3 = club.post(f"/api/projects/{pid}/commitments", {"kind": "money", "quantity": 999}).json()["commitment"]["id"]
        for c in (c1, c2):
            owner.post(f"/api/commitments/{c}/action", {"action": "accept"})
        owner.post(f"/api/projects/{pid}/updates", {"title": "Site visit done", "body": "Met the headmaster and measured the space."})
        p = self.anon.get(f"/api/projects/{pid}").json()["project"]
        kinds = [e["kind"] for e in p["timeline"]]
        self.assertIn("published", kinds); self.assertIn("update", kinds); self.assertEqual(kinds.count("pledge"), 2)
        titles = " ".join(e["title"] for e in p["timeline"])
        self.assertIn("RC Akurdi committed funding", titles)
        self.assertIn("Priya committed volunteers", titles)
        self.assertNotIn("Kulkarni", titles, "individuals appear by first name only")
        self.assertNotIn("999", json.dumps(p["timeline"]), "pending offers are not shown as proof")
        self.assertIsNotNone(p["last_activity_at"])
        acts = self.anon.get("/api/activity").json()["events"]
        self.assertTrue(any(e["kind"] == "pledge" and "RC Akurdi" in e["text"] for e in acts))
        self.assertFalse(any("Kulkarni" in e["text"] for e in acts))
        tile = [x for x in self.anon.get("/api/projects").json()["projects"] if x["id"] == pid][0]
        self.assertEqual(tile["open_items"][0]["name"], "Handwash unit")
        st = club.get("/api/dashboard").json()["stats"]
        self.assertEqual((st["money_pledged"], st["projects_supported"]), (30000, 1))
        self.assertEqual(owner.get("/api/dashboard").json()["stats"]["pending_offers"], 1)
        draft = owner.post("/api/projects", self.project_body(title="Hidden draft activity")).json()["project"]["id"]
        self.assertFalse(any(e["project"]["id"] == draft for e in self.anon.get("/api/activity").json()["events"]))


class AccountDeletionAndAppTests(Base):
    db_name = "deletion"

    def test_delete_account(self):
        owner = self.register("d-owner@example.org")
        vol = self.register("d-vol@example.org", "volunteer", name="Ravi Deshmukh")
        club = self.register("d-club@example.org", "club", org={"name": "RC Nigdi", "org_type": "rotary"})
        rev = self.make_staff("d-rev@example.org", "verifier")
        pid = self.published_project(owner, rev)
        draft = owner.post("/api/projects", self.project_body(title="Private draft")).json()["project"]["id"]
        up = vol.upload(PNG, "me.png", purpose="avatar", visibility="private")
        c_acc = vol.post(f"/api/projects/{pid}/commitments", {"kind": "volunteers", "quantity": 2, "hours": 3}).json()["commitment"]["id"]
        c_open = vol.post(f"/api/projects/{pid}/commitments", {"kind": "volunteers", "quantity": 1, "hours": 2}).json()["commitment"]["id"]
        owner.post(f"/api/commitments/{c_acc}/action", {"action": "accept"})
        self.assertEqual(self.anon.get(f"/api/projects/{pid}").json()["project"]["resources"]["volunteers"]["pledged"], 2)

        self.assertEqual(self.anon.post("/api/auth/delete-account", {"password": "x", "confirm": "DELETE"}).status_code, 401)
        self.assertEqual(vol.post("/api/auth/delete-account", {"password": "Secure#pass1", "confirm": "nope"}).status_code, 422)
        self.assertEqual(vol.post("/api/auth/delete-account", {"password": "Wrong#pass1", "confirm": "DELETE"}).status_code, 400)
        r = vol.post("/api/auth/delete-account", {"password": "Secure#pass1", "confirm": "delete"})
        self.assertEqual(r.status_code, 200, r.text)

        u = db.get("users", vol.user["id"])
        self.assertEqual(u["name"], "Deleted user")
        self.assertTrue(u["email"].endswith("@deleted.invalid"))
        self.assertIsNone(u["city"])
        self.assertEqual(vol.get("/api/auth/me").json()["user"], None, "old token no longer works")
        login = TestClient(self.app).post("/api/auth/login", json={"email": "d-vol@example.org", "password": "Secure#pass1"})
        self.assertEqual(login.status_code, 401)
        self.assertEqual(db.get("commitments", c_acc)["status"], "cancelled")
        self.assertEqual(db.get("commitments", c_open)["status"], "withdrawn")
        self.assertEqual(self.anon.get(f"/api/projects/{pid}").json()["project"]["resources"]["volunteers"]["pledged"], 0)
        if up.status_code == 201:
            self.assertIsNone(db.get("files", up.json()["file"]["id"]))
        self.assertTrue(any("deleted their account" in n["title"] for n in owner.get("/api/notifications").json()["notifications"]))
        self.assertNotIn("Ravi", json.dumps(self.anon.get(f"/api/projects/{pid}").json()))
        # the project owner deletes: draft is removed, the published project stays
        self.assertEqual(owner.post("/api/auth/delete-account", {"password": "Secure#pass1", "confirm": "DELETE"}).status_code, 200)
        self.assertIsNone(db.get("projects", draft))
        self.assertEqual(self.anon.get(f"/api/projects/{pid}").status_code, 200)
        # org ownership: sole owner leaves, org remains without members
        self.assertEqual(club.post("/api/auth/delete-account", {"password": "Secure#pass1", "confirm": "DELETE"}).status_code, 200)
        self.assertEqual(db.scalar("SELECT COUNT(*) FROM org_members WHERE user_id = ?", (club.user["id"],)), 0)
        # last admin cannot delete themselves
        admin = self.make_staff("d-admin@example.org", "admin")
        self.assertEqual(admin.post("/api/auth/delete-account", {"password": "Secure#pass1", "confirm": "DELETE"}).status_code, 409)

    def test_installable_app_files(self):
        r = self.anon.get("/manifest.webmanifest")
        self.assertEqual(r.status_code, 200)
        self.assertIn("manifest+json", r.headers["content-type"])
        m = r.json()
        self.assertEqual(m["display"], "standalone")
        self.assertTrue(any(i["sizes"] == "512x512" for i in m["icons"]))
        for i in m["icons"]:
            self.assertEqual(self.anon.get(i["src"]).status_code, 200, i["src"])
        sw = self.anon.get("/sw.js")
        self.assertEqual(sw.status_code, 200)
        self.assertIn("javascript", sw.headers["content-type"])
        self.assertEqual(self.anon.get("/.well-known/assetlinks.json").json(), [])
        os.environ.update(ANDROID_PACKAGE_NAME="org.impactbridge.app", ANDROID_CERT_SHA256="AA:BB")
        try:
            config.reload_settings()
            al = self.anon.get("/.well-known/assetlinks.json").json()
            self.assertEqual(al[0]["target"]["package_name"], "org.impactbridge.app")
            self.assertEqual(al[0]["target"]["sha256_cert_fingerprints"], ["AA:BB"])
        finally:
            os.environ.pop("ANDROID_PACKAGE_NAME"); os.environ.pop("ANDROID_CERT_SHA256")
            config.reload_settings()
        for path in ("/privacy", "/delete-account", "/offline"):
            self.assertEqual(self.anon.get(path).status_code, 200, path)


class AccountRecoveryTests(Base):
    db_name = "recovery"

    def test_forgot_and_reset_password(self):
        u = self.register("r-user@example.org")
        anon = Api(self.app)
        r = anon.post("/api/auth/forgot", {"email": "nobody@example.org"})
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("dev_link", r.json(), "no hint whether an account exists")
        r = anon.post("/api/auth/forgot", {"email": "R-User@example.org"})
        link = r.json()["dev_link"]
        token = link.split("token=")[1]
        self.assertEqual(anon.post("/api/auth/reset", {"token": token, "password": "short"}).status_code, 422)
        self.assertEqual(anon.post("/api/auth/reset", {"token": token, "password": "New#secret9"}).status_code, 200)
        self.assertEqual(anon.post("/api/auth/reset", {"token": token, "password": "New#secret9"}).status_code, 400, "single use")
        self.assertEqual(TestClient(self.app).post("/api/auth/login", json={"email": "r-user@example.org", "password": "Secure#pass1"}).status_code, 401)
        self.assertEqual(TestClient(self.app).post("/api/auth/login", json={"email": "r-user@example.org", "password": "New#secret9"}).status_code, 200)
        self.assertTrue(db.get("users", u.user["id"])["email_verified"], "resetting by email proves the address")

    def test_email_verification_and_enforcement(self):
        u = self.register("v-user@example.org")
        self.assertFalse(u.get("/api/auth/me").json()["user"]["email_verified"])
        self.assertFalse(u.get("/api/auth/me").json()["user"]["needs_verification"], "not enforced without email delivery")
        link = u.post("/api/auth/resend-verification").json()["dev_link"]
        self.assertEqual(Api(self.app).post("/api/auth/verify-email", {"token": link.split("token=")[1]}).status_code, 200)
        self.assertTrue(u.get("/api/auth/me").json()["user"]["email_verified"])
        # with email configured, unverified accounts can't submit or pledge
        rev = self.make_staff("v-rev@example.org", "verifier")
        other = self.register("v-other@example.org")
        pid = other.post("/api/projects", self.project_body()).json()["project"]["id"]
        config.settings.resend_api_key = "test-key"
        try:
            r = other.post(f"/api/projects/{pid}/transition", {"status": "submitted"})
            self.assertEqual((r.status_code, r.json().get("code")), (403, "verify_required"))
            self.assertTrue(other.get("/api/auth/me").json()["user"]["needs_verification"])
        finally:
            config.settings.resend_api_key = ""
        self.assertEqual(other.post(f"/api/projects/{pid}/transition", {"status": "submitted"}).status_code, 200)

    def test_phone_signup_login_and_verify(self):
        anon = Api(self.app)
        self.assertEqual(anon.post("/api/auth/otp/start", {"phone": "12345"}).status_code, 422)
        r = anon.post("/api/auth/otp/start", {"phone": "98765 43210"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["phone"], "+919876543210")
        code = r.json()["dev_code"]
        self.assertEqual(anon.post("/api/auth/otp/start", {"phone": "9876543210"}).status_code, 429, "30-second resend wait")
        bad = anon.post("/api/auth/otp/verify", {"phone": "9876543210", "code": "000000" if code != "000000" else "111111"})
        self.assertEqual(bad.status_code, 400)
        r = anon.post("/api/auth/otp/verify", {"phone": "+91 98765 43210", "code": code})
        self.assertTrue(r.json()["needs_signup"])
        ticket = r.json()["ticket"]
        r = TestClient(self.app).post("/api/auth/register-phone", json={"ticket": ticket, "name": "Sunita Pawar", "role": "submitter",
                                                                       "city": "Pune", "accept_terms": True})
        self.assertEqual(r.status_code, 201, r.text)
        me = r.json()["user"]
        self.assertIsNone(me["email"])
        self.assertTrue(me["phone_verified"])
        self.assertFalse(me["has_password"])
        self.assertEqual(TestClient(self.app).post("/api/auth/register-phone", json={"ticket": ticket, "name": "X Y", "role": "submitter", "accept_terms": True}).status_code, 400)
        # sign in again with a fresh code (bypass the resend wait by ageing the previous code)
        db.execute("UPDATE auth_tokens SET created_at = '2000-01-01T00:00:00+00:00' WHERE kind = 'otp'")
        code = anon.post("/api/auth/otp/start", {"phone": "9876543210"}).json()["dev_code"]
        r = TestClient(self.app).post("/api/auth/otp/verify", json={"phone": "9876543210", "code": code})
        self.assertEqual(r.json()["user"]["name"], "Sunita Pawar")
        sunita = Api(self.app, r.json()["token"], r.json()["user"])
        # phone-only account can delete itself without a password
        # an email account verifies a number; the same number can't be claimed twice
        e = self.register("p-email@example.org")
        db.execute("UPDATE auth_tokens SET created_at = '2000-01-01T00:00:00+00:00' WHERE kind = 'otp'")
        code = e.post("/api/auth/otp/start", {"phone": "9876543210", "purpose": "verify"}).json()["dev_code"]
        self.assertEqual(e.post("/api/auth/otp/verify", {"phone": "9876543210", "code": code, "purpose": "verify"}).status_code, 409)
        code = e.post("/api/auth/otp/start", {"phone": "9123456780", "purpose": "verify"}).json()["dev_code"]
        self.assertEqual(e.post("/api/auth/otp/verify", {"phone": "9123456780", "code": code, "purpose": "verify"}).status_code, 200)
        self.assertTrue(e.get("/api/auth/me").json()["user"]["phone_verified"])
        self.assertEqual(sunita.post("/api/auth/delete-account", {"confirm": "DELETE"}).status_code, 200)

    def test_code_attempt_limit(self):
        anon = Api(self.app)
        code = anon.post("/api/auth/otp/start", {"phone": "9000000001"}).json()["dev_code"]
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(5):
            anon.post("/api/auth/otp/verify", {"phone": "9000000001", "code": wrong})
        self.assertEqual(anon.post("/api/auth/otp/verify", {"phone": "9000000001", "code": code}).status_code, 429)


class SafetyAndPushTests(Base):
    db_name = "safety"

    def test_block_user(self):
        owner = self.register("b-owner@example.org")
        vol = self.register("b-vol@example.org", "volunteer")
        rev = self.make_staff("b-rev@example.org", "verifier")
        pid = self.published_project(owner, rev)
        cid = vol.post(f"/api/projects/{pid}/commitments", {"kind": "volunteers", "quantity": 1, "hours": 2}).json()["commitment"]["id"]
        self.assertEqual(owner.post(f"/api/users/{rev.user['id']}/block").status_code, 409, "reviewers can't be blocked")
        r = owner.post(f"/api/users/{vol.user['id']}/block")
        self.assertEqual((r.status_code, r.json()["closed_offers"]), (200, 1))
        self.assertEqual(db.get("commitments", cid)["status"], "withdrawn")
        self.assertEqual(vol.post(f"/api/projects/{pid}/commitments", {"kind": "volunteers", "quantity": 1}).status_code, 403)
        self.assertFalse(any(x["id"] == pid for x in vol.get("/api/projects").json()["projects"]), "blocked person's projects are hidden both ways")
        self.assertTrue(vol.get(f"/api/projects/{pid}").json()["project"]["blocked_owner"])
        self.assertEqual([b["id"] for b in owner.get("/api/blocks").json()["blocked"]], [vol.user["id"]])
        self.assertEqual(owner.delete(f"/api/users/{vol.user['id']}/block").status_code, 200)
        self.assertEqual(vol.post(f"/api/projects/{pid}/commitments", {"kind": "volunteers", "quantity": 1, "hours": 2}).status_code, 201)

    def test_push_subscription_rules(self):
        u = self.register("push@example.org")
        self.assertIsNone(u.get("/api/push/key").json()["key"])
        self.assertEqual(u.post("/api/push/subscribe", {"endpoint": "https://fcm.googleapis.com/fcm/send/x"}).status_code, 503)
        from app.services.push import generate_keys
        config.settings.vapid_public, config.settings.vapid_private = generate_keys()
        try:
            self.assertEqual(u.post("/api/push/subscribe", {"endpoint": "https://evil.example/collect"}).status_code, 422)
            self.assertEqual(u.post("/api/push/subscribe", {"endpoint": "https://fcm.googleapis.com/fcm/send/abc"}).status_code, 200)
            self.assertEqual(db.scalar("SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?", (u.user["id"],)), 1)
            self.assertEqual(u.post("/api/push/unsubscribe", {"endpoint": "https://fcm.googleapis.com/fcm/send/abc"}).status_code, 200)
        finally:
            config.settings.vapid_public = config.settings.vapid_private = ""

    def test_client_errors_and_language(self):
        anon = Api(self.app)
        self.assertEqual(anon.post("/api/client-errors", {"message": "TypeError: x is undefined", "source": "app.js:10", "path": "/explore?q=secret"}).status_code, 200)
        self.assertEqual(db.one("SELECT path FROM client_errors")["path"], "/explore", "query strings are dropped")
        admin = self.make_staff("ce-admin@example.org")
        self.assertEqual(admin.get("/api/admin/client-errors").json()["errors"][0]["count"], 1)
        u = self.register("lang@example.org")
        self.assertEqual(u.patch("/api/auth/me", {"language": "mr"}).json()["user"]["language"], "mr")
        self.assertEqual(u.patch("/api/auth/me", {"language": "fr"}).status_code, 422)
        for path in ("/terms", "/forgot-password", "/reset-password", "/verify-email"):
            self.assertEqual(anon.get(path).status_code, 200, path)


class CoordinationTests(Base):
    db_name = "coordination"

    def test_ai_estimate_and_language(self):
        seen = {}
        def fake(system, text, images):
            seen["text"] = text
            return json.dumps({"title": "शाळेतील नळ", "problem_statement": "शाळेत १८० मुलांसाठी एकच नळ आहे.",
                               "proposed_solution": "चार नळ बसवणे", "beneficiaries": "विद्यार्थी", "beneficiary_count": 180,
                               "budget_required": 90000, "volunteers_required": 5, "materials": [], "skills": [],
                               "milestones": [], "outcomes": [], "budget_estimate": {"amount": 48350, "basis": "4 taps with piping"},
                               "missing_information": [], "follow_up_questions": []})
        ai.set_test_hooks(provider=fake)
        try:
            u = self.register("lang-ai@example.org")
            r = u.post("/api/ai/structure", {"description": "आमच्या शाळेत १८० मुलांसाठी फक्त एकच नळ आहे, पाच स्वयंसेवक मदत करतील.", "language": "mr"})
            self.assertEqual(r.status_code, 200, r.text)
            p = r.json()["proposal"]
            self.assertIn("Marathi", seen["text"])
            self.assertEqual(p["beneficiary_count"], 180, "Devanagari digits count as stated")
            self.assertEqual(p["volunteers_required"], 5, "Marathi number words count as stated")
            self.assertIsNone(p["budget_required"], "the AI's own budget never fills the budget field")
            self.assertEqual(p["budget_estimate"], {"amount": 48400.0, "basis": "4 taps with piping"})
        finally:
            ai.set_test_hooks()

    def test_interest_chat_recommendations_certificates(self):
        owner = self.register("c-owner@example.org")
        rev = self.make_staff("c-rev@example.org", "verifier")
        vol = self.register("c-vol@example.org", "volunteer", city="Pune")
        db.execute("UPDATE users SET skills = ? WHERE id = ?", (json.dumps(["Plumbing"]), vol.user["id"]))
        stranger = self.register("c-str@example.org", "volunteer", city="Nagpur")
        club = self.register("c-club@example.org", "club", org={"name": "RC Baner", "org_type": "rotary"})
        pid = self.published_project(owner, rev)
        # recommendations: same city + skill
        recs = vol.get("/api/recommendations").json()["projects"]
        self.assertEqual(recs[0]["id"], pid)
        self.assertIn("In your city", recs[0]["reasons"])
        self.assertTrue(any("Plumbing" in r for r in recs[0]["reasons"]))
        self.assertFalse(any(x["id"] == pid for x in owner.get("/api/recommendations").json()["projects"]), "own projects excluded")
        # effort filter
        light = {x["id"] for x in self.anon.get("/api/projects?effort=light").json()["projects"]}
        medium = {x["id"] for x in self.anon.get("/api/projects?effort=medium").json()["projects"]}
        self.assertIn(pid, medium | light)
        self.assertNotIn(pid, light & medium)
        # interest and chat
        self.assertEqual(stranger.get(f"/api/projects/{pid}/messages").status_code, 403)
        r = vol.post(f"/api/projects/{pid}/interest")
        self.assertEqual(r.json()["interest"]["count"], 1)
        self.assertTrue(any(n["type"] == "interest" for n in owner.get("/api/notifications").json()["notifications"]))
        self.assertEqual(vol.post(f"/api/projects/{pid}/messages", {"body": "Can I bring tools on Sunday?"}).status_code, 200)
        self.assertTrue(any(n["type"] == "message" for n in owner.get("/api/notifications").json()["notifications"]))
        self.assertEqual(owner.post(f"/api/projects/{pid}/messages", {"body": "Yes please!"}).status_code, 200)
        msgs = vol.get(f"/api/projects/{pid}/messages").json()["messages"]
        self.assertEqual([m["body"] for m in msgs], ["Can I bring tools on Sunday?", "Yes please!"])
        self.assertTrue(msgs[1]["author"]["is_team"])
        self.assertEqual(owner.get(f"/api/projects/{pid}").json()["project"]["interest"]["people"][0]["id"], vol.user["id"])
        self.assertEqual(stranger.delete(f"/api/messages/{msgs[0]['id']}").status_code, 403)
        self.assertEqual(owner.delete(f"/api/messages/{msgs[0]['id']}").status_code, 200)
        self.assertEqual(len(vol.get(f"/api/projects/{pid}/messages").json()["messages"]), 1)
        # certificate after completion
        org = club.user["organizations"][0]["id"]
        cid = club.post(f"/api/projects/{pid}/commitments", {"kind": "money", "quantity": 50000, "org_id": org}).json()["commitment"]["id"]
        owner.post(f"/api/commitments/{cid}/action", {"action": "accept"})
        self.assertEqual(self.anon.get(f"/api/certificates/{cid}").status_code, 404, "no certificate before completion")
        owner.post(f"/api/projects/{pid}/transition", {"status": "in_progress"})
        r = owner.put(f"/api/projects/{pid}/impact-report", {"people_reached": 180, "summary": "Stations installed and in use."})
        self.assertIn(r.status_code, (200, 201), r.text)
        self.assertEqual(owner.post(f"/api/projects/{pid}/transition", {"status": "completed"}).status_code, 200)
        cert = self.anon.get(f"/api/certificates/{cid}").json()["certificate"]
        self.assertEqual(cert["sponsor"]["name"], "RC Baner")
        self.assertEqual(cert["contribution"]["quantity"], 50000)
        self.assertEqual(cert["report"]["people_reached"], 180)
        self.assertTrue(cert["number"].startswith("IB-"))
        self.assertEqual([c["id"] for c in club.get("/api/my/certificates").json()["certificates"]], [cid])


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
