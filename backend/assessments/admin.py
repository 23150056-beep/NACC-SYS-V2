from django.contrib import admin
from assessments.models import Questionnaire, Question, Assessment, Response

for m in (Questionnaire, Question, Assessment, Response):
    admin.site.register(m)
