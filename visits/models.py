from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from core.models import Gate


class Visitor(models.Model):
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    company = models.CharField(max_length=150)
    phone_optional = models.CharField(max_length=50, blank=True)
    email_optional = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return f"{self.last_name}, {self.first_name}"


class Visit(models.Model):
    class Status(models.TextChoices):
        PLANNED = "planned", "Geplant"
        PRE_REGISTERED = "pre_registered", "Vorangemeldet"
        CHECKED_IN = "checked_in", "Eingecheckt"
        CHECKED_OUT = "checked_out", "Ausgecheckt"
        CANCELLED = "cancelled", "Storniert"

    visitor = models.ForeignKey(Visitor, on_delete=models.PROTECT, related_name="visits")
    gate = models.ForeignKey(Gate, on_delete=models.PROTECT, related_name="visits")
    host_name = models.CharField(max_length=150)
    host_department = models.CharField(max_length=150)
    purpose = models.CharField(max_length=200)
    location = models.CharField(max_length=200, blank=True)
    vehicle_registration = models.CharField(max_length=30, blank=True)
    valid_from = models.DateTimeField()
    valid_until = models.DateTimeField()
    check_in_at = models.DateTimeField(null=True, blank=True)
    check_out_at = models.DateTimeField(null=True, blank=True)
    badge_number = models.CharField(max_length=50, blank=True)
    reference_code = models.CharField(max_length=32, unique=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANNED)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_visits")
    created_via_public_form = models.BooleanField(default=False)
    submitted_ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-valid_from", "-created_at"]

    def __str__(self):
        return f"{self.reference_code or self.pk} - {self.visitor}"

    def clean(self):
        if self.valid_until and self.valid_from and self.valid_until < self.valid_from:
            raise ValidationError({"valid_until": "Das Ende muss nach dem Beginn liegen."})
        if self.check_in_at and self.check_out_at and self.check_out_at < self.check_in_at:
            raise ValidationError({"check_out_at": "Check-out darf nicht vor Check-in liegen."})

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.reference_code:
            self.reference_code = f"V{self.created_at:%Y%m%d}-{self.pk:05d}"
            super().save(update_fields=["reference_code"])
