from django.contrib import admin
from assessments.models import (
    Questionnaire, Question, Assessment, Response, AssessmentResult, Recommendation,
)

for m in (Questionnaire, Question, Assessment, Response, AssessmentResult, Recommendation):
    admin.site.register(m)
