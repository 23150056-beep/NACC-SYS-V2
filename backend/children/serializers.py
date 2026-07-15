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
            "id", "first_name", "middle_initial", "last_name", "fullname", "birth_date", "gender",
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
        # fullname is derived (Child.save() composes it from the name parts).
        read_only_fields = ["case_status", "updated_at", "fullname"]

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

    def _legacy_fullname_parts(self):
        # Back-compat: some callers (and older API integrations) still create
        # a child by sending only "fullname", with no first/last name parts.
        # fullname is read-only now, so it never reaches validated_data/attrs —
        # split it the same way the split_existing_fullnames data migration
        # does. str.split() with no args already discards whitespace-only
        # input (e.g. "   ".split() == []), so this never manufactures a name
        # out of blank space.
        legacy_fullname = (self.initial_data or {}).get("fullname")
        return str(legacy_fullname).split() if legacy_fullname else []

    def create(self, validated_data):
        if not validated_data.get("first_name") and not validated_data.get("last_name"):
            parts = self._legacy_fullname_parts()
            if parts:
                validated_data["last_name"] = parts[-1] if len(parts) > 1 else ""
                validated_data["first_name"] = " ".join(parts[:-1]) if len(parts) > 1 else parts[0]
        return super().create(validated_data)

    def validate(self, attrs):
        request = self.context.get("request")
        role = getattr(getattr(getattr(request, "user", None), "role", None),
                       "role_name", None) if request else None
        if self.instance:
            # fullname is read-only (DRF drops it from `attrs`), so an attempt to
            # PATCH it has to be caught from the raw request payload instead.
            raw = self.initial_data if hasattr(self, "initial_data") else {}
            for f in ("first_name", "middle_initial", "last_name", "fullname"):
                if f in attrs:
                    new_val = attrs[f]
                elif f in raw:
                    new_val = raw[f]
                else:
                    continue
                if new_val != getattr(self.instance, f):
                    raise serializers.ValidationError(
                        {f: "The child's name cannot be changed after the record is created."})
            if role == Role.PSYCHOLOGIST:
                if ("assigned_psychologist" in attrs
                        and attrs["assigned_psychologist"] != self.instance.assigned_psychologist):
                    raise serializers.ValidationError(
                        {"psychologist": "Only administrators or staff can reassign a psychologist."})
                attrs.pop("assignee_sees_history", None)
                attrs.pop("status", None)
        else:
            # Create: fullname is read-only and first_name/last_name are
            # blank=True on the model, so DRF won't require any of them on
            # its own. Require a name in some form here — either the normal
            # first_name/last_name fields, or a legacy fullname-only payload
            # (the exact same acceptance test create()'s fallback uses, via
            # _legacy_fullname_parts() — .strip() here matches .split()'s
            # whitespace-only rejection there, so the two can't diverge).
            has_name = (
                (attrs.get("first_name") or "").strip()
                or (attrs.get("last_name") or "").strip()
                or self._legacy_fullname_parts()
            )
            if not has_name:
                raise serializers.ValidationError(
                    {"first_name": "Provide a name - either first_name/last_name, or a legacy fullname."})
        return attrs


class TerminationRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = TerminationRecord
        fields = ["id", "child", "date", "reason_category", "note", "created_at"]


