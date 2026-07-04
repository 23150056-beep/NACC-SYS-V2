from django.db.models import Q
from rest_framework import generics, mixins, viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role
from accounts.permissions import CanViewResults, IsAdminOrStaff
from activity.models import ActivityLog
from activity.services import log_activity
from assessments import reports
from assessments.models import Assessment
from children.models import Child
from children.serializers import ChildSerializer
from assessments.serializers import AssessmentListSerializer, AssessmentEditSerializer


class AssessmentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                        viewsets.GenericViewSet):
    """Read-only assessment history plus practitioner edits (notes/classification),
    scheduling and finalize. In-app administration was removed in V2 — assessments
    are no longer created through the API."""
    pagination_class = None
    serializer_class = AssessmentListSerializer

    def get_permissions(self):
        return [CanViewResults()]

    def get_queryset(self):
        qs = (Assessment.objects
              .select_related("child", "questionnaire", "psychologist")
              .order_by("-assessment_date", "-id"))
        role = getattr(getattr(self.request.user, "role", None), "role_name", None)
        if role == Role.PSYCHOLOGIST:
            qs = qs.filter(child__assigned_psychologist=self.request.user).filter(
                Q(child__assignee_sees_history=True) | Q(psychologist=self.request.user))
        return qs

    def partial_update(self, request, *args, **kwargs):
        # Editable-with-audit: owning psychologist edits notes/classification only,
        # blocked once finalized.
        assessment = self.get_object()
        if assessment.psychologist_id != request.user.id:
            return Response({"detail": "You can only edit your own assessments."},
                            status=status.HTTP_403_FORBIDDEN)
        if assessment.is_locked:
            return Response({"detail": "This assessment is finalized and can no longer be edited."},
                            status=status.HTTP_400_BAD_REQUEST)
        serializer = AssessmentEditSerializer(assessment, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_activity(request.user, ActivityLog.UPDATED, ActivityLog.RECORD,
                     entity_type="Assessment", entity_label=assessment.child.fullname,
                     entity_id=assessment.id, recipient=assessment.child.assigned_psychologist)
        return Response(AssessmentListSerializer(assessment).data)

    @action(detail=True, methods=["patch"])
    def schedule(self, request, pk=None):
        assessment = self.get_object()
        role = getattr(getattr(request.user, "role", None), "role_name", None)
        allowed = (role == Role.ADMINISTRATOR) or (assessment.psychologist_id == request.user.id)
        if not allowed:
            return Response({"detail": "You cannot schedule this assessment."},
                            status=status.HTTP_403_FORBIDDEN)
        raw = request.data.get("next_session")
        if raw:
            try:
                assessment.next_session = serializers.DateField().to_internal_value(raw)
            except serializers.ValidationError:
                return Response({"detail": "Invalid date. Use YYYY-MM-DD."},
                                status=status.HTTP_400_BAD_REQUEST)
        else:
            assessment.next_session = None
        assessment.save(update_fields=["next_session", "updated_at"])
        return Response(AssessmentListSerializer(assessment).data)

    @action(detail=True, methods=["post"])
    def finalize(self, request, pk=None):
        from django.utils import timezone
        assessment = self.get_object()
        if assessment.psychologist_id != request.user.id:
            return Response({"detail": "You can only finalize your own assessments."},
                            status=status.HTTP_403_FORBIDDEN)
        assessment.is_locked = True
        assessment.locked_at = timezone.now()
        assessment.save(update_fields=["is_locked", "locked_at", "updated_at"])
        log_activity(request.user, ActivityLog.UPDATED, ActivityLog.RECORD,
                     entity_type="Assessment", entity_label=assessment.child.fullname,
                     entity_id=assessment.id, recipient=assessment.child.assigned_psychologist)
        return Response({"status": "locked"})


class ChildReportView(generics.GenericAPIView):
    """Per-child report: profile + ordered assessment history."""
    permission_classes = [CanViewResults]

    def get(self, request, child_id):
        try:
            child = Child.objects.get(pk=child_id)
        except Child.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        role = getattr(getattr(request.user, "role", None), "role_name", None)
        if role == Role.PSYCHOLOGIST and child.assigned_psychologist_id != request.user.id:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        qs = (Assessment.objects.filter(child=child)
              .select_related("psychologist")
              .order_by("assessment_date", "id"))
        if role == Role.PSYCHOLOGIST and not child.assignee_sees_history:
            qs = qs.filter(psychologist=request.user)
        assessments = list(qs)
        return Response({
            "child": ChildSerializer(child).data,
            "assessments": AssessmentListSerializer(assessments, many=True).data,
        })


class MonitoringListView(generics.GenericAPIView):
    """Per-child progress overview for the Progress Monitoring page, role-scoped:
    admin/staff -> all active children; psychologist -> their assigned children.
    V2: no engine scores — rows show last activity / next session instead."""
    permission_classes = [CanViewResults]

    def get(self, request):
        role = getattr(getattr(request.user, "role", None), "role_name", None)
        children = (Child.objects.exclude(status=Child.ARCHIVED)
                    .select_related("assigned_psychologist"))
        if role == Role.PSYCHOLOGIST:
            children = children.filter(assigned_psychologist=request.user)
        children = list(children)

        child_ids = [c.id for c in children]
        assessments = (Assessment.objects.filter(child_id__in=child_ids)
                       .order_by("assessment_date", "id"))
        by_child = {}
        for a in assessments:
            by_child.setdefault(a.child_id, []).append(a)

        rows = []
        for c in children:
            items = by_child.get(c.id, [])
            latest = items[-1] if items else None
            if c.assigned_psychologist_id:
                psy = c.assigned_psychologist
                psy_name = (getattr(psy, "fullname", "") or getattr(psy, "username", "")) or None
            else:
                psy_name = None
            rows.append({
                "child_id": c.id,
                "child_name": c.fullname,
                "case_ref": f"C-{c.id:04d}",
                "case_type": c.case_type or None,
                "psychologist_name": psy_name,
                "latest_classification": latest.classification if latest else None,
                "next_session": (latest.next_session.isoformat()
                                 if latest and latest.next_session else None),
                "last_assessment_date": latest.assessment_date if latest else None,
                "assessment_count": len(items),
            })
        rows.sort(key=lambda r: (r["child_name"] or "").lower())
        return Response(rows)


def _summary_csv(data):
    import csv
    from django.http import HttpResponse
    resp = HttpResponse(content_type="text/csv")
    resp["Content-Disposition"] = 'attachment; filename="agency-summary.csv"'
    w = csv.writer(resp)
    w.writerow(["Metric", "Value"])
    w.writerow(["Total assessments", data["total"]])
    w.writerow(["Children assessed", data["children"]])
    w.writerow([])
    w.writerow(["Case type", "Count"])
    for k, v in data["by_case_type"].items():
        w.writerow([k, v])
    w.writerow([])
    w.writerow(["Psychologist", "Assessments"])
    for p in data["per_psychologist"]:
        w.writerow([p["name"], p["count"]])
    return resp


class SummaryReportView(generics.GenericAPIView):
    """Agency Summary (admin + staff): aggregates over a date range."""
    permission_classes = [IsAdminOrStaff]

    def get(self, request):
        rng = request.query_params.get("range", "monthly")
        qs = (Assessment.objects.select_related("child", "psychologist")
              .order_by("assessment_date", "id"))
        frm, to = request.query_params.get("from"), request.query_params.get("to")
        if frm:
            qs = qs.filter(assessment_date__gte=frm)
        if to:
            qs = qs.filter(assessment_date__lte=to)
        data = reports.summary(list(qs), rng)
        # NB: `format` is reserved by DRF content negotiation, so use `export`.
        if request.query_params.get("export") == "csv":
            return _summary_csv(data)
        return Response(data)


class DashboardView(generics.GenericAPIView):
    """Current-state dashboard stats, role-scoped:
    psychologist -> their assigned children; admin/staff -> all.
    V2 interim shape (full census dashboard lands with the scheduling module):
    child counts + activity trend + case mix, no engine classifications."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = getattr(getattr(request.user, "role", None), "role_name", None)
        rng = request.query_params.get("range", "monthly")
        children = Child.objects.exclude(status=Child.ARCHIVED)
        assessments = Assessment.objects.select_related("child", "psychologist")
        if role == Role.PSYCHOLOGIST:
            children = children.filter(assigned_psychologist=request.user)
            assessments = assessments.filter(child__assigned_psychologist=request.user)
        assessments = list(assessments.order_by("assessment_date", "id"))

        assessed_children = {a.child_id for a in assessments}
        total = children.count()
        agg = reports.summary(assessments, rng)
        return Response({
            "total_children": total,
            "unassessed": max(0, total - len(assessed_children)),
            "trend": agg["trend"][-6:],
            "per_psychologist": agg["per_psychologist"],
            "by_case_type": agg["by_case_type"],
        })
