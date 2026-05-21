from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Visitor",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("first_name", models.CharField(max_length=80)),
                ("last_name", models.CharField(max_length=80)),
                ("company", models.CharField(max_length=150)),
                ("phone_optional", models.CharField(blank=True, max_length=50)),
                ("email_optional", models.EmailField(blank=True, max_length=254)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["last_name", "first_name"]},
        ),
        migrations.CreateModel(
            name="Visit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("host_name", models.CharField(max_length=150)),
                ("host_department", models.CharField(max_length=150)),
                ("purpose", models.CharField(max_length=200)),
                ("location", models.CharField(blank=True, max_length=200)),
                ("vehicle_registration", models.CharField(blank=True, max_length=30)),
                ("valid_from", models.DateTimeField()),
                ("valid_until", models.DateTimeField()),
                ("check_in_at", models.DateTimeField(blank=True, null=True)),
                ("check_out_at", models.DateTimeField(blank=True, null=True)),
                ("badge_number", models.CharField(blank=True, max_length=50)),
                ("reference_code", models.CharField(blank=True, max_length=32, unique=True)),
                ("status", models.CharField(choices=[("planned", "Geplant"), ("pre_registered", "Vorangemeldet"), ("checked_in", "Eingecheckt"), ("checked_out", "Ausgecheckt"), ("cancelled", "Storniert")], default="planned", max_length=20)),
                ("created_via_public_form", models.BooleanField(default=False)),
                ("submitted_ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("notes", models.TextField(blank=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_visits", to=settings.AUTH_USER_MODEL)),
                ("gate", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="visits", to="core.gate")),
                ("visitor", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="visits", to="visits.visitor")),
            ],
            options={"ordering": ["-valid_from", "-created_at"]},
        ),
    ]

