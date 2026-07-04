from rest_framework.routers import DefaultRouter
from clinical.views import (
    InstrumentCatalogViewSet, AgencyFormTemplateViewSet,
    ConsentRecordViewSet, ClinicalInterviewRecordViewSet, ProblemEntryViewSet,
    PreAssessmentViewSet,
)

router = DefaultRouter()
router.register("instruments", InstrumentCatalogViewSet, basename="instrument")
router.register("form-templates", AgencyFormTemplateViewSet, basename="form-template")
router.register("consents", ConsentRecordViewSet, basename="consent")
router.register("interviews", ClinicalInterviewRecordViewSet, basename="interview")
router.register("problems", ProblemEntryViewSet, basename="problem")
router.register("pre-assessments", PreAssessmentViewSet, basename="pre-assessment")

urlpatterns = router.urls
