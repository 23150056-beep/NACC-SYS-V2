from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import Role
from children.tests.test_child_collab import make_user


class OllamaUrlGuardTests(APITestCase):
    def setUp(self):
        self.admin = make_user("ou@t.ph", Role.ADMINISTRATOR)
        self.client.force_authenticate(self.admin)

    def test_remote_url_rejected(self):
        r = self.client.patch("/api/ai/settings/", {"ollama_url": "http://203.0.113.5:11434"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_localhost_accepted(self):
        r = self.client.patch("/api/ai/settings/", {"ollama_url": "http://localhost:11434"}, format="json")
        self.assertEqual(r.status_code, 200)

    def test_loopback_ip_accepted(self):
        r = self.client.patch("/api/ai/settings/", {"ollama_url": "http://127.0.0.1:11434"}, format="json")
        self.assertEqual(r.status_code, 200)

    def test_ipv6_loopback_accepted(self):
        r = self.client.patch("/api/ai/settings/", {"ollama_url": "http://[::1]:11434"}, format="json")
        self.assertEqual(r.status_code, 200)

    @override_settings(ALLOW_REMOTE_OLLAMA=True)
    def test_remote_url_allowed_when_escape_hatch_set(self):
        r = self.client.patch("/api/ai/settings/", {"ollama_url": "http://203.0.113.5:11434"}, format="json")
        self.assertEqual(r.status_code, 200)
