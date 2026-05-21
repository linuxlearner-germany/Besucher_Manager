from django.contrib import admin

from .models import AuditLog, BadgeTextTemplate, Gate, SiteMap, StaffProfile, SystemSetting
from .utils import log_audit_event


class AuditedAdminMixin:
    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        log_audit_event(
            action=f"{obj._meta.model_name}_{'updated' if change else 'created'}",
            object_type=obj._meta.label,
            object_id=obj.pk,
            user=request.user,
            request=request,
        )

    def delete_model(self, request, obj):
        log_audit_event(
            action=f"{obj._meta.model_name}_deleted",
            object_type=obj._meta.label,
            object_id=obj.pk,
            user=request.user,
            request=request,
        )
        super().delete_model(request, obj)


@admin.register(Gate)
class GateAdmin(AuditedAdminMixin, admin.ModelAdmin):
    list_display = ("name", "location", "is_active", "sort_order")
    list_filter = ("is_active",)
    search_fields = ("name", "location")
    ordering = ("sort_order", "name")


@admin.register(StaffProfile)
class StaffProfileAdmin(AuditedAdminMixin, admin.ModelAdmin):
    list_display = ("user", "role", "default_gate", "can_access_all_gates", "force_password_change")
    list_filter = ("role", "can_access_all_gates", "force_password_change", "default_gate")
    search_fields = ("user__username", "user__first_name", "user__last_name")


@admin.register(SiteMap)
class SiteMapAdmin(AuditedAdminMixin, admin.ModelAdmin):
    list_display = ("name", "is_active", "uploaded_by", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(BadgeTextTemplate)
class BadgeTextTemplateAdmin(AuditedAdminMixin, admin.ModelAdmin):
    list_display = ("name", "text_type", "is_active", "updated_by", "updated_at")
    list_filter = ("text_type", "is_active")
    search_fields = ("name", "content")


@admin.register(SystemSetting)
class SystemSettingAdmin(AuditedAdminMixin, admin.ModelAdmin):
    list_display = ("key", "value", "description")
    search_fields = ("key", "description")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "action", "object_type", "object_id", "user", "ip_address")
    list_filter = ("action", "object_type")
    search_fields = ("object_type", "object_id", "user__username", "ip_address")
    readonly_fields = ("timestamp", "user", "action", "object_type", "object_id", "ip_address", "details")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
