"""Domain vocabulary and project status rules."""
from __future__ import annotations

CAUSES = {
    "education": "Education & literacy",
    "health": "Health & disease prevention",
    "maternal_child_health": "Maternal & child health",
    "water_sanitation": "Water, sanitation & hygiene",
    "environment": "Environment",
    "livelihoods": "Livelihoods & economic development",
    "hunger_nutrition": "Hunger & nutrition",
    "disaster_relief": "Disaster relief",
    "elderly_care": "Elderly care",
    "disability_inclusion": "Disability inclusion",
    "women_empowerment": "Women's empowerment",
    "peacebuilding": "Peacebuilding & community harmony",
    "community_infrastructure": "Community infrastructure",
    "animal_welfare": "Animal welfare",
}

ORG_TYPES = {
    "community": "Community organization",
    "rotary": "Rotary club",
    "rotaract": "Rotaract club",
    "csr": "Corporate CSR team",
    "ngo": "NGO",
    "company": "Company",
    "other": "Other",
}

PROJECT_STATUSES = [
    "draft", "submitted", "needs_information", "approved", "published",
    "in_progress", "completed", "verified", "rejected",
]
PUBLIC_STATUSES = ("published", "in_progress", "completed", "verified")
SUPPORTABLE_STATUSES = ("published", "in_progress")
EDITABLE_STATUSES = ("draft", "needs_information")

# who may move a project between statuses: "owner" or "reviewer"
TRANSITIONS: dict[tuple[str, str], str] = {
    ("draft", "submitted"): "owner",
    ("needs_information", "submitted"): "owner",
    ("submitted", "needs_information"): "reviewer",
    ("submitted", "approved"): "reviewer",
    ("submitted", "rejected"): "reviewer",
    ("approved", "published"): "owner_or_reviewer",
    ("published", "in_progress"): "owner",
    ("in_progress", "completed"): "owner",
    ("completed", "verified"): "reviewer",
    ("completed", "in_progress"): "reviewer",  # reviewer sends back if completion evidence is insufficient
}

COMMITMENT_KINDS = {
    "money": "Funding",
    "volunteers": "Volunteers",
    "materials": "Materials",
    "equipment": "Equipment",
    "skills": "Professional skills",
}
COUNTED_COMMITMENT_STATUSES = ("accepted", "fulfilled")
OPEN_COMMITMENT_STATUSES = ("proposed", "changes_requested")

VERIFICATION_KINDS = {
    "organization_identity": "organization",
    "project_need": "project",
    "project_financial": "project",
    "project_completion": "project",
}

REPORT_REASONS = {
    "suspicious": "Suspicious or fraudulent request",
    "inaccurate": "Inaccurate information",
    "safeguarding": "Safeguarding concern (children or vulnerable people)",
    "privacy": "Exposes private information",
    "offensive": "Offensive or inappropriate content",
    "other": "Other",
}
