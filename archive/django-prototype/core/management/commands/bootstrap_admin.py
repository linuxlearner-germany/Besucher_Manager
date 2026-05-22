import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from core.models import StaffProfile


User = get_user_model()


class Command(BaseCommand):
    help = "Legt den Admin-Benutzer aus Umgebungsvariablen an oder aktualisiert ihn."

    def handle(self, *args, **options):
        username = os.getenv("ADMIN_USERNAME", "").strip()
        password = os.getenv("ADMIN_PASSWORD", "").strip()
        email = os.getenv("ADMIN_EMAIL", "").strip()
        reset_password = os.getenv("ADMIN_RESET_PASSWORD_ON_START", "False").strip().lower() == "true"

        if not username or not password:
            self.stdout.write("ADMIN_USERNAME oder ADMIN_PASSWORD nicht gesetzt. Ueberspringe Admin-Bootstrap.")
            return

        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "email": email,
                "is_staff": True,
                "is_superuser": True,
            },
        )

        changed = False
        if email and user.email != email:
            user.email = email
            changed = True
        if not user.is_staff:
            user.is_staff = True
            changed = True
        if not user.is_superuser:
            user.is_superuser = True
            changed = True

        password_was_set = False
        if created or reset_password:
            user.set_password(password)
            changed = True
            password_was_set = True

        if changed:
            user.save()

        profile, _ = StaffProfile.objects.get_or_create(user=user)
        profile.role = StaffProfile.Role.ADMIN
        profile.can_access_all_gates = True
        if created or password_was_set:
            profile.force_password_change = True
        profile.save()

        state = "angelegt" if created else "aktualisiert"
        self.stdout.write(self.style.SUCCESS(f"Admin-Benutzer {username} {state}."))
