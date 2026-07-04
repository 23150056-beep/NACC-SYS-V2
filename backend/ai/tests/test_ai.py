from unittest.mock import patch

from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from accounts.models import Role
from ai.models import AISetting, AIJob
from ai.services import AIUnavailable, NullClient, get_ai_client
from children.models import Child
from clinical.models import PsychologicalReport, RemarkNote

User = get_user_model()


class FakeClient:
    available = True

    def __init__(self, reply="Drafted text."):
        self.reply = reply

    def generate(self, prompt, system=None):
        return self.reply


class AIBase(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name=Role.ADMINISTRATOR)
        self.psy_role = Role.objects.create(role_name=Role.PSYCHOLOGIST)
        self.staff_role = Role.objects.create(role_name=Role.STAFF)
        self.admin = User.objects.create_user(
            email="a@racco1.gov.ph", username="a", password="pass1234", role=self.admin_role)
        self.psy = User.objects.create_user(
            email="p@racco1.gov.ph", username="p", password="pass1234", role=self.psy_role)
        self.child = Child.objects.create(
            fullname="Ana Reyes", case_type="Adoption", assigned_psychologist=self.psy)

    def _auth(self, email):
        token = self.client.post("/api/auth/login/", {
            "email": email, "password": "pass1234"}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)

    def _enable(self):
        s = AISetting.load()
        s.enabled = True
        s.save()


class AISettingsTest(AIBase):
    def test_defaults_off(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.get("/api/ai/settings/")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["enabled"])

    def test_admin_can_toggle(self):
        self._auth("a@racco1.gov.ph")
        resp = self.client.patch("/api/ai/settings/", {"enabled": True}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(AISetting.load().enabled)

    def test_non_admin_cannot_toggle(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.patch("/api/ai/settings/", {"enabled": True}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_client_seam(self):
        self.assertIsInstance(get_ai_client(), NullClient)
        with self.assertRaises(AIUnavailable):
            NullClient().generate("x")


class BriefTest(AIBase):
    def test_disabled_returns_503(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.post(f"/api/ai/brief/child/{self.child.id}/")
        self.assertEqual(resp.status_code, 503)

    @patch("ai.services.get_ai_client", return_value=FakeClient("Brief for Ana."))
    def test_brief_returns_draft_and_logs_job(self, _mock):
        self._enable()
        RemarkNote.objects.create(child=self.child, author=self.psy, text="Sleeping better.")
        self._auth("p@racco1.gov.ph")
        resp = self.client.post(f"/api/ai/brief/child/{self.child.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["draft"], "Brief for Ana.")
        self.assertIn("disclaimer", resp.data)
        job = AIJob.objects.get()
        self.assertEqual(job.job_type, "brief")
        self.assertEqual(job.input_ref, f"child:{self.child.id}")
        self.assertTrue(job.ok)

    @patch("ai.services.get_ai_client", return_value=FakeClient())
    def test_brief_scoped_to_assigned(self, _mock):
        self._enable()
        other = User.objects.create_user(
            email="o@racco1.gov.ph", username="o", password="pass1234", role=self.psy_role)
        self._auth("o@racco1.gov.ph")
        resp = self.client.post(f"/api/ai/brief/child/{self.child.id}/")
        self.assertEqual(resp.status_code, 404)

    def test_unreachable_runtime_returns_503_and_logs_error(self):
        self._enable()  # enabled but no Ollama running on that port in CI
        s = AISetting.load()
        s.ollama_url = "http://127.0.0.1:1"  # guaranteed refused
        s.save()
        self._auth("p@racco1.gov.ph")
        resp = self.client.post(f"/api/ai/brief/child/{self.child.id}/")
        self.assertEqual(resp.status_code, 503)
        job = AIJob.objects.get()
        self.assertFalse(job.ok)


class DocIntelligenceTest(AIBase):
    def setUp(self):
        super().setUp()
        self.report = PsychologicalReport.objects.create(
            child=self.child, author=self.psy, file="reports/x.pdf",
            extracted_text="The child shows marked improvement in emotional regulation.")

    @patch("ai.services.get_ai_client", return_value=FakeClient("1. Findings…"))
    def test_draft_saved_unconfirmed(self, _mock):
        self._enable()
        self._auth("p@racco1.gov.ph")
        resp = self.client.post(f"/api/ai/summarize-report/{self.report.id}/")
        self.assertEqual(resp.status_code, 200)
        self.report.refresh_from_db()
        self.assertEqual(self.report.ai_summary, "1. Findings…")
        self.assertFalse(self.report.ai_summary_confirmed)

    @patch("ai.services.get_ai_client", return_value=FakeClient())
    def test_confirm_flow(self, _mock):
        self._enable()
        self._auth("p@racco1.gov.ph")
        self.client.post(f"/api/ai/summarize-report/{self.report.id}/")
        resp = self.client.post(f"/api/ai/confirm-summary/{self.report.id}/",
                                {"text": "Edited summary."}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.report.refresh_from_db()
        self.assertTrue(self.report.ai_summary_confirmed)
        self.assertEqual(self.report.ai_summary, "Edited summary.")
        self.assertTrue(AIJob.objects.filter(accepted=True).exists())

    def test_no_text_400(self):
        self._enable()
        self.report.extracted_text = ""
        self.report.save()
        with patch("ai.services.get_ai_client", return_value=FakeClient()):
            self._auth("p@racco1.gov.ph")
            resp = self.client.post(f"/api/ai/summarize-report/{self.report.id}/")
        self.assertEqual(resp.status_code, 400)


class PolishAndNarrativeTest(AIBase):
    @patch("ai.services.get_ai_client", return_value=FakeClient("Polished prose."))
    def test_polish(self, _mock):
        self._enable()
        self._auth("p@racco1.gov.ph")
        resp = self.client.post("/api/ai/polish-remark/", {"text": "slept ok, less anx"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["draft"], "Polished prose.")

    @patch("ai.services.get_ai_client", return_value=FakeClient("Narrative."))
    def test_narrative_admin_only(self, _mock):
        self._enable()
        self._auth("p@racco1.gov.ph")
        self.assertEqual(self.client.post("/api/ai/census-narrative/",
                                          {"stats": {"total": 3}}, format="json").status_code, 403)
        self._auth("a@racco1.gov.ph")
        resp = self.client.post("/api/ai/census-narrative/", {"stats": {"total": 3}}, format="json")
        self.assertEqual(resp.status_code, 200)
