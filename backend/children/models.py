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
    ARCHIVED = "archived"
    STATUS_CHOICES = [(ACTIVE, "Active"), (ARCHIVED, "Archived")]

    # Adviser-approved case types (Adoption handled separately, not listed here).
    CASE_TYPE_CHOICES = [
        ("Foster Care", "Foster Care"),
        ("Kinship Care", "Kinship Care"),
        ("Residential Care", "Residential Care"),
        ("Family Tracing & Reunification", "Family Tracing & Reunification"),
        ("Independent Living", "Independent Living"),
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
    surrendered_by = models.CharField(max_length=50, blank=True, choices=SURRENDERED_BY_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tbl_child"

    def __str__(self):
        return self.fullname


class ProgressNote(models.Model):
    """A dated progress/session note on a child's record (Phase 2 monitoring)."""
    child = models.ForeignKey(Child, on_delete=models.CASCADE, related_name="progress_notes")
    author = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="authored_progress_notes")
    date = models.DateField(default=timezone.localdate)
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tbl_progress_note"
        ordering = ["-date", "-id"]


class Goal(models.Model):
    """A treatment goal on a child's record (Phase 2 monitoring)."""
    ONGOING, MET = "ongoing", "met"
    STATUS_CHOICES = [(ONGOING, "Ongoing"), (MET, "Met")]

    child = models.ForeignKey(Child, on_delete=models.CASCADE, related_name="goals")
    author = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="authored_goals")
    text = models.CharField(max_length=255)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=ONGOING)
    target_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tbl_goal"
        ordering = ["status", "-created_at"]
