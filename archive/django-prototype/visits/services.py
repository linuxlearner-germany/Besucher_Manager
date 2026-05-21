from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db.models import Max, Q
from django.utils import timezone

from core.models import BadgeTextTemplate, Gate, SiteMap
from core.utils import get_setting, profile_for
from visits.models import Visit


def accessible_gates_for(user):
    if not getattr(user, "is_authenticated", False):
        return Gate.objects.none()
    if user.is_superuser:
        return Gate.objects.filter(is_active=True)
    profile = profile_for(user)
    if not profile:
        return Gate.objects.none()
    if profile.can_access_all_gates or profile.role == profile.Role.ADMIN:
        return Gate.objects.filter(is_active=True)
    if profile.default_gate_id:
        return Gate.objects.filter(pk=profile.default_gate_id, is_active=True)
    return Gate.objects.none()


def filter_visits_for_user(queryset, user):
    gates = accessible_gates_for(user)
    return queryset.filter(gate__in=gates)


def todays_visits_queryset():
    today = timezone.localdate()
    tomorrow = today + timedelta(days=1)
    return Visit.objects.select_related("visitor", "gate", "created_by").filter(
        Q(valid_from__date=today)
        | Q(check_in_at__date=today)
        | Q(check_out_at__date=today)
        | Q(valid_until__date=today)
        | Q(valid_from__date=tomorrow, status=Visit.Status.PRE_REGISTERED)
    )


def badge_context(visit):
    active_map = SiteMap.objects.filter(is_active=True).order_by("-created_at").first()
    texts = BadgeTextTemplate.objects.filter(is_active=True)
    text_by_type = {item.text_type: item.content for item in texts}
    return {
        "visit": visit,
        "site_map": active_map,
        "safety_text": text_by_type.get(BadgeTextTemplate.TextType.SAFETY, ""),
        "photography_text": text_by_type.get(
            BadgeTextTemplate.TextType.PHOTOGRAPHY,
            "Fotografieren und Filmen sind auf dem Gelaende nur mit ausdruecklicher Genehmigung erlaubt.",
        ),
        "rules_text": text_by_type.get(
            BadgeTextTemplate.TextType.RULES,
            "Bitte sichtbar tragen und beim Verlassen an der Pforte abmelden.",
        ),
        "footer_text": text_by_type.get(BadgeTextTemplate.TextType.FOOTER, ""),
    }


def public_submission_allowed(client_ip):
    limit = settings.PUBLIC_FORM_RATE_LIMIT
    window = settings.PUBLIC_FORM_RATE_WINDOW_SECONDS
    cache_key = f"public-form:{client_ip or 'unknown'}"
    current = cache.get(cache_key, 0)
    if current >= limit:
        return False
    cache.set(cache_key, current + 1, timeout=window)
    return True


def retention_days():
    configured = get_setting("retention_days")
    try:
        return int(configured)
    except (TypeError, ValueError):
        return settings.VISITOR_RETENTION_DAYS


def visitors_eligible_for_anonymization(cutoff):
    from visits.models import Visitor

    return Visitor.objects.annotate(last_visit=Max("visits__valid_until")).filter(last_visit__lt=cutoff)
