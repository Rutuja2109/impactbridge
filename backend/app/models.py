"""Request schemas (server-side validation)."""
from __future__ import annotations

import re
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .domain import CAUSES, COMMITMENT_KINDS, ORG_TYPES, REPORT_REASONS, VERIFICATION_KINDS
from .security import SELF_SERVICE_ROLES

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Strict(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


def _email(v: str) -> str:
    v = (v or "").strip().lower()
    if not EMAIL_RE.match(v) or len(v) > 254:
        raise ValueError("Enter a valid email address")
    return v


def _date(v):
    if v in (None, ""):
        return None
    try:
        return date.fromisoformat(str(v)).isoformat()
    except ValueError:
        raise ValueError("Use the date format YYYY-MM-DD")


class OrgCreate(Strict):
    name: str = Field(min_length=2, max_length=150)
    org_type: str
    description: Optional[str] = Field(default=None, max_length=3000)
    city: Optional[str] = Field(default=None, max_length=80)
    region: Optional[str] = Field(default=None, max_length=80)
    website: Optional[str] = Field(default=None, max_length=200)
    registration_number: Optional[str] = Field(default=None, max_length=80)
    contact_email: Optional[str] = None

    @field_validator("org_type")
    @classmethod
    def _type(cls, v):
        if v not in ORG_TYPES:
            raise ValueError("Choose a valid organization type")
        return v

    @field_validator("contact_email")
    @classmethod
    def _ce(cls, v):
        return _email(v) if v else None

    @field_validator("website")
    @classmethod
    def _web(cls, v):
        if v and not re.match(r"^https?://", v):
            v = "https://" + v
        return v or None


class RegisterIn(Strict):
    email: str
    password: str = Field(min_length=8, max_length=200)
    name: str = Field(min_length=2, max_length=120)
    role: str
    city: Optional[str] = Field(default=None, max_length=80)
    region: Optional[str] = Field(default=None, max_length=80)
    organization: Optional[OrgCreate] = None
    accept_terms: bool = False

    _e = field_validator("email")(lambda cls, v: _email(v))

    @field_validator("role")
    @classmethod
    def _role(cls, v):
        if v not in SELF_SERVICE_ROLES:
            raise ValueError("Choose a valid account type")
        return v

    @field_validator("accept_terms")
    @classmethod
    def _terms(cls, v):
        if not v:
            raise ValueError("Please accept the terms of use, community guidelines and privacy policy")
        return v


class LoginIn(Strict):
    email: str
    password: str = Field(min_length=1, max_length=200)
    _e = field_validator("email")(lambda cls, v: _email(v))


class ProfileIn(Strict):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=30)
    city: Optional[str] = Field(default=None, max_length=80)
    region: Optional[str] = Field(default=None, max_length=80)
    bio: Optional[str] = Field(default=None, max_length=2000)
    skills: Optional[list[str]] = Field(default=None, max_length=30)
    email_notifications: Optional[bool] = None
    push_notifications: Optional[bool] = None
    language: Optional[str] = None

    @field_validator("language")
    @classmethod
    def _lang(cls, v):
        if v is not None and v not in ("en", "hi", "mr"):
            raise ValueError("Choose English, Hindi or Marathi")
        return v


class PasswordChangeIn(Strict):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


class DeleteAccountIn(Strict):
    password: Optional[str] = Field(default=None, max_length=200)
    confirm: str

    @field_validator("confirm")
    @classmethod
    def _c(cls, v):
        if v.strip().upper() != "DELETE":
            raise ValueError("Type DELETE to confirm")
        return v


class OrgUpdate(Strict):
    name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    description: Optional[str] = Field(default=None, max_length=3000)
    city: Optional[str] = Field(default=None, max_length=80)
    region: Optional[str] = Field(default=None, max_length=80)
    website: Optional[str] = Field(default=None, max_length=200)
    registration_number: Optional[str] = Field(default=None, max_length=80)
    contact_email: Optional[str] = None


class MemberIn(Strict):
    email: str
    member_role: Literal["member", "admin"] = "member"
    _e = field_validator("email")(lambda cls, v: _email(v))


class MaterialIn(Strict):
    name: str = Field(min_length=1, max_length=120)
    quantity: Optional[float] = Field(default=None, ge=0, le=1e9)
    unit: Optional[str] = Field(default=None, max_length=40)


class MilestoneDraft(Strict):
    title: str = Field(min_length=2, max_length=140)
    description: Optional[str] = Field(default="", max_length=1000)
    due_date: Optional[str] = None
    _d = field_validator("due_date")(lambda cls, v: _date(v))


class OutcomeDraft(Strict):
    metric: str = Field(min_length=2, max_length=160)
    target: Optional[float] = Field(default=None, ge=0, le=1e12)
    unit: Optional[str] = Field(default=None, max_length=40)


class ProjectIn(Strict):
    title: str = Field(min_length=5, max_length=120)
    problem_statement: str = Field(default="", max_length=6000)
    proposed_solution: str = Field(default="", max_length=6000)
    story: str = Field(default="", max_length=700)
    beneficiaries: str = Field(default="", max_length=2000)
    beneficiary_count: Optional[int] = Field(default=None, ge=0, le=100_000_000)
    city: Optional[str] = Field(default=None, max_length=80)
    region: Optional[str] = Field(default=None, max_length=80)
    location_detail: Optional[str] = Field(default=None, max_length=300)
    cause: Optional[str] = None
    budget_required: Optional[float] = Field(default=None, ge=0, le=1e12)
    volunteers_required: Optional[int] = Field(default=None, ge=0, le=100_000)
    materials: list[MaterialIn] = Field(default_factory=list, max_length=40)
    skills: list[str] = Field(default_factory=list, max_length=30)
    time_commitment: Optional[str] = Field(default=None, max_length=300)
    duration_weeks: Optional[int] = Field(default=None, ge=0, le=520)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    original_description: Optional[str] = Field(default=None, max_length=20000)
    ai_assisted: bool = False
    ai_provider: Optional[str] = Field(default=None, max_length=80)
    missing_info: list[str] = Field(default_factory=list, max_length=30)
    follow_up_questions: list[str] = Field(default_factory=list, max_length=30)
    allow_multiple_supporters: bool = True
    involves_children: bool = False
    involves_vulnerable: bool = False
    safeguarding_notes: Optional[str] = Field(default=None, max_length=2000)
    org_id: Optional[str] = None
    milestones: Optional[list[MilestoneDraft]] = Field(default=None, max_length=30)
    outcomes: Optional[list[OutcomeDraft]] = Field(default=None, max_length=20)
    photo_file_ids: list[str] = Field(default_factory=list, max_length=12)

    _d1 = field_validator("start_date", "end_date")(lambda cls, v: _date(v))

    @field_validator("cause")
    @classmethod
    def _cause(cls, v):
        if v and v not in CAUSES:
            raise ValueError("Choose a valid cause")
        return v or None

    @field_validator("skills")
    @classmethod
    def _skills(cls, v):
        return list(dict.fromkeys(s.strip()[:80] for s in v if s and s.strip()))

    @model_validator(mode="after")
    def _dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("End date must be after the start date")
        return self


class StructureIn(Strict):
    description: str = Field(min_length=30, max_length=8000)
    city: Optional[str] = Field(default=None, max_length=80)
    region: Optional[str] = Field(default=None, max_length=80)
    cause: Optional[str] = None
    photo_file_ids: list[str] = Field(default_factory=list, max_length=4)
    language: str = "en"

    @field_validator("language")
    @classmethod
    def _lang(cls, v):
        return v if v in ("en", "hi", "mr") else "en"


class TransitionIn(Strict):
    status: str
    notes: Optional[str] = Field(default=None, max_length=3000)


class CommitmentIn(Strict):
    kind: str
    quantity: float = Field(gt=0, le=1e12)
    item: Optional[str] = Field(default=None, max_length=120)
    unit: Optional[str] = Field(default=None, max_length=40)
    hours: Optional[float] = Field(default=None, gt=0, le=10000)
    description: Optional[str] = Field(default=None, max_length=2000)
    deadline: Optional[str] = None
    org_id: Optional[str] = None
    is_anonymous: bool = False
    _d = field_validator("deadline")(lambda cls, v: _date(v))

    @field_validator("kind")
    @classmethod
    def _kind(cls, v):
        if v not in COMMITMENT_KINDS:
            raise ValueError("Choose money, volunteers, materials, equipment or skills")
        return v

    @model_validator(mode="after")
    def _item(self):
        if self.kind in ("materials", "equipment", "skills") and not self.item:
            raise ValueError("Say which item or skill you are offering")
        if self.kind == "volunteers" and self.quantity != int(self.quantity):
            raise ValueError("Volunteer count must be a whole number")
        return self


class CommitmentActionIn(Strict):
    action: Literal["accept", "decline", "request_changes", "cancel", "withdraw", "fulfil"]
    message: Optional[str] = Field(default=None, max_length=2000)


class CommitmentProgressIn(Strict):
    received_quantity: Optional[float] = Field(default=None, ge=0, le=1e12)
    spent_amount: Optional[float] = Field(default=None, ge=0, le=1e12)
    responsibility: Optional[str] = Field(default=None, max_length=300)
    deadline: Optional[str] = None
    _d = field_validator("deadline")(lambda cls, v: _date(v))


class MilestoneIn(Strict):
    title: str = Field(min_length=2, max_length=140)
    description: Optional[str] = Field(default="", max_length=1000)
    due_date: Optional[str] = None
    responsible: Optional[str] = Field(default=None, max_length=140)
    status: Literal["pending", "in_progress", "done"] = "pending"
    _d = field_validator("due_date")(lambda cls, v: _date(v))


class OutcomeIn(OutcomeDraft):
    reported_value: Optional[float] = Field(default=None, ge=0, le=1e12)


class ChecklistIn(Strict):
    text: str = Field(min_length=2, max_length=300)


class ChecklistToggle(Strict):
    done: bool


class UpdateIn(Strict):
    title: str = Field(min_length=3, max_length=160)
    body: str = Field(min_length=10, max_length=6000)
    kind: Literal["progress", "milestone", "completion"] = "progress"
    file_ids: list[str] = Field(default_factory=list, max_length=10)


class ImpactReportIn(Strict):
    people_reached: Optional[int] = Field(default=None, ge=0, le=100_000_000)
    volunteers_involved: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    volunteer_hours: Optional[float] = Field(default=None, ge=0, le=1e8)
    materials_delivered: Optional[str] = Field(default=None, max_length=3000)
    funds_spent: Optional[float] = Field(default=None, ge=0, le=1e12)
    summary: str = Field(min_length=20, max_length=6000)
    challenges: Optional[str] = Field(default=None, max_length=3000)
    file_ids: list[str] = Field(default_factory=list, max_length=15)


class VerificationRequestIn(Strict):
    kind: str
    subject_id: str
    notes: Optional[str] = Field(default=None, max_length=3000)
    file_ids: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("kind")
    @classmethod
    def _k(cls, v):
        if v not in VERIFICATION_KINDS:
            raise ValueError("Unknown verification type")
        return v


class VerificationDecisionIn(Strict):
    decision: Literal["approve", "reject"]
    notes: str = Field(min_length=5, max_length=3000)
    verified_people_reached: Optional[int] = Field(default=None, ge=0)
    verified_volunteers_involved: Optional[int] = Field(default=None, ge=0)
    verified_volunteer_hours: Optional[float] = Field(default=None, ge=0)
    verified_funds_spent: Optional[float] = Field(default=None, ge=0)
    verified_outcomes: Optional[dict[str, float]] = None


class ReportIn(Strict):
    subject_type: Literal["project", "organization", "user", "update"]
    subject_id: str
    reason: str
    details: Optional[str] = Field(default=None, max_length=3000)

    @field_validator("reason")
    @classmethod
    def _r(cls, v):
        if v not in REPORT_REASONS:
            raise ValueError("Choose a reason")
        return v


class ReportResolveIn(Strict):
    status: Literal["reviewing", "resolved", "dismissed"]
    resolution: str = Field(min_length=3, max_length=3000)
    hide_subject: bool = False


class AdminUserIn(Strict):
    role: Optional[str] = None
    is_suspended: Optional[bool] = None


class MatchIn(Strict):
    budget: Optional[float] = Field(default=None, ge=0, le=1e12)
    volunteers: Optional[int] = Field(default=None, ge=0, le=100000)
    city: Optional[str] = Field(default=None, max_length=80)
    region: Optional[str] = Field(default=None, max_length=80)
    location_scope: Literal["city", "region", "anywhere"] = "anywhere"
    available_from: Optional[str] = None
    available_until: Optional[str] = None
    skills: list[str] = Field(default_factory=list, max_length=30)
    equipment: list[str] = Field(default_factory=list, max_length=30)
    causes: list[str] = Field(default_factory=list, max_length=20)
    open_to_partnering: bool = True
    _d = field_validator("available_from", "available_until")(lambda cls, v: _date(v))

    @model_validator(mode="after")
    def _some(self):
        if not any([self.budget, self.volunteers, self.skills, self.equipment]):
            raise ValueError("Enter at least one resource you can offer (budget, volunteers, skills or equipment)")
        return self


class ProjectVisibilityIn(Strict):
    is_hidden: bool
    reason: str = Field(min_length=3, max_length=1000)
