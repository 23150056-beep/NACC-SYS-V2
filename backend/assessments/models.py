from django.conf import settings
from django.db import models
from children.models import Child


class Questionnaire(models.Model):
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


class Question(models.Model):
    questionnaire = models.ForeignKey(
        Questionnaire, on_delete=models.CASCADE, related_name="questions")
    question_text = models.TextField()
    question_type = models.CharField(max_length=50)
    options = models.JSONField(default=list, blank=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tbl_question"
        ordering = ["order", "id"]


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


class Response(models.Model):
    assessment = models.ForeignKey(
        Assessment, on_delete=models.CASCADE, related_name="responses")
    question = models.ForeignKey(Question, on_delete=models.PROTECT)
    answer = models.TextField(blank=True)

    class Meta:
        db_table = "tbl_response"


