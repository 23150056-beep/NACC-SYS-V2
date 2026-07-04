from rest_framework import serializers
from assessments.models import Questionnaire, Question, Assessment, Response, AssessmentResult, AnalysisSetting


class QuestionSerializer(serializers.ModelSerializer):
    options = serializers.JSONField(required=False, default=list)
    concern_options = serializers.JSONField(required=False, default=list)

    class Meta:
        model = Question
        fields = ["id", "question_text", "question_type", "options", "order",
                  "concern_direction", "concern_options"]


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


class ResponseWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Response
        fields = ["question", "answer"]


class AssessmentWriteSerializer(serializers.ModelSerializer):
    responses = ResponseWriteSerializer(many=True)

    class Meta:
        model = Assessment
        fields = ["id", "child", "questionnaire", "assessment_type", "notes",
                  "classification", "respondent_mode", "responses"]

    def validate(self, attrs):
        # Assessment-taking is psychologist-only: enforce assigned child + owned instrument.
        user = getattr(self.context.get("request"), "user", None)
        uid = getattr(user, "id", None)
        child = attrs.get("child")
        questionnaire = attrs.get("questionnaire")
        if child is not None and child.assigned_psychologist_id != uid:
            raise serializers.ValidationError({"child": "That child is not assigned to you."})
        if questionnaire is not None and questionnaire.owner_id != uid:
            raise serializers.ValidationError({"questionnaire": "That instrument is not yours."})
        return attrs

    def create(self, validated_data):
        responses = validated_data.pop("responses", [])
        assessment = Assessment.objects.create(**validated_data)
        for rd in responses:
            Response.objects.create(assessment=assessment, **rd)
        return assessment


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
    result = serializers.SerializerMethodField()

    class Meta:
        model = Assessment
        fields = ["id", "child", "child_name", "child_case_type", "questionnaire", "questionnaire_title",
                  "psychologist_name", "assessment_type", "classification", "notes",
                  "status", "assessment_date", "next_session", "is_locked", "locked_at", "result"]

    def get_result(self, obj):
        ar = getattr(obj, "result", None)
        return AssessmentResultSerializer(ar).data if ar else None


class AssessmentResultSerializer(serializers.ModelSerializer):
    priority_level = serializers.SerializerMethodField()
    recommendation_text = serializers.SerializerMethodField()

    class Meta:
        model = AssessmentResult
        fields = ["behavioral_score", "classification", "generated_date",
                  "confidence", "overridden", "priority_level", "recommendation_text"]

    def _first_rec(self, obj):
        return obj.recommendations.first()

    def get_priority_level(self, obj):
        rec = self._first_rec(obj)
        return rec.priority_level if rec else ""

    def get_recommendation_text(self, obj):
        rec = self._first_rec(obj)
        return rec.recommendation_text if rec else ""


class AnalysisSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnalysisSetting
        fields = ["min_confidence_threshold", "require_override_on_low_confidence"]

    def validate_min_confidence_threshold(self, value):
        if value < 50 or value > 99:
            raise serializers.ValidationError("Threshold must be between 50 and 99.")
        return value
