from rest_framework import serializers
from assessments.models import Questionnaire, Question, Assessment, Response


class QuestionSerializer(serializers.ModelSerializer):
    options = serializers.JSONField(required=False, default=list)

    class Meta:
        model = Question
        fields = ["id", "question_text", "question_type", "options", "order"]


class QuestionnaireSerializer(serializers.ModelSerializer):
    questions = QuestionSerializer(many=True, required=False)
    owner_name = serializers.CharField(source="owner.fullname", read_only=True, default=None)

    class Meta:
        model = Questionnaire
        fields = ["id", "title", "age_group", "description", "status",
                  "owner", "owner_name", "questions"]

    def _write_questions(self, questionnaire, questions):
        for i, qd in enumerate(questions):
            qd = {**qd}
            qd.setdefault("order", i + 1)
            Question.objects.create(questionnaire=questionnaire, **qd)

    def create(self, validated_data):
        questions = validated_data.pop("questions", [])
        questionnaire = Questionnaire.objects.create(**validated_data)
        self._write_questions(questionnaire, questions)
        return questionnaire

    def update(self, instance, validated_data):
        questions = validated_data.pop("questions", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if questions is not None:
            instance.questions.all().delete()
            self._write_questions(instance, questions)
        return instance


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
