from rest_framework import serializers
from django.contrib.auth import get_user_model
from accounts.models import Role
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
    terminations = serializers.SerializerMethodField()
    # Computed V2 profile surface: has the pre-assessment been answered, and
    # which instrument titles were used (titles only — copyright policy).
    pre_assessment_status = serializers.SerializerMethodField()
    instruments_used = serializers.SerializerMethodField()

    class Meta:
        model = Child
        fields = [
            "id", "fullname", "birth_date", "gender",
            "province", "municipality", "barangay", "address",
            "case_type", "case_category", "surrendered_by", "status", "case_status", "assignee_sees_history",
            "photo", "referral_source", "referral_reason",
            "education_level", "current_placement", "medical_notes", "recommendation",
            "psychologist", "psychologist_name",
            "guardian", "guardian_name", "termination", "terminations",
            "pre_assessment_status", "instruments_used",
            "updated_at",
        ]
        # The tracker moves only through the advance-status / terminate actions.
        read_only_fields = ["case_status", "updated_at"]

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

    def get_terminations(self, obj):
        out = []
        for t in obj.terminations.all():  # Meta.ordering: newest first
            by = t.terminated_by
            out.append({
                "date": t.date, "reason_category": t.reason_category, "note": t.note,
                "terminated_by": (getattr(by, "fullname", "") or getattr(by, "username", "")) or None,
            })
        return out

    def validate(self, attrs):
        request = self.context.get("request")
        role = getattr(getattr(getattr(request, "user", None), "role", None),
                       "role_name", None) if request else None
        if self.instance:
            new_name = attrs.get("fullname")
            if new_name and new_name != self.instance.fullname:
                raise serializers.ValidationError(
                    {"fullname": "The child's name cannot be changed after the record is created."})
            if role == Role.PSYCHOLOGIST:
                if ("assigned_psychologist" in attrs
                        and attrs["assigned_psychologist"] != self.instance.assigned_psychologist):
                    raise serializers.ValidationError(
                        {"psychologist": "Only administrators or staff can reassign a psychologist."})
                attrs.pop("assignee_sees_history", None)
                attrs.pop("status", None)
        return attrs


class TerminationRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = TerminationRecord
        fields = ["id", "child", "date", "reason_category", "note", "created_at"]


