from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from accounts.models import Role
from children.models import Child
from clinical.models import AgencyFormTemplate

User = get_user_model()


class AgencyFormsBase(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name=Role.ADMINISTRATOR)
        self.psy_role = Role.objects.create(role_name=Role.PSYCHOLOGIST)
        self.admin = User.objects.create_user(
            email="a@racco1.gov.ph", username="a", password="pass1234", role=self.admin_role)
        self.psy = User.objects.create_user(
            email="p@racco1.gov.ph", username="p", password="pass1234", role=self.psy_role)
        self.other = User.objects.create_user(
            email="o@racco1.gov.ph", username="o", password="pass1234", role=self.psy_role)
        self.child = Child.objects.create(
            fullname="Ana", case_type="Foster Care", assigned_psychologist=self.psy)

    def _auth(self, email):
        token = self.client.post("/api/auth/login/", {
            "email": email, "password": "pass1234"}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)


class TemplateBodyTest(AgencyFormsBase):
    def test_body_roundtrips_through_api(self):
        self._auth("a@racco1.gov.ph")
        resp = self.client.post("/api/form-templates/", {
            "form_type": "consent", "title": "Consent X",
            "body": "Intro paragraph.\n\n## I. PURPOSE\nBody text.",
            "fields": [], "attestation": True}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertIn("## I. PURPOSE", resp.data["body"])
        self.assertEqual(AgencyFormTemplate.objects.get(pk=resp.data["id"]).body,
                         "Intro paragraph.\n\n## I. PURPOSE\nBody text.")

    def test_body_edit_bumps_version(self):
        self._auth("a@racco1.gov.ph")
        created = self.client.post("/api/form-templates/", {
            "form_type": "consent", "title": "Consent X", "body": "v1 text",
            "fields": [], "attestation": True}, format="json")
        resp = self.client.patch(f"/api/form-templates/{created.data['id']}/", {
            "body": "v2 text", "attestation": True}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["version"], 2)


class InterviewRespondentTest(AgencyFormsBase):
    def test_respondent_roundtrips_through_api(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.post("/api/interviews/", {
            "child": self.child.id, "answers": {"Q": "A"},
            "respondent": "Custodian/PAP"}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["respondent"], "Custodian/PAP")
        listed = self.client.get(f"/api/interviews/?child={self.child.id}")
        self.assertEqual(listed.data[0]["respondent"], "Custodian/PAP")


class SharedTemplateAccessTest(AgencyFormsBase):
    def setUp(self):
        super().setUp()
        self.shared = AgencyFormTemplate.objects.create(
            form_type="consent", title="Official Consent", owner=None,
            attestation=True, active=True)
        self.own = AgencyFormTemplate.objects.create(
            form_type="consent", title="My Consent", owner=self.psy,
            attestation=True, active=True)
        self.others = AgencyFormTemplate.objects.create(
            form_type="consent", title="Other Consent", owner=self.other,
            attestation=True, active=True)

    def test_psychologist_sees_own_and_shared_only(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.get("/api/form-templates/")
        self.assertEqual({t["title"] for t in resp.data},
                         {"Official Consent", "My Consent"})

    def test_psychologist_cannot_edit_shared_template(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.patch(f"/api/form-templates/{self.shared.id}/", {
            "title": "Renamed", "attestation": True}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_psychologist_cannot_deactivate_shared_template(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.post(f"/api/form-templates/{self.shared.id}/deactivate/")
        self.assertEqual(resp.status_code, 403)

    def test_admin_can_edit_shared_template(self):
        self._auth("a@racco1.gov.ph")
        resp = self.client.patch(f"/api/form-templates/{self.shared.id}/", {
            "title": "Official Consent (2025)", "attestation": True}, format="json")
        self.assertEqual(resp.status_code, 200)
