from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db.models import Q
from django.http import Http404, HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse_lazy
from django.utils import timezone
from django.views.decorators.http import require_POST
from django.views.generic import DetailView, FormView, TemplateView

from core.utils import get_client_ip, log_audit_event
from visits.forms import VisitFilterForm, VisitIntakeForm
from visits.models import Visit
from visits.services import accessible_gates_for, badge_context, filter_visits_for_user, public_submission_allowed, todays_visits_queryset


class PublicPreRegistrationView(FormView):
    template_name = "visits/public_pre_registration.html"
    form_class = VisitIntakeForm
    success_url = reverse_lazy("public-pre-registration-success")

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["gate_queryset"] = accessible_gates_for_public()
        return kwargs

    def form_valid(self, form):
        client_ip = get_client_ip(self.request)
        if not public_submission_allowed(client_ip):
            form.add_error(None, "Zu viele Anfragen von dieser Adresse. Bitte spaeter erneut versuchen.")
            return self.form_invalid(form)
        visit = form.save(public_submission=True, submitted_ip_address=client_ip)
        log_audit_event(
            action="public_pre_registration_created",
            object_type="Visit",
            object_id=visit.pk,
            request=self.request,
            details={"reference_code": visit.reference_code, "gate": visit.gate.name},
        )
        self.request.session["last_public_reference"] = visit.reference_code
        return super().form_valid(form)


class PublicPreRegistrationSuccessView(TemplateView):
    template_name = "visits/public_pre_registration_success.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["reference_code"] = self.request.session.get("last_public_reference")
        return context


class DashboardView(LoginRequiredMixin, TemplateView):
    template_name = "visits/dashboard.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        gate_queryset = accessible_gates_for(self.request.user)
        filter_form = VisitFilterForm(self.request.GET or None, gate_queryset=gate_queryset)
        visits = filter_visits_for_user(todays_visits_queryset(), self.request.user)
        if filter_form.is_valid():
            status = filter_form.cleaned_data.get("status")
            gate = filter_form.cleaned_data.get("gate")
            query = filter_form.cleaned_data.get("q")
            if status:
                visits = visits.filter(status=status)
            if gate:
                visits = visits.filter(gate=gate)
            if query:
                visits = visits.filter(
                    Q(visitor__first_name__icontains=query)
                    | Q(visitor__last_name__icontains=query)
                    | Q(visitor__company__icontains=query)
                    | Q(host_name__icontains=query)
                )
        visits = visits.order_by("status", "valid_from", "visitor__last_name")
        context["filter_form"] = filter_form
        context["visits"] = visits
        context["active_count"] = visits.filter(status=Visit.Status.CHECKED_IN).count()
        context["expected_count"] = visits.filter(status=Visit.Status.PRE_REGISTERED).count()
        context["accessible_gates"] = gate_queryset
        return context


class GuardScopedMixin(LoginRequiredMixin):
    def dispatch(self, request, *args, **kwargs):
        if not accessible_gates_for(request.user).exists():
            return HttpResponseForbidden("Kein Zugriff auf eine Wache konfiguriert.")
        return super().dispatch(request, *args, **kwargs)

    def get_object(self, queryset=None):
        obj = super().get_object(queryset)
        if not accessible_gates_for(self.request.user).filter(pk=obj.gate_id).exists():
            raise Http404
        return obj


class VisitCreateView(GuardScopedMixin, FormView):
    template_name = "visits/visit_form.html"
    form_class = VisitIntakeForm
    success_url = reverse_lazy("dashboard")

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["gate_queryset"] = accessible_gates_for(self.request.user)
        return kwargs

    def form_valid(self, form):
        visit = form.save(created_by=self.request.user)
        log_audit_event(
            action="visit_created",
            object_type="Visit",
            object_id=visit.pk,
            user=self.request.user,
            request=self.request,
            details={"reference_code": visit.reference_code},
        )
        messages.success(self.request, f"Besuch {visit.reference_code} wurde angelegt.")
        return super().form_valid(form)


class VisitUpdateView(GuardScopedMixin, FormView):
    template_name = "visits/visit_form.html"
    form_class = VisitIntakeForm
    success_url = reverse_lazy("dashboard")

    def dispatch(self, request, *args, **kwargs):
        self.visit = get_object_or_404(Visit.objects.select_related("visitor", "gate"), pk=kwargs["pk"])
        if self.visit.gate not in accessible_gates_for(request.user):
            raise Http404
        if self.visit.status == Visit.Status.CHECKED_OUT:
            return HttpResponseForbidden("Ausgecheckte Besuche sind gesperrt.")
        return super().dispatch(request, *args, **kwargs)

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["gate_queryset"] = accessible_gates_for(self.request.user)
        kwargs["visit"] = self.visit
        return kwargs

    def form_valid(self, form):
        visit = form.save(created_by=self.request.user)
        log_audit_event(
            action="visit_updated",
            object_type="Visit",
            object_id=visit.pk,
            user=self.request.user,
            request=self.request,
            details={"reference_code": visit.reference_code},
        )
        messages.success(self.request, f"Besuch {visit.reference_code} wurde aktualisiert.")
        return super().form_valid(form)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["visit"] = self.visit
        return context


class VisitDetailView(GuardScopedMixin, DetailView):
    template_name = "visits/visit_detail.html"
    queryset = Visit.objects.select_related("visitor", "gate", "created_by")


class VisitBadgePrintView(GuardScopedMixin, DetailView):
    template_name = "visits/visit_badge_print.html"
    queryset = Visit.objects.select_related("visitor", "gate")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.update(badge_context(self.object))
        return context


@require_POST
def check_in_visit(request, pk):
    return _transition_visit(
        request,
        pk,
        Visit.Status.CHECKED_IN,
        "visit_checked_in",
        "Besuch eingecheckt.",
        "check_in_at",
        allowed_from={Visit.Status.PLANNED, Visit.Status.PRE_REGISTERED},
    )


@require_POST
def check_out_visit(request, pk):
    return _transition_visit(
        request,
        pk,
        Visit.Status.CHECKED_OUT,
        "visit_checked_out",
        "Besuch ausgecheckt.",
        "check_out_at",
        allowed_from={Visit.Status.CHECKED_IN},
    )


def _transition_visit(request, pk, new_status, action, success_message, timestamp_field, allowed_from):
    if not request.user.is_authenticated:
        return redirect("login")
    visit = get_object_or_404(Visit.objects.select_related("gate"), pk=pk)
    if not accessible_gates_for(request.user).filter(pk=visit.gate_id).exists():
        raise Http404
    if visit.status not in allowed_from:
        messages.error(request, "Ungueltiger Statuswechsel.")
        return redirect("visit-detail", pk=visit.pk)
    setattr(visit, timestamp_field, timezone.now())
    visit.status = new_status
    visit.save(update_fields=[timestamp_field, "status", "updated_at"])
    log_audit_event(
        action=action,
        object_type="Visit",
        object_id=visit.pk,
        user=request.user,
        request=request,
        details={"reference_code": visit.reference_code, "status": new_status},
    )
    messages.success(request, success_message)
    return redirect("visit-detail", pk=visit.pk)


def accessible_gates_for_public():
    from core.models import Gate

    return Gate.objects.filter(is_active=True)
