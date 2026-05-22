from django.urls import path

from . import views


urlpatterns = [
    path("", views.PublicPreRegistrationView.as_view(), name="public-pre-registration"),
    path("voranmeldung/erfolgreich/", views.PublicPreRegistrationSuccessView.as_view(), name="public-pre-registration-success"),
    path("app/", views.DashboardView.as_view(), name="dashboard"),
    path("app/besuche/neu/", views.VisitCreateView.as_view(), name="visit-create"),
    path("app/besuche/<int:pk>/", views.VisitDetailView.as_view(), name="visit-detail"),
    path("app/besuche/<int:pk>/bearbeiten/", views.VisitUpdateView.as_view(), name="visit-update"),
    path("app/besuche/<int:pk>/check-in/", views.check_in_visit, name="visit-check-in"),
    path("app/besuche/<int:pk>/check-out/", views.check_out_visit, name="visit-check-out"),
    path("app/besuche/<int:pk>/druck/", views.VisitBadgePrintView.as_view(), name="visit-badge-print"),
]

