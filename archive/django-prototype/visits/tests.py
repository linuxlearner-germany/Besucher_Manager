from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from core.models import Gate
from visits.forms import VisitIntakeForm
from visits.models import Visit, Visitor
from visits.services import accessible_gates_for, filter_visits_for_user


User = get_user_model()


class VisitFlowTests(TestCase):
    def setUp(self):
        self.gate_north = Gate.objects.create(name="Nordtor", sort_order=10)
        self.gate_south = Gate.objects.create(name="Suedtor", sort_order=20)

        self.guard = User.objects.create_user(username="guard", password="test-pass-123")
        self.guard.staff_profile.default_gate = self.gate_north
        self.guard.staff_profile.save()

    def test_public_registration_creates_pre_registered_visit(self):
        form = VisitIntakeForm(
            data={
                "first_name": "Anna",
                "last_name": "Gast",
                "company": "Beispiel GmbH",
                "phone_optional": "",
                "email_optional": "anna@example.com",
                "host_name": "Max Muster",
                "host_department": "Einkauf",
                "purpose": "Projekttermin",
                "gate": self.gate_north.pk,
                "location": "Haus 2",
                "vehicle_registration": "AB-CD-123",
                "valid_from": "2026-05-21T08:30",
                "valid_until": "2026-05-21T10:30",
                "badge_number": "",
                "notes": "Kommt mit Laptop",
            },
            gate_queryset=Gate.objects.all(),
        )
        self.assertTrue(form.is_valid(), form.errors)

        visit = form.save(public_submission=True, submitted_ip_address="10.0.0.12")

        self.assertEqual(visit.status, Visit.Status.PRE_REGISTERED)
        self.assertTrue(visit.created_via_public_form)
        self.assertEqual(visit.submitted_ip_address, "10.0.0.12")
        self.assertEqual(visit.vehicle_registration, "AB-CD-123")
        self.assertTrue(visit.reference_code.startswith("V"))

    def test_guard_scope_filters_other_gates(self):
        visitor = Visitor.objects.create(first_name="Eva", last_name="Nord", company="Firma A")
        allowed_visit = Visit.objects.create(
            visitor=visitor,
            gate=self.gate_north,
            host_name="Mitarbeiter A",
            host_department="IT",
            purpose="Audit",
            valid_from=timezone.now(),
            valid_until=timezone.now() + timedelta(hours=2),
        )
        blocked_visit = Visit.objects.create(
            visitor=visitor,
            gate=self.gate_south,
            host_name="Mitarbeiter B",
            host_department="IT",
            purpose="Audit",
            valid_from=timezone.now(),
            valid_until=timezone.now() + timedelta(hours=2),
        )

        gates = accessible_gates_for(self.guard)
        visible = filter_visits_for_user(Visit.objects.all(), self.guard)

        self.assertQuerysetEqual(gates.order_by("pk"), [self.gate_north], transform=lambda x: x)
        self.assertIn(allowed_visit, visible)
        self.assertNotIn(blocked_visit, visible)

    def test_check_in_transition_updates_status(self):
        visitor = Visitor.objects.create(first_name="Ina", last_name="Check", company="Firma B")
        visit = Visit.objects.create(
            visitor=visitor,
            gate=self.gate_north,
            host_name="Mitarbeiter C",
            host_department="Produktion",
            purpose="Termin",
            valid_from=timezone.now(),
            valid_until=timezone.now() + timedelta(hours=1),
        )

        self.client.force_login(self.guard)
        response = self.client.post(reverse("visit-check-in", args=[visit.pk]))

        self.assertEqual(response.status_code, 302)
        visit.refresh_from_db()
        self.assertEqual(visit.status, Visit.Status.CHECKED_IN)
        self.assertIsNotNone(visit.check_in_at)

    def test_retention_command_deletes_orphan_visitors(self):
        old_visitor = Visitor.objects.create(first_name="Alt", last_name="Gast", company="Alt GmbH")
        old_visit = Visit.objects.create(
            visitor=old_visitor,
            gate=self.gate_north,
            host_name="Archiv",
            host_department="Alt",
            purpose="Archiv",
            valid_from=timezone.now() - timedelta(days=120),
            valid_until=timezone.now() - timedelta(days=119),
        )

        call_command("purge_old_visits")

        self.assertFalse(Visit.objects.filter(pk=old_visit.pk).exists())
        self.assertFalse(Visitor.objects.filter(pk=old_visitor.pk).exists())

