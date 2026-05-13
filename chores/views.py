from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from django.utils import timezone

from .models import ChoreDefinition, ChoreInstance
from .recurrence import ChoreStatus, get_chore_status

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
    from django.http import HttpResponse
    return HttpResponse(status=501)


@login_required
def questions(request, pk):
    from django.http import HttpResponse
    return HttpResponse(status=501)


@login_required
def chore_create(request):
    from django.http import HttpResponse
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
