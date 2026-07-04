from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from accounts.models import Role
from children.models import Child, Goal

User = get_user_model()


class GoalApiTest(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name=Role.ADMINISTRATOR)
        self.psy_role = Role.objects.create(role_name=Role.PSYCHOLOGIST)
        self.staff_role = Role.objects.create(role_name=Role.STAFF)
        self.admin = User.objects.create_user(email="a@racco1.gov.ph", username="a", password="pass1234", role=self.admin_role)
        self.psy = User.objects.create_user(email="p@racco1.gov.ph", username="p", password="pass1234", role=self.psy_role)
        self.staff = User.objects.create_user(email="s@racco1.gov.ph", username="s", password="pass1234", role=self.staff_role)
        self.mine = Child.objects.create(fullname="Ana", assigned_psychologist=self.psy)
        self.other = User.objects.create_user(email="o@racco1.gov.ph", username="o", password="pass1234", role=self.psy_role)
        self.theirs = Child.objects.create(fullname="Ben", assigned_psychologist=self.other)

    def _auth(self, email):
        token = self.client.post("/api/auth/login/", {"email": email, "password": "pass1234"}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)

    def test_psychologist_creates_goal_defaults_ongoing(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.post("/api/goals/", {"child": self.mine.id, "text": "Attend school daily"}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["status"], "ongoing")
        self.assertEqual(Goal.objects.count(), 1)

    def test_toggle_status_to_met(self):
        goal = Goal.objects.create(child=self.mine, author=self.psy, text="x")
        self._auth("p@racco1.gov.ph")
        resp = self.client.patch(f"/api/goals/{goal.id}/", {"status": "met"}, format="json")
        self.assertEqual(resp.status_code, 200)
        goal.refresh_from_db()
        self.assertEqual(goal.status, "met")

    def test_staff_cannot_write(self):
        self._auth("s@racco1.gov.ph")
        resp = self.client.post("/api/goals/", {"child": self.mine.id, "text": "x"}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_admin_can_create(self):
        self._auth("a@racco1.gov.ph")
        resp = self.client.post("/api/goals/", {"child": self.mine.id, "text": "Admin goal"}, format="json")
        self.assertEqual(resp.status_code, 201)

    def test_psychologist_cannot_write_to_unassigned_child(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.post("/api/goals/", {"child": self.theirs.id, "text": "x"}, format="json")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(Goal.objects.count(), 0)

    def test_psychologist_list_scoped_to_assigned(self):
        Goal.objects.create(child=self.mine, author=self.psy, text="mine")
        Goal.objects.create(child=self.theirs, author=self.other, text="theirs")
        self._auth("p@racco1.gov.ph")
        resp = self.client.get("/api/goals/")
        self.assertEqual(len(resp.data), 1)
