import json

from core.models import AuditLog, StaffProfile, SystemSetting


def get_client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def log_audit_event(*, action, object_type, object_id="", user=None, request=None, details=None):
    AuditLog.objects.create(
        user=user if getattr(user, "is_authenticated", False) else None,
        action=action,
        object_type=object_type,
        object_id=str(object_id or ""),
        ip_address=get_client_ip(request) if request else None,
        details=json.dumps(details or {}, ensure_ascii=True, sort_keys=True),
    )


def get_setting(key, default=None):
    try:
        return SystemSetting.objects.get(key=key).value
    except SystemSetting.DoesNotExist:
        return default


def profile_for(user):
    if not getattr(user, "is_authenticated", False):
        return None
    try:
        return user.staff_profile
    except StaffProfile.DoesNotExist:
        return None
