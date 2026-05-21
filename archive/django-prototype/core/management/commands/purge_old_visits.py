from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.utils import log_audit_event
from visits.models import Visit, Visitor
from visits.services import retention_days, visitors_eligible_for_anonymization


class Command(BaseCommand):
    help = "Loescht oder anonymisiert alte Besuchsdaten gemaess Aufbewahrungsfrist."

    def add_arguments(self, parser):
        parser.add_argument("--anonymize", action="store_true", help="Personendaten anonymisieren statt Besuche zu loeschen.")

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=retention_days())
        old_visits = Visit.objects.filter(valid_until__lt=cutoff)
        count = old_visits.count()
        if options["anonymize"]:
            old_visits.update(
                submitted_ip_address=None,
                notes="",
                badge_number="",
            )
            visitors_eligible_for_anonymization(cutoff).update(
                first_name="Anonymisiert",
                last_name="Besucher",
                company="",
                phone_optional="",
                email_optional="",
            )
            action = "visits_anonymized"
        else:
            old_visits.delete()
            Visitor.objects.filter(visits__isnull=True).delete()
            action = "visits_deleted"
        log_audit_event(
            action=action,
            object_type="Visit",
            object_id="bulk",
            details={"count": count, "cutoff": cutoff.isoformat()},
        )
        self.stdout.write(self.style.SUCCESS(f"{count} Datensaetze verarbeitet."))
