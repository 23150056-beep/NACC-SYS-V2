from rest_framework.routers import DefaultRouter
from children.views import GuardianViewSet, ChildViewSet, ProgressNoteViewSet, GoalViewSet

router = DefaultRouter()
router.register("guardians", GuardianViewSet, basename="guardian")
router.register("children", ChildViewSet, basename="child")
router.register("progress-notes", ProgressNoteViewSet, basename="progress-note")
router.register("goals", GoalViewSet, basename="goal")

urlpatterns = router.urls
