from django.contrib import messages
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.views import PasswordChangeView
from django.urls import reverse_lazy

from core.utils import profile_for


class ForcedPasswordChangeView(PasswordChangeView):
    template_name = "auth/password_change.html"
    success_url = reverse_lazy("dashboard")

    def form_valid(self, form):
        response = super().form_valid(form)
        profile = profile_for(self.request.user)
        if profile and profile.force_password_change:
            profile.force_password_change = False
            profile.save(update_fields=["force_password_change"])
        update_session_auth_hash(self.request, self.request.user)
        messages.success(self.request, "Passwort geaendert.")
        return response
