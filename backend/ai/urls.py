from django.urls import path
from ai.views import (
    AISettingView, PreSessionBriefView, ReportSummaryDraftView,
    ConfirmReportSummaryView, RemarkPolishView, CensusNarrativeView,
)

urlpatterns = [
    path("ai/settings/", AISettingView.as_view(), name="ai-settings"),
    path("ai/brief/child/<int:child_id>/", PreSessionBriefView.as_view(), name="ai-brief"),
    path("ai/summarize-report/<int:report_id>/", ReportSummaryDraftView.as_view(), name="ai-summarize-report"),
    path("ai/confirm-summary/<int:report_id>/", ConfirmReportSummaryView.as_view(), name="ai-confirm-summary"),
    path("ai/polish-remark/", RemarkPolishView.as_view(), name="ai-polish-remark"),
    path("ai/census-narrative/", CensusNarrativeView.as_view(), name="ai-census-narrative"),
]
