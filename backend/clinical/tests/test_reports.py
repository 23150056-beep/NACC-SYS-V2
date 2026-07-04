from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from accounts.models import Role
from children.models import Child, TerminationRecord
from clinical.models import InstrumentCatalog, PreAssessment, ResultEntry, RemarkNote

User = get_user_model()


class ReportsBase(APITestCase):
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
        self.child = Child.objects.create(
            fullname="Ana", case_type="Foster Care", assigned_psychologist=self.psy)
        self.tool = InstrumentCatalog.objects.create(title="CBCL", owner=self.psy)
        pa = PreAssessment.objects.create(
            child=self.child, psychologist=self.psy, status="completed")
        pa.instruments.add(self.tool)
        ResultEntry.objects.create(
            child=self.child, instrument=self.tool, entered_by=self.psy,
            summary="Findings.", classification="Adjustment difficulties")
        RemarkNote.objects.create(child=self.child, author=self.psy, text="Note.")

    def _auth(self, email):
        token = self.client.post("/api/auth/login/", {
            "email": email, "password": "pass1234"}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)


class ChildReportTest(ReportsBase):
    def test_child_report_bundles_all_sections(self):
        self._auth("p@racco1.gov.ph")
        resp = self.client.get(f"/api/reports/child/{self.child.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["child"]["pre_assessment_status"], "Answered")
        self.assertEqual(len(resp.data["pre_assessments"]), 1)
        self.assertEqual(len(resp.data["result_entries"]), 1)
        self.assertEqual(len(resp.data["remarks"]), 1)
        self.assertIn("treatment_plans", resp.data)
        self.assertIn("reports", resp.data)
        self.assertIn("problems", resp.data)

    def test_blocked_for_unassigned_psychologist(self):
        self._auth("o@racco1.gov.ph")
        self.assertEqual(self.client.get(f"/api/reports/child/{self.child.id}/").status_code, 404)

    def test_carry_history_off_hides_others_records(self):
        self.child.assigned_psychologist = self.other
        self.child.assignee_sees_history = False
        self.child.save()
        self._auth("o@racco1.gov.ph")
        resp = self.client.get(f"/api/reports/child/{self.child.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["pre_assessments"]), 0)
        self.assertEqual(len(resp.data["result_entries"]), 0)
        self.assertEqual(len(resp.data["remarks"]), 0)


class MonitoringTest(ReportsBase):
    def test_rows_have_v2_columns(self):
        self._auth("a@racco1.gov.ph")
        resp = self.client.get("/api/reports/monitoring/")
        self.assertEqual(resp.status_code, 200)
        ana = next(r for r in resp.data if r["child_name"] == "Ana")
        self.assertEqual(ana["pre_assessment_status"], "Answered")
        self.assertEqual(ana["latest_classification"], "Adjustment difficulties")
        self.assertIsNotNone(ana["last_activity"])
        self.assertEqual(ana["pre_assessment_count"], 1)

    def test_psychologist_scoped(self):
        Child.objects.create(fullname="Ben", assigned_psychologist=self.other)
        self._auth("p@racco1.gov.ph")
        names = [r["child_name"] for r in self.client.get("/api/reports/monitoring/").data]
        self.assertEqual(names, ["Ana"])

    def test_inactive_children_excluded(self):
        self.child.status = Child.INACTIVE
        self.child.save()
        self._auth("a@racco1.gov.ph")
        self.assertEqual(len(self.client.get("/api/reports/monitoring/").data), 0)


class SummaryTest(ReportsBase):
    def test_summary_kpis(self):
        TerminationRecord.objects.create(
            child=self.child, terminated_by=self.psy,
            reason_category="Reunified with family", note="Done.")
        PreAssessment.objects.create(child=self.child, psychologist=self.psy, status="in_progress")
        self._auth("a@racco1.gov.ph")
        resp = self.client.get("/api/reports/summary/?range=monthly")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total"], 1)  # completed only
        self.assertEqual(resp.data["children"], 1)
        self.assertEqual(resp.data["pending_pre_assessments"], 1)
        self.assertEqual(resp.data["terminations_by_reason"], {"Reunified with family": 1})

    def test_summary_forbidden_for_psychologist(self):
        self._auth("p@racco1.gov.ph")
        self.assertEqual(self.client.get("/api/reports/summary/").status_code, 403)

    def test_summary_csv(self):
        self._auth("s@racco1.gov.ph")
        resp = self.client.get("/api/reports/summary/?export=csv")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("Completed pre-assessments", resp.content.decode())


class DashboardTest(ReportsBase):
    def test_admin_dashboard(self):
        self._auth("a@racco1.gov.ph")
        resp = self.client.get("/api/reports/dashboard/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total_children"], 1)
        self.assertEqual(resp.data["unassessed"], 0)
        self.assertEqual(len(resp.data["trend"]), 1)

    def test_psychologist_scoped_dashboard(self):
        Child.objects.create(fullname="Ben", assigned_psychologist=self.other)
        self._auth("p@racco1.gov.ph")
        resp = self.client.get("/api/reports/dashboard/")
        self.assertEqual(resp.data["total_children"], 1)
