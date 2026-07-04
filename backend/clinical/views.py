from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response

from accounts.models import Role
from accounts.permissions import CanManageInstruments, ProgressRecordAccess
from activity.models import ActivityLog
from activity.services import log_activity
from clinical.models import (
    InstrumentCatalog, AgencyFormTemplate, ConsentRecord,
    ClinicalInterviewRecord, ProblemEntry, PreAssessment,
    PsychologicalReport, RemarkNote, TreatmentPlan, ResultEntry,
)
from clinical.serializers import (
    InstrumentCatalogSerializer, AgencyFormTemplateSerializer,
    ConsentRecordSerializer, ClinicalInterviewRecordSerializer,
    ProblemEntrySerializer, PreAssessmentSerializer,
    PsychologicalReportSerializer, RemarkNoteSerializer,
    TreatmentPlanSerializer, ResultEntrySerializer,
)
from clinical.services import extract_pdf_text


def _role(request):
    return getattr(getattr(request.user, "role", None), "role_name", None)


class InstrumentCatalogViewSet(viewsets.ModelViewSet):
    """Title-only instrument catalog. Psychologists manage their own entries,
    admins manage all (catalog governance)."""
    permission_classes = [CanManageInstruments]
    pagination_class = None
    serializer_class = InstrumentCatalogSerializer

    def get_queryset(self):
        qs = InstrumentCatalog.objects.all()
        if self.request.query_params.get("include_inactive") != "true":
            qs = qs.filter(active=True)
        if _role(self.request) == Role.PSYCHOLOGIST:
            qs = qs.filter(owner=self.request.user)
        return qs

    def _log(self, obj, action_name):
        log_activity(self.request.user, action_name, ActivityLog.RECORD,
                     entity_type="Instrument", entity_label=obj.title, entity_id=obj.id)

    def perform_create(self, serializer):
        if _role(self.request) == Role.PSYCHOLOGIST:
            obj = serializer.save(owner=self.request.user)
        else:
            if not serializer.validated_data.get("owner"):
                raise serializers.ValidationError(
                    {"owner": "Select the psychologist who owns this instrument."})
            obj = serializer.save()
        self._log(obj, ActivityLog.CREATED)

    def perform_update(self, serializer):
        self._log(serializer.save(), ActivityLog.UPDATED)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        obj = self.get_object()
        obj.active = False
        obj.save(update_fields=["active", "updated_at"])
        self._log(obj, ActivityLog.ARCHIVED)
        return Response({"active": False}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        obj = self.get_object()
        obj.active = True
        obj.save(update_fields=["active", "updated_at"])
        return Response({"active": True}, status=status.HTTP_200_OK)


class AgencyFormTemplateViewSet(viewsets.ModelViewSet):
    """Agency-authored form templates (consent, clinical interview, …).
    Same ownership rules as the catalog; attestation enforced by the serializer."""
    permission_classes = [CanManageInstruments]
    pagination_class = None
    serializer_class = AgencyFormTemplateSerializer

    def get_queryset(self):
        qs = AgencyFormTemplate.objects.all()
        if self.request.query_params.get("include_inactive") != "true":
            qs = qs.filter(active=True)
        form_type = self.request.query_params.get("type")
        if form_type:
            qs = qs.filter(form_type=form_type)
        if _role(self.request) == Role.PSYCHOLOGIST:
            qs = qs.filter(owner=self.request.user)
        return qs

    def _log(self, obj, action_name):
        log_activity(self.request.user, action_name, ActivityLog.RECORD,
                     entity_type="AgencyForm", entity_label=obj.title, entity_id=obj.id)

    def perform_create(self, serializer):
        if _role(self.request) == Role.PSYCHOLOGIST:
            obj = serializer.save(owner=self.request.user)
        else:
            obj = serializer.save(owner=serializer.validated_data.get("owner") or self.request.user)
        self._log(obj, ActivityLog.CREATED)

    def perform_update(self, serializer):
        self._log(serializer.save(), ActivityLog.UPDATED)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        obj = self.get_object()
        obj.active = False
        obj.save(update_fields=["active", "updated_at"])
        self._log(obj, ActivityLog.ARCHIVED)
        return Response({"active": False}, status=status.HTTP_200_OK)


class _ChildScopedClinicalViewSet(viewsets.ModelViewSet):
    """Shared behavior for per-child clinical records (consent, interview,
    problems): read admin/staff/psychologist (psychologist scoped to assigned
    children); write admin or the child's assigned psychologist."""
    permission_classes = [ProgressRecordAccess]
    pagination_class = None
    model = None
    author_field = None  # set by subclass: who recorded the row

    def get_queryset(self):
        qs = self.model.objects.select_related("child")
        child_id = self.request.query_params.get("child")
        if child_id:
            if not str(child_id).isdigit():
                return qs.none()
            qs = qs.filter(child_id=child_id)
        if _role(self.request) == Role.PSYCHOLOGIST:
            qs = qs.filter(child__assigned_psychologist=self.request.user)
        return qs

    def _assert_can_write(self, child):
        role = _role(self.request)
        if role == Role.ADMINISTRATOR:
            return
        if role == Role.PSYCHOLOGIST and child.assigned_psychologist_id == self.request.user.id:
            return
        raise PermissionDenied("You can only manage clinical records for your assigned children.")

    def perform_create(self, serializer):
        self._assert_can_write(serializer.validated_data["child"])
        obj = serializer.save(**{self.author_field: self.request.user})
        log_activity(self.request.user, ActivityLog.CREATED, ActivityLog.RECORD,
                     entity_type=self.model.__name__, entity_label=obj.child.fullname,
                     entity_id=obj.id, recipient=obj.child.assigned_psychologist)

    def perform_update(self, serializer):
        self._assert_can_write(serializer.instance.child)
        obj = serializer.save()
        log_activity(self.request.user, ActivityLog.UPDATED, ActivityLog.RECORD,
                     entity_type=self.model.__name__, entity_label=obj.child.fullname,
                     entity_id=obj.id, recipient=obj.child.assigned_psychologist)


class PreAssessmentViewSet(_ChildScopedClinicalViewSet):
    model = PreAssessment
    serializer_class = PreAssessmentSerializer
    author_field = "psychologist"

    def get_queryset(self):
        return super().get_queryset().prefetch_related("instruments").select_related("consent", "interview")

    def perform_create(self, serializer):
        self._assert_can_write(serializer.validated_data["child"])
        obj = serializer.save(psychologist=self.request.user, status=PreAssessment.IN_PROGRESS)
        log_activity(self.request.user, ActivityLog.CREATED, ActivityLog.RECORD,
                     entity_type="PreAssessment", entity_label=obj.child.fullname,
                     entity_id=obj.id, recipient=obj.child.assigned_psychologist)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Mark the pre-assessment completed. Requires a SIGNED consent and at
        least one instrument title selected."""
        obj = self.get_object()
        self._assert_can_write(obj.child)
        if obj.status == PreAssessment.COMPLETED:
            return Response({"detail": "Already completed."}, status=status.HTTP_400_BAD_REQUEST)
        if not obj.consent or obj.consent.status != ConsentRecord.SIGNED:
            return Response({"consent": "A signed consent is required before completing the pre-assessment."},
                            status=status.HTTP_400_BAD_REQUEST)
        if obj.instruments.count() == 0:
            return Response({"instruments": "Select at least one instrument title."},
                            status=status.HTTP_400_BAD_REQUEST)
        from django.utils import timezone as tz
        obj.status = PreAssessment.COMPLETED
        obj.completed_at = tz.now()
        obj.save(update_fields=["status", "completed_at", "updated_at"])
        log_activity(request.user, ActivityLog.UPDATED, ActivityLog.RECORD,
                     entity_type="PreAssessment", entity_label=obj.child.fullname,
                     entity_id=obj.id, recipient=obj.child.assigned_psychologist)
        return Response(PreAssessmentSerializer(obj).data)


class ConsentRecordViewSet(_ChildScopedClinicalViewSet):
    model = ConsentRecord
    serializer_class = ConsentRecordSerializer
    author_field = "recorded_by"
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        """Authenticated serving of the signed-consent scan."""
        from django.http import FileResponse
        obj = self.get_object()
        if not obj.scan:
            return Response({"detail": "No scan attached to this consent."},
                            status=status.HTTP_404_NOT_FOUND)
        try:
            handle = obj.scan.open("rb")
        except (FileNotFoundError, ValueError):
            return Response({"detail": "File is missing from storage."},
                            status=status.HTTP_404_NOT_FOUND)
        return FileResponse(handle, as_attachment=True,
                            filename=obj.scan.name.rsplit("/", 1)[-1])


class ClinicalInterviewRecordViewSet(_ChildScopedClinicalViewSet):
    model = ClinicalInterviewRecord
    serializer_class = ClinicalInterviewRecordSerializer
    author_field = "interviewer"


class ProblemEntryViewSet(_ChildScopedClinicalViewSet):
    model = ProblemEntry
    serializer_class = ProblemEntrySerializer
    author_field = "logged_by"


class PsychologicalReportViewSet(_ChildScopedClinicalViewSet):
    model = PsychologicalReport
    serializer_class = PsychologicalReportSerializer
    author_field = "author"
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def perform_create(self, serializer):
        self._assert_can_write(serializer.validated_data["child"])
        upload = serializer.validated_data["file"]
        extracted = ""
        if upload.name.lower().endswith(".pdf"):
            extracted = extract_pdf_text(upload)
        obj = serializer.save(author=self.request.user,
                              original_filename=upload.name,
                              extracted_text=extracted)
        log_activity(self.request.user, ActivityLog.CREATED, ActivityLog.RECORD,
                     entity_type="PsychologicalReport", entity_label=obj.child.fullname,
                     entity_id=obj.id, recipient=obj.child.assigned_psychologist)

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        """Authenticated file serving — MEDIA_URL is never exposed directly."""
        from django.http import FileResponse
        obj = self.get_object()  # queryset scoping already applied
        try:
            handle = obj.file.open("rb")
        except (FileNotFoundError, ValueError):
            return Response({"detail": "File is missing from storage."},
                            status=status.HTTP_404_NOT_FOUND)
        return FileResponse(handle, as_attachment=True,
                            filename=obj.original_filename or obj.file.name.rsplit("/", 1)[-1])


class RemarkNoteViewSet(_ChildScopedClinicalViewSet):
    model = RemarkNote
    serializer_class = RemarkNoteSerializer
    author_field = "author"


class TreatmentPlanViewSet(_ChildScopedClinicalViewSet):
    model = TreatmentPlan
    serializer_class = TreatmentPlanSerializer
    author_field = "author"


class ResultEntryViewSet(_ChildScopedClinicalViewSet):
    model = ResultEntry
    serializer_class = ResultEntrySerializer
    author_field = "entered_by"

    def get_queryset(self):
        return super().get_queryset().select_related("instrument", "entered_by", "child")
