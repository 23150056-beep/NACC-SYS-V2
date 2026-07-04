from rest_framework import serializers
from assessments.models import Assessment


class AssessmentEditSerializer(serializers.ModelSerializer):
    """Editable-with-audit: a psychologist may revise only these two fields."""
    class Meta:
        model = Assessment
        fields = ["id", "notes", "classification"]


class AssessmentListSerializer(serializers.ModelSerializer):
    child_name = serializers.CharField(source="child.fullname", read_only=True)
    child_case_type = serializers.CharField(source="child.case_type", read_only=True, default="")
    questionnaire_title = serializers.CharField(source="questionnaire.title", read_only=True, default=None)
    psychologist_name = serializers.CharField(source="psychologist.fullname", read_only=True)

    class Meta:
        model = Assessment
        fields = ["id", "child", "child_name", "child_case_type", "questionnaire", "questionnaire_title",
                  "psychologist_name", "assessment_type", "classification", "notes",
                  "status", "assessment_date", "next_session", "is_locked", "locked_at"]
