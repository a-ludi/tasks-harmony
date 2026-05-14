import logging
from datetime import timedelta

from django.conf import settings as django_settings
from django.contrib.auth.decorators import login_required
from django.db import models, transaction
from django.http import HttpResponse, HttpResponseBadRequest
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.dateparse import parse_datetime

logger = logging.getLogger(__name__)

from .answer_validators import AnswerValidationError, validate_answer
from .forms import ChoreDefinitionForm, QuestionFormSet
from .models import ChoreCompletion, ChoreDefinition, ChoreInstance, CompletionAnswer, Question, QuestionChoice
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


def _coerce_answer(question, raw):
    if raw is None or raw.strip() == "":
        return None
    if question.type == "INTEGER":
        return int(raw)
    if question.type == "BOOLEAN":
        return raw.lower() in ("true", "1", "yes", "on")
    if question.type == "ENUM":
        return int(raw)
    return raw  # TEXT


def _validate_timestamp(request):
    """Parse and validate completed_at from POST data. Returns (completed_at, now) or raises."""
    raw_ts = request.POST.get("completed_at", "")
    completed_at = parse_datetime(raw_ts)
    if completed_at is None:
        return None, None
    now = timezone.now()
    max_age = timedelta(hours=django_settings.COMPLETION_TIMESTAMP_MAX_AGE_HOURS)
    if completed_at > now or now - completed_at > max_age:
        return None, None
    return completed_at, now


def _save_completion(request, instance, completed_at, now, answers_by_question=None):
    """Atomic: update streak, save completion + answers, update profile XP."""
    with transaction.atomic():
        broke = detect_streak_break(instance.definition.recurrence, instance.last_completed_at, completed_at)
        instance.streak_count = 1 if broke else instance.streak_count + 1
        instance.last_completed_at = completed_at

        xp_settings = instance.owner.profile.xp_settings
        xp_earned = calculate_xp(instance.definition.base_xp, instance.streak_count, xp_settings)

        completion = ChoreCompletion.objects.create(
            instance=instance, completed_at=completed_at, xp_earned=xp_earned
        )
        instance.save()

        if answers_by_question:
            for q, value in answers_by_question.items():
                if value is None:
                    continue
                kwargs = {"completion": completion, "question": q}
                if q.type == "TEXT":
                    kwargs["text_value"] = value
                elif q.type == "INTEGER":
                    kwargs["integer_value"] = value
                elif q.type == "BOOLEAN":
                    kwargs["boolean_value"] = value
                elif q.type == "ENUM":
                    kwargs["enum_value_id"] = value
                CompletionAnswer.objects.create(**kwargs)

        from accounts.models import Profile
        Profile.objects.filter(user=request.user).update(total_xp=models.F("total_xp") + xp_earned)

    return xp_earned


@login_required
def complete(request, pk):
    if request.method != "POST":
        return HttpResponseBadRequest()

    instance = get_object_or_404(ChoreInstance, pk=pk, owner=request.user, is_active=True)

    completed_at, now = _validate_timestamp(request)
    if completed_at is None:
        return HttpResponseBadRequest("Invalid completed_at")

    _save_completion(request, instance, completed_at, now)
    instance.refresh_from_db()
    status = _annotate_status(instance, now)
    return render(request, "chores/_chore_card.html", {"instance": instance, "status": status})


@login_required
def questions(request, pk):
    instance = get_object_or_404(ChoreInstance, pk=pk, owner=request.user, is_active=True)
    qs = list(instance.definition.questions.prefetch_related("choices").all())

    if request.method == "GET":
        return render(request, "chores/_question_modal.html", {
            "instance": instance,
            "questions": qs,
            "errors": {},
        })

    # POST — validate answers then complete
    completed_at, now = _validate_timestamp(request)
    if completed_at is None:
        return HttpResponseBadRequest("Invalid completed_at")

    errors = {}
    typed_answers = {}

    for q in qs:
        raw = request.POST.get(f"question_{q.pk}")
        try:
            value = _coerce_answer(q, raw)
            valid_ids = set(q.choices.values_list("pk", flat=True)) if q.type == "ENUM" else set()
            validate_answer(q, value, valid_ids)
            typed_answers[q] = value
        except (AnswerValidationError, ValueError) as exc:
            errors[q.pk] = str(exc)

    if errors:
        return render(request, "chores/_question_modal.html", {
            "instance": instance,
            "questions": qs,
            "errors": errors,
            "posted": request.POST,
        })

    _save_completion(request, instance, completed_at, now, answers_by_question=typed_answers)
    instance.refresh_from_db()
    status = _annotate_status(instance, now)
    card_html = render(request, "chores/_chore_card.html", {"instance": instance, "status": status}).content.decode()
    # Replace entire modal element (removes Bootstrap's 'show' class → display:none)
    close_oob = (
        '<div id="question-modal" class="modal fade" tabindex="-1" aria-hidden="true"'
        ' hx-swap-oob="outerHTML">'
        '<div class="modal-dialog">'
        '<div class="modal-content" id="question-modal-content"></div>'
        '</div>'
        '</div>'
    )
    return HttpResponse(card_html + close_oob)


@login_required
def create_chore(request):
    if request.method == "POST":
        form = ChoreDefinitionForm(request.POST)
        formset = QuestionFormSet(request.POST, prefix="questions")
        if form.is_valid() and formset.is_valid():
            with transaction.atomic():
                defn = form.save(commit=False)
                defn.creator = request.user
                defn.save()
                formset.instance = defn
                formset.save()
                ChoreInstance.objects.create(definition=defn, owner=request.user)
            return redirect("dashboard")
    else:
        form = ChoreDefinitionForm()
        formset = QuestionFormSet(prefix="questions")
    return render(request, "chores/chore_form.html", {"form": form, "formset": formset, "action": "Create"})


@login_required
def edit_chore(request, definition_id):
    defn = get_object_or_404(ChoreDefinition, pk=definition_id, creator=request.user)
    if request.method == "POST":
        form = ChoreDefinitionForm(request.POST, instance=defn)
        formset = QuestionFormSet(request.POST, instance=defn, prefix="questions")
        if form.is_valid() and formset.is_valid():
            with transaction.atomic():
                form.save()
                formset.save()
            return redirect("dashboard")
    else:
        form = ChoreDefinitionForm(instance=defn)
        formset = QuestionFormSet(instance=defn, prefix="questions")
    return render(request, "chores/chore_form.html", {"form": form, "formset": formset, "action": "Edit"})


@login_required
def deactivate_chore(request, instance_id):
    if request.method != "POST":
        return HttpResponseBadRequest()
    instance = get_object_or_404(ChoreInstance, pk=instance_id, owner=request.user)
    instance.is_active = False
    instance.save()
    return redirect("dashboard")


@login_required
def dashboard(request):
    now = timezone.now()
    instances = (
        ChoreInstance.objects.filter(owner=request.user, is_active=True)
        .select_related("definition", "owner__profile__xp_settings")
    )
    annotated = []
    for inst in instances:
        try:
            status = _annotate_status(inst, now)
        except Exception:
            logger.exception("Skipping ChoreInstance pk=%s: failed to compute status", inst.pk)
            continue
        annotated.append((inst, status))
    annotated.sort(key=lambda t: STATUS_ORDER[t[1]])
    return render(request, "chores/dashboard.html", {"annotated": annotated})
