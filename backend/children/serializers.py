from rest_framework import serializers
from django.contrib.auth import get_user_model
from children.models import Guardian, Child, ProgressNote, Goal, TerminationRecord

User = get_user_model()


class GuardianSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guardian
        fields = [
            "id", "fullname", "birth_date", "gender", "address",
            "case_type", "status",
        ]


class ChildSerializer(serializers.ModelSerializer):
    guardian_name = serializers.CharField(source="guardian.fullname", read_only=True, default=None)
    # Frontend uses `psychologist`; map it to the assigned_psychologist FK.
    psychologist = serializers.PrimaryKeyRelatedField(
        source="assigned_psychologist", queryset=User.objects.all(),
        required=False, allow_null=True,
    )
    psychologist_name = serializers.CharField(
        source="assigned_psychologist.fullname", read_only=True, default=None,
    )

    termination = serializers.SerializerMethodField()

    class Meta:
        model = Child
        fields = [
            "id", "fullname", "birth_date", "gender",
            "province", "municipality", "barangay", "address",
            "case_type", "surrendered_by", "status", "assignee_sees_history",
            "photo", "referral_source", "referral_reason",
            "education_level", "current_placement", "medical_notes",
            "psychologist", "psychologist_name",
            "guardian", "guardian_name", "termination",
        ]

    def get_termination(self, obj):
        if obj.status != Child.INACTIVE:
            return None
        t = obj.terminations.first()  # newest first (Meta.ordering)
        if not t:
            return None
        by = t.terminated_by
        return {
            "date": t.date,
            "reason_category": t.reason_category,
            "note": t.note,
            "terminated_by": (getattr(by, "fullname", "") or getattr(by, "username", "")) or None,
        }


class TerminationRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = TerminationRecord
        fields = ["id", "child", "date", "reason_category", "note", "created_at"]


class ProgressNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.fullname", read_only=True, default=None)

    class Meta:
        model = ProgressNote
        fields = ["id", "child", "author", "author_name", "date", "text", "created_at", "updated_at"]
        read_only_fields = ["author"]


class GoalSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.fullname", read_only=True, default=None)

    class Meta:
        model = Goal
        fields = ["id", "child", "author", "author_name", "text", "status", "target_date", "created_at", "updated_at"]
        read_only_fields = ["author"]
