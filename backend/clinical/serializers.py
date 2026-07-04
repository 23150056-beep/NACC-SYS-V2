from rest_framework import serializers
from django.utils import timezone

from clinical.models import (
    InstrumentCatalog, AgencyFormTemplate, ConsentRecord,
    ClinicalInterviewRecord, ProblemEntry, PreAssessment,
)


class InstrumentCatalogSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.fullname", read_only=True, default=None)

    class Meta:
        model = InstrumentCatalog
        fields = ["id", "title", "publisher", "category", "age_range", "notes",
                  "owner", "owner_name", "active", "updated_at"]


class AgencyFormTemplateSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.fullname", read_only=True, default=None)
    fields = serializers.JSONField(required=False, default=list)

    class Meta:
        model = AgencyFormTemplate
        fields = ["id", "form_type", "title", "fields", "version",
                  "owner", "owner_name", "attestation", "attested_at",
                  "active", "updated_at"]
        read_only_fields = ["attested_at", "version"]

    def validate_attestation(self, value):
        if not value:
            raise serializers.ValidationError(
                "You must attest that this form is agency-authored or an official "
                "government form, not a published assessment instrument.")
        return value

    def create(self, validated_data):
        validated_data["attested_at"] = timezone.now()
        return super().create(validated_data)

    def update(self, instance, validated_data):
        # Any content edit bumps the version; re-attestation is enforced by the field validator.
        if "fields" in validated_data and validated_data["fields"] != instance.fields:
            instance.version += 1
            validated_data["attested_at"] = timezone.now()
        return super().update(instance, validated_data)


class ConsentRecordSerializer(serializers.ModelSerializer):
    child_name = serializers.CharField(source="child.fullname", read_only=True)
    template_title = serializers.CharField(source="template.title", read_only=True, default=None)
    recorded_by_name = serializers.CharField(source="recorded_by.fullname", read_only=True, default=None)

    class Meta:
        model = ConsentRecord
        fields = ["id", "child", "child_name", "template", "template_title",
                  "signer_name", "signer_relationship", "date", "scan", "status",
                  "recorded_by", "recorded_by_name", "created_at"]
        read_only_fields = ["recorded_by"]


class ClinicalInterviewRecordSerializer(serializers.ModelSerializer):
    child_name = serializers.CharField(source="child.fullname", read_only=True)
    template_title = serializers.CharField(source="template.title", read_only=True, default=None)
    interviewer_name = serializers.CharField(source="interviewer.fullname", read_only=True, default=None)
    answers = serializers.JSONField(required=False, default=dict)

    class Meta:
        model = ClinicalInterviewRecord
        fields = ["id", "child", "child_name", "template", "template_title",
                  "answers", "interviewer", "interviewer_name", "date", "created_at"]
        read_only_fields = ["interviewer"]


class PreAssessmentSerializer(serializers.ModelSerializer):
    child_name = serializers.CharField(source="child.fullname", read_only=True)
    psychologist_name = serializers.CharField(source="psychologist.fullname", read_only=True, default=None)
    instrument_titles = serializers.SerializerMethodField()
    consent_status = serializers.CharField(source="consent.status", read_only=True, default=None)

    class Meta:
        model = PreAssessment
        fields = ["id", "child", "child_name", "psychologist", "psychologist_name",
                  "date", "status", "instruments", "instrument_titles",
                  "consent", "consent_status", "interview", "notes",
                  "completed_at", "created_at"]
        read_only_fields = ["psychologist", "status", "completed_at"]

    def get_instrument_titles(self, obj):
        return [i.title for i in obj.instruments.all()]

    def validate(self, attrs):
        # Linked consent/interview must belong to the same child.
        child = attrs.get("child") or (self.instance.child if self.instance else None)
        consent = attrs.get("consent")
        interview = attrs.get("interview")
        if consent and child and consent.child_id != child.id:
            raise serializers.ValidationError({"consent": "That consent belongs to a different child."})
        if interview and child and interview.child_id != child.id:
            raise serializers.ValidationError({"interview": "That interview belongs to a different child."})
        return attrs


class ProblemEntrySerializer(serializers.ModelSerializer):
    child_name = serializers.CharField(source="child.fullname", read_only=True)
    logged_by_name = serializers.CharField(source="logged_by.fullname", read_only=True, default=None)

    class Meta:
        model = ProblemEntry
        fields = ["id", "child", "child_name", "description", "category",
                  "identified_on", "resolved", "logged_by", "logged_by_name", "created_at"]
        read_only_fields = ["logged_by"]
