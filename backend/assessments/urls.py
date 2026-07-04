from django.urls import path
from rest_framework.routers import DefaultRouter
from assessments.views import (
    QuestionnaireViewSet, AssessmentViewSet, ActiveQuestionnaireListView, AnalysisSettingView,
    ChildReportView, SummaryReportView, DashboardView, MonitoringListView,
)

router = DefaultRouter()
router.register("questionnaires", QuestionnaireViewSet, basename="questionnaire")
router.register("assessments", AssessmentViewSet, basename="assessment")

urlpatterns = router.urls + [
    path("active-questionnaires/", ActiveQuestionnaireListView.as_view(), name="active-questionnaires"),
    path("analysis-settings/", AnalysisSettingView.as_view(), name="analysis-settings"),
    path("reports/child/<int:child_id>/", ChildReportView.as_view(), name="report-child"),
    path("reports/summary/", SummaryReportView.as_view(), name="report-summary"),
    path("reports/dashboard/", DashboardView.as_view(), name="report-dashboard"),
    path("reports/monitoring/", MonitoringListView.as_view(), name="report-monitoring"),
]
