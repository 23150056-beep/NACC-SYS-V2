from django.utils import timezone
from rest_framework import generics, status, serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from accounts.permissions import IsAdministrator, IsAdminOrStaff, CanViewResults
from ai import prompts
from ai.briefs import build_brief_prompt, latest_brief_job, prefetch_briefs
from ai.models import AISetting, AIJob
from ai.services import AIUnavailable, DISCLAIMER, feature_enabled, run_job
from children.models import Child
from clinical.models import PsychologicalReport, CaseStudy
from scheduling.models import Appointment


def _role(request):
    return getattr(getattr(request.user, "role", None), "role_name", None)


class AISettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = AISetting
        fields = ["enabled", "feature_brief", "feature_doc_intelligence",
                  "feature_remark_polish", "feature_census_narrative",
                  "ollama_url", "model_name", "updated_at"]


class AISettingView(generics.RetrieveUpdateAPIView):
    serializer_class = AISettingSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAuthenticated()]
        return [IsAdministrator()]

    def get_object(self):
        return AISetting.load()


def _gate(feature):
    """503 payload when a feature (or the AI runtime) is off/unreachable."""
    return Response(
        {"detail": "AI assistance is not available. The system works fully without it.",
         "feature": feature},
        status=status.HTTP_503_SERVICE_UNAVAILABLE)


class PreSessionBriefView(APIView):
    """A1 — compile recent clinical context into a 150-word brief (draft)."""
    permission_classes = [CanViewResults]

    def post(self, request, child_id):
        if not feature_enabled("brief"):
            return _gate("brief")
        try:
            child = Child.objects.get(pk=child_id)
        except Child.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if _role(request) == Role.PSYCHOLOGIST and \
                child.assigned_psychologist_id != request.user.id:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        prompt = build_brief_prompt(child)
        try:
            text, job = run_job("brief", f"child:{child.id}", prompt,
                                prompts.SYSTEM, request.user)
        except AIUnavailable:
            return _gate("brief")
        return Response({"draft": text, "job_id": job.id, "disclaimer": DISCLAIMER})


class ReportSummaryDraftView(APIView):
    """A2 — draft structured fields from the psychologist's own report text."""
    permission_classes = [CanViewResults]

    def post(self, request, report_id):
        if not feature_enabled("doc_intelligence"):
            return _gate("doc_intelligence")
        try:
            report = PsychologicalReport.objects.select_related("child").get(pk=report_id)
        except PsychologicalReport.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if _role(request) == Role.PSYCHOLOGIST and \
                report.child.assigned_psychologist_id != request.user.id:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not report.extracted_text:
            return Response({"detail": "No extractable text in this report (scanned or Word file)."},
                            status=status.HTTP_400_BAD_REQUEST)
        prompt = prompts.DOC_INTELLIGENCE.format(text=report.extracted_text[:12000])
        try:
            text, job = run_job("doc_intelligence", f"report:{report.id}", prompt,
                                prompts.SYSTEM, request.user)
        except AIUnavailable:
            return _gate("doc_intelligence")
        report.ai_summary = text
        report.ai_summary_confirmed = False
        report.save(update_fields=["ai_summary", "ai_summary_confirmed"])
        return Response({"draft": text, "job_id": job.id, "disclaimer": DISCLAIMER})


class ConfirmReportSummaryView(APIView):
    """Human-in-the-loop confirm/edit of the A2 draft."""
    permission_classes = [CanViewResults]

    def post(self, request, report_id):
        try:
            report = PsychologicalReport.objects.select_related("child").get(pk=report_id)
        except PsychologicalReport.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        role = _role(request)
        can = role == Role.ADMINISTRATOR or (
            role == Role.PSYCHOLOGIST and report.child.assigned_psychologist_id == request.user.id)
        if not can:
            return Response({"detail": "Only the assigned psychologist can confirm the summary."},
                            status=status.HTTP_403_FORBIDDEN)
        text = (request.data.get("text") or "").strip()
        if not text:
            return Response({"text": "Provide the confirmed summary text."},
                            status=status.HTTP_400_BAD_REQUEST)
        report.ai_summary = text
        report.ai_summary_confirmed = True
        report.save(update_fields=["ai_summary", "ai_summary_confirmed"])
        AIJob.objects.filter(input_ref=f"report:{report.id}",
                             job_type="doc_intelligence").update(accepted=True)
        return Response({"ai_summary": report.ai_summary, "confirmed": True})


class RemarkPolishView(APIView):
    """A3 — rewrite a shorthand remark into clinical prose (draft only)."""
    permission_classes = [CanViewResults]

    def post(self, request):
        if not feature_enabled("remark_polish"):
            return _gate("remark_polish")
        raw = (request.data.get("text") or "").strip()
        if not raw:
            return Response({"text": "Provide the remark text to polish."},
                            status=status.HTTP_400_BAD_REQUEST)
        prompt = prompts.REMARK_POLISH.format(text=raw[:2000])
        try:
            text, job = run_job("remark_polish", "remark:draft", prompt,
                                prompts.SYSTEM, request.user)
        except AIUnavailable:
            return _gate("remark_polish")
        return Response({"draft": text, "job_id": job.id, "disclaimer": DISCLAIMER})


class CensusNarrativeView(APIView):
    """A5 — optional narrative paragraph for the monthly agency report."""
    permission_classes = [IsAdminOrStaff]

    def post(self, request):
        if not feature_enabled("census_narrative"):
            return _gate("census_narrative")
        stats = request.data.get("stats")
        if not stats:
            return Response({"stats": "Provide the aggregates to narrate."},
                            status=status.HTTP_400_BAD_REQUEST)
        import json as _json
        prompt = prompts.CENSUS_NARRATIVE.format(stats=_json.dumps(stats, indent=2)[:6000])
        try:
            text, job = run_job("census_narrative", "summary", prompt,
                                prompts.SYSTEM, request.user)
        except AIUnavailable:
            return _gate("census_narrative")
        return Response({"draft": text, "job_id": job.id, "disclaimer": DISCLAIMER})


class LatestBriefView(APIView):
    """F2 — return today's cached brief instantly (404 when none)."""
    permission_classes = [CanViewResults]

    def get(self, request, child_id):
        try:
            child = Child.objects.get(pk=child_id)
        except Child.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if _role(request) == Role.PSYCHOLOGIST and \
                child.assigned_psychologist_id != request.user.id:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        job = latest_brief_job(child.id)
        if not job:
            return Response({"detail": "No brief generated today."},
                            status=status.HTTP_404_NOT_FOUND)
        return Response({"draft": job.output_text, "job_id": job.id,
                         "generated_at": job.created_at, "disclaimer": DISCLAIMER})


class PrefetchBriefsView(APIView):
    """F2 — queue background brief generation for today's scheduled appointments."""
    permission_classes = [CanViewResults]

    def post(self, request):
        if not feature_enabled("brief"):
            return _gate("brief")
        appts = Appointment.objects.filter(
            status=Appointment.SCHEDULED,
            start__date=timezone.localdate()).select_related("child")
        if _role(request) == Role.PSYCHOLOGIST:
            appts = appts.filter(child__assigned_psychologist=request.user)
        children = list({a.child_id: a.child for a in appts}.values())
        queued, skipped = prefetch_briefs(children, request.user)
        return Response({"queued": queued, "skipped": skipped})


class CaseStudySummaryDraftView(APIView):
    """F3 — draft structured fields from the social worker's case study."""
    permission_classes = [CanViewResults]

    def post(self, request, case_study_id):
        if not feature_enabled("doc_intelligence"):
            return _gate("doc_intelligence")
        try:
            cs = CaseStudy.objects.select_related("child").get(pk=case_study_id)
        except CaseStudy.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if _role(request) == Role.PSYCHOLOGIST and \
                cs.child.assigned_psychologist_id != request.user.id:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not cs.extracted_text:
            return Response(
                {"detail": "No extractable text in this case study (scanned or Word file)."},
                status=status.HTTP_400_BAD_REQUEST)
        prompt = prompts.CASE_STUDY.format(text=cs.extracted_text[:12000])
        try:
            text, job = run_job("case_study", f"casestudy:{cs.id}", prompt,
                                prompts.SYSTEM, request.user)
        except AIUnavailable:
            return _gate("doc_intelligence")
        cs.ai_summary = text
        cs.ai_summary_confirmed = False
        cs.save(update_fields=["ai_summary", "ai_summary_confirmed"])
        return Response({"draft": text, "job_id": job.id, "disclaimer": DISCLAIMER})


class ConfirmCaseStudySummaryView(APIView):
    """Human-in-the-loop confirm/edit of the case-study draft."""
    permission_classes = [CanViewResults]

    def post(self, request, case_study_id):
        try:
            cs = CaseStudy.objects.select_related("child").get(pk=case_study_id)
        except CaseStudy.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        role = _role(request)
        can = role == Role.ADMINISTRATOR or (
            role == Role.PSYCHOLOGIST and cs.child.assigned_psychologist_id == request.user.id)
        if not can:
            return Response(
                {"detail": "Only the assigned psychologist can confirm the summary."},
                status=status.HTTP_403_FORBIDDEN)
        text = (request.data.get("text") or "").strip()
        if not text:
            return Response({"text": "Provide the confirmed summary text."},
                            status=status.HTTP_400_BAD_REQUEST)
        cs.ai_summary = text
        cs.ai_summary_confirmed = True
        cs.save(update_fields=["ai_summary", "ai_summary_confirmed"])
        AIJob.objects.filter(input_ref=f"casestudy:{cs.id}",
                             job_type="case_study").update(accepted=True)
        return Response({"ai_summary": cs.ai_summary, "confirmed": True})
