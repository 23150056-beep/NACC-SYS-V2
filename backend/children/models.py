from django.db import models
from django.utils import timezone


class Guardian(models.Model):
    ACTIVE = "active"
    ARCHIVED = "archived"
    STATUS_CHOICES = [(ACTIVE, "Active"), (ARCHIVED, "Archived")]

    fullname = models.CharField(max_length=150)
    birth_date = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, blank=True)
    address = models.CharField(max_length=150, blank=True)
    case_type = models.CharField(max_length=150, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tbl_guardian"

    def __str__(self):
        return self.fullname


class Child(models.Model):
    ACTIVE = "active"
    INACTIVE = "inactive"
    # Back-compat alias: v1 called the non-active state "archived"; V2 renames it
    # to inactive (a terminated/archived case) without touching shared code paths.
    ARCHIVED = INACTIVE
    STATUS_CHOICES = [(ACTIVE, "Active"), (INACTIVE, "Inactive")]

    # Linear case tracker (blueprint milestones): the psychologist advances
    # pre_assessment -> counseling; terminate sets terminated (and inactive).
    STAGE_PRE_ASSESSMENT = "pre_assessment"
    STAGE_COUNSELING = "counseling"
    STAGE_TERMINATED = "terminated"
    CASE_STATUS_CHOICES = [
        (STAGE_PRE_ASSESSMENT, "Pre-Assessment"),
        (STAGE_COUNSELING, "Counseling"),
        (STAGE_TERMINATED, "Terminated"),
    ]

    # V2 case types per the psychologist interview ("active/adoption,
    # active/foster care"). This placement-track list is now corroborated by
    # NACC-SAMD-GF-000 KRA III (transition strategies: adoption, kinship/foster
    # care, family reunification, independent living); final wording still
    # pending RACCO I confirmation.
    CASE_TYPE_CHOICES = [
        ("Adoption", "Adoption"),
        ("Foster Care", "Foster Care"),
        ("Kinship Care", "Kinship Care"),
        ("Residential Care", "Residential Care"),
        ("Family Tracing & Reunification", "Family Tracing & Reunification"),
        ("Independent Living", "Independent Living"),
    ]

    # Official "Service Users by Case Category" list from NACC-SAMD-GF-000
    # (June 2025), the government AACC-program certification tool.
    CASE_CATEGORY_CHOICES = [
        ("Abandoned", "Abandoned"),
        ("Foundling", "Foundling"),
        ("Surrendered", "Surrendered"),
        ("Neglected", "Neglected"),
        ("Dependent", "Dependent"),
        ("Orphaned", "Orphaned"),
        ("Victim of Physical Abuse", "Victim of Physical Abuse"),
        ("Victim of Sexual Abuse", "Victim of Sexual Abuse"),
        ("Victim of OSAEC/CSAEM", "Victim of OSAEC/CSAEM"),
        ("Trafficked", "Trafficked"),
        ("CICL", "CICL"),
        ("Children at Risk (CAR)", "Children at Risk (CAR)"),
        ("Children in Street Situation", "Children in Street Situation"),
        ("Victim of Child Labor", "Victim of Child Labor"),
        ("Child With Disability", "Child With Disability"),
        ("Child Living with HIV", "Child Living with HIV"),
        ("Indigenous Peoples", "Indigenous Peoples"),
        ("Others", "Others"),
    ]

    # Who surrendered the child to NACC / RACCO I.
    SURRENDERED_BY_CHOICES = [
        ("Social Worker", "Social Worker"),
        ("Police", "Police"),
        ("Relatives", "Relatives"),
    ]

    # Deprecated in favour of assigned_psychologist; kept for migration safety.
    guardian = models.ForeignKey(
        Guardian, on_delete=models.SET_NULL, null=True, blank=True, related_name="children"
    )
    # A record is handled by an assigned psychologist (replaces Guardian in the UI).
    assigned_psychologist = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="assigned_children",
    )
    # Set at (re)assignment: does the current assignee see the child's prior assessments.
    assignee_sees_history = models.BooleanField(default=True)
    fullname = models.CharField(max_length=150)
    birth_date = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, blank=True)
    # Structured location pickers (Province / Municipality-City / Barangay).
    province = models.CharField(max_length=100, blank=True)
    municipality = models.CharField(max_length=100, blank=True)
    barangay = models.CharField(max_length=100, blank=True)
    address = models.CharField(max_length=150, blank=True)
    case_type = models.CharField(max_length=150, blank=True, choices=CASE_TYPE_CHOICES)
    # Official NACC-SAMD-GF-000 (June 2025) "Service Users by Case Category" list.
    case_category = models.CharField(max_length=50, blank=True, choices=CASE_CATEGORY_CHOICES)
    surrendered_by = models.CharField(max_length=50, blank=True, choices=SURRENDERED_BY_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=ACTIVE)
    case_status = models.CharField(
        max_length=20, choices=CASE_STATUS_CHOICES, default=STAGE_PRE_ASSESSMENT)
    # V2 profiling fields (exact list pending confirmation with the psychologist).
    photo = models.ImageField(upload_to="children/photos/", null=True, blank=True)
    referral_source = models.CharField(max_length=150, blank=True)
    referral_reason = models.TextField(blank=True)
    education_level = models.CharField(max_length=100, blank=True)
    current_placement = models.CharField(max_length=150, blank=True)
    medical_notes = models.TextField(blank=True)
    # Free-text recommendations + fields not part of the agency's intake
    # interview live under the "Recommendation" section in the UI.
    recommendation = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tbl_child"

    def __str__(self):
        return self.fullname


class TerminationRecord(models.Model):
    """Archive/termination of a case, always with a reason. Creating one sets
    the child to inactive. Reason categories pending RACCO I confirmation."""
    REASON_CHOICES = [
        ("Reunified with family", "Reunified with family"),
        ("Adoption finalized", "Adoption finalized"),
        ("Transferred to another agency", "Transferred to another agency"),
        ("Aged out of program", "Aged out of program"),
        ("Services completed", "Services completed"),
        ("Other", "Other"),
    ]

    child = models.ForeignKey(Child, on_delete=models.CASCADE, related_name="terminations")
    terminated_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="terminations_made")
    date = models.DateField(default=timezone.localdate)
    reason_category = models.CharField(max_length=50, choices=REASON_CHOICES)
    note = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tbl_termination_record"
        ordering = ["-created_at"]


# V2: v1's ProgressNote and Goal were replaced by clinical.RemarkNote and
# clinical.TreatmentPlan per the psychologist interview.
