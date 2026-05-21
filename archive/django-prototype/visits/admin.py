from django.contrib import admin

from visits.models import Visit, Visitor


@admin.register(Visitor)
class VisitorAdmin(admin.ModelAdmin):
    list_display = ("last_name", "first_name", "company", "phone_optional", "email_optional")
    search_fields = ("first_name", "last_name", "company", "phone_optional", "email_optional")


@admin.register(Visit)
class VisitAdmin(admin.ModelAdmin):
    list_display = (
        "reference_code",
        "visitor",
        "gate",
        "host_name",
        "vehicle_registration",
        "valid_from",
        "valid_until",
        "status",
        "check_in_at",
        "check_out_at",
    )
    list_filter = ("status", "gate", "created_via_public_form")
    search_fields = ("reference_code", "visitor__first_name", "visitor__last_name", "visitor__company", "host_name")
    autocomplete_fields = ("visitor", "gate", "created_by")
