from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models


User = get_user_model()


class Gate(models.Model):
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    location = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class StaffProfile(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "Administrator"
        GUARD = "guard", "Pforte/Wache"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="staff_profile")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.GUARD)
    default_gate = models.ForeignKey(Gate, null=True, blank=True, on_delete=models.SET_NULL, related_name="staff_members")
    can_access_all_gates = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.user.get_username()} ({self.get_role_display()})"


class SiteMap(models.Model):
    name = models.CharField(max_length=150)
    file = models.FileField(upload_to="site_maps/")
    is_active = models.BooleanField(default=False)
    uploaded_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="uploaded_site_maps")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class BadgeTextTemplate(models.Model):
    class TextType(models.TextChoices):
        SAFETY = "safety", "Sicherheitshinweise"
        PHOTOGRAPHY = "photography", "Fotografierverbot"
        RULES = "rules", "Besucherregeln"
        FOOTER = "footer", "Fusstext"

    name = models.CharField(max_length=150)
    text_type = models.CharField(max_length=20, choices=TextType.choices)
    content = models.TextField()
    is_active = models.BooleanField(default=True)
    updated_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="updated_badge_texts")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["text_type", "name"]

    def __str__(self):
        return f"{self.get_text_type_display()}: {self.name}"


class SystemSetting(models.Model):
    key = models.CharField(max_length=120, unique=True)
    value = models.TextField()
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["key"]

    def __str__(self):
        return self.key


class AuditLog(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=120)
    object_type = models.CharField(max_length=120)
    object_id = models.CharField(max_length=64, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    details = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.timestamp:%Y-%m-%d %H:%M} {self.action}"

