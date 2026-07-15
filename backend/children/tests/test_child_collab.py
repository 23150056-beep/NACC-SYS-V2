from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from accounts.models import Role, User
from children.models import Child


def make_user(email, role_name, **kw):
    role, _ = Role.objects.get_or_create(role_name=role_name)
    username = kw.pop("username", email.split("@")[0])
    return User.objects.create_user(email=email, username=username, password="pass12345", role=role, **kw)


class PsychologistEditTests(APITestCase):
    def setUp(self):
        self.admin = make_user("a@t.ph", Role.ADMINISTRATOR)
        self.staff = make_user("s@t.ph", Role.STAFF)
        self.psych = make_user("p@t.ph", Role.PSYCHOLOGIST)
        self.other_psych = make_user("p2@t.ph", Role.PSYCHOLOGIST)
        self.child = Child.objects.create(fullname="Mika Santos",
                                          assigned_psychologist=self.psych)

    def patch(self, user, child, data):
        self.client.force_authenticate(user)
        return self.client.patch(f"/api/children/{child.id}/", data, format="json")

    def test_assigned_psychologist_can_edit(self):
        r = self.patch(self.psych, self.child, {"education_level": "Grade 4"})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.child.refresh_from_db()
        self.assertEqual(self.child.education_level, "Grade 4")

    def test_unassigned_psychologist_cannot_edit(self):
        r = self.patch(self.other_psych, self.child, {"education_level": "x"})
        # queryset scoping means the record 404s for them
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)

    def test_psychologist_cannot_reassign(self):
        r = self.patch(self.psych, self.child, {"psychologist": self.other_psych.id})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_psychologist_cannot_create(self):
        self.client.force_authenticate(self.psych)
        r = self.client.post("/api/children/", {"fullname": "New Kid"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_fullname_locked_on_update_for_everyone(self):
        r = self.patch(self.staff, self.child, {"fullname": "Renamed"})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_recommendation_field_roundtrip(self):
        r = self.patch(self.staff, self.child, {"recommendation": "Refer for art therapy."})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["recommendation"], "Refer for art therapy.")


class ConcurrencyPresenceTests(APITestCase):
    def setUp(self):
        self.staff = make_user("s2@t.ph", Role.STAFF)
        self.psych = make_user("p3@t.ph", Role.PSYCHOLOGIST)
        self.child = Child.objects.create(fullname="Ana Cruz",
                                          assigned_psychologist=self.psych)

    def test_stale_write_conflicts(self):
        self.client.force_authenticate(self.staff)
        stale = "2000-01-01T00:00:00+00:00"
        r = self.client.patch(f"/api/children/{self.child.id}/",
                              {"education_level": "G1", "expected_updated_at": stale},
                              format="json")
        self.assertEqual(r.status_code, 409)
        self.assertIn("current", r.data)

    def test_fresh_write_passes(self):
        self.client.force_authenticate(self.staff)
        current = self.client.get(f"/api/children/{self.child.id}/").data["updated_at"]
        r = self.client.patch(f"/api/children/{self.child.id}/",
                              {"education_level": "G1", "expected_updated_at": current},
                              format="json")
        self.assertEqual(r.status_code, 200)

    def test_presence_roundtrip(self):
        self.client.force_authenticate(self.psych)
        self.client.post(f"/api/children/{self.child.id}/presence/")
        self.client.force_authenticate(self.staff)
        r = self.client.get(f"/api/children/{self.child.id}/presence/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data["others"]), 1)


class NameSplitTests(APITestCase):
    def setUp(self):
        self.staff = make_user("ns@t.ph", Role.STAFF)
        self.client.force_authenticate(self.staff)

    def test_create_composes_fullname(self):
        r = self.client.post("/api/children/", {
            "first_name": "Mika", "middle_initial": "R", "last_name": "Santos",
            "birth_date": "2016-01-10", "gender": "Female", "case_type": "Foster Care",
        }, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["fullname"], "Mika R. Santos")

    def test_name_parts_locked_after_create(self):
        r = self.client.post("/api/children/", {
            "first_name": "Ana", "last_name": "Cruz",
            "birth_date": "2016-01-10", "gender": "Female", "case_type": "Foster Care",
        }, format="json")
        r2 = self.client.patch(f"/api/children/{r.data['id']}/",
                               {"last_name": "Reyes"}, format="json")
        self.assertEqual(r2.status_code, 400)

    def test_create_without_any_name_rejected(self):
        r = self.client.post("/api/children/", {
            "birth_date": "2016-01-10",
        }, format="json")
        self.assertEqual(r.status_code, 400)

    def test_create_with_whitespace_only_fullname_rejected(self):
        r = self.client.post("/api/children/", {
            "fullname": "   ", "birth_date": "2016-01-10",
        }, format="json")
        self.assertEqual(r.status_code, 400)

    def test_create_with_whitespace_only_first_name_rejected(self):
        r = self.client.post("/api/children/", {
            "first_name": "   ", "birth_date": "2016-01-10",
        }, format="json")
        self.assertEqual(r.status_code, 400)

    def _payload(self, **over):
        base = {"first_name": "Leo", "last_name": "Diaz", "birth_date": "2016-01-10",
                "gender": "Male", "case_type": "Foster Care"}
        base.update(over)
        return base

    def test_age_below_5_rejected(self):
        r = self.client.post("/api/children/", self._payload(birth_date="2024-01-01"), format="json")
        self.assertEqual(r.status_code, 400)

    def test_age_above_17_rejected(self):
        r = self.client.post("/api/children/", self._payload(birth_date="2000-01-01"), format="json")
        self.assertEqual(r.status_code, 400)

    def test_required_fields_on_create(self):
        r = self.client.post("/api/children/", {"first_name": "Solo"}, format="json")
        self.assertEqual(r.status_code, 400)
        for f in ("last_name", "birth_date", "gender", "case_type"):
            self.assertIn(f, r.data)

    def test_legacy_fullname_create_still_exempt_from_new_required_fields(self):
        # Task 1/12 back-compat path: a bare `fullname` payload is still
        # accepted without birth_date/gender/case_type — Task 13's stricter
        # per-field requirements apply to the first_name/last_name creation
        # flow, not this legacy shape (see children/tests/test_api.py and
        # activity/tests/test_activity.py, which rely on this staying true).
        r = self.client.post("/api/children/", {
            "fullname": "Legacy Kid", "case_type": "Foster Care",
        }, format="json")
        self.assertEqual(r.status_code, 201)

    def test_legacy_fullname_create_still_age_validated(self):
        # The legacy path skips the new birth_date/gender/case_type REQUIRED
        # check, but if a birth_date IS supplied it must still be in range —
        # the legacy exemption must never bypass age validation.
        r = self.client.post("/api/children/", {
            "fullname": "Legacy Kid", "birth_date": "2000-01-01",
        }, format="json")
        self.assertEqual(r.status_code, 400)
