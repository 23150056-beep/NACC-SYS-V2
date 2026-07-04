from django.contrib import admin
from assessments.models import Questionnaire, Assessment

for m in (Questionnaire, Assessment):
    admin.site.register(m)
