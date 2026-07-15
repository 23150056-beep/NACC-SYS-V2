from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from accounts.models import Role
from accounts.permissions import RecordsAccess, ChildRecordAccess
from activity.models import ActivityLog
from activity.services import log_activity
from children.models import Guardian, Child, TerminationRecord
from children.serializers import GuardianSerializer, ChildSerializer


class _ArchivableViewSet(viewsets.ModelViewSet):
    permission_classes = [RecordsAccess]
    pagination_class = None
    model = None

    def get_queryset(self):
        qs = self.model.objects.all().order_by("fullname")
        if self.request.query_params.get("include_archived") != "true":
            qs = qs.exclude(status=self.model.ARCHIVED)
        return qs

    def _log(self, obj, action_name):
        log_activity(
            self.request.user, action_name, ActivityLog.RECORD,
            entity_type=self.model.__name__,
            entity_label=getattr(obj, "fullname", ""),
            entity_id=obj.id)

    def perform_create(self, serializer):
        obj = serializer.save()
        self._log(obj, ActivityLog.CREATED)

    def perform_update(self, serializer):
        obj = serializer.save()
        self._log(obj, ActivityLog.UPDATED)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        obj = self.get_object()
        obj.status = self.model.ARCHIVED
        obj.save(update_fields=["status", "updated_at"])
        self._log(obj, ActivityLog.ARCHIVED)
        return Response({"status": "archived"}, status=status.HTTP_200_OK)


class GuardianViewSet(_ArchivableViewSet):
    model = Guardian
    serializer_class = GuardianSerializer


class ChildViewSet(_ArchivableViewSet):
    model = Child
    serializer_class = ChildSerializer
    permission_classes = [ChildRecordAccess]

    def get_permissions(self):
        # Terminate/advance have their own rule (admin OR the child's assigned
        # psychologist), enforced in the action body - RecordsAccess would
        # block psychologists.
        if self.action in ("terminate", "advance_status"):
            return [IsAuthenticated()]
        return super().get_permissions()

    def get_queryset(self):
        # Inactive (terminated) cases stay reachable by id - the profile view
        # shows the termination details, and terminate itself must be able to
        # report "already inactive" rather than 404.
        if self.action in ("retrieve", "terminate"):
            qs = self.model.objects.all().order_by("fullname")
        else:
            qs = super().get_queryset()
        qs = qs.prefetch_related("pre_assessments__instruments")
        role = getattr(getattr(self.request.user, "role", None), "role_name", None)
        if role == Role.PSYCHOLOGIST:
            qs = qs.filter(assigned_psychologist=self.request.user)
        return qs

    def _log(self, obj, action_name):
        # Direct child-record notifications at the child's assigned psychologist.
        log_activity(
            self.request.user, action_name, ActivityLog.RECORD,
            entity_type="Child", entity_label=getattr(obj, "fullname", ""),
            entity_id=obj.id, recipient=obj.assigned_psychologist)

    @action(detail=True, methods=["post"], url_path="advance-status")
    def advance_status(self, request, pk=None):
        """Move the case tracker between pre_assessment and counseling.
        Terminated is only reachable through the terminate action."""
        child = self.get_object()
        role = getattr(getattr(request.user, "role", None), "role_name", None)
        allowed = (role == Role.ADMINISTRATOR) or (
            role == Role.PSYCHOLOGIST and child.assigned_psychologist_id == request.user.id)
        if not allowed:
            return Response({"detail": "Only the assigned psychologist or an administrator can update the case status."},
                            status=status.HTTP_403_FORBIDDEN)
        if child.status == Child.INACTIVE:
            return Response({"detail": "This case is terminated; reactivation is not supported."},
                            status=status.HTTP_400_BAD_REQUEST)
        new_status = request.data.get("case_status")
        if new_status not in (Child.STAGE_PRE_ASSESSMENT, Child.STAGE_COUNSELING):
            return Response({"case_status": "Choose pre_assessment or counseling."},
                            status=status.HTTP_400_BAD_REQUEST)
        child.case_status = new_status
        child.save(update_fields=["case_status", "updated_at"])
        self._log(child, ActivityLog.UPDATED)
        return Response({"case_status": child.case_status}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def terminate(self, request, pk=None):
        """Archive a case with a required reason (V2). Sets the child inactive
        and writes a TerminationRecord. Admin or assigned psychologist only."""
        child = self.get_object()
        role = getattr(getattr(request.user, "role", None), "role_name", None)
        allowed = (role == Role.ADMINISTRATOR) or (
            role == Role.PSYCHOLOGIST and child.assigned_psychologist_id == request.user.id)
        if not allowed:
            return Response({"detail": "Only the assigned psychologist or an administrator can terminate this case."},
                            status=status.HTTP_403_FORBIDDEN)
        if child.status == Child.INACTIVE:
            return Response({"detail": "This case is already inactive."},
                            status=status.HTTP_400_BAD_REQUEST)
        reason = request.data.get("reason_category", "")
        note = (request.data.get("note") or "").strip()
        valid_reasons = {c[0] for c in TerminationRecord.REASON_CHOICES}
        if reason not in valid_reasons:
            return Response({"reason_category": "Select a termination reason."},
                            status=status.HTTP_400_BAD_REQUEST)
        if not note:
            return Response({"note": "A reason note is required to terminate a case."},
                            status=status.HTTP_400_BAD_REQUEST)
        record = TerminationRecord.objects.create(
            child=child, terminated_by=request.user,
            reason_category=reason, note=note)
        child.status = Child.INACTIVE
        child.case_status = Child.STAGE_TERMINATED
        child.save(update_fields=["status", "case_status", "updated_at"])
        self._log(child, ActivityLog.ARCHIVED)
        return Response({
            "status": "inactive",
            "termination": {
                "date": record.date, "reason_category": record.reason_category,
                "note": record.note,
            },
        }, status=status.HTTP_200_OK)
