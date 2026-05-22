from core.models import Gate, SiteMap


def app_context(request):
    return {
        "active_gate_count": Gate.objects.filter(is_active=True).count(),
        "active_site_map": SiteMap.objects.filter(is_active=True).order_by("-created_at").first(),
    }

