from django.conf import settings
from django.db import models
from django.utils import timezone

from children.models import Child


class InstrumentCatalog(models.Model):
    """Title-and-metadata-only record of a psychological assessment instrument.

    Copyright policy (V2 §2): instrument items, scales, scoring keys, and
    scans are NEVER stored. Titles and bibliographic facts only.
    """
    CATEGORY_CHOICES = [
        ("cognitive", "Cognitive"),
        ("behavioral", "Behavioral"),
        ("projective", "Projective"),
        ("personality", "Personality"),
        ("developmental", "Developmental"),
        ("achievement", "Achievement"),
        ("other", "Other"),
    ]

    title = models.CharField(max_length=200)
    publisher = models.CharField(max_length=200, blank=True)
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default="other")
    age_range = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="catalog_instruments")
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tbl_instrument_catalog"
        ordering = ["title"]

    def __str__(self):
        return self.title


class AgencyFormTemplate(models.Model):
    """Agency-authored form definitions (v1's questionnaire builder repurposed).

    Restricted to agency/government forms; creating one requires an explicit
    attestation that it is not a published assessment instrument.
    """
    CONSENT = "consent"
    CLINICAL_INTERVIEW = "clinical_interview"
    PROBLEM_CHECKLIST = "problem_checklist"
    SELF_REPORT_GOV = "self_report_gov"
    TYPE_CHOICES = [
        (CONSENT, "Consent Form"),
        (CLINICAL_INTERVIEW, "Clinical Interview Form"),
        (PROBLEM_CHECKLIST, "Problem Checklist"),
        (SELF_REPORT_GOV, "Self-Report (Government Form)"),
    ]

    form_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    title = models.CharField(max_length=200)
    # Versioned field definitions: [{"label": ..., "field_type": ..., "options": [...]}, ...]
    fields = models.JSONField(default=list, blank=True)
    version = models.PositiveIntegerField(default=1)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="form_templates")
    attestation = models.BooleanField(
        default=False,
        help_text="This form is agency-authored or an official government form, "
                  "not a published assessment instrument.")
    attested_at = models.DateTimeField(null=True, blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tbl_agency_form_template"
        ordering = ["form_type", "title"]

    def __str__(self):
        return f"{self.get_form_type_display()}: {self.title}"


class ConsentRecord(models.Model):
    """A consent collected (on paper) before pre-assessment; optionally a scan
    of the signed agency-authored form is attached."""
    PENDING = "pending"
    SIGNED = "signed"
    DECLINED = "declined"
    STATUS_CHOICES = [(PENDING, "Pending"), (SIGNED, "Signed"), (DECLINED, "Declined")]

    child = models.ForeignKey(Child, on_delete=models.CASCADE, related_name="consents")
    template = models.ForeignKey(
        AgencyFormTemplate, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="consent_records")
    signer_name = models.CharField(max_length=150, blank=True)
    signer_relationship = models.CharField(max_length=100, blank=True)
    date = models.DateField(default=timezone.localdate)
    scan = models.FileField(upload_to="consents/", null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=PENDING)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="consents_recorded")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tbl_consent_record"
        ordering = ["-date", "-id"]


class ClinicalInterviewRecord(models.Model):
    """Answers to the psychologist's own Clinical Interview form."""
    child = models.ForeignKey(Child, on_delete=models.CASCADE, related_name="clinical_interviews")
    template = models.ForeignKey(
        AgencyFormTemplate, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="interview_records")
    answers = models.JSONField(default=dict, blank=True)
    interviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="interviews_conducted")
    date = models.DateField(default=timezone.localdate)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tbl_clinical_interview_record"
        ordering = ["-date", "-id"]


class ProblemEntry(models.Model):
    """A problem encountered in the child, logged by the psychologist."""
    child = models.ForeignKey(Child, on_delete=models.CASCADE, related_name="problems")
    description = models.TextField()
    category = models.CharField(max_length=100, blank=True)
    identified_on = models.DateField(default=timezone.localdate)
    resolved = models.BooleanField(default=False)
    logged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="problems_logged")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tbl_problem_entry"
        ordering = ["resolved", "-identified_on", "-id"]
