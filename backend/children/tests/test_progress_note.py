from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from accounts.models import Role
from children.models import Child, ProgressNote

User = get_user_model()


class ProgressNoteApiTest(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name=Role.ADMINISTRATOR)
        self.psy_role = Role.objects.create(role_name=Role.PSYCHOLOGIST)
        self.staff_role = Role.objects.create(role_name=Role.STAFF)
        self.admin = User.objects.create_user(email="a@racco1.gov.ph", username="a", password="pass1234", role=self.admin_role)
        self.psy = User.objects.create_user(email="p@racco1.gov.ph", username="p", password="pass1234", role=self.psy_role)
        self.other = User.objects.create_user(email="o@racco1.gov.ph", username="o", password="pass1234", role=self.psy_role)
        self.staff = User.objects.create_user(email="s@racco1.gov.ph", username="s", password="pass1234", role=self.staff_role)
        self.mine = Child.objects.create(fullname="Ana", assigned_psychologist=self.psy)
        self.theirs = Child.objects.create(fullname="Ben", assigned_psychologist=self.other)

    def _auth(self, email):
        token = self.client.post("/api/auth/login/", {"email": email, "password": "pass1234"}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)

    def test_assigned_psychologist_adds_note(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.post("/api/progress-notes/", {"child": self.mine.id, "text": "Good session."}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["author_name"], self.psy.fullname)
        self.assertEqual(ProgressNote.objects.count(), 1)

    def test_psychologist_cannot_add_to_unassigned_child(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.post("/api/progress-notes/", {"child": self.theirs.id, "text": "x"}, format="json")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(ProgressNote.objects.count(), 0)

    def test_admin_can_add_note(self):
        self._auth("a@racco1.gov.ph")
        resp = self.client.post("/api/progress-notes/", {"child": self.mine.id, "text": "Admin note."}, format="json")
        self.assertEqual(resp.status_code, 201)

    def test_staff_read_only(self):
        self._auth("s@racco1.gov.ph")
        self.assertEqual(self.client.post("/api/progress-notes/", {"child": self.mine.id, "text": "x"}, format="json").status_code, 403)
        self.assertEqual(self.client.get("/api/progress-notes/").status_code, 200)

    def test_psychologist_list_scoped_and_filtered(self):
        ProgressNote.objects.create(child=self.mine, author=self.psy, text="mine")
        ProgressNote.objects.create(child=self.theirs, author=self.other, text="theirs")
        self._auth("p@racco1.gov.ph")
        resp = self.client.get("/api/progress-notes/")
        self.assertEqual(len(resp.data), 1)
        resp2 = self.client.get(f"/api/progress-notes/?child={self.mine.id}")
        self.assertEqual(len(resp2.data), 1)

    def test_other_psychologist_cannot_delete(self):
        note = ProgressNote.objects.create(child=self.mine, author=self.psy, text="mine")
        self._auth("o@racco1.gov.ph")
        resp = self.client.delete(f"/api/progress-notes/{note.id}/")
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(ProgressNote.objects.count(), 1)

    def test_other_psychologist_cannot_update(self):
        note = ProgressNote.objects.create(child=self.mine, author=self.psy, text="mine")
        self._auth("o@racco1.gov.ph")
        resp = self.client.patch(f"/api/progress-notes/{note.id}/", {"text": "hack"}, format="json")
        self.assertEqual(resp.status_code, 404)
        note.refresh_from_db()
        self.assertEqual(note.text, "mine")
