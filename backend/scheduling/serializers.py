from django.utils import timezone
from rest_framework import serializers

from scheduling.models import AvailabilityBlock, Appointment


class AvailabilityBlockSerializer(serializers.ModelSerializer):
    psychologist_name = serializers.CharField(
        source="psychologist.fullname", read_only=True, default=None)

    class Meta:
        model = AvailabilityBlock
        fields = ["id", "psychologist", "psychologist_name", "weekday", "date",
                  "start_time", "end_time", "capacity", "active"]
        extra_kwargs = {"psychologist": {"required": False}}

    def validate(self, attrs):
        start = attrs.get("start_time") or (self.instance.start_time if self.instance else None)
        end = attrs.get("end_time") or (self.instance.end_time if self.instance else None)
        if start and end and start >= end:
            raise serializers.ValidationError({"end_time": "End must be after start."})
        weekday = attrs.get("weekday", self.instance.weekday if self.instance else None)
        date = attrs.get("date", self.instance.date if self.instance else None)
        if weekday is None and date is None:
            raise serializers.ValidationError(
                {"weekday": "Pick a recurring weekday or a specific date."})
        return attrs


class AppointmentSerializer(serializers.ModelSerializer):
    child_name = serializers.CharField(source="child.fullname", read_only=True)
    psychologist_name = serializers.CharField(
        source="psychologist.fullname", read_only=True, default=None)
    booked_by_name = serializers.CharField(
        source="booked_by.fullname", read_only=True, default=None)

    class Meta:
        model = Appointment
        fields = ["id", "child", "child_name", "psychologist", "psychologist_name",
                  "start", "duration_minutes", "purpose", "status",
                  "pre_assessment", "notes", "booked_by", "booked_by_name", "created_at"]
        read_only_fields = ["booked_by", "status"]
        extra_kwargs = {"psychologist": {"required": False}}

    def validate_start(self, value):
        if value < timezone.now() and self.instance is None:
            raise serializers.ValidationError("Cannot book an appointment in the past.")
        return value
