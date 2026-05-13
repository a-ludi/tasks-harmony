from datetime import timedelta

from django.conf import settings as django_settings
from django.contrib.auth.decorators import login_required
from django.db import models, transaction
from django.http import HttpResponse, HttpResponseBadRequest
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import ChoreCompletion, ChoreDefinition, ChoreInstance
from .recurrence import ChoreStatus, detect_streak_break, get_chore_status
from xp.formulas import calculate_xp

STATUS_ORDER = {
    ChoreStatus.OVERDUE: 0,
    ChoreStatus.DUE: 1,
    ChoreStatus.COMPLETED: 2,
    ChoreStatus.UPCOMING: 3,
}


def _annotate_status(instance: ChoreInstance, now) -> ChoreStatus:
    return get_chore_status(
        instance.definition.recurrence,
        instance.last_completed_at,
        now,
    )


@login_required
def complete(request, pk):
    if request.method != "POST":
        return HttpResponseBadRequest()

    instance = get_object_or_404(ChoreInstance, pk=pk, owner=request.user, is_active=True)

    raw_ts = request.POST.get("completed_at", "")
    completed_at = parse_datetime(raw_ts)
    if completed_at is None:
        return HttpResponseBadRequest("Invalid completed_at")

    now = timezone.now()
    max_age = timedelta(hours=django_settings.COMPLETION_TIMESTAMP_MAX_AGE_HOURS)
    if completed_at > now:
        return HttpResponseBadRequest("Timestamp is in the future")
    if now - completed_at > max_age:
        return HttpResponseBadRequest("Timestamp too old")

    with transaction.atomic():
        # Use completed_at (not server now) so streak continuity reflects the user's timeline
        broke = detect_streak_break(instance.definition.recurrence, instance.last_completed_at, completed_at)
        instance.streak_count = 1 if broke else instance.streak_count + 1
        instance.last_completed_at = completed_at

        xp_settings = instance.owner.profile.xp_settings
        xp_earned = calculate_xp(instance.definition.base_xp, instance.streak_count, xp_settings)

        ChoreCompletion.objects.create(instance=instance, completed_at=completed_at, xp_earned=xp_earned)
        instance.save()

        from accounts.models import Profile
        Profile.objects.filter(user=request.user).update(total_xp=models.F("total_xp") + xp_earned)

    instance.refresh_from_db()
    status = _annotate_status(instance, now)
    return render(request, "chores/_chore_card.html", {"instance": instance, "status": status})


@login_required
def questions(request, pk):
    return HttpResponse(status=501)


@login_required
def chore_create(request):
    return HttpResponse(status=501)


@login_required
def dashboard(request):
    now = timezone.now()
    instances = (
        ChoreInstance.objects.filter(owner=request.user, is_active=True)
        .select_related("definition", "owner__profile__xp_settings")
    )
    annotated = []
    for inst in instances:
        status = _annotate_status(inst, now)
        annotated.append((inst, status))
    annotated.sort(key=lambda t: STATUS_ORDER[t[1]])
    return render(request, "chores/dashboard.html", {"annotated": annotated})
