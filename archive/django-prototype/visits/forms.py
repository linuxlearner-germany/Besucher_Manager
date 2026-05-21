from django import forms
from django.utils import timezone

from core.models import Gate
from visits.models import Visit, Visitor


DATETIME_INPUT_FORMATS = ["%Y-%m-%dT%H:%M", "%d.%m.%Y %H:%M"]


class VisitIntakeForm(forms.Form):
    first_name = forms.CharField(label="Vorname", max_length=80)
    last_name = forms.CharField(label="Nachname", max_length=80)
    company = forms.CharField(label="Firma / Organisation", max_length=150)
    phone_optional = forms.CharField(label="Telefon", max_length=50, required=False)
    email_optional = forms.EmailField(label="E-Mail", required=False)
    host_name = forms.CharField(label="Ansprechpartner", max_length=150)
    host_department = forms.CharField(label="Abteilung / Bereich", max_length=150)
    purpose = forms.CharField(label="Besuchszweck", max_length=200)
    gate = forms.ModelChoiceField(label="Wache / Eingang", queryset=Gate.objects.none())
    location = forms.CharField(label="Bereich / Ort", max_length=200, required=False)
    vehicle_registration = forms.CharField(label="Kennzeichen", max_length=30, required=False)
    valid_from = forms.DateTimeField(
        label="Gueltig von",
        input_formats=DATETIME_INPUT_FORMATS,
        widget=forms.DateTimeInput(attrs={"type": "datetime-local"}),
    )
    valid_until = forms.DateTimeField(
        label="Gueltig bis",
        input_formats=DATETIME_INPUT_FORMATS,
        widget=forms.DateTimeInput(attrs={"type": "datetime-local"}),
    )
    badge_number = forms.CharField(label="Ausweisnummer", max_length=50, required=False)
    notes = forms.CharField(label="Bemerkung", required=False, widget=forms.Textarea(attrs={"rows": 4}))

    def __init__(self, *args, gate_queryset=None, visit=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["gate"].queryset = gate_queryset or Gate.objects.filter(is_active=True)
        self.visit = visit
        if visit:
            self.initial.update(
                {
                    "first_name": visit.visitor.first_name,
                    "last_name": visit.visitor.last_name,
                    "company": visit.visitor.company,
                    "phone_optional": visit.visitor.phone_optional,
                    "email_optional": visit.visitor.email_optional,
                    "host_name": visit.host_name,
                    "host_department": visit.host_department,
                    "purpose": visit.purpose,
                    "gate": visit.gate,
                    "location": visit.location,
                    "vehicle_registration": visit.vehicle_registration,
                    "valid_from": timezone.localtime(visit.valid_from).strftime("%Y-%m-%dT%H:%M"),
                    "valid_until": timezone.localtime(visit.valid_until).strftime("%Y-%m-%dT%H:%M"),
                    "badge_number": visit.badge_number,
                    "notes": visit.notes,
                }
            )

    def clean(self):
        cleaned = super().clean()
        valid_from = cleaned.get("valid_from")
        valid_until = cleaned.get("valid_until")
        if valid_from and valid_until and valid_until < valid_from:
            self.add_error("valid_until", "Das Ende muss nach dem Beginn liegen.")
        return cleaned

    def save(self, *, created_by=None, public_submission=False, submitted_ip_address=None):
        visitor = self.visit.visitor if self.visit else Visitor()
        visitor.first_name = self.cleaned_data["first_name"]
        visitor.last_name = self.cleaned_data["last_name"]
        visitor.company = self.cleaned_data["company"]
        visitor.phone_optional = self.cleaned_data["phone_optional"]
        visitor.email_optional = self.cleaned_data["email_optional"]
        visitor.save()

        visit = self.visit or Visit(visitor=visitor)
        visit.visitor = visitor
        visit.gate = self.cleaned_data["gate"]
        visit.host_name = self.cleaned_data["host_name"]
        visit.host_department = self.cleaned_data["host_department"]
        visit.purpose = self.cleaned_data["purpose"]
        visit.location = self.cleaned_data["location"]
        visit.vehicle_registration = self.cleaned_data["vehicle_registration"]
        visit.valid_from = self.cleaned_data["valid_from"]
        visit.valid_until = self.cleaned_data["valid_until"]
        visit.badge_number = self.cleaned_data["badge_number"]
        visit.notes = self.cleaned_data["notes"]
        visit.created_by = visit.created_by or created_by
        visit.created_via_public_form = visit.created_via_public_form or public_submission
        visit.submitted_ip_address = submitted_ip_address or visit.submitted_ip_address
        if public_submission:
            visit.status = Visit.Status.PRE_REGISTERED
        elif not visit.pk and visit.status == Visit.Status.PLANNED:
            visit.status = Visit.Status.PLANNED
        visit.full_clean()
        visit.save()
        return visit


class VisitFilterForm(forms.Form):
    status = forms.ChoiceField(
        label="Status",
        required=False,
        choices=[("", "Alle")] + list(Visit.Status.choices),
    )
    gate = forms.ModelChoiceField(label="Wache", queryset=Gate.objects.none(), required=False)
    q = forms.CharField(label="Suche", required=False)

    def __init__(self, *args, gate_queryset=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["gate"].queryset = gate_queryset or Gate.objects.filter(is_active=True)
