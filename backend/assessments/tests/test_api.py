from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from accounts.models import Role
from assessments.models import Questionnaire

User = get_user_model()


class QuestionnaireApiTest(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name=Role.ADMINISTRATOR)
        self.psy_role = Role.objects.create(role_name=Role.PSYCHOLOGIST)
        self.staff_role = Role.objects.create(role_name=Role.STAFF)
        self.admin = User.objects.create_user(
            email="a@racco1.gov.ph", username="a", password="pass1234", role=self.admin_role)
        self.psy = User.objects.create_user(
            email="p@racco1.gov.ph", username="p", password="pass1234", role=self.psy_role)
        self.staff = User.objects.create_user(
            email="s@racco1.gov.ph", username="s", password="pass1234", role=self.staff_role)

    def _auth(self, email):
        token = self.client.post("/api/auth/login/", {
            "email": email, "password": "pass1234"}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)

    def _payload(self):
        return {
            "title": "SDQ", "age_group": "5-8", "status": "draft",
            "questions": [
                {"question_text": "I am kind.", "question_type": "rating_scale", "options": [], "order": 1},
                {"question_text": "Do you sleep well?", "question_type": "yes_no", "options": [], "order": 2},
            ],
        }

    def test_psychologist_can_create_with_questions(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.post("/api/questionnaires/", self._payload(), format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(len(resp.data["questions"]), 2)
        self.assertEqual(Questionnaire.objects.count(), 1)

    def test_psychologist_create_sets_owner_self(self):
        self._auth("p@racco1.gov.ph")
        self.client.post("/api/questionnaires/", self._payload(), format="json")
        self.assertEqual(Questionnaire.objects.get().owner, self.psy)

    def test_admin_create_requires_owner(self):
        self._auth("a@racco1.gov.ph")
        resp = self.client.post("/api/questionnaires/", self._payload(), format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("owner", resp.data)

    def test_admin_can_list(self):
        Questionnaire.objects.create(title="X")
        self._auth("a@racco1.gov.ph")
        resp = self.client.get("/api/questionnaires/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_staff_forbidden(self):
        self._auth("s@racco1.gov.ph")
        self.assertEqual(self.client.get("/api/questionnaires/").status_code, 403)
        self.assertEqual(
            self.client.post("/api/questionnaires/", self._payload(), format="json").status_code, 403)

    def test_update_replaces_questions(self):
        self._auth("p@racco1.gov.ph")
        qid = self.client.post("/api/questionnaires/", self._payload(), format="json").data["id"]
        upd = self._payload()
        upd["questions"] = [{"question_text": "Only one.", "question_type": "yes_no", "options": [], "order": 1}]
        resp = self.client.put(f"/api/questionnaires/{qid}/", upd, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["questions"]), 1)

    def test_archive_hides_from_list(self):
        self._auth("a@racco1.gov.ph")
        qid = self.client.post("/api/questionnaires/", {**self._payload(), "owner": self.psy.id},
                               format="json").data["id"]
        self.client.post(f"/api/questionnaires/{qid}/archive/")
        self.assertEqual(len(self.client.get("/api/questionnaires/").data), 0)


import fitz  # PyMuPDF
from django.core.files.uploadedfile import SimpleUploadedFile


class ExtractEndpointTest(QuestionnaireApiTest):
    def _pdf_file(self):
        doc = fitz.open()
        doc.new_page().insert_text((72, 72), "1. The child is calm.\n2. Sleeps well?", fontsize=11)
        return SimpleUploadedFile("form.pdf", doc.tobytes(), content_type="application/pdf")

    def test_extract_returns_draft_without_saving(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.post("/api/questionnaires/extract/", {"file": self._pdf_file()}, format="multipart")
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(len(resp.data["questions"]), 2)
        self.assertEqual(Questionnaire.objects.count(), 0)

    def test_extract_forbidden_for_staff(self):
        self._auth("s@racco1.gov.ph")
        resp = self.client.post("/api/questionnaires/extract/", {"file": self._pdf_file()}, format="multipart")
        self.assertEqual(resp.status_code, 403)

    def test_extract_rejects_missing_file(self):
        self._auth("a@racco1.gov.ph")
        resp = self.client.post("/api/questionnaires/extract/", {}, format="multipart")
        self.assertEqual(resp.status_code, 400)


from assessments.models import Question, Assessment, Response
from children.models import Child


class AssessmentTakingTest(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name=Role.ADMINISTRATOR)
        self.psy_role = Role.objects.create(role_name=Role.PSYCHOLOGIST)
        self.staff_role = Role.objects.create(role_name=Role.STAFF)
        self.admin = User.objects.create_user(
            email="a@racco1.gov.ph", username="a", password="pass1234", role=self.admin_role)
        self.psy = User.objects.create_user(
            email="p@racco1.gov.ph", username="p", password="pass1234", role=self.psy_role)
        self.staff = User.objects.create_user(
            email="s@racco1.gov.ph", username="s", password="pass1234", role=self.staff_role)
        self.child = Child.objects.create(fullname="Ana Lopez", case_type="Foster Care",
                                          assigned_psychologist=self.psy)
        self.qn = Questionnaire.objects.create(title="SDQ", status="active", owner=self.psy)
        self.q1 = Question.objects.create(questionnaire=self.qn, question_text="Calm?", question_type="yes_no", order=1)
        self.q2 = Question.objects.create(questionnaire=self.qn, question_text="Sleeps?", question_type="rating_scale", order=2)
        self.draft = Questionnaire.objects.create(title="Draft one", status="draft", owner=self.psy)

    def _auth(self, email):
        token = self.client.post("/api/auth/login/", {
            "email": email, "password": "pass1234"}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)

    def _assessment_payload(self):
        return {
            "child": self.child.id, "questionnaire": self.qn.id, "assessment_type": "Intake",
            "classification": "Normal Development", "notes": "Adjusting well.",
            "responses": [
                {"question": self.q1.id, "answer": "Yes"},
                {"question": self.q2.id, "answer": "4"},
            ],
        }

    def test_active_questionnaires_lists_only_active(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.get("/api/active-questionnaires/")
        self.assertEqual(resp.status_code, 200)
        titles = [q["title"] for q in resp.data]
        self.assertIn("SDQ", titles)
        self.assertNotIn("Draft one", titles)

    def test_active_questionnaires_forbidden_for_staff(self):
        self._auth("s@racco1.gov.ph")
        self.assertEqual(self.client.get("/api/active-questionnaires/").status_code, 403)

    def test_psychologist_creates_assessment_with_responses(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.post("/api/assessments/", self._assessment_payload(), format="json")
        self.assertEqual(resp.status_code, 201)
        a = Assessment.objects.get()
        self.assertEqual(a.status, "completed")
        self.assertEqual(a.psychologist, self.psy)
        self.assertEqual(a.notes, "Adjusting well.")
        self.assertEqual(a.responses.count(), 2)

    def test_staff_cannot_create_assessment(self):
        self._auth("s@racco1.gov.ph")
        resp = self.client.post("/api/assessments/", self._assessment_payload(), format="json")
        self.assertEqual(resp.status_code, 403)

    def test_psychologist_lists_only_assigned_childrens_assessments(self):
        other = Child.objects.create(fullname="Other Kid", assigned_psychologist=self.admin)
        Assessment.objects.create(child=other, psychologist=self.admin, status="completed")
        self._auth("p@racco1.gov.ph")
        self.client.post("/api/assessments/", self._assessment_payload(), format="json")
        resp = self.client.get("/api/assessments/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_admin_sees_all_assessments(self):
        Assessment.objects.create(child=self.child, psychologist=self.psy, status="completed")
        self._auth("a@racco1.gov.ph")
        resp = self.client.get("/api/assessments/")
        self.assertEqual(len(resp.data), 1)

    def test_take_rejects_unassigned_child(self):
        other = Child.objects.create(fullname="Not Mine", assigned_psychologist=self.admin)
        self._auth("p@racco1.gov.ph")
        payload = self._assessment_payload()
        payload["child"] = other.id
        resp = self.client.post("/api/assessments/", payload, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("child", resp.data)

    def test_take_rejects_unowned_instrument(self):
        foreign = Questionnaire.objects.create(title="Foreign", status="active", owner=self.admin)
        self._auth("p@racco1.gov.ph")
        payload = self._assessment_payload()
        payload["questionnaire"] = foreign.id
        resp = self.client.post("/api/assessments/", payload, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("questionnaire", resp.data)

    def test_psychologist_sees_only_owned_active_instruments(self):
        Questionnaire.objects.create(title="Admins One", status="active", owner=self.admin)
        self._auth("p@racco1.gov.ph")
        titles = [q["title"] for q in self.client.get("/api/active-questionnaires/").data]
        self.assertIn("SDQ", titles)
        self.assertNotIn("Admins One", titles)

    def test_carry_history_controls_visibility_of_prior_assessments(self):
        Assessment.objects.create(child=self.child, psychologist=self.admin, status="completed")
        self.child.assignee_sees_history = False
        self.child.save()
        self._auth("p@racco1.gov.ph")
        self.assertEqual(len(self.client.get("/api/assessments/").data), 0)
        self.child.assignee_sees_history = True
        self.child.save()
        self.assertEqual(len(self.client.get("/api/assessments/").data), 1)

    def test_respondent_mode_defaults_to_staff(self):
        self._auth("p@racco1.gov.ph")
        self.client.post("/api/assessments/", self._assessment_payload(), format="json")
        self.assertEqual(Assessment.objects.get().respondent_mode, "staff")

    def test_respondent_mode_child_is_saved(self):
        self._auth("p@racco1.gov.ph")
        payload = self._assessment_payload()
        payload["respondent_mode"] = "child"
        self.client.post("/api/assessments/", payload, format="json")
        self.assertEqual(Assessment.objects.get().respondent_mode, "child")

    def test_analyze_returns_result_without_saving(self):
        from assessments.models import AssessmentResult
        self._auth("p@racco1.gov.ph")
        resp = self.client.post("/api/assessments/analyze/", {
            "questionnaire": self.qn.id,
            "responses": [{"question": self.q1.id, "answer": "No"}, {"question": self.q2.id, "answer": "5"}],
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("behavioral_score", resp.data)
        self.assertIn("recommendation_text", resp.data)
        self.assertEqual(AssessmentResult.objects.count(), 0)

    def test_analyze_forbidden_for_staff(self):
        self._auth("s@racco1.gov.ph")
        resp = self.client.post("/api/assessments/analyze/", {"questionnaire": self.qn.id, "responses": []}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_submit_persists_result_and_recommendation(self):
        from assessments.models import AssessmentResult, Recommendation
        self._auth("p@racco1.gov.ph")
        self.client.post("/api/assessments/", self._assessment_payload(), format="json")
        self.assertEqual(AssessmentResult.objects.count(), 1)
        self.assertEqual(Recommendation.objects.count(), 1)
        self.assertTrue(AssessmentResult.objects.first().classification)

    def test_staff_can_view_results_sees_all(self):
        Assessment.objects.create(child=self.child, psychologist=self.psy, questionnaire=self.qn, status="completed")
        self._auth("s@racco1.gov.ph")
        resp = self.client.get("/api/assessments/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_result_included_in_list(self):
        self._auth("p@racco1.gov.ph")
        self.client.post("/api/assessments/", self._assessment_payload(), format="json")
        resp = self.client.get("/api/assessments/")
        self.assertIsNotNone(resp.data[0]["result"])
        self.assertIn("behavioral_score", resp.data[0]["result"])
        self.assertIn("notes", resp.data[0])

    def _low_conf_payload(self):
        # q1 scorable ("Yes" -> concern 1.0); q2 blank -> unscorable.
        # coverage 1/2, score 100 -> confidence round(100*(0.5*0.5 + 0.5*1.0)) = 75 -> below 80.
        return {
            "child": self.child.id, "questionnaire": self.qn.id, "assessment_type": "Intake",
            "classification": "Normal Development", "notes": "Limited data.",
            "responses": [
                {"question": self.q1.id, "answer": "Yes"},
                {"question": self.q2.id, "answer": ""},
            ],
        }

    def test_low_confidence_blocked_without_override(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.post("/api/assessments/", self._low_conf_payload(), format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data["code"], "override_required")
        self.assertEqual(resp.data["confidence"], 75)
        self.assertEqual(Assessment.objects.count(), 0)

    def test_low_confidence_saved_with_override(self):
        from assessments.models import AssessmentResult
        self._auth("p@racco1.gov.ph")
        payload = self._low_conf_payload()
        payload["override_acknowledged"] = True
        resp = self.client.post("/api/assessments/", payload, format="json")
        self.assertEqual(resp.status_code, 201)
        ar = AssessmentResult.objects.get()
        self.assertTrue(ar.overridden)
        self.assertEqual(ar.confidence, 75)

    def test_high_confidence_not_gated(self):
        from assessments.models import AssessmentResult
        self._auth("p@racco1.gov.ph")
        resp = self.client.post("/api/assessments/", self._assessment_payload(), format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertFalse(AssessmentResult.objects.get().overridden)

    def test_gate_disabled_when_override_not_required(self):
        from assessments.models import AnalysisSetting
        s = AnalysisSetting.load()
        s.require_override_on_low_confidence = False
        s.save()
        self._auth("p@racco1.gov.ph")
        resp = self.client.post("/api/assessments/", self._low_conf_payload(), format="json")
        self.assertEqual(resp.status_code, 201)
        from assessments.models import AssessmentResult
        self.assertFalse(AssessmentResult.objects.get().overridden)

    def test_result_payload_includes_confidence(self):
        self._auth("p@racco1.gov.ph")
        self.client.post("/api/assessments/", self._assessment_payload(), format="json")
        resp = self.client.get("/api/assessments/")
        self.assertIn("confidence", resp.data[0]["result"])
        self.assertIn("overridden", resp.data[0]["result"])
        self.assertEqual(resp.data[0]["result"]["confidence"], 100)

    def test_analyze_returns_confidence_and_flag(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.post("/api/assessments/analyze/", {
            "questionnaire": self.qn.id,
            "responses": [{"question": self.q1.id, "answer": "Yes"}, {"question": self.q2.id, "answer": ""}],
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["confidence"], 75)
        self.assertTrue(resp.data["flagged"])
        self.assertEqual(resp.data["min_confidence_threshold"], 80)


class AnalysisSettingApiTest(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name=Role.ADMINISTRATOR)
        self.psy_role = Role.objects.create(role_name=Role.PSYCHOLOGIST)
        self.admin = User.objects.create_user(email="a@racco1.gov.ph", username="a", password="pass1234", role=self.admin_role)
        self.psy = User.objects.create_user(email="p@racco1.gov.ph", username="p", password="pass1234", role=self.psy_role)

    def _auth(self, email):
        token = self.client.post("/api/auth/login/", {"email": email, "password": "pass1234"}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)

    def test_get_returns_defaults(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.get("/api/analysis-settings/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["min_confidence_threshold"], 80)
        self.assertTrue(resp.data["require_override_on_low_confidence"])

    def test_admin_can_update(self):
        self._auth("a@racco1.gov.ph")
        resp = self.client.put("/api/analysis-settings/", {
            "min_confidence_threshold": 70, "require_override_on_low_confidence": False}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["min_confidence_threshold"], 70)
        from assessments.models import AnalysisSetting
        self.assertEqual(AnalysisSetting.load().min_confidence_threshold, 70)

    def test_non_admin_cannot_update(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.put("/api/analysis-settings/", {
            "min_confidence_threshold": 70, "require_override_on_low_confidence": True}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_non_admin_cannot_patch(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.patch("/api/analysis-settings/", {"min_confidence_threshold": 60}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_threshold_out_of_range_rejected(self):
        self._auth("a@racco1.gov.ph")
        resp = self.client.put("/api/analysis-settings/", {
            "min_confidence_threshold": 10, "require_override_on_low_confidence": True}, format="json")
        self.assertEqual(resp.status_code, 400)
