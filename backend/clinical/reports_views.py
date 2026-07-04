"""V2 report endpoints: per-child chart view, cross-child monitoring, agency
summary, and the (interim) dashboard — all sourced from clinical records."""

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role
from accounts.permissions import CanViewResults, IsAdminOrStaff
from children.models import Child, TerminationRecord
from children.serializers import ChildSerializer
from clinical import reports
from clinical.models import (
    PreAssessment, ResultEntry, RemarkNote, TreatmentPlan,
    PsychologicalReport, ProblemEntry,
)
from clinical.serializers import (
    PreAssessmentSerializer, ResultEntrySerializer, RemarkNoteSerializer,
    TreatmentPlanSerializer, PsychologicalReportSerializer, ProblemEntrySerializer,
)


def _role(request):
    return getattr(getattr(request.user, "role", None), "role_name", None)


class ChildReportView(generics.GenericAPIView):
    """Chart view of one child: profile + pre-assessment log + result entries
    + report files + remarks + treatment plan + open problems."""
    permission_classes = [CanViewResults]

    def get(self, request, child_id):
        try:
            child = Child.objects.prefetch_related("pre_assessments__instruments").get(pk=child_id)
        except Child.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        role = _role(request)
        if role == Role.PSYCHOLOGIST and child.assigned_psychologist_id != request.user.id:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        pas = child.pre_assessments.all().select_related("consent", "interview", "psychologist")
        results = child.result_entries.select_related("instrument", "entered_by")
        remarks = child.remarks.select_related("author")
        plans = child.treatment_plans.select_related("author")
        files = child.psych_reports.select_related("author")
        problems = child.problems.all()

        # Carry-history control: a newly assigned psychologist without history
        # sees only records they authored themselves.
        if role == Role.PSYCHOLOGIST and not child.assignee_sees_history:
            pas = pas.filter(psychologist=request.user)
            results = results.filter(entered_by=request.user)
            remarks = remarks.filter(author=request.user)
            plans = plans.filter(author=request.user)
            files = files.filter(author=request.user)

        return Response({
            "child": ChildSerializer(child).data,
            "pre_assessments": PreAssessmentSerializer(pas, many=True).data,
            "result_entries": ResultEntrySerializer(results, many=True).data,
            "remarks": RemarkNoteSerializer(remarks, many=True).data,
            "treatment_plans": TreatmentPlanSerializer(plans, many=True).data,
            "reports": PsychologicalReportSerializer(files, many=True).data,
            "problems": ProblemEntrySerializer(problems, many=True).data,
        })


class MonitoringListView(generics.GenericAPIView):
    """Cross-child monitoring table, role-scoped. V2 columns: last activity /
    next appointment / flags — no engine scores exist."""
    permission_classes = [CanViewResults]

    def get(self, request):
        role = _role(request)
        children = (Child.objects.exclude(status=Child.INACTIVE)
                    .select_related("assigned_psychologist")
                    .prefetch_related("pre_assessments__instruments"))
        if role == Role.PSYCHOLOGIST:
            children = children.filter(assigned_psychologist=request.user)
        children = list(children)
        ids = [c.id for c in children]

        latest_result = {}
        for r in ResultEntry.objects.filter(child_id__in=ids).order_by("date", "id"):
            latest_result[r.child_id] = r
        last_remark = {}
        for r in RemarkNote.objects.filter(child_id__in=ids).order_by("date", "id"):
            last_remark[r.child_id] = r.date
        report_counts = {}
        for r in PsychologicalReport.objects.filter(child_id__in=ids):
            report_counts[r.child_id] = report_counts.get(r.child_id, 0) + 1

        rows = []
        for c in children:
            completed = [p for p in c.pre_assessments.all() if p.status == "completed"]
            last_pa = max((p.date for p in completed), default=None)
            res = latest_result.get(c.id)
            candidates = [d for d in (last_pa,
                                      last_remark.get(c.id),
                                      res.date if res else None) if d]
            last_activity = max(candidates) if candidates else None
            psy = c.assigned_psychologist
            rows.append({
                "child_id": c.id,
                "child_name": c.fullname,
                "case_ref": f"C-{c.id:04d}",
                "case_type": c.case_type or None,
                "psychologist_name": (getattr(psy, "fullname", "") or getattr(psy, "username", "")) or None,
                "pre_assessment_status": "Answered" if completed else "Not yet",
                "latest_classification": (res.classification or None) if res else None,
                "last_activity": last_activity.isoformat() if last_activity else None,
                "next_session": None,  # wired to appointments by the scheduling module
                "report_count": report_counts.get(c.id, 0),
                "pre_assessment_count": len(completed),
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
    w.writerow(["Completed pre-assessments", data["total"]])
    w.writerow(["Children seen", data["children"]])
    w.writerow(["Pending pre-assessments", data["pending_pre_assessments"]])
    w.writerow([])
    w.writerow(["Case type", "Count"])
    for k, v in data["by_case_type"].items():
        w.writerow([k, v])
    w.writerow([])
    w.writerow(["Psychologist", "Sessions"])
    for p in data["per_psychologist"]:
        w.writerow([p["name"], p["count"]])
    w.writerow([])
    w.writerow(["Termination reason", "Count"])
    for k, v in data["terminations_by_reason"].items():
        w.writerow([k, v])
    return resp


class SummaryReportView(generics.GenericAPIView):
    """Agency Summary (admin + staff): census KPIs over a date range."""
    permission_classes = [IsAdminOrStaff]

    def get(self, request):
        rng = request.query_params.get("range", "monthly")
        qs = (PreAssessment.objects.filter(status=PreAssessment.COMPLETED)
              .select_related("child", "psychologist").order_by("date", "id"))
        frm, to = request.query_params.get("from"), request.query_params.get("to")
        if frm:
            qs = qs.filter(date__gte=frm)
        if to:
            qs = qs.filter(date__lte=to)
        data = reports.summary(list(qs), rng)

        term_qs = TerminationRecord.objects.all()
        if frm:
            term_qs = term_qs.filter(date__gte=frm)
        if to:
            term_qs = term_qs.filter(date__lte=to)
        by_reason = {}
        for t in term_qs:
            by_reason[t.reason_category] = by_reason.get(t.reason_category, 0) + 1
        data["terminations_by_reason"] = by_reason
        data["pending_pre_assessments"] = (PreAssessment.objects
                                           .exclude(status=PreAssessment.COMPLETED).count())

        # NB: `format` is reserved by DRF content negotiation, so use `export`.
        if request.query_params.get("export") == "csv":
            return _summary_csv(data)
        return Response(data)


class DashboardView(generics.GenericAPIView):
    """Interim dashboard stats (full census dashboard lands with scheduling):
    child counts, session trend, case mix — role-scoped."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = _role(request)
        rng = request.query_params.get("range", "monthly")
        children = Child.objects.exclude(status=Child.INACTIVE)
        pas = (PreAssessment.objects.filter(status=PreAssessment.COMPLETED)
               .select_related("child", "psychologist"))
        if role == Role.PSYCHOLOGIST:
            children = children.filter(assigned_psychologist=request.user)
            pas = pas.filter(child__assigned_psychologist=request.user)
        pas = list(pas.order_by("date", "id"))

        assessed_children = {p.child_id for p in pas}
        total = children.count()
        agg = reports.summary(pas, rng)
        return Response({
            "total_children": total,
            "unassessed": max(0, total - len(assessed_children)),
            "trend": agg["trend"][-6:],
            "per_psychologist": agg["per_psychologist"],
            "by_case_type": agg["by_case_type"],
        })
