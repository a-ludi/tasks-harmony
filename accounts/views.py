from django.contrib.auth import login, update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import PasswordChangeForm
from django.contrib import messages
from django.core.cache import cache
from django.http import HttpResponse
from django.shortcuts import redirect, render
from django.urls import reverse_lazy
from django.views.generic import CreateView

from .forms import PersonalInfoForm, RegisterForm


def ping(request):
    response = HttpResponse(status=204)
    response["Cache-Control"] = "no-store"
    return response

_REGISTER_RATE_LIMIT = 10   # max POST attempts
_REGISTER_WINDOW_SECS = 3600  # per hour


class RegisterView(CreateView):
    form_class = RegisterForm
    template_name = "accounts/register.html"
    success_url = reverse_lazy("dashboard")

    def dispatch(self, request, *args, **kwargs):
        if request.method == "POST":
            ip = request.META.get("REMOTE_ADDR", "unknown")
            key = f"register_attempts_{ip}"
            attempts = cache.get(key, 0)
            if attempts >= _REGISTER_RATE_LIMIT:
                return HttpResponse(
                    "Too many registration attempts. Please try again later.",
                    status=429,
                )
            cache.set(key, attempts + 1, _REGISTER_WINDOW_SECS)
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        response = super().form_valid(form)
        login(self.request, self.object)
        return response


@login_required
def profile(request):
    user = request.user
    info_form = PersonalInfoForm(instance=user)
    password_form = PasswordChangeForm(user)

    if request.method == "POST":
        action = request.POST.get("action")
        if action == "info":
            info_form = PersonalInfoForm(request.POST, instance=user)
            if info_form.is_valid():
                info_form.save()
                messages.success(request, "Personal info updated.")
                return redirect("profile")
        elif action == "password":
            password_form = PasswordChangeForm(user, request.POST)
            if password_form.is_valid():
                password_form.save()
                update_session_auth_hash(request, password_form.user)
                messages.success(request, "Password changed.")
                return redirect("profile")

    return render(request, "accounts/profile.html", {
        "info_form": info_form,
        "password_form": password_form,
    })
