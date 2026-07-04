from rest_framework import serializers
from django.contrib.auth import get_user_model
from children.models import Guardian, Child, TerminationRecord

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
    # Computed V2 profile surface: has the pre-assessment been answered, and
    # which instrument titles were used (titles only — copyright policy).
    pre_assessment_status = serializers.SerializerMethodField()
    instruments_used = serializers.SerializerMethodField()

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
            "pre_assessment_status", "instruments_used",
        ]

    def get_pre_assessment_status(self, obj):
        return "Answered" if any(
            p.status == "completed" for p in obj.pre_assessments.all()) else "Not yet"

    def get_instruments_used(self, obj):
        titles = []
        for p in obj.pre_assessments.all():
            if p.status != "completed":
                continue
            for i in p.instruments.all():
                if i.title not in titles:
                    titles.append(i.title)
        return titles

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


