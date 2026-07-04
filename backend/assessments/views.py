from django.db.models import Q
from rest_framework import generics, viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role
from accounts.permissions import (
    CanManageInstruments, CanTakeAssessments, CanViewResults, IsAdministrator, IsAdminOrStaff,
)
from activity.models import ActivityLog
from activity.services import log_activity
from assessments import reports
from assessments.models import Questionnaire, Assessment, AssessmentResult, Recommendation, AnalysisSetting
from children.models import Child
from children.serializers import ChildSerializer
from assessments.serializers import (
    QuestionnaireSerializer, AssessmentWriteSerializer, AssessmentListSerializer,
    AssessmentEditSerializer, AnalysisSettingSerializer,
)
from assessments.analysis import scoring, recommendations
from assessments.extraction.base import ExtractionError
from assessments.extraction.ocr_heuristic import OcrHeuristicExtractor

ALLOWED_UPLOAD_TYPES = ("application/pdf", "image/png", "image/jpeg")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def get_extractor():
    # Swap point: return an LlmExtractor() here once an API key/budget exists.
    return OcrHeuristicExtractor()


class QuestionnaireViewSet(viewsets.ModelViewSet):
    permission_classes = [CanManageInstruments]
    pagination_class = None
    serializer_class = QuestionnaireSerializer

    def get_queryset(self):
        qs = Questionnaire.objects.all().order_by("-created_at")
        if self.request.query_params.get("include_archived") != "true":
            qs = qs.exclude(status=Questionnaire.ARCHIVED)
        role = getattr(getattr(self.request.user, "role", None), "role_name", None)
        if role == Role.PSYCHOLOGIST:
            qs = qs.filter(owner=self.request.user)
        return qs

    def _log(self, obj, action_name):
        log_activity(self.request.user, action_name, ActivityLog.RECORD,
                     entity_type="Questionnaire", entity_label=obj.title, entity_id=obj.id)

    def perform_create(self, serializer):
        role = getattr(getattr(self.request.user, "role", None), "role_name", None)
        if role == Role.PSYCHOLOGIST:
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
    def archive(self, request, pk=None):
        obj = self.get_object()
        obj.status = Questionnaire.ARCHIVED
        obj.save(update_fields=["status", "updated_at"])
        self._log(obj, ActivityLog.ARCHIVED)
        return Response({"status": "archived"}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        obj = self.get_object()
        obj.status = Questionnaire.ACTIVE
        obj.save(update_fields=["status", "updated_at"])
        return Response({"status": "active"}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def extract(self, request):
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)
        if upload.size > MAX_UPLOAD_BYTES:
            return Response({"detail": "File too large (max 10 MB)."}, status=status.HTTP_400_BAD_REQUEST)
        if upload.content_type not in ALLOWED_UPLOAD_TYPES:
            return Response({"detail": "Unsupported file type. Upload a PDF, PNG, or JPG."},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            draft = get_extractor().extract(upload.read(), upload.content_type)
        except ExtractionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(draft, status=status.HTTP_200_OK)


class ActiveQuestionnaireListView(generics.ListAPIView):
    permission_classes = [CanTakeAssessments]
    pagination_class = None
    serializer_class = QuestionnaireSerializer

    def get_queryset(self):
        qs = Questionnaire.objects.filter(status=Questionnaire.ACTIVE).order_by("title")
        role = getattr(getattr(self.request.user, "role", None), "role_name", None)
        if role == Role.PSYCHOLOGIST:
            qs = qs.filter(owner=self.request.user)
        return qs


class AssessmentViewSet(viewsets.ModelViewSet):
    pagination_class = None

    def get_permissions(self):
        if self.action in ("list", "retrieve", "schedule"):
            return [CanViewResults()]
        return [CanTakeAssessments()]

    def get_queryset(self):
        qs = (Assessment.objects
              .select_related("child", "questionnaire", "psychologist", "result")
              .prefetch_related("result__recommendations")
              .order_by("-assessment_date", "-id"))
        role = getattr(getattr(self.request.user, "role", None), "role_name", None)
        if role == Role.PSYCHOLOGIST:
            qs = qs.filter(child__assigned_psychologist=self.request.user).filter(
                Q(child__assignee_sees_history=True) | Q(psychologist=self.request.user))
        return qs

    def get_serializer_class(self):
        if self.action == "create":
            return AssessmentWriteSerializer
        return AssessmentListSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        questionnaire = serializer.validated_data.get("questionnaire")
        setting = AnalysisSetting.load()
        confidence, flagged = 0, False
        if questionnaire is not None:
            responses = [{"question": r["question"].id, "answer": r.get("answer", "")}
                         for r in serializer.validated_data.get("responses", [])]
            # Pre-save gate score; _persist_analysis re-scores from saved rows (deterministic, same result).
            confidence = scoring.score(questionnaire, responses)["confidence"]
            flagged = (setting.require_override_on_low_confidence
                       and confidence < setting.min_confidence_threshold)
        if flagged and not request.data.get("override_acknowledged"):
            return Response({
                "detail": "This result is below the minimum confidence threshold and requires practitioner override.",
                "code": "override_required",
                "confidence": confidence,
                "threshold": setting.min_confidence_threshold,
            }, status=status.HTTP_400_BAD_REQUEST)
        self.perform_create(serializer, overridden=flagged)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer, overridden=False):
        assessment = serializer.save(psychologist=self.request.user, status="completed")
        self._persist_analysis(assessment, overridden=overridden)
        log_activity(self.request.user, ActivityLog.CREATED, ActivityLog.RECORD,
                     entity_type="Assessment", entity_label=assessment.child.fullname, entity_id=assessment.id)

    def _persist_analysis(self, assessment, overridden=False):
        if not assessment.questionnaire_id:
            return
        responses = [{"question": r.question_id, "answer": r.answer} for r in assessment.responses.all()]
        result = scoring.score(assessment.questionnaire, responses)
        rec = recommendations.recommend(result)
        ar = AssessmentResult.objects.create(
            assessment=assessment,
            behavioral_score=result["behavioral_score"],
            classification=result["classification"],
            confidence=result["confidence"],
            overridden=overridden,
            assessment_date=assessment.assessment_date,
            assessment_type=assessment.assessment_type,
        )
        Recommendation.objects.create(
            result=ar, recommendation_text=rec["recommendation_text"], priority_level=rec["priority_level"])

    @action(detail=False, methods=["post"])
    def analyze(self, request):
        try:
            questionnaire = Questionnaire.objects.get(pk=request.data.get("questionnaire"))
        except Questionnaire.DoesNotExist:
            return Response({"detail": "Questionnaire not found."}, status=status.HTTP_400_BAD_REQUEST)
        result = scoring.score(questionnaire, request.data.get("responses", []))
        rec = recommendations.recommend(result)
        setting = AnalysisSetting.load()
        flagged = (setting.require_override_on_low_confidence
                   and result["confidence"] < setting.min_confidence_threshold)
        return Response({
            **result, **rec,
            "min_confidence_threshold": setting.min_confidence_threshold,
            "require_override": setting.require_override_on_low_confidence,
            "flagged": flagged,
        }, status=status.HTTP_200_OK)

    def partial_update(self, request, *args, **kwargs):
        # Editable-with-audit: owning psychologist edits notes/classification only,
        # blocked once finalized; AI result fields are never editable.
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


class AnalysisSettingView(generics.RetrieveUpdateAPIView):
    serializer_class = AnalysisSettingSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAuthenticated()]
        return [IsAdministrator()]

    def get_object(self):
        return AnalysisSetting.load()


class ChildReportView(generics.GenericAPIView):
    """Per-child progress report: profile + ordered assessment history + trajectory."""
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
              .select_related("result", "psychologist")
              .prefetch_related("result__recommendations")
              .order_by("assessment_date", "id"))
        if role == Role.PSYCHOLOGIST and not child.assignee_sees_history:
            qs = qs.filter(psychologist=request.user)
        assessments = list(qs)
        scores = [getattr(a, "result", None).behavioral_score if getattr(a, "result", None) else None
                  for a in assessments]
        return Response({
            "child": ChildSerializer(child).data,
            "assessments": AssessmentListSerializer(assessments, many=True).data,
            "trajectory": reports.trajectory(scores),
        })


class MonitoringListView(generics.GenericAPIView):
    """Per-child progress overview for the Progress Monitoring page, role-scoped:
    admin/staff -> all active children; psychologist -> their assigned children.
    Read-only; reuses reports.trajectory(). No new model."""
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
                       .select_related("result")
                       .order_by("assessment_date", "id"))
        by_child = {}
        for a in assessments:
            by_child.setdefault(a.child_id, []).append(a)

        rows = []
        for c in children:
            items = by_child.get(c.id, [])
            scores = [getattr(a, "result", None).behavioral_score
                      if getattr(a, "result", None) else None for a in items]
            latest = items[-1] if items else None
            latest_result = getattr(latest, "result", None) if latest else None
            if c.assigned_psychologist_id:
                psy = c.assigned_psychologist
                psy_name = (getattr(psy, "fullname", "") or getattr(psy, "username", "")) or None
            else:
                psy_name = None
            score = (float(latest_result.behavioral_score)
                     if latest_result and latest_result.behavioral_score is not None else None)
            rows.append({
                "child_id": c.id,
                "child_name": c.fullname,
                "case_ref": f"C-{c.id:04d}",
                "case_type": c.case_type or None,
                "psychologist_name": psy_name,
                "latest_classification": latest_result.classification if latest_result else None,
                "latest_score": score,
                "trajectory": reports.trajectory(scores),
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
    w.writerow(["Average score", data["avg_score"]])
    w.writerow(["Average confidence", data["avg_confidence"]])
    w.writerow(["Low-confidence (overridden)", data["overridden"]])
    w.writerow([])
    w.writerow(["Classification", "Count"])
    for k, v in data["by_classification"].items():
        w.writerow([k, v])
    w.writerow([])
    w.writerow(["Psychologist", "Assessments"])
    for p in data["per_psychologist"]:
        w.writerow([p["name"], p["count"]])
    return resp


class SummaryReportView(generics.GenericAPIView):
    """Agency Assessment Summary (admin + staff): aggregates over a date range."""
    permission_classes = [IsAdminOrStaff]

    def get(self, request):
        rng = request.query_params.get("range", "monthly")
        qs = (Assessment.objects.select_related("child", "psychologist", "result")
              .prefetch_related("result__recommendations").order_by("assessment_date", "id"))
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
    """Current-state dashboard stats (per-child latest classification), role-scoped:
    psychologist -> their assigned children; admin/staff -> all."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = getattr(getattr(request.user, "role", None), "role_name", None)
        rng = request.query_params.get("range", "monthly")
        children = Child.objects.exclude(status=Child.ARCHIVED)
        assessments = (Assessment.objects.select_related("result", "child", "psychologist")
                       .prefetch_related("result__recommendations"))
        if role == Role.PSYCHOLOGIST:
            children = children.filter(assigned_psychologist=request.user)
            assessments = assessments.filter(child__assigned_psychologist=request.user)
        assessments = list(assessments.order_by("assessment_date", "id"))

        latest = {}
        for a in assessments:
            latest[a.child_id] = a  # ordered, so this keeps the newest
        by_status = {"attention": 0, "monitoring": 0, "normal": 0}
        for a in latest.values():
            r = getattr(a, "result", None)
            cls = r.classification if r else None
            if cls == "Needs Counseling Attention":
                by_status["attention"] += 1
            elif cls == "Needs Monitoring":
                by_status["monitoring"] += 1
            elif cls == "Normal":
                by_status["normal"] += 1

        total = children.count()
        agg = reports.summary(assessments, rng)
        return Response({
            "total_children": total,
            "by_status": by_status,
            "unassessed": max(0, total - len(latest)),
            "trend": agg["trend"][-6:],
            "per_psychologist": agg["per_psychologist"],
            "by_case_type": agg["by_case_type"],
        })
