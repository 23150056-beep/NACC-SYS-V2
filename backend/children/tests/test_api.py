from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from accounts.models import Role
from children.models import Guardian, Child

User = get_user_model()


class ChildApiTest(APITestCase):
    def setUp(self):
        self.staff_role = Role.objects.create(role_name=Role.STAFF)
        self.psychologist_role = Role.objects.create(role_name=Role.PSYCHOLOGIST)
        self.staff = User.objects.create_user(
            email="staff@racco1.gov.ph", username="staff", password="staff1234",
            role=self.staff_role)
        self.psychologist = User.objects.create_user(
            email="c@racco1.gov.ph", username="c", password="couns1234",
            role=self.psychologist_role)

    def _auth(self, email, password):
        token = self.client.post("/api/auth/login/", {
            "email": email, "password": password}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)

    def test_staff_can_create_child(self):
        self._auth("staff@racco1.gov.ph", "staff1234")
        resp = self.client.post("/api/children/", {
            "fullname": "Juan Cruz", "gender": "Male", "case_type": "Foster Care"})
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(Child.objects.filter(fullname="Juan Cruz").exists())

    def test_psychologist_cannot_create_child(self):
        self._auth("c@racco1.gov.ph", "couns1234")
        resp = self.client.post("/api/children/", {"fullname": "X"})
        self.assertEqual(resp.status_code, 403)

    def test_psychologist_can_view_children(self):
        Child.objects.create(fullname="Visible Child", case_type="Foster Care",
                             assigned_psychologist=self.psychologist)
        self._auth("c@racco1.gov.ph", "couns1234")
        resp = self.client.get("/api/children/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_archive_child_hides_from_list(self):
        self._auth("staff@racco1.gov.ph", "staff1234")
        child = Child.objects.create(fullname="Ana Lopez", case_type="Adoption")
        self.client.post(f"/api/children/{child.id}/archive/")
        names = [c["fullname"] for c in self.client.get("/api/children/").data]
        self.assertNotIn("Ana Lopez", names)

    def test_staff_can_create_guardian(self):
        self._auth("staff@racco1.gov.ph", "staff1234")
        resp = self.client.post("/api/guardians/", {
            "fullname": "Maria Cruz", "case_type": "Foster"})
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(Guardian.objects.filter(fullname="Maria Cruz").exists())
