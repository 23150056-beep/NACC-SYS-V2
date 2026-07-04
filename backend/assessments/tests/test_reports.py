from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from accounts.models import Role
from children.models import Child
from assessments.models import Assessment

User = get_user_model()


class ReportApiTest(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name=Role.ADMINISTRATOR)
        self.psy_role = Role.objects.create(role_name=Role.PSYCHOLOGIST)
        self.staff_role = Role.objects.create(role_name=Role.STAFF)
        self.admin = User.objects.create_user(email="a@racco1.gov.ph", username="a", password="pass1234", role=self.admin_role)
        self.psy = User.objects.create_user(email="p@racco1.gov.ph", username="p", password="pass1234", role=self.psy_role)
        self.staff = User.objects.create_user(email="s@racco1.gov.ph", username="s", password="pass1234", role=self.staff_role)
        self.child = Child.objects.create(fullname="Ana", case_type="Foster Care", assigned_psychologist=self.psy)
        Assessment.objects.create(child=self.child, psychologist=self.psy, status="completed",
                                  classification="Needs close support")
        Assessment.objects.create(child=self.child, psychologist=self.psy, status="completed",
                                  classification="Improving steadily")

    def _auth(self, email):
        token = self.client.post("/api/auth/login/", {"email": email, "password": "pass1234"}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)

    def test_child_report_returns_history(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.get(f"/api/reports/child/{self.child.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["assessments"]), 2)
        self.assertEqual(resp.data["child"]["fullname"], "Ana")

    def test_child_report_blocked_for_unassigned_psychologist(self):
        User.objects.create_user(email="o@racco1.gov.ph", username="o", password="pass1234", role=self.psy_role)
        self._auth("o@racco1.gov.ph")
        resp = self.client.get(f"/api/reports/child/{self.child.id}/")
        self.assertEqual(resp.status_code, 404)

    def test_summary_for_admin(self):
        self._auth("a@racco1.gov.ph")
        resp = self.client.get("/api/reports/summary/?range=monthly")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total"], 2)
        self.assertEqual(resp.data["children"], 1)
        self.assertIn("by_case_type", resp.data)
        self.assertIn("per_psychologist", resp.data)

    def test_summary_forbidden_for_psychologist(self):
        self._auth("p@racco1.gov.ph")
        self.assertEqual(self.client.get("/api/reports/summary/").status_code, 403)

    def test_summary_csv_download(self):
        self._auth("s@racco1.gov.ph")
        resp = self.client.get("/api/reports/summary/?export=csv")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"], "text/csv")
        self.assertIn("Total assessments", resp.content.decode())

    def test_dashboard_current_state_for_admin(self):
        self._auth("a@racco1.gov.ph")
        resp = self.client.get("/api/reports/dashboard/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total_children"], 1)
        self.assertEqual(resp.data["unassessed"], 0)
        self.assertIn("by_case_type", resp.data)

    def test_dashboard_scoped_for_psychologist(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.get("/api/reports/dashboard/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total_children"], 1)  # only their assigned child


class AssessmentEditTest(APITestCase):
    def setUp(self):
        self.psy_role = Role.objects.create(role_name=Role.PSYCHOLOGIST)
        self.psy = User.objects.create_user(email="p@racco1.gov.ph", username="p", password="pass1234", role=self.psy_role)
        self.other = User.objects.create_user(email="o@racco1.gov.ph", username="o", password="pass1234", role=self.psy_role)
        self.child = Child.objects.create(fullname="Kid", assigned_psychologist=self.psy)
        self.a = Assessment.objects.create(
            child=self.child, psychologist=self.psy, status="completed",
            notes="orig", classification="Normal Development")

    def _auth(self, email):
        token = self.client.post("/api/auth/login/", {"email": email, "password": "pass1234"}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)

    def test_owner_can_edit_notes_and_classification(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.patch(f"/api/assessments/{self.a.id}/", {
            "notes": "updated", "classification": "Adjustment Disorder"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.a.refresh_from_db()
        self.assertEqual(self.a.notes, "updated")
        self.assertEqual(self.a.classification, "Adjustment Disorder")

    def test_edit_logs_activity(self):
        from activity.models import ActivityLog
        self._auth("p@racco1.gov.ph")
        self.client.patch(f"/api/assessments/{self.a.id}/", {"notes": "x"}, format="json")
        self.assertTrue(ActivityLog.objects.filter(action="updated", entity_type="Assessment").exists())

    def test_non_owner_cannot_edit(self):
        self._auth("o@racco1.gov.ph")
        resp = self.client.patch(f"/api/assessments/{self.a.id}/", {"notes": "hack"}, format="json")
        self.assertIn(resp.status_code, (403, 404))

    def test_finalize_locks_and_blocks_further_edit(self):
        self._auth("p@racco1.gov.ph")
        fin = self.client.post(f"/api/assessments/{self.a.id}/finalize/")
        self.assertEqual(fin.status_code, 200)
        self.a.refresh_from_db()
        self.assertTrue(self.a.is_locked)
        resp = self.client.patch(f"/api/assessments/{self.a.id}/", {"notes": "late"}, format="json")
        self.assertEqual(resp.status_code, 400)


class MonitoringApiTest(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name=Role.ADMINISTRATOR)
        self.psy_role = Role.objects.create(role_name=Role.PSYCHOLOGIST)
        self.staff_role = Role.objects.create(role_name=Role.STAFF)
        self.admin = User.objects.create_user(
            email="a@racco1.gov.ph", username="a", password="pass1234", role=self.admin_role)
        self.psy = User.objects.create_user(
            email="p@racco1.gov.ph", username="p", password="pass1234", role=self.psy_role)
        self.other = User.objects.create_user(
            email="o@racco1.gov.ph", username="o", password="pass1234", role=self.psy_role)
        self.staff = User.objects.create_user(
            email="s@racco1.gov.ph", username="s", password="pass1234", role=self.staff_role)
        # Assigned to psy, two sessions; latest carries the practitioner's classification.
        self.mine = Child.objects.create(
            fullname="Ana", case_type="Foster Care", assigned_psychologist=self.psy)
        Assessment.objects.create(child=self.mine, psychologist=self.psy, status="completed",
                                  classification="Needs close support")
        Assessment.objects.create(child=self.mine, psychologist=self.psy, status="completed",
                                  classification="Improving steadily")
        # Assigned to a different psychologist.
        self.theirs = Child.objects.create(fullname="Ben", assigned_psychologist=self.other)
        Assessment.objects.create(child=self.theirs, psychologist=self.other, status="completed")
        # Assigned to psy but never assessed.
        self.fresh = Child.objects.create(fullname="Cara", assigned_psychologist=self.psy)
        # Archived — must never appear.
        self.gone = Child.objects.create(
            fullname="Zed", assigned_psychologist=self.psy, status=Child.ARCHIVED)

    def _auth(self, email):
        token = self.client.post("/api/auth/login/", {
            "email": email, "password": "pass1234"}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)

    def test_admin_sees_all_active_children_sorted(self):
        self._auth("a@racco1.gov.ph")
        resp = self.client.get("/api/reports/monitoring/")
        self.assertEqual(resp.status_code, 200)
        names = [r["child_name"] for r in resp.data]
        self.assertEqual(names, ["Ana", "Ben", "Cara"])  # sorted, Zed excluded

    def test_staff_sees_all_active_children(self):
        self._auth("s@racco1.gov.ph")
        resp = self.client.get("/api/reports/monitoring/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 3)

    def test_psychologist_sees_only_assigned(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.get("/api/reports/monitoring/")
        self.assertEqual(resp.status_code, 200)
        names = [r["child_name"] for r in resp.data]
        self.assertEqual(names, ["Ana", "Cara"])  # Ben (other psy) and Zed (archived) excluded

    def test_assessed_row_has_latest_activity(self):
        self._auth("a@racco1.gov.ph")
        resp = self.client.get("/api/reports/monitoring/")
        ana = next(r for r in resp.data if r["child_name"] == "Ana")
        self.assertEqual(ana["latest_classification"], "Improving steadily")
        self.assertEqual(ana["assessment_count"], 2)
        self.assertEqual(ana["case_ref"], f"C-{self.mine.id:04d}")
        self.assertIsNotNone(ana["last_assessment_date"])

    def test_unassessed_child_has_no_activity(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.get("/api/reports/monitoring/")
        cara = next(r for r in resp.data if r["child_name"] == "Cara")
        self.assertIsNone(cara["latest_classification"])
        self.assertIsNone(cara["last_assessment_date"])
        self.assertEqual(cara["assessment_count"], 0)


class NextSessionTest(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name=Role.ADMINISTRATOR)
        self.psy_role = Role.objects.create(role_name=Role.PSYCHOLOGIST)
        self.admin = User.objects.create_user(email="a@racco1.gov.ph", username="a", password="pass1234", role=self.admin_role)
        self.psy = User.objects.create_user(email="p@racco1.gov.ph", username="p", password="pass1234", role=self.psy_role)
        self.other = User.objects.create_user(email="o@racco1.gov.ph", username="o", password="pass1234", role=self.psy_role)
        self.staff = User.objects.create_user(email="s@racco1.gov.ph", username="s", password="pass1234", role=Role.objects.create(role_name=Role.STAFF))
        self.child = Child.objects.create(fullname="Ana", assigned_psychologist=self.psy)
        self.a = Assessment.objects.create(child=self.child, psychologist=self.psy, status="completed")

    def _auth(self, email):
        token = self.client.post("/api/auth/login/", {"email": email, "password": "pass1234"}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)

    def test_owner_psychologist_can_schedule(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.patch(f"/api/assessments/{self.a.id}/schedule/", {"next_session": "2026-08-01"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.a.refresh_from_db()
        self.assertEqual(str(self.a.next_session), "2026-08-01")

    def test_admin_can_schedule(self):
        self._auth("a@racco1.gov.ph")
        resp = self.client.patch(f"/api/assessments/{self.a.id}/schedule/", {"next_session": "2026-08-02"}, format="json")
        self.assertEqual(resp.status_code, 200)

    def test_unrelated_psychologist_cannot_schedule(self):
        self._auth("o@racco1.gov.ph")
        resp = self.client.patch(f"/api/assessments/{self.a.id}/schedule/", {"next_session": "2026-08-03"}, format="json")
        self.assertIn(resp.status_code, (403, 404))

    def test_monitoring_includes_next_session(self):
        self.a.next_session = "2026-08-05"; self.a.save()
        self._auth("a@racco1.gov.ph")
        resp = self.client.get("/api/reports/monitoring/")
        ana = next(r for r in resp.data if r["child_name"] == "Ana")
        self.assertEqual(ana["next_session"], "2026-08-05")

    def test_staff_cannot_schedule(self):
        self._auth("s@racco1.gov.ph")
        resp = self.client.patch(f"/api/assessments/{self.a.id}/schedule/", {"next_session": "2026-08-04"}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_invalid_date_returns_400(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.patch(f"/api/assessments/{self.a.id}/schedule/", {"next_session": "2026-99-99"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.a.refresh_from_db()
        self.assertIsNone(self.a.next_session)
