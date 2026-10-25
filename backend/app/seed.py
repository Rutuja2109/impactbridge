"""Clearly-labelled demo data for trying ImpactBridge locally.

Every record created here has is_demo = 1 and the UI shows a "Demo data" badge.
Demo organizations are never verified and demo projects are never marked verified.
"""
from __future__ import annotations

import secrets
from datetime import date, datetime, timedelta, timezone

from . import db
from .security import hash_password

DEMO_PROJECTS = [
    {
        "title": "Handwashing stations for a village primary school",
        "story": "At lunch break, around 180 children line up at a single tap, and most can't wash their hands before eating. Teachers see children fall ill with stomach problems every monsoon. Four handwashing stations would let every child wash before eating.",
        "cause": "water_sanitation", "city": "Talegaon Dabhade", "region": "Maharashtra",
        "problem_statement": "Around 180 children at a zilla parishad primary school share one tap. During lunch "
                             "break most children cannot wash hands before eating, and teachers report frequent "
                             "stomach illness in the monsoon.",
        "proposed_solution": "Install four multi-tap handwashing stations connected to two 500 litre tanks, and run "
                             "a short hygiene session with teachers.",
        "beneficiaries": "Students and teachers of the school", "beneficiary_count": 180,
        "budget_required": 85000, "volunteers_required": 6, "duration_weeks": 6,
        "materials": [{"name": "Multi-tap handwash unit", "quantity": 4, "unit": "units"},
                      {"name": "Water tank 500 L", "quantity": 2, "unit": "tanks"}],
        "skills": ["Plumbing", "Hygiene education"], "time_commitment": "Two weekends for installation",
        "involves_children": 1,
        "safeguarding_notes": "All activity during school hours with teachers present. No photos of children's faces.",
        "milestones": ["Confirm site and water source with headmaster", "Procure units and tanks",
                       "Installation weekend", "Hygiene session with teachers"],
        "outcomes": [("Students with access to handwashing before meals", 180, "students")],
    },
    {
        "title": "Pre-monsoon drain clearing in a residential lane",
        "story": "Last monsoon, water came into the ground-floor homes of this lane twice. The drains outside about 60 homes are choked with silt and plastic. One clean-up morning with the residents can keep the lane dry this year.",
        "cause": "community_infrastructure", "city": "Pimpri", "region": "Maharashtra",
        "problem_statement": "Open drains along a lane of about 60 homes are blocked with silt and plastic. Last "
                             "monsoon water entered ground-floor homes twice.",
        "proposed_solution": "A volunteer clean-up drive with residents, coordinated with the ward office for waste "
                             "pickup, followed by a plastic-waste awareness meeting.",
        "beneficiaries": "Families living along the lane", "beneficiary_count": 60,
        "budget_required": 15000, "volunteers_required": 20, "duration_weeks": 2,
        "materials": [{"name": "Heavy-duty gloves", "quantity": 40, "unit": "pairs"},
                      {"name": "Shovels", "quantity": 10, "unit": "pieces"}],
        "skills": ["Community mobilisation"], "time_commitment": "One Sunday morning, 4 hours",
        "milestones": ["Ward office coordination", "Clean-up drive", "Awareness meeting"],
        "outcomes": [("Length of drain cleared", None, "metres")],
    },
    {
        "title": "Smartphone basics for senior citizens",
        "story": "Many members of this seniors' association depend on family to make a UPI payment or answer a video call, and find it hard to spot fraud messages. A few evening classes would give them back their independence.",
        "cause": "elderly_care", "city": "Pune", "region": "Maharashtra",
        "problem_statement": "Many members of a senior citizens' association struggle with UPI payments, video calls "
                             "and spotting fraud messages, and depend on family for basic tasks.",
        "proposed_solution": "Eight weekly evening sessions in small groups covering calls, UPI safety, and scam "
                             "awareness, using the association hall.",
        "beneficiaries": "Members of the senior citizens' association", "beneficiary_count": 40,
        "budget_required": 12000, "volunteers_required": 8, "duration_weeks": 8,
        "materials": [{"name": "Projector", "quantity": 1, "unit": "unit"}],
        "skills": ["Teaching", "Digital literacy", "Cyber safety"], "time_commitment": "2 hours per week",
        "involves_vulnerable": 1,
        "safeguarding_notes": "Volunteers never handle participants' phones' PINs or bank details.",
        "milestones": ["Session plan and handouts", "Sessions 1–4", "Sessions 5–8", "Feedback round"],
        "outcomes": [("Participants completing all sessions", None, "people")],
    },
    {
        "title": "Native tree plantation along the river bank",
        "story": "The river bank near the village is slowly washing away, with little tree cover left to hold it. Native saplings planted before the monsoon, and young people to water them, can help the bank hold.",
        "cause": "environment", "city": "Dehu", "region": "Maharashtra",
        "problem_statement": "A stretch of the river bank near the village is eroding and has little tree cover.",
        "proposed_solution": "Plant 300 native saplings with community volunteers before monsoon and set up a "
                             "watering rota with local youth for the first year.",
        "beneficiaries": "Village residents and farmers along the bank", "beneficiary_count": None,
        "budget_required": 60000, "volunteers_required": 50, "duration_weeks": 52,
        "materials": [{"name": "Native saplings", "quantity": 300, "unit": "saplings"},
                      {"name": "Tree guards", "quantity": 300, "unit": "pieces"}],
        "skills": ["Horticulture"], "time_commitment": "One plantation day, then weekly watering rota",
        "milestones": ["Gram panchayat permission", "Plantation day", "3-month survival check", "12-month survival check"],
        "outcomes": [("Saplings surviving after 12 months", None, "saplings")],
    },
]


def _p(title, story, cause, city, budget, vols, weeks, beneficiaries, count, skills, pledges, **kw):
    """Compact sample project. pledges = [(supporter_key, kind, quantity, anonymous, message)]."""
    return {"title": title, "story": story, "cause": cause, "city": city, "region": "Maharashtra",
            "problem_statement": story, "proposed_solution": kw.pop("solution"), "beneficiaries": beneficiaries,
            "beneficiary_count": count, "budget_required": budget, "volunteers_required": vols, "duration_weeks": weeks,
            "materials": [], "skills": skills, "time_commitment": kw.pop("time", "A few weekends"),
            "milestones": kw.pop("milestones"), "outcomes": [(kw.pop("metric"), count, kw.pop("unit"))],
            "pledges": pledges, **kw}


DEMO_PROJECTS += [
    _p("Evening study room for 40 children in a slum lane",
       "Children in this lane share one small room with no light after dark, so homework waits until morning. A study room with lamps, mats and a volunteer teacher gives them a place to learn every evening.",
       "education", "Pimpri-Chinchwad", 45000, 10, 24, "Children aged 8 to 14", 40, ["Teaching"],
       [("a", "money", 15000, False, "Education changed my life. Happy to give a child that chance."),
        ("b", "money", 5000, True, None), ("c", "volunteers", 2, False, "We can take Tuesdays and Thursdays."),
        ("d", "money", 2500, False, "Keep us posted with photos!")],
       solution="Rent a room, fit lamps and mats, and run a volunteer-taught homework hour on weekday evenings.",
       milestones=["Room and lights ready", "First month of classes", "Mid-term check with parents"],
       metric="Children attending 3+ evenings a week", unit="children", involves_children=1,
       safeguarding_notes="Two adults present at all times. No photos of children's faces."),
    _p("Fresh meals for 25 elderly people living alone",
       "Many older neighbours here cook only once a day because standing at the stove tires them. A neighbourhood kitchen team can deliver a warm dal-rice tiffin on weekdays.",
       "hunger_nutrition", "Pune", 36000, 12, 12, "Elderly people living alone", 25, ["Cooking", "Delivery"],
       [("a", "money", 12000, False, "For my grandmother's neighbours."), ("c", "money", 8000, False, None),
        ("d", "volunteers", 4, False, "Delivery on bike every Saturday."), ("b", "money", 3000, True, None)],
       solution="A rota of home cooks and delivery volunteers supplies a weekday tiffin for 12 weeks.",
       milestones=["Recruit cooks and delivery team", "Tiffin service begins", "Feedback round"],
       metric="Tiffins delivered", unit="meals", involves_vulnerable=1),
    _p("Sewing machines for a women's self-help group",
       "Twelve women in this group stitch by hand and finish one blouse a day. Four machines would triple their output and let them take bulk orders from local boutiques.",
       "livelihoods", "Chakan", 52000, 3, 8, "Twelve women in the group", 12, ["Tailoring"],
       [("b", "money", 20000, False, "Proud to back women entrepreneurs."), ("c", "money", 10000, False, None),
        ("a", "money", 4000, True, None)],
       solution="Buy four machines and fund a short skill upgrade so the group can take regular orders.",
       milestones=["Machines purchased", "Skill training", "First bulk order delivered"],
       metric="Women earning a regular income", unit="women"),
    _p("Eye-check camp for a village of 300 families",
       "Many older villagers squint through years of blurred vision because the nearest eye clinic is 30 km away. A one-day camp brings the checks and spectacles to them.",
       "health", "Maval", 40000, 15, 4, "Villagers aged 40 and above", 300, ["Nursing", "Registration"],
       [("a", "money", 18000, False, "Glad to help."), ("d", "money", 6000, False, None),
        ("c", "volunteers", 5, False, "Our Rotaract team will manage registration.")],
       solution="Partner with a licensed eye hospital for a one-day camp with free checks and subsidised glasses.",
       milestones=["Hospital partner confirmed", "Camp day", "Spectacle distribution"],
       metric="People screened", unit="people"),
    _p("Safe play area with swings for a housing society",
       "Children here play next to the parking lot because there is no safe play area. Two swings, a slide and soft flooring would give about 70 children a safe place.",
       "community_infrastructure", "Wakad", 90000, 8, 6, "Children living in the society", 70, ["Carpentry"],
       [("c", "money", 30000, False, None), ("a", "money", 12000, False, "Every child needs to play."),
        ("b", "money", 6000, True, None)],
       solution="Install play equipment and rubber flooring in the unused corner, with residents helping on installation day.",
       milestones=["Society approval", "Equipment ordered", "Installation day"],
       metric="Children using the play area weekly", unit="children", involves_children=1,
       safeguarding_notes="Equipment installed by a certified vendor."),
    _p("Rescue and vaccination drive for street dogs",
       "Strays in this ward are not vaccinated, which puts both dogs and residents at risk of rabies. A trained vet team can vaccinate and tag 150 dogs in two weekends.",
       "animal_welfare", "Hinjewadi", 28000, 10, 3, "Residents and street animals", 150, ["Veterinary"],
       [("b", "money", 9000, False, "Dog mom here, count me in."), ("d", "volunteers", 3, False, None)],
       solution="A vet team vaccinates and tags dogs while volunteers guide them in humanely.",
       milestones=["Vet team booked", "Vaccination weekends", "Tag registry shared with ward"],
       metric="Dogs vaccinated", unit="dogs"),
]


_BASE_PLEDGES = [
    [("a", "money", 25000, False, "Clean water for kids. Count me in."), ("c", "money", 10000, False, None), ("b", "money", 2000, True, None)],
    [("d", "volunteers", 6, False, "Our building group will come on Sunday."), ("b", "money", 3000, False, None)],
    [("b", "volunteers", 3, False, "I teach on weekends."), ("a", "money", 4000, False, "Great idea.")],
    [("c", "money", 15000, False, None), ("d", "volunteers", 12, False, "Our college NSS unit.")],
]
for _spec, _pl in zip(DEMO_PROJECTS, _BASE_PLEDGES):
    _spec["pledges"] = _pl


_UPDATES = {
    0: [("Site visit done", "We met the headmaster and marked where the four stations will go. The water line is only 12 metres away.")],
    1: [("Ward office said yes", "The ward office will send a truck to collect the silt on the day. We only need hands and gloves.")],
    4: [("Room is booked", "We have a room for the evening study space and the first 25 children have signed up.")],
    5: [("Cooks recruited", "Eight home cooks have joined the rota. First tiffins go out next Monday.")],
    6: [("Machines shortlisted", "The group picked four sturdy machines. A local dealer gave a discount for the bulk order.")],
    7: [("Eye hospital confirmed", "A licensed eye hospital will send two doctors and a van on camp day.")],
}


def seed_demo() -> None:
    if db.scalar("SELECT COUNT(*) FROM projects WHERE is_demo = 1"):
        print("Demo data already present. Run remove-demo first to recreate it.")
        return
    ts = db.now()
    password = "demo-" + secrets.token_urlsafe(6)
    accounts = [
        ("demo.community@example.org", "Demo Community Group", "submitter"),
        ("demo.club@example.org", "Demo Rotaract Member", "club"),
        ("demo.csr@example.org", "Demo CSR Lead", "csr"),
        ("demo.volunteer@example.org", "Demo Volunteer", "volunteer"),
    ]
    users = {}
    sup = {}
    for key, nm in [("a", "Aarav Kulkarni"), ("b", "Priya Deshmukh"), ("c", "Rotaract Club of Akurdi"), ("d", "Neha Patil")]:
        uid = db.new_id()
        db.insert("users", {"id": uid, "email": f"demo.{key}@example.org", "password_hash": hash_password(password), "name": nm,
                            "role": "volunteer", "city": "Pune", "region": "Maharashtra", "skills": "[]", "is_demo": 1,
                            "created_at": ts, "updated_at": ts})
        sup[key] = uid
    for email, name, role in accounts:
        uid = db.new_id()
        db.insert("users", {"id": uid, "email": email, "password_hash": hash_password(password), "name": name,
                            "role": role, "city": "Pune", "region": "Maharashtra", "skills": "[]", "is_demo": 1,
                            "created_at": ts, "updated_at": ts})
        users[role] = uid
    orgs = {}
    for key, name, otype, owner in [("community", "Demo Neighbourhood Association", "community", "submitter"),
                                    ("ward", "Demo Ward Residents Forum", "community", "submitter"),
                                    ("shg", "Demo Women's Self-Help Group", "community", "submitter"),
                                    ("club", "Demo Rotaract Club", "rotaract", "club"),
                                    ("csr", "Demo Company CSR", "csr", "csr")]:
        oid = db.new_id()
        db.insert("organizations", {"id": oid, "name": name, "org_type": otype, "city": "Pune", "region": "Maharashtra",
                                    "description": "Demo organization for trying ImpactBridge. Not a real organization.",
                                    "created_by": users[owner], "is_demo": 1, "created_at": ts, "updated_at": ts})
        db.insert("org_members", {"org_id": oid, "user_id": users[owner], "member_role": "owner", "created_at": ts})
        orgs[key] = oid
    poster = ["community", "ward", "shg", "club", "csr", "community"]  # different posters, so the sample list doesn't look copied
    start = date.today() + timedelta(days=14)
    for i, spec in enumerate(DEMO_PROJECTS):
        pid = db.new_id()
        s = dict(spec)
        milestones, outcomes = s.pop("milestones"), s.pop("outcomes")
        pledges = s.pop("pledges", [])
        db.insert("projects", {
            **{k: v for k, v in s.items()}, "id": pid, "owner_id": users["submitter"], "org_id": orgs[poster[i % len(poster)]],
            "original_description": s["problem_statement"], "status": "published",
            "start_date": (start + timedelta(days=7 * i)).isoformat(),
            "allow_multiple_supporters": 1, "is_demo": 1, "created_at": ts, "updated_at": ts,
            "submitted_at": ts, "published_at": (datetime.now(timezone.utc) - timedelta(days=[1, 4, 9, 2, 3, 6, 5, 8, 12, 7][i % 10])).isoformat(timespec="seconds"),
        })
        for j, title in enumerate(milestones):
            db.insert("milestones", {"id": db.new_id(), "project_id": pid, "title": title, "status": "pending",
                                     "due_date": (start + timedelta(days=7 * i + 10 * j)).isoformat(),
                                     "sort_order": j, "created_at": ts})
        for t, b in _UPDATES.get(i, []):
            db.insert("updates", {"id": db.new_id(), "project_id": pid, "author_id": users["submitter"], "kind": "progress",
                                  "title": t, "body": b, "created_at": ts})
        for sk, kind, qty, anon, msg in pledges:
            db.insert("commitments", {"id": db.new_id(), "project_id": pid, "supporter_id": sup[sk], "kind": kind,
                                      "quantity": qty, "description": msg, "status": "accepted", "is_anonymous": int(anon),
                                      "created_at": ts, "updated_at": ts})
        for metric, target, unit in outcomes:
            db.insert("outcomes", {"id": db.new_id(), "project_id": pid, "metric": metric, "target": target,
                                   "unit": unit, "created_at": ts})
    print("Demo data created (all records are labelled as demo).")
    print("Demo accounts:", ", ".join(a[0] for a in accounts))
    print("Shared demo password:", password)


def remove_demo() -> None:
    db.execute("DELETE FROM projects WHERE is_demo = 1")
    db.execute("DELETE FROM organizations WHERE is_demo = 1")
    db.execute("DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE is_demo = 1)")
    db.execute("DELETE FROM audit_log WHERE actor_id IN (SELECT id FROM users WHERE is_demo = 1)")
    db.execute("DELETE FROM commitments WHERE supporter_id IN (SELECT id FROM users WHERE is_demo = 1)")
    db.execute("DELETE FROM files WHERE owner_id IN (SELECT id FROM users WHERE is_demo = 1)")
    db.execute("DELETE FROM users WHERE is_demo = 1")
    print("Demo data removed.")
