# Chore Form Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the chore create and edit forms in a Bootstrap modal instead of navigating to a separate page.

**Architecture:** HTMX loads the form fragment into a persistent modal container on the dashboard. The views detect `HX-Request` header and return either the modal fragment (GET/invalid POST) or an `HX-Redirect` header (successful POST). Non-HTMX requests fall back to the existing full-page behaviour.

**Tech Stack:** Django 5, HTMX 1.9.12, Bootstrap 5.3.3

---

## File Structure

| File | Change |
|---|---|
| `templates/chores/_chore_form_modal.html` | **Create** — modal fragment (header + form body + JS) |
| `templates/chores/dashboard.html` | Add modal container; change `<a>` New Chore to HTMX `<button>` |
| `templates/chores/_chore_card.html` | Change Edit `<a>` to HTMX `<button>` |
| `chores/views.py` | `create_chore` / `edit_chore` handle HTMX GET & POST |
| `tests/integration/test_chore_management.py` | Add 5 HTMX tests |

---

### Task 1: Create `_chore_form_modal.html`

**Files:**
- Create: `templates/chores/_chore_form_modal.html`

- [ ] **Step 1: Create the template**

```html
<div class="modal-header">
  <h5 class="modal-title">{{ action }} Chore</h5>
  <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
</div>
<form hx-post="{{ form_url }}"
      hx-target="#chore-form-modal-content"
      hx-swap="innerHTML">
  {% csrf_token %}
  <div class="modal-body">
    {{ form.as_p }}

    <h5 class="mt-3">Questions</h5>
    {{ formset.management_form }}
    <div id="question-formset">
      {% for qform in formset %}
      <div class="border rounded p-3 mb-2 question-form">
        {{ qform.as_p }}
        {% if qform.instance.pk %}
          <div class="d-none">{{ qform.DELETE }}</div>
        {% endif %}
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="removeQuestion(this)">Remove</button>
      </div>
      {% endfor %}
    </div>

    <div id="empty-question-form" class="d-none">
      <div class="border rounded p-3 mb-2 question-form">
        {{ formset.empty_form.as_p }}
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="removeQuestion(this)">Remove</button>
      </div>
    </div>

    <button type="button" class="btn btn-outline-secondary btn-sm mb-3" id="add-question">+ Add Question</button>
  </div>
  <div class="modal-footer">
    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
    <button class="btn btn-primary" type="submit">{{ action }}</button>
  </div>
</form>

<script>
  let formIdx = {{ formset.total_form_count }};

  function removeQuestion(btn) {
    const form = btn.closest('.question-form');
    const deleteCheckbox = form.querySelector('input[type="checkbox"][id$="-DELETE"]');
    if (deleteCheckbox) {
      deleteCheckbox.checked = true;
      form.classList.add('d-none');
    } else {
      form.remove();
    }
  }

  function updateChoicesVisibility(typeSelect) {
    const form = typeSelect.closest('.question-form');
    const choicesRow = Array.from(form.querySelectorAll('p')).find(p => {
      const label = p.querySelector('label');
      return label && label.textContent.includes('Choices');
    });
    if (choicesRow) {
      choicesRow.style.display = typeSelect.value === 'ENUM' ? '' : 'none';
    }
  }

  document.getElementById('question-formset').addEventListener('change', e => {
    if (e.target.tagName === 'SELECT' && e.target.id.includes('-type')) {
      updateChoicesVisibility(e.target);
    }
  });

  document.querySelectorAll('#question-formset select[id$="-type"]').forEach(updateChoicesVisibility);

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
    const newTypeSelect = clone.querySelector('select[id$="-type"]');
    if (newTypeSelect) updateChoicesVisibility(newTypeSelect);
  });
</script>
```

- [ ] **Step 2: Commit**

```bash
git add templates/chores/_chore_form_modal.html
git commit -m "feat: add chore form modal fragment template"
```

---

### Task 2: Write failing HTMX tests

**Files:**
- Modify: `tests/integration/test_chore_management.py`

- [ ] **Step 1: Add 5 new tests at the end of the file**

```python
@pytest.mark.django_db
def test_create_chore_htmx_get_returns_modal_fragment(client, django_user_model):
    user = django_user_model.objects.create_user(username="h_c1", password="pw")
    client.force_login(user)
    response = client.get("/chores/new/", HTTP_HX_REQUEST="true")
    assert response.status_code == 200
    assert b"<html" not in response.content
    assert b"Create" in response.content


@pytest.mark.django_db
def test_create_chore_htmx_post_success_returns_hx_redirect(client, django_user_model):
    user = django_user_model.objects.create_user(username="h_c2", password="pw")
    client.force_login(user)
    response = client.post("/chores/new/", {
        "name": "Walk", "description": "", "xp_size": "S",
        "recurrence_freq": "DAILY", "recurrence_interval": "1",
        "recurrence_dtstart": "2026-01-01",
        "questions-TOTAL_FORMS": "0", "questions-INITIAL_FORMS": "0",
        "questions-MIN_NUM_FORMS": "0", "questions-MAX_NUM_FORMS": "1000",
    }, HTTP_HX_REQUEST="true")
    assert response.status_code == 200
    assert response["HX-Redirect"] == "/"


@pytest.mark.django_db
def test_create_chore_htmx_post_invalid_returns_form_fragment(client, django_user_model):
    user = django_user_model.objects.create_user(username="h_c3", password="pw")
    client.force_login(user)
    response = client.post("/chores/new/", {
        "name": "",
        "questions-TOTAL_FORMS": "0", "questions-INITIAL_FORMS": "0",
        "questions-MIN_NUM_FORMS": "0", "questions-MAX_NUM_FORMS": "1000",
    }, HTTP_HX_REQUEST="true")
    assert response.status_code == 200
    assert b"<html" not in response.content
    assert "HX-Redirect" not in response


@pytest.mark.django_db
def test_edit_chore_htmx_get_returns_modal_fragment(client, django_user_model):
    user = django_user_model.objects.create_user(username="h_e1", password="pw")
    client.force_login(user)
    defn = ChoreDefinition.objects.create(
        creator=user, name="Sweep", xp_size="S",
        recurrence="DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY",
    )
    response = client.get(f"/chores/{defn.pk}/edit/", HTTP_HX_REQUEST="true")
    assert response.status_code == 200
    assert b"<html" not in response.content
    assert b"Sweep" in response.content


@pytest.mark.django_db
def test_edit_chore_htmx_post_success_returns_hx_redirect(client, django_user_model):
    user = django_user_model.objects.create_user(username="h_e2", password="pw")
    client.force_login(user)
    defn = ChoreDefinition.objects.create(
        creator=user, name="Sweep", xp_size="S",
        recurrence="DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY",
    )
    response = client.post(f"/chores/{defn.pk}/edit/", {
        "name": "Sweep Updated", "description": "", "xp_size": "M",
        "recurrence_freq": "DAILY", "recurrence_interval": "1",
        "recurrence_dtstart": "2026-01-01",
        "questions-TOTAL_FORMS": "0", "questions-INITIAL_FORMS": "0",
        "questions-MIN_NUM_FORMS": "0", "questions-MAX_NUM_FORMS": "1000",
    }, HTTP_HX_REQUEST="true")
    assert response.status_code == 200
    assert response["HX-Redirect"] == "/"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
DOCKER_HOST=unix:///run/user/1000/docker.sock docker compose run --rm web pytest tests/integration/test_chore_management.py -v -k "htmx"
```

Expected: 5 FAIL (views don't yet handle `HX-Request`)

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/integration/test_chore_management.py
git commit -m "test: add failing HTMX tests for chore form modal"
```

---

### Task 3: Update views to handle HTMX

**Files:**
- Modify: `chores/views.py`

- [ ] **Step 1: Add `reverse` import and update `create_chore`**

Add `reverse` to the existing `django.urls` import line (currently only `django.shortcuts` provides `redirect`; `reverse` comes from `django.urls`). Then replace `create_chore` and `edit_chore`.

Change the import block at the top of `chores/views.py`:

```python
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
```

Replace the entire `create_chore` function:

```python
@login_required
def create_chore(request):
    is_htmx = bool(request.headers.get("HX-Request"))
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
                _save_question_choices(formset)
                ChoreInstance.objects.create(definition=defn, owner=request.user)
            if is_htmx:
                response = HttpResponse()
                response["HX-Redirect"] = "/"
                return response
            return redirect("dashboard")
        if is_htmx:
            return render(request, "chores/_chore_form_modal.html", {
                "form": form, "formset": formset, "action": "Create",
                "form_url": reverse("chore_create"),
            })
    else:
        form = ChoreDefinitionForm()
        formset = QuestionFormSet(prefix="questions")
    if is_htmx:
        return render(request, "chores/_chore_form_modal.html", {
            "form": form, "formset": formset, "action": "Create",
            "form_url": reverse("chore_create"),
        })
    return render(request, "chores/chore_form.html", {"form": form, "formset": formset, "action": "Create"})
```

Replace the entire `edit_chore` function:

```python
@login_required
def edit_chore(request, definition_id):
    defn = get_object_or_404(ChoreDefinition, pk=definition_id, creator=request.user)
    is_htmx = bool(request.headers.get("HX-Request"))
    if request.method == "POST":
        form = ChoreDefinitionForm(request.POST, instance=defn)
        formset = QuestionFormSet(request.POST, instance=defn, prefix="questions")
        if form.is_valid() and formset.is_valid():
            with transaction.atomic():
                form.save()
                formset.save()
                _save_question_choices(formset)
            if is_htmx:
                response = HttpResponse()
                response["HX-Redirect"] = "/"
                return response
            return redirect("dashboard")
        if is_htmx:
            return render(request, "chores/_chore_form_modal.html", {
                "form": form, "formset": formset, "action": "Edit",
                "form_url": reverse("chore_edit", args=[definition_id]),
            })
    else:
        form = ChoreDefinitionForm(instance=defn)
        formset = QuestionFormSet(instance=defn, prefix="questions")
    if is_htmx:
        return render(request, "chores/_chore_form_modal.html", {
            "form": form, "formset": formset, "action": "Edit",
            "form_url": reverse("chore_edit", args=[definition_id]),
        })
    return render(request, "chores/chore_form.html", {"form": form, "formset": formset, "action": "Edit"})
```

- [ ] **Step 2: Run HTMX tests to confirm they now pass**

```bash
DOCKER_HOST=unix:///run/user/1000/docker.sock docker compose run --rm web pytest tests/integration/test_chore_management.py -v -k "htmx"
```

Expected: 5 PASS

- [ ] **Step 3: Run full test suite to catch regressions**

```bash
DOCKER_HOST=unix:///run/user/1000/docker.sock docker compose run --rm web pytest tests/integration/ tests/unit/ -v
```

Expected: all 54 tests PASS

- [ ] **Step 4: Commit**

```bash
git add chores/views.py
git commit -m "feat: create_chore and edit_chore return modal fragment for HTMX requests"
```

---

### Task 4: Update dashboard and chore card

**Files:**
- Modify: `templates/chores/dashboard.html`
- Modify: `templates/chores/_chore_card.html`

- [ ] **Step 1: Update `dashboard.html`**

Replace the `<a class="btn btn-success" href="{% url 'chore_create' %}">+ New Chore</a>` line with:

```html
<button class="btn btn-success"
  hx-get="{% url 'chore_create' %}"
  hx-target="#chore-form-modal-content"
  hx-on::after-request="bootstrap.Modal.getOrCreateInstance(document.getElementById('chore-form-modal')).show()">
  + New Chore
</button>
```

Add the modal container just before `{% endblock %}`:

```html
<div class="modal fade" id="chore-form-modal" tabindex="-1">
  <div class="modal-dialog modal-lg modal-dialog-scrollable">
    <div class="modal-content" id="chore-form-modal-content"></div>
  </div>
</div>
```

- [ ] **Step 2: Update `_chore_card.html`**

Replace the Edit `<a>` tag:
```html
<a href="{% url 'chore_edit' instance.definition.pk %}" class="btn btn-outline-secondary btn-sm py-0">Edit</a>
```

with:

```html
<button class="btn btn-outline-secondary btn-sm py-0"
  hx-get="{% url 'chore_edit' instance.definition.pk %}"
  hx-target="#chore-form-modal-content"
  hx-on::after-request="bootstrap.Modal.getOrCreateInstance(document.getElementById('chore-form-modal')).show()">
  Edit
</button>
```

- [ ] **Step 3: Run full test suite**

```bash
DOCKER_HOST=unix:///run/user/1000/docker.sock docker compose run --rm web pytest tests/integration/ tests/unit/ -v
```

Expected: all 54 tests PASS

- [ ] **Step 4: Commit**

```bash
git add templates/chores/dashboard.html templates/chores/_chore_card.html
git commit -m "feat: open chore create/edit in modal via HTMX"
```
