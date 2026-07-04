from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from accounts.models import Role
from accounts.permissions import RecordsAccess, ProgressRecordAccess
from activity.models import ActivityLog
from activity.services import log_activity
from children.models import Guardian, Child, ProgressNote, Goal
from children.serializers import GuardianSerializer, ChildSerializer, ProgressNoteSerializer, GoalSerializer


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

    def get_queryset(self):
        qs = super().get_queryset()
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


class ProgressNoteViewSet(viewsets.ModelViewSet):
    """Per-child progress log. Read: admin/staff/psychologist (psychologist scoped to
    assigned children). Write: admin or the child's assigned psychologist."""
    permission_classes = [ProgressRecordAccess]
    pagination_class = None
    serializer_class = ProgressNoteSerializer

    def get_queryset(self):
        qs = ProgressNote.objects.select_related("author", "child")
        child_id = self.request.query_params.get("child")
        if child_id:
            if not str(child_id).isdigit():
                return qs.none()
            qs = qs.filter(child_id=child_id)
        role = getattr(getattr(self.request.user, "role", None), "role_name", None)
        if role == Role.PSYCHOLOGIST:
            qs = qs.filter(child__assigned_psychologist=self.request.user)
        return qs

    def _assert_can_write(self, child):
        role = getattr(getattr(self.request.user, "role", None), "role_name", None)
        if role == Role.ADMINISTRATOR:
            return
        if role == Role.PSYCHOLOGIST and child.assigned_psychologist_id == self.request.user.id:
            return
        raise PermissionDenied("You can only add progress notes for your assigned children.")

    def perform_create(self, serializer):
        # has_permission already gate-checked the role; this enforces per-child assignment at create time.
        self._assert_can_write(serializer.validated_data["child"])
        obj = serializer.save(author=self.request.user)
        log_activity(self.request.user, ActivityLog.CREATED, ActivityLog.RECORD,
                     entity_type="ProgressNote", entity_label=obj.child.fullname,
                     entity_id=obj.id, recipient=obj.child.assigned_psychologist)


class GoalViewSet(viewsets.ModelViewSet):
    """Per-child treatment goals. Same access rules as ProgressNoteViewSet:
    read admin/staff/psychologist (psychologist scoped to assigned children);
    write admin or the child's assigned psychologist."""
    permission_classes = [ProgressRecordAccess]
    pagination_class = None
    serializer_class = GoalSerializer

    def get_queryset(self):
        qs = Goal.objects.select_related("author", "child")
        child_id = self.request.query_params.get("child")
        if child_id:
            if not str(child_id).isdigit():
                return qs.none()
            qs = qs.filter(child_id=child_id)
        role = getattr(getattr(self.request.user, "role", None), "role_name", None)
        if role == Role.PSYCHOLOGIST:
            qs = qs.filter(child__assigned_psychologist=self.request.user)
        return qs

    def _assert_can_write(self, child):
        role = getattr(getattr(self.request.user, "role", None), "role_name", None)
        if role == Role.ADMINISTRATOR:
            return
        if role == Role.PSYCHOLOGIST and child.assigned_psychologist_id == self.request.user.id:
            return
        raise PermissionDenied("You can only manage goals for your assigned children.")

    def perform_create(self, serializer):
        # has_permission already gate-checked the role; this enforces per-child assignment at create time.
        self._assert_can_write(serializer.validated_data["child"])
        obj = serializer.save(author=self.request.user)
        log_activity(self.request.user, ActivityLog.CREATED, ActivityLog.RECORD,
                     entity_type="Goal", entity_label=obj.child.fullname,
                     entity_id=obj.id, recipient=obj.child.assigned_psychologist)
