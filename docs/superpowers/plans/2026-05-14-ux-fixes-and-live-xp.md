# UX Fixes and Live XP Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs (non-functional "Add Question" button and missing Edit link) and add two features (live XP counter update on completion, dedicated recurrence UI).

**Architecture:** All four changes are independent; they can be executed in any order. Tasks 1–2 are pure template fixes. Task 3 adds HTMX OOB swap to two view functions. Task 4 replaces the raw RRULE textarea with three guided form fields that synthesize the stored RRULE string server-side.

**Tech Stack:** Django 5, HTMX 1.9, Bootstrap 5, dateutil.rrule, pytest.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `templates/chores/chore_form.html` | Modify | Fix Add Question JS; render guided recurrence fields |
| `templates/chores/_chore_card.html` | Modify | Add Edit link in card footer |
| `templates/base.html` | Modify | Add `id="xp-counter"` to navbar XP span |
| `templates/chores/_xp_counter.html` | Create | OOB-swappable XP counter partial |
| `chores/views.py` | Modify | `complete()` and `questions()` append XP OOB swap |
| `chores/forms.py` | Modify | Replace `recurrence` textarea with three guided fields |
| `tests/integration/test_chore_management.py` | Modify | Add tests for edit link and guided recurrence fields |
| `tests/integration/test_completion.py` | Modify | Add test for XP counter in completion response |

---

### Task 1: Fix "Add Question" button does nothing

**Root cause:** `chore_form.html` JS clones `container.querySelector('.question-form')` — which is `null` when creating a new chore (no pre-existing questions). The guard `if (!tmpl) return;` silently aborts.

**Fix:** Use Django formset's built-in `empty_form` (a form with `__prefix__` placeholders) as a hidden clone template that always exists.

**Files:**
- Modify: `templates/chores/chore_form.html`

- [ ] **Step 1: Write a failing integration test**

In `tests/integration/test_chore_management.py`, add after the existing tests:

```python
@pytest.mark.django_db
def test_chore_form_has_empty_form_template(client, django_user_model):
    """The hidden empty-form template must be present so JS can clone it."""
    user = django_user_model.objects.create_user(username="i10", password="pw")
    client.force_login(user)
    response = client.get("/chores/new/")
    assert response.status_code == 200
    assert b'id="empty-question-form"' in response.content
    assert b'__prefix__' in response.content
```

- [ ] **Step 2: Run test to verify it fails**

```
docker compose run --rm web pytest tests/integration/test_chore_management.py::test_chore_form_has_empty_form_template -v
```

Expected: FAIL with `AssertionError`

- [ ] **Step 3: Rewrite `chore_form.html` with empty_form template and fixed JS**

Replace the entire file at `templates/chores/chore_form.html` with:

```html
{% extends "base.html" %}
{% block title %}{{ action }} Chore{% endblock %}
{% block content %}
<h2>{{ action }} Chore</h2>
<form method="post">
  {% csrf_token %}
  {{ form.as_p }}

  <h4 class="mt-4">Questions</h4>
  {{ formset.management_form }}
  <div id="question-formset">
    {% for qform in formset %}
    <div class="border rounded p-3 mb-2 question-form">
      {{ qform.as_p }}
      {% if qform.instance.pk %}{{ qform.DELETE }}{% endif %}
    </div>
    {% endfor %}
  </div>

  {# Hidden template for JS cloning — always present even when formset is empty #}
  <div id="empty-question-form" class="d-none">
    <div class="border rounded p-3 mb-2 question-form">
      {{ formset.empty_form.as_p }}
    </div>
  </div>

  <button type="button" class="btn btn-outline-secondary btn-sm mb-3" id="add-question">+ Add Question</button>

  <div>
    <button class="btn btn-primary" type="submit">{{ action }}</button>
    <a class="btn btn-link" href="{% url 'dashboard' %}">Cancel</a>
  </div>
</form>

<script>
  let formIdx = {{ formset.total_form_count }};
  document.getElementById('add-question').addEventListener('click', () => {
    const container = document.getElementById('question-formset');
    const tmpl = document.getElementById('empty-question-form').querySelector('.question-form');
    const clone = tmpl.cloneNode(true);
    clone.innerHTML = clone.innerHTML
      .replace(/__prefix__/g, formIdx)
      .replace(/questions-__prefix__-/g, `questions-${formIdx}-`);
    clone.querySelectorAll('input,select,textarea').forEach(el => el.value = '');
    container.appendChild(clone);
    document.getElementById('id_questions-TOTAL_FORMS').value = ++formIdx;
  });
</script>
{% endblock %}
```

- [ ] **Step 4: Run test to verify it passes**

```
docker compose run --rm web pytest tests/integration/test_chore_management.py::test_chore_form_has_empty_form_template -v
```

Expected: PASS

- [ ] **Step 5: Run full integration suite to check no regressions**

```
docker compose run --rm web pytest tests/integration/test_chore_management.py -v
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add templates/chores/chore_form.html tests/integration/test_chore_management.py
git commit -m "fix: Add Question button clones empty_form template so it works on new chores"
```

---

### Task 2: Add Edit link to chore card

**Files:**
- Modify: `templates/chores/_chore_card.html`
- Modify: `tests/integration/test_chore_management.py`

- [ ] **Step 1: Write failing integration test**

Add to `tests/integration/test_chore_management.py`:

```python
@pytest.mark.django_db
def test_chore_card_has_edit_link(client, django_user_model):
    user = django_user_model.objects.create_user(username="i11", password="pw")
    client.force_login(user)
    defn = ChoreDefinition.objects.create(
        creator=user, name="Edit Me", xp_size="S",
        recurrence="DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
    )
    ChoreInstance.objects.create(definition=defn, owner=user)
    response = client.get("/")
    assert f'/chores/{defn.pk}/edit/'.encode() in response.content
```

- [ ] **Step 2: Run test to verify it fails**

```
docker compose run --rm web pytest tests/integration/test_chore_management.py::test_chore_card_has_edit_link -v
```

Expected: FAIL

- [ ] **Step 3: Add Edit link to `_chore_card.html`**

Replace the card footer in `templates/chores/_chore_card.html` (line 31):

Old:
```html
    <div class="card-footer text-muted small">{{ instance.definition.get_xp_size_display }}</div>
```

New:
```html
    <div class="card-footer d-flex justify-content-between align-items-center text-muted small">
      <span>{{ instance.definition.get_xp_size_display }}</span>
      <a href="{% url 'chore_edit' instance.definition.pk %}" class="btn btn-outline-secondary btn-sm py-0">Edit</a>
    </div>
```

- [ ] **Step 4: Run test to verify it passes**

```
docker compose run --rm web pytest tests/integration/test_chore_management.py::test_chore_card_has_edit_link -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add templates/chores/_chore_card.html tests/integration/test_chore_management.py
git commit -m "feat: add Edit link to chore card footer"
```

---

### Task 3: Live XP counter update on chore completion

When a chore is completed via HTMX, the XP counter in the navbar should update without a full page reload, using an HTMX OOB swap.

**Files:**
- Modify: `templates/base.html`
- Create: `templates/chores/_xp_counter.html`
- Modify: `chores/views.py`
- Modify: `tests/integration/test_completion.py`

- [ ] **Step 1: Write failing integration test**

Add to `tests/integration/test_completion.py`:

```python
@pytest.mark.django_db
def test_complete_response_includes_xp_oob_swap(client, django_user_model):
    user = django_user_model.objects.create_user(username="g9", password="pw")
    client.force_login(user)
    inst = make_chore(user)
    xp_before = user.profile.total_xp
    ts = dj_tz.now().isoformat()
    response = client.post(
        f"/chores/{inst.pk}/complete/",
        {"completed_at": ts},
        HTTP_HX_REQUEST="true",
    )
    assert response.status_code == 200
    user.profile.refresh_from_db()
    expected_xp = str(user.profile.total_xp).encode()
    assert b'id="xp-counter"' in response.content
    assert expected_xp in response.content
```

- [ ] **Step 2: Run test to verify it fails**

```
docker compose run --rm web pytest tests/integration/test_completion.py::test_complete_response_includes_xp_oob_swap -v
```

Expected: FAIL — `id="xp-counter"` not in response

- [ ] **Step 3: Add `id="xp-counter"` to navbar span in `base.html`**

In `templates/base.html`, replace line 18:

Old:
```html
      <span class="navbar-text text-light me-3">XP: {{ user.profile.total_xp }}</span>
```

New:
```html
      <span id="xp-counter" class="navbar-text text-light me-3">XP: {{ user.profile.total_xp }}</span>
```

- [ ] **Step 4: Create `templates/chores/_xp_counter.html`**

```html
<span id="xp-counter" class="navbar-text text-light me-3" hx-swap-oob="outerHTML:#xp-counter">XP: {{ total_xp }}</span>
```

- [ ] **Step 5: Modify `complete()` view in `chores/views.py` to append OOB swap**

Replace the `complete` function body (the part after `_save_completion`):

Old (lines 108–111):
```python
    _save_completion(request, instance, completed_at, now)
    instance.refresh_from_db()
    status = _annotate_status(instance, now)
    return render(request, "chores/_chore_card.html", {"instance": instance, "status": status})
```

New:
```python
    _save_completion(request, instance, completed_at, now)
    instance.refresh_from_db()
    status = _annotate_status(instance, now)
    request.user.profile.refresh_from_db()
    card_html = render(request, "chores/_chore_card.html", {"instance": instance, "status": status}).content.decode()
    xp_html = render(request, "chores/_xp_counter.html", {"total_xp": request.user.profile.total_xp}).content.decode()
    return HttpResponse(card_html + xp_html)
```

- [ ] **Step 6: Modify the POST path of `questions()` in `chores/views.py` to also append OOB swap**

In the `questions` view, find the final `return HttpResponse(card_html + close_oob)` (line 165) and replace with:

```python
    request.user.profile.refresh_from_db()
    xp_html = render(request, "chores/_xp_counter.html", {"total_xp": request.user.profile.total_xp}).content.decode()
    return HttpResponse(card_html + close_oob + xp_html)
```

- [ ] **Step 7: Run tests**

```
docker compose run --rm web pytest tests/integration/test_completion.py -v
```

Expected: all pass including the new test

- [ ] **Step 8: Commit**

```bash
git add templates/base.html templates/chores/_xp_counter.html chores/views.py tests/integration/test_completion.py
git commit -m "feat: live XP counter update via HTMX OOB swap on chore completion"
```

---

### Task 4: Dedicated recurrence UI (replace raw RRULE textarea)

Replace the raw RRULE textarea with three guided fields: Frequency dropdown, Every-N interval, and Start date picker. The form synthesizes the stored RRULE string server-side in `clean()`. Editing an existing chore pre-populates the fields by parsing the stored RRULE.

**Files:**
- Modify: `chores/forms.py`
- Modify: `templates/chores/chore_form.html` (recurrence section only — file already updated in Task 1)

- [ ] **Step 1: Write failing unit test for recurrence field synthesis**

Create or append to `tests/unit/test_recurrence_form.py` — but since the file doesn't exist, add to `tests/integration/test_chore_management.py`:

```python
@pytest.mark.django_db
def test_create_chore_with_guided_recurrence_fields(client, django_user_model):
    user = django_user_model.objects.create_user(username="i12", password="pw")
    client.force_login(user)
    response = client.post("/chores/new/", {
        "name": "Guided",
        "description": "",
        "xp_size": "S",
        "recurrence_freq": "WEEKLY",
        "recurrence_interval": "2",
        "recurrence_dtstart": "2026-01-05",
        "questions-TOTAL_FORMS": "0",
        "questions-INITIAL_FORMS": "0",
        "questions-MIN_NUM_FORMS": "0",
        "questions-MAX_NUM_FORMS": "1000",
    })
    assert response.status_code == 302
    defn = ChoreDefinition.objects.get(name="Guided")
    assert "FREQ=WEEKLY" in defn.recurrence
    assert "INTERVAL=2" in defn.recurrence
    assert "DTSTART:20260105T000000Z" in defn.recurrence


@pytest.mark.django_db
def test_edit_chore_guided_recurrence_prepopulates(client, django_user_model):
    user = django_user_model.objects.create_user(username="i13", password="pw")
    client.force_login(user)
    defn = ChoreDefinition.objects.create(
        creator=user, name="Prepop", xp_size="S",
        recurrence="DTSTART:20260310T000000Z\nRRULE:FREQ=MONTHLY;INTERVAL=3"
    )
    response = client.get(f"/chores/{defn.pk}/edit/")
    assert response.status_code == 200
    assert b"MONTHLY" in response.content
    assert b"2026-03-10" in response.content
```

- [ ] **Step 2: Run tests to verify they fail**

```
docker compose run --rm web pytest tests/integration/test_chore_management.py::test_create_chore_with_guided_recurrence_fields tests/integration/test_chore_management.py::test_edit_chore_guided_recurrence_prepopulates -v
```

Expected: both FAIL

- [ ] **Step 3: Rewrite `chores/forms.py` with guided recurrence fields**

Replace the entire file:

```python
from datetime import date
from django import forms
from django.forms import inlineformset_factory
from django.utils.safestring import mark_safe
from dateutil.rrule import rrulestr
from .models import ChoreDefinition, Question

FREQ_CHOICES = [
    ("HOURLY", "Hourly"),
    ("DAILY", "Daily"),
    ("WEEKLY", "Weekly"),
    ("MONTHLY", "Monthly"),
]


def _parse_recurrence(value):
    """Parse stored RRULE string into (freq, interval, dtstart_date)."""
    freq, interval, dtstart = "DAILY", 1, None
    for line in (value or "").splitlines():
        upper = line.upper().strip()
        if upper.startswith("DTSTART:"):
            ts = upper[8:]  # e.g. "20260101T000000Z"
            try:
                dtstart = date(int(ts[0:4]), int(ts[4:6]), int(ts[6:8]))
            except (ValueError, IndexError):
                pass
        elif upper.startswith("RRULE:"):
            params = {}
            for part in upper[6:].split(";"):
                if "=" in part:
                    k, v = part.split("=", 1)
                    params[k] = v
            freq = params.get("FREQ", "DAILY")
            try:
                interval = int(params.get("INTERVAL", "1"))
            except ValueError:
                interval = 1
    return freq, interval, dtstart


class ChoreDefinitionForm(forms.ModelForm):
    recurrence_freq = forms.ChoiceField(
        choices=FREQ_CHOICES,
        label="Frequency",
    )
    recurrence_interval = forms.IntegerField(
        min_value=1,
        initial=1,
        label="Every N periods",
        help_text="e.g. 2 = every 2 days/weeks/months",
    )
    recurrence_dtstart = forms.DateField(
        label="Start date",
        widget=forms.DateInput(attrs={"type": "date"}),
    )

    class Meta:
        model = ChoreDefinition
        fields = ["name", "description", "xp_size"]
        widgets = {
            "description": forms.Textarea(attrs={"rows": 3}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance.pk and self.instance.recurrence:
            freq, interval, dtstart = _parse_recurrence(self.instance.recurrence)
            self.fields["recurrence_freq"].initial = freq
            self.fields["recurrence_interval"].initial = interval
            self.fields["recurrence_dtstart"].initial = dtstart

    def clean(self):
        cleaned = super().clean()
        freq = cleaned.get("recurrence_freq")
        interval = cleaned.get("recurrence_interval", 1)
        dtstart = cleaned.get("recurrence_dtstart")
        if freq and dtstart:
            date_str = dtstart.strftime("%Y%m%dT000000Z")
            cleaned["recurrence"] = f"DTSTART:{date_str}\nRRULE:FREQ={freq};INTERVAL={interval}"
        return cleaned

    def save(self, commit=True):
        instance = super().save(commit=False)
        instance.recurrence = self.cleaned_data["recurrence"]
        if commit:
            instance.save()
        return instance


QuestionFormSet = inlineformset_factory(
    ChoreDefinition,
    Question,
    fields=["text", "type", "required", "order", "regex_pattern", "min_value", "max_value"],
    extra=0,
    can_delete=True,
    can_order=False,
)
```

- [ ] **Step 4: Run tests to verify they pass**

```
docker compose run --rm web pytest tests/integration/test_chore_management.py::test_create_chore_with_guided_recurrence_fields tests/integration/test_chore_management.py::test_edit_chore_guided_recurrence_prepopulates -v
```

Expected: both PASS

- [ ] **Step 5: Run full integration suite to check existing chore management tests still pass**

```
docker compose run --rm web pytest tests/integration/test_chore_management.py -v
```

The existing tests post `"recurrence": "DTSTART:20260101T000000Z\nRRULE:FREQ=WEEKLY"` to the form. These will now fail because the form no longer has a `recurrence` field — the POST data is ignored. Update the existing tests that submit the old recurrence field to use the new guided fields.

Update `tests/integration/test_chore_management.py` — replace every occurrence of:
```python
"recurrence": "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY",
```
with:
```python
"recurrence_freq": "DAILY",
"recurrence_interval": "1",
"recurrence_dtstart": "2026-01-01",
```

And:
```python
"recurrence": "DTSTART:20260101T000000Z\nRRULE:FREQ=WEEKLY",
```
with:
```python
"recurrence_freq": "WEEKLY",
"recurrence_interval": "1",
"recurrence_dtstart": "2026-01-01",
```

- [ ] **Step 6: Run full integration suite again**

```
docker compose run --rm web pytest tests/integration/ -v
```

Expected: all pass

- [ ] **Step 7: Run full test suite**

```
docker compose run --rm web pytest tests/ -v
```

Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add chores/forms.py templates/chores/chore_form.html tests/integration/test_chore_management.py
git commit -m "feat: replace raw RRULE textarea with guided frequency/interval/start-date fields"
```

---

## Self-Review

**Spec coverage:**
- "Add Question button does nothing" → Task 1 ✓
- "Possibility to edit chores" → Task 2 ✓
- "Total XP should update when a chore is completed" → Task 3 ✓
- "Entering a recurrence pattern requires a dedicated UI" → Task 4 ✓

**Placeholder scan:** None found.

**Type consistency:**
- `_parse_recurrence()` returns `(str, int, date | None)` — matches `recurrence_dtstart = forms.DateField()` which yields `date` objects in `cleaned_data`
- `cleaned_data["recurrence"]` is set in `clean()` and consumed in `save()` — consistent
- `hx-swap-oob="outerHTML:#xp-counter"` targets `id="xp-counter"` added to `base.html` — consistent

**Potential issue — admin form:** `ChoreDefinitionAdmin` uses `form = ChoreDefinitionForm` (added in a prior session). The guided form's `clean()` requires `recurrence_freq`, `recurrence_interval`, and `recurrence_dtstart` to be present. In the Django admin, these fields will appear in the admin form automatically (they are declared on the form class), so admin creation/editing will work as long as those fields are filled in. However the admin `ChoreDefinition` change form rendered by `as_p` may show the guided fields below the base model fields — this is acceptable. No fix needed.
