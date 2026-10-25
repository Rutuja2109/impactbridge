"""Clearly-labelled demo data for trying ImpactBridge locally.

Every record created here has is_demo = 1 and the UI shows a "Demo data" badge.
Demo organizations are never verified and demo projects are never marked verified.
"""
from __future__ import annotations

import secrets
from datetime import date, timedelta

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
    for email, name, role in accounts:
        uid = db.new_id()
        db.insert("users", {"id": uid, "email": email, "password_hash": hash_password(password), "name": name,
                            "role": role, "city": "Pune", "region": "Maharashtra", "skills": "[]", "is_demo": 1,
                            "created_at": ts, "updated_at": ts})
        users[role] = uid
    orgs = {}
    for key, name, otype, owner in [("community", "Demo Neighbourhood Association", "community", "submitter"),
                                    ("club", "Demo Rotaract Club", "rotaract", "club"),
                                    ("csr", "Demo Company CSR", "csr", "csr")]:
        oid = db.new_id()
        db.insert("organizations", {"id": oid, "name": name, "org_type": otype, "city": "Pune", "region": "Maharashtra",
                                    "description": "Demo organization for trying ImpactBridge. Not a real organization.",
                                    "created_by": users[owner], "is_demo": 1, "created_at": ts, "updated_at": ts})
        db.insert("org_members", {"org_id": oid, "user_id": users[owner], "member_role": "owner", "created_at": ts})
        orgs[key] = oid
    start = date.today() + timedelta(days=14)
    for i, spec in enumerate(DEMO_PROJECTS):
        pid = db.new_id()
        s = dict(spec)
        milestones, outcomes = s.pop("milestones"), s.pop("outcomes")
        db.insert("projects", {
            **{k: v for k, v in s.items()}, "id": pid, "owner_id": users["submitter"], "org_id": orgs["community"],
            "original_description": s["problem_statement"], "status": "published",
            "start_date": (start + timedelta(days=7 * i)).isoformat(),
            "allow_multiple_supporters": 1, "is_demo": 1, "created_at": ts, "updated_at": ts,
            "submitted_at": ts, "published_at": ts,
        })
        for j, title in enumerate(milestones):
            db.insert("milestones", {"id": db.new_id(), "project_id": pid, "title": title, "status": "pending",
                                     "due_date": (start + timedelta(days=7 * i + 10 * j)).isoformat(),
                                     "sort_order": j, "created_at": ts})
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
