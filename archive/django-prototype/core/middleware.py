from django.shortcuts import redirect
from django.urls import reverse

from core.utils import profile_for


class ForcePasswordChangeMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated:
            profile = profile_for(request.user)
            if profile and profile.force_password_change:
                allowed_paths = {
                    reverse("password_change"),
                    reverse("password_change_done"),
                    reverse("logout"),
                }
                if not request.path.startswith("/static/") and request.path not in allowed_paths:
                    return redirect("password_change")
        return self.get_response(request)

