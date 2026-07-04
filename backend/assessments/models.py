from django.conf import settings
from django.db import models
from children.models import Child


class Questionnaire(models.Model):
    """LEGACY (V2): kept only so historical Assessment rows keep their
    instrument title. The managed catalog lives in clinical.InstrumentCatalog;
    there is no questionnaire CRUD API anymore."""
    DRAFT, ACTIVE, ARCHIVED = "draft", "active", "archived"
    STATUS_CHOICES = [(DRAFT, "Draft"), (ACTIVE, "Active"), (ARCHIVED, "Archived")]

    title = models.CharField(max_length=150)
    age_group = models.CharField(max_length=50, blank=True)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=DRAFT)
    # Owner-only model: each instrument belongs to one psychologist (admin assigns/reassigns).
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="owned_instruments")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tbl_questionnaire"

    def __str__(self):
        return self.title


class Assessment(models.Model):
    child = models.ForeignKey(Child, on_delete=models.CASCADE, related_name="assessments")
    psychologist = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="assessments")
    questionnaire = models.ForeignKey(
        Questionnaire, on_delete=models.SET_NULL, null=True, blank=True, related_name="assessments")
    assessment_date = models.DateField(auto_now_add=True)
    assessment_type = models.CharField(max_length=50, blank=True)
    status = models.CharField(max_length=50, default="ongoing")
    notes = models.TextField(blank=True)
    classification = models.CharField(max_length=50, blank=True)
    # Editable-with-audit: a signed assessment locks on finalize/export.
    is_locked = models.BooleanField(default=False)
    locked_at = models.DateTimeField(null=True, blank=True)
    next_session = models.DateField(null=True, blank=True)
    STAFF, CHILD = "staff", "child"
    RESPONDENT_CHOICES = [(STAFF, "Staff"), (CHILD, "Child")]
    respondent_mode = models.CharField(max_length=10, choices=RESPONDENT_CHOICES, default=STAFF)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tbl_assessment"


