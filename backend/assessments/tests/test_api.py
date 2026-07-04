from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from accounts.models import Role
from assessments.models import Questionnaire, Assessment
from children.models import Child

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


class AssessmentReadTest(APITestCase):
    """V2: assessments are read-only history (in-app administration removed).
    Verifies role scoping on the list endpoint."""

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

    def _auth(self, email):
        token = self.client.post("/api/auth/login/", {
            "email": email, "password": "pass1234"}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)

    def test_create_endpoint_is_gone(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.post("/api/assessments/", {"child": self.child.id}, format="json")
        self.assertEqual(resp.status_code, 405)

    def test_psychologist_lists_only_assigned_childrens_assessments(self):
        other = Child.objects.create(fullname="Other Kid", assigned_psychologist=self.admin)
        Assessment.objects.create(child=other, psychologist=self.admin, status="completed")
        Assessment.objects.create(child=self.child, psychologist=self.psy, status="completed")
        self._auth("p@racco1.gov.ph")
        resp = self.client.get("/api/assessments/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_admin_sees_all_assessments(self):
        Assessment.objects.create(child=self.child, psychologist=self.psy, status="completed")
        self._auth("a@racco1.gov.ph")
        resp = self.client.get("/api/assessments/")
        self.assertEqual(len(resp.data), 1)

    def test_staff_can_view_results_sees_all(self):
        Assessment.objects.create(child=self.child, psychologist=self.psy, status="completed")
        self._auth("s@racco1.gov.ph")
        resp = self.client.get("/api/assessments/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_carry_history_controls_visibility_of_prior_assessments(self):
        Assessment.objects.create(child=self.child, psychologist=self.admin, status="completed")
        self.child.assignee_sees_history = False
        self.child.save()
        self._auth("p@racco1.gov.ph")
        self.assertEqual(len(self.client.get("/api/assessments/").data), 0)
        self.child.assignee_sees_history = True
        self.child.save()
        self.assertEqual(len(self.client.get("/api/assessments/").data), 1)
