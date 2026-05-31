# UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver 9 UI improvements: description on chore cards, responsive scheduling fields in the edit modal, question ordering with arrows, type-conditional question fields, form-switch for required, improved remove/restore delete behavior, and a dynamic add/remove/reorder list UI for ENUM choices (replacing the plain textarea).

**Architecture:** All changes are confined to 3 source files (`_chore_card.html`, `_chore_form_modal.html`, `chores/forms.py`) plus new tests. No new source files, no CSS files, no changes to `bs_field` or `chore_tags.py`. All JavaScript stays inline in the modal `<script>` block. ENUM choices continue to be stored as newline-separated text in the hidden `choice_labels` field — the list UI serializes to that format before submission, so no view or model changes are needed.

**Tech Stack:** Django 5, Bootstrap 5.3 (Bootstrap Icons 1.11 already in base.html), HTMX 1.9, Alpine.js, pytest-django (integration), Playwright (E2E)

---

## File Map

| File | What changes |
|------|-------------|
| `templates/chores/_chore_card.html` | Add description paragraph with CSS line-clamp |
| `chores/forms.py` | `QuestionForm`: HiddenInput for `order`, `required.initial = True` |
| `templates/chores/_chore_form_modal.html` | Replace `{% for %}` loops with explicit field rendering, responsive grid, question block rewrite, ENUM list UI, new JS |
| `tests/integration/test_chore_management.py` | 5 new integration tests |
| `tests/e2e/test_chore_management.py` | 4 new E2E tests |

---

### Task 1: Description on chore cards

**Files:**
- Modify: `tests/integration/test_chore_management.py`
- Modify: `templates/chores/_chore_card.html`

- [ ] **Step 1: Write the failing integration test**

Add to `tests/integration/test_chore_management.py`:

```python
@pytest.mark.django_db
def test_dashboard_shows_chore_description(client, django_user_model):
    user = django_user_model.objects.create_user(username="desc1", password="pw")
    client.force_login(user)
    rrule = "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(
        creator=user, name="Vacuum", description="Clean under sofa every week",
        xp_size="S", recurrence=rrule,
    )
    ChoreInstance.objects.create(definition=defn, owner=user)
    response = client.get("/")
    assert b"Clean under sofa every week" in response.content
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
docker compose run --rm web pytest tests/integration/test_chore_management.py::test_dashboard_shows_chore_description -v
```

Expected: `FAILED` — description not in card HTML yet.

- [ ] **Step 3: Implement — add description to `_chore_card.html`**

In `templates/chores/_chore_card.html`, after the streak/XP `<p>` at line 35, insert:

```html
      {% if instance.definition.description %}
      <p class="card-text small text-muted mb-2"
         style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">{{ instance.definition.description }}</p>
      {% endif %}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
docker compose run --rm web pytest tests/integration/test_chore_management.py::test_dashboard_shows_chore_description -v
```

Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add templates/chores/_chore_card.html tests/integration/test_chore_management.py
git commit -m "feat: show truncated description on chore cards"
```

---

### Task 2: forms.py — hidden order field, required defaults to checked

**Files:**
- Modify: `tests/integration/test_chore_management.py`
- Modify: `chores/forms.py`

- [ ] **Step 1: Write the failing integration tests**

Add to `tests/integration/test_chore_management.py`:

```python
import re as _re

@pytest.mark.django_db
def test_chore_modal_order_field_is_hidden_input(client, django_user_model):
    user = django_user_model.objects.create_user(username="ordhid1", password="pw")
    client.force_login(user)
    response = client.get("/chores/new/", HTTP_HX_REQUEST="true")
    content = response.content.decode()
    match = _re.search(
        r'<input[^>]+name="questions-__prefix__-order"[^>]*>',
        content,
    )
    assert match, "order input not found in modal HTML"
    assert 'type="hidden"' in match.group(0), f"order input is not hidden: {match.group(0)}"


@pytest.mark.django_db
def test_chore_modal_question_form_has_form_switch(client, django_user_model):
    user = django_user_model.objects.create_user(username="sw1", password="pw")
    client.force_login(user)
    response = client.get("/chores/new/", HTTP_HX_REQUEST="true")
    assert b"form-switch" in response.content
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
docker compose run --rm web pytest tests/integration/test_chore_management.py::test_chore_modal_order_field_is_hidden_input tests/integration/test_chore_management.py::test_chore_modal_question_form_has_form_switch -v
```

Expected: both `FAILED` — order is currently a number input, no form-switch yet.

- [ ] **Step 3: Implement `forms.py` changes**

In `chores/forms.py`, update `QuestionForm` to match exactly:

```python
class QuestionForm(forms.ModelForm):
    choice_labels = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={"rows": 2, "placeholder": "One choice per line"}),
        label="Choices",
        help_text="ENUM only — one option per line, in display order",
    )

    class Meta:
        model = Question
        fields = ["text", "type", "required", "order", "regex_pattern", "min_value", "max_value"]
        widgets = {
            "order": forms.HiddenInput(),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance.pk and self.instance.type == "ENUM":
            labels = list(self.instance.choices.order_by("order").values_list("label", flat=True))
            self.fields["choice_labels"].initial = "\n".join(labels)
        if not self.instance.pk:
            self.fields["required"].initial = True
```

- [ ] **Step 4: Run the tests**

```bash
docker compose run --rm web pytest tests/integration/test_chore_management.py::test_chore_modal_order_field_is_hidden_input -v
```

Expected: `PASSED`. (`test_chore_modal_question_form_has_form_switch` still fails — needs the template change in Task 4.)

- [ ] **Step 5: Commit**

```bash
git add chores/forms.py tests/integration/test_chore_management.py
git commit -m "feat: hide order input and default required=True for new questions"
```

---

### Task 3: Responsive scheduling fields in chore modal

**Files:**
- Modify: `tests/integration/test_chore_management.py`
- Modify: `templates/chores/_chore_form_modal.html`

- [ ] **Step 1: Write the failing integration test**

Add to `tests/integration/test_chore_management.py`:

```python
@pytest.mark.django_db
def test_chore_modal_scheduling_fields_in_responsive_grid(client, django_user_model):
    user = django_user_model.objects.create_user(username="grid1", password="pw")
    client.force_login(user)
    response = client.get("/chores/new/", HTTP_HX_REQUEST="true")
    assert b"col-12 col-md-6 col-lg-3" in response.content
```

- [ ] **Step 2: Run to confirm it fails**

```bash
docker compose run --rm web pytest tests/integration/test_chore_management.py::test_chore_modal_scheduling_fields_in_responsive_grid -v
```

Expected: `FAILED` — modal currently uses `{% for field in form %}` with no grid.

- [ ] **Step 3: Implement — replace the ChoreDefinitionForm loop**

In `templates/chores/_chore_form_modal.html`, replace:

```html
    {% for field in form %}{% bs_field field %}{% endfor %}
```

with:

```html
    {% bs_field form.name %}
    {% bs_field form.description %}
    <div class="row g-2 mb-3">
      <div class="col-12 col-md-6 col-lg-3">{% bs_field form.xp_size %}</div>
      <div class="col-12 col-md-6 col-lg-3">{% bs_field form.recurrence_freq %}</div>
      <div class="col-12 col-md-6 col-lg-3">{% bs_field form.recurrence_interval %}</div>
      <div class="col-12 col-md-6 col-lg-3">{% bs_field form.recurrence_dtstart %}</div>
    </div>
```

- [ ] **Step 4: Run the test plus existing chore creation tests**

```bash
docker compose run --rm web pytest tests/integration/test_chore_management.py::test_chore_modal_scheduling_fields_in_responsive_grid tests/integration/test_chore_management.py::test_create_chore_htmx_get_returns_modal_fragment tests/integration/test_chore_management.py::test_create_chore_htmx_post_success_returns_hx_redirect -v
```

Expected: all `PASSED`

- [ ] **Step 5: Commit**

```bash
git add templates/chores/_chore_form_modal.html tests/integration/test_chore_management.py
git commit -m "feat: responsive 4-column grid for scheduling fields in chore modal"
```

---

### Task 4: Question block rewrite (items 3–9)

This task replaces the `{% for field in qform %}` loops for both the formset and the empty_form with a manually-rendered block implementing all remaining items: arrow buttons, form-switch for required, conditional field visibility, min/max on the same row, remove/restore delete pattern, and the ENUM choices dynamic list UI.

**Files:**
- Modify: `tests/integration/test_chore_management.py`
- Modify: `templates/chores/_chore_form_modal.html`

- [ ] **Step 1: Write the failing integration tests**

Add to `tests/integration/test_chore_management.py`:

```python
@pytest.mark.django_db
def test_chore_modal_question_conditional_field_wrappers(client, django_user_model):
    user = django_user_model.objects.create_user(username="cond1", password="pw")
    client.force_login(user)
    response = client.get("/chores/new/", HTTP_HX_REQUEST="true")
    content = response.content.decode()
    assert 'data-field-conditional="INTEGER"' in content
    assert 'data-field-conditional="TEXT"' in content
    assert 'data-field-conditional="ENUM"' in content


@pytest.mark.django_db
def test_chore_modal_enum_choices_has_list_ui(client, django_user_model):
    user = django_user_model.objects.create_user(username="enum1", password="pw")
    client.force_login(user)
    response = client.get("/chores/new/", HTTP_HX_REQUEST="true")
    assert b"enum-choices-list" in response.content
```

- [ ] **Step 2: Run to confirm they fail**

```bash
docker compose run --rm web pytest tests/integration/test_chore_management.py::test_chore_modal_question_form_has_form_switch tests/integration/test_chore_management.py::test_chore_modal_question_conditional_field_wrappers tests/integration/test_chore_management.py::test_chore_modal_enum_choices_has_list_ui -v
```

Expected: all `FAILED`

- [ ] **Step 3: Rewrite the question blocks in `_chore_form_modal.html`**

Replace everything from `<h5 class="mt-3">Questions</h5>` through `</script>` with the following complete replacement. The question form block is written out in full for both the formset loop and the `#empty-question-form` clone template.

```html
    <h5 class="mt-3">Questions</h5>
    {{ formset.management_form }}
    <div id="question-formset">
      {% for qform in formset %}
      <div class="border rounded p-3 mb-2 question-form">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="fw-semibold small text-muted">Question</span>
          <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-outline-secondary"
                    onclick="moveQuestion(this, -1)" title="Move up">
              <i class="bi bi-arrow-up"></i>
            </button>
            <button type="button" class="btn btn-outline-secondary"
                    onclick="moveQuestion(this, 1)" title="Move down">
              <i class="bi bi-arrow-down"></i>
            </button>
          </div>
        </div>
        {% bs_field qform.text %}
        <div class="mb-3 form-check form-switch" data-field="required">
          <input class="form-check-input" type="checkbox"
                 name="{{ qform.required.html_name }}"
                 id="{{ qform.required.id_for_label }}"
                 {% if qform.required.value %}checked{% endif %}>
          <label class="form-check-label" for="{{ qform.required.id_for_label }}">
            {{ qform.required.label }}
          </label>
          {% if qform.required.errors %}
            <div class="invalid-feedback d-block">{{ qform.required.errors.0 }}</div>
          {% endif %}
        </div>
        {% bs_field qform.type %}
        <div data-field-conditional="TEXT">
          {% bs_field qform.regex_pattern %}
        </div>
        <div class="row g-2 mb-3" data-field-conditional="INTEGER">
          <div class="col">{% bs_field qform.min_value %}</div>
          <div class="col">{% bs_field qform.max_value %}</div>
        </div>
        <div data-field-conditional="ENUM">
          <div class="mb-3" data-field="choice_labels">
            <label class="form-label">Choices</label>
            <div class="enum-choices-list mb-2"></div>
            <button type="button" class="btn btn-outline-secondary btn-sm"
                    onclick="addEnumChoice(this)">+ Add Choice</button>
            {% if qform.choice_labels.errors %}
              <div class="invalid-feedback d-block">{{ qform.choice_labels.errors.0 }}</div>
            {% endif %}
          </div>
          {{ qform.choice_labels.as_hidden }}
        </div>
        {{ qform.order }}
        {% if qform.instance.pk %}
          <div class="d-none">{{ qform.DELETE }}</div>
        {% endif %}
        <button type="button" class="btn btn-outline-danger btn-sm mt-2"
                onclick="removeQuestion(this)"
                {% if qform.instance.pk %}data-has-delete{% endif %}>
          Remove
        </button>
      </div>
      {% endfor %}
    </div>

    <div id="empty-question-form" class="d-none">
      {% with qform=formset.empty_form %}
      <div class="border rounded p-3 mb-2 question-form">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="fw-semibold small text-muted">Question</span>
          <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-outline-secondary"
                    onclick="moveQuestion(this, -1)" title="Move up">
              <i class="bi bi-arrow-up"></i>
            </button>
            <button type="button" class="btn btn-outline-secondary"
                    onclick="moveQuestion(this, 1)" title="Move down">
              <i class="bi bi-arrow-down"></i>
            </button>
          </div>
        </div>
        {% bs_field qform.text %}
        <div class="mb-3 form-check form-switch" data-field="required">
          <input class="form-check-input" type="checkbox"
                 name="{{ qform.required.html_name }}"
                 id="{{ qform.required.id_for_label }}"
                 {% if qform.required.value %}checked{% endif %}>
          <label class="form-check-label" for="{{ qform.required.id_for_label }}">
            {{ qform.required.label }}
          </label>
        </div>
        {% bs_field qform.type %}
        <div data-field-conditional="TEXT">
          {% bs_field qform.regex_pattern %}
        </div>
        <div class="row g-2 mb-3" data-field-conditional="INTEGER">
          <div class="col">{% bs_field qform.min_value %}</div>
          <div class="col">{% bs_field qform.max_value %}</div>
        </div>
        <div data-field-conditional="ENUM">
          <div class="mb-3" data-field="choice_labels">
            <label class="form-label">Choices</label>
            <div class="enum-choices-list mb-2"></div>
            <button type="button" class="btn btn-outline-secondary btn-sm"
                    onclick="addEnumChoice(this)">+ Add Choice</button>
          </div>
          {{ qform.choice_labels.as_hidden }}
        </div>
        {{ qform.order }}
        <button type="button" class="btn btn-outline-danger btn-sm mt-2"
                onclick="removeQuestion(this)">
          Remove
        </button>
      </div>
      {% endwith %}
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

  // ── Question ordering ──────────────────────────────────────────────────────

  function moveQuestion(btn, direction) {
    const form = btn.closest('.question-form');
    const container = form.parentElement;
    const forms = Array.from(
      container.querySelectorAll(':scope > .question-form:not(.opacity-50)')
    );
    const idx = forms.indexOf(form);
    const target = forms[idx + direction];
    if (!target) return;
    if (direction === -1) container.insertBefore(form, target);
    else container.insertBefore(target, form);
    updateOrderInputs();
  }

  function updateOrderInputs() {
    const container = document.getElementById('question-formset');
    Array.from(container.querySelectorAll(':scope > .question-form')).forEach((form, i) => {
      const orderInput = form.querySelector('input[id$="-order"]');
      if (orderInput) orderInput.value = i;
    });
  }

  // ── Conditional field visibility ───────────────────────────────────────────

  function updateConditionalFields(typeSelect) {
    const form = typeSelect.closest('.question-form');
    const selectedType = typeSelect.value;
    form.querySelectorAll('[data-field-conditional]').forEach(wrapper => {
      wrapper.style.display =
        (selectedType === wrapper.dataset.fieldConditional) ? '' : 'none';
    });
    if (selectedType === 'ENUM') initEnumChoicesList(form);
  }

  // ── Remove / Restore ───────────────────────────────────────────────────────

  function removeQuestion(btn) {
    const form = btn.closest('.question-form');
    if (btn.dataset.hasDelete !== undefined) {
      const deleteCheckbox = form.querySelector('input[type="checkbox"][id$="-DELETE"]');
      const isMarked = form.classList.contains('opacity-50');
      if (isMarked) {
        if (deleteCheckbox) deleteCheckbox.checked = false;
        form.classList.remove('opacity-50');
        btn.textContent = 'Remove';
      } else {
        if (deleteCheckbox) deleteCheckbox.checked = true;
        form.classList.add('opacity-50');
        btn.textContent = 'Restore';
      }
    } else {
      form.remove();
      updateOrderInputs();
    }
  }

  // ── ENUM choices list ──────────────────────────────────────────────────────

  function initEnumChoicesList(questionForm) {
    const hidden = questionForm.querySelector('input[id$="-choice_labels"]');
    const list = questionForm.querySelector('.enum-choices-list');
    if (!hidden || !list) return;
    list.innerHTML = '';
    const choices = hidden.value ? hidden.value.split('\n').filter(s => s.trim()) : [];
    choices.forEach(label => _appendEnumChoiceItem(list, label));
  }

  function _appendEnumChoiceItem(list, label) {
    const item = document.createElement('div');
    item.className = 'input-group input-group-sm mb-1 enum-choice-item';
    const safe = (label || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    item.innerHTML =
      '<input type="text" class="form-control" placeholder="Choice label" value="' + safe + '">' +
      '<button type="button" class="btn btn-outline-secondary" onclick="moveEnumChoice(this,-1)" title="Move up"><i class="bi bi-arrow-up"></i></button>' +
      '<button type="button" class="btn btn-outline-secondary" onclick="moveEnumChoice(this,1)" title="Move down"><i class="bi bi-arrow-down"></i></button>' +
      '<button type="button" class="btn btn-outline-danger" onclick="removeEnumChoice(this)" title="Remove"><i class="bi bi-x"></i></button>';
    item.querySelector('input').addEventListener('input', () =>
      syncEnumChoices(list.closest('.question-form'))
    );
    list.appendChild(item);
    syncEnumChoices(list.closest('.question-form'));
  }

  function syncEnumChoices(questionForm) {
    const list = questionForm.querySelector('.enum-choices-list');
    const hidden = questionForm.querySelector('input[id$="-choice_labels"]');
    if (!list || !hidden) return;
    hidden.value = Array.from(list.querySelectorAll('.enum-choice-item input'))
      .map(el => el.value.trim()).filter(s => s).join('\n');
  }

  function addEnumChoice(btn) {
    const list = btn.closest('[data-field-conditional="ENUM"]').querySelector('.enum-choices-list');
    _appendEnumChoiceItem(list, '');
  }

  function removeEnumChoice(btn) {
    const item = btn.closest('.enum-choice-item');
    const qForm = item.closest('.question-form');
    item.remove();
    syncEnumChoices(qForm);
  }

  function moveEnumChoice(btn, direction) {
    const item = btn.closest('.enum-choice-item');
    const list = item.parentElement;
    const items = Array.from(list.querySelectorAll('.enum-choice-item'));
    const idx = items.indexOf(item);
    const target = items[idx + direction];
    if (!target) return;
    if (direction === -1) list.insertBefore(item, target);
    else list.insertBefore(target, item);
    syncEnumChoices(list.closest('.question-form'));
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  document.getElementById('question-formset').addEventListener('change', e => {
    if (e.target.tagName === 'SELECT' && e.target.id.includes('-type')) {
      updateConditionalFields(e.target);
    }
  });

  document.querySelectorAll('#question-formset select[id$="-type"]').forEach(sel => {
    updateConditionalFields(sel);
    initEnumChoicesList(sel.closest('.question-form'));
  });

  updateOrderInputs();

  document.getElementById('add-question').addEventListener('click', () => {
    const container = document.getElementById('question-formset');
    const tmpl = document.getElementById('empty-question-form').querySelector('.question-form');
    const clone = tmpl.cloneNode(true);
    clone.innerHTML = clone.innerHTML.replace(/__prefix__/g, formIdx);
    clone.querySelectorAll('input[type="text"], input[type="number"], textarea')
         .forEach(el => el.value = '');
    container.appendChild(clone);
    document.getElementById('id_questions-TOTAL_FORMS').value = ++formIdx;
    const newTypeSelect = clone.querySelector('select[id$="-type"]');
    if (newTypeSelect) updateConditionalFields(newTypeSelect);
    initEnumChoicesList(clone);
    updateOrderInputs();
  });
</script>
```

- [ ] **Step 4: Run all integration tests for chore management**

```bash
docker compose run --rm web pytest tests/integration/test_chore_management.py -v
```

Expected: all tests pass, including all 5 new tests from Tasks 1–4.

- [ ] **Step 5: Commit**

```bash
git add templates/chores/_chore_form_modal.html tests/integration/test_chore_management.py
git commit -m "feat: rewrite question form block — arrows, form-switch, conditional fields, ENUM list UI, remove/restore"
```

---

### Task 5: E2E tests for interactive question behavior

These tests verify JS-driven behavior that cannot be tested at the integration level.

**Files:**
- Modify: `tests/e2e/test_chore_management.py`

- [ ] **Step 1: Write four E2E tests**

Add to `tests/e2e/test_chore_management.py`:

```python
import re as _re


@pytest.mark.django_db(transaction=True)
def test_question_arrows_reorder_in_create_modal(page: Page, live_server):
    user, pw = create_test_user("e2e_arrows")
    login_browser(page, live_server.url, "e2e_arrows", pw)

    page.click("text=+ New Chore")
    page.wait_for_selector("#chore-form-modal.show")

    page.click("#add-question")
    page.fill(".question-form:nth-child(1) [name$='-text']", "Alpha")
    page.click("#add-question")
    page.fill(".question-form:nth-child(2) [name$='-text']", "Beta")

    # Move Alpha down
    page.locator(".question-form").nth(0).locator("button[title='Move down']").click()

    assert page.input_value(".question-form:nth-child(1) [name$='-text']") == "Beta"
    assert page.input_value(".question-form:nth-child(2) [name$='-text']") == "Alpha"


@pytest.mark.django_db(transaction=True)
def test_question_type_shows_conditional_fields(page: Page, live_server):
    user, pw = create_test_user("e2e_cond")
    login_browser(page, live_server.url, "e2e_cond", pw)

    page.click("text=+ New Chore")
    page.wait_for_selector("#chore-form-modal.show")
    page.click("#add-question")

    form = page.locator(".question-form").first
    type_select = form.locator("select[id$='-type']")

    type_select.select_option("TEXT")
    expect(form.locator("[data-field-conditional='TEXT']")).to_be_visible()
    expect(form.locator("[data-field-conditional='INTEGER']")).to_be_hidden()
    expect(form.locator("[data-field-conditional='ENUM']")).to_be_hidden()

    type_select.select_option("INTEGER")
    expect(form.locator("[data-field-conditional='INTEGER']")).to_be_visible()
    expect(form.locator("[data-field-conditional='TEXT']")).to_be_hidden()

    type_select.select_option("BOOLEAN")
    expect(form.locator("[data-field-conditional='TEXT']")).to_be_hidden()
    expect(form.locator("[data-field-conditional='INTEGER']")).to_be_hidden()
    expect(form.locator("[data-field-conditional='ENUM']")).to_be_hidden()

    type_select.select_option("ENUM")
    expect(form.locator("[data-field-conditional='ENUM']")).to_be_visible()
    expect(form.locator("[data-field-conditional='TEXT']")).to_be_hidden()


@pytest.mark.django_db(transaction=True)
def test_edit_mode_remove_fades_question_restore_unfades(page: Page, live_server):
    from chores.models import ChoreDefinition, ChoreInstance, Question
    user, pw = create_test_user("e2e_restore")
    rrule = "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(
        creator=user, name="Edit Restore Test", xp_size="M", recurrence=rrule,
    )
    ChoreInstance.objects.create(definition=defn, owner=user)
    Question.objects.create(definition=defn, text="Existing Q", type="TEXT", order=0)

    login_browser(page, live_server.url, "e2e_restore", pw)

    page.locator("[aria-label='Card options']").click()
    page.locator(".dropdown-item:has-text('Edit')").click()
    page.wait_for_selector("#chore-form-modal.show")

    question_form = page.locator(".question-form").first
    question_form.locator("button:has-text('Remove')").click()
    expect(question_form).to_have_class(_re.compile(r"\bopacity-50\b"))
    expect(question_form.locator("button:has-text('Restore')")).to_be_visible()

    question_form.locator("button:has-text('Restore')").click()
    expect(question_form).not_to_have_class(_re.compile(r"\bopacity-50\b"))
    expect(question_form.locator("button:has-text('Remove')")).to_be_visible()


@pytest.mark.django_db(transaction=True)
def test_enum_choices_list_add_remove_reorder(page: Page, live_server):
    user, pw = create_test_user("e2e_enum")
    login_browser(page, live_server.url, "e2e_enum", pw)

    page.click("text=+ New Chore")
    page.wait_for_selector("#chore-form-modal.show")
    page.click("#add-question")

    form = page.locator(".question-form").first
    form.locator("select[id$='-type']").select_option("ENUM")
    page.wait_for_selector(".enum-choices-list")

    form.locator("button:has-text('+ Add Choice')").click()
    form.locator(".enum-choice-item input").nth(0).fill("First")
    form.locator("button:has-text('+ Add Choice')").click()
    form.locator(".enum-choice-item input").nth(1).fill("Second")

    # Move First down
    form.locator(".enum-choice-item").nth(0).locator("button[title='Move down']").click()
    assert form.locator(".enum-choice-item input").nth(0).input_value() == "Second"
    assert form.locator(".enum-choice-item input").nth(1).input_value() == "First"

    # Remove First (now second position)
    form.locator(".enum-choice-item").nth(1).locator("button[title='Remove']").click()
    expect(form.locator(".enum-choice-item")).to_have_count(1)
    assert form.locator(".enum-choice-item input").first.input_value() == "Second"
```

- [ ] **Step 2: Run the E2E tests**

```bash
docker compose run --rm web pytest tests/e2e/test_chore_management.py -v
```

Expected: the 2 pre-existing tests plus all 4 new tests pass.

- [ ] **Step 3: Run the full test suite to confirm no regressions**

```bash
docker compose run --rm web pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/test_chore_management.py
git commit -m "test: E2E tests for question arrows, conditional fields, remove/restore, ENUM list UI"
```

---

## Self-Review

**Spec coverage:**
1. Description on cards with ellipsis — Task 1 ✓
2. Responsive scheduling grid (1/2/4 cols) — Task 3 ✓
3. Question order by DOM position + arrows — Tasks 2, 4, 5 ✓
4. Min/max on same line — Task 4 (`row g-2` inside `data-field-conditional="INTEGER"`) ✓
5. Conditional fields by type — Tasks 4, 5 ✓
6. form-switch for required — Tasks 2, 4 ✓
7. Field order: text, required, type, remainder — Task 4 ✓
8. Remove/Restore vs disappear — Tasks 4, 5 ✓
9. ENUM choices dynamic list (add/remove/reorder) — Tasks 4, 5 ✓

**Key implementation notes:**
- `{{ qform.choice_labels.as_hidden }}` renders the field as `<input type="hidden">` preserving the value for existing ENUM questions; the JS `initEnumChoicesList` reads it on load and populates the visual list
- `syncEnumChoices` writes back to the hidden input on every list mutation, so the correct value is always in the form data when HTMX submits
- After JS clones the empty_form, `initEnumChoicesList(clone)` is called — the hidden input value is empty, so the list starts empty (correct for new questions)
- `moveQuestion` skips `opacity-50` forms via `:not(.opacity-50)` so soft-deleted questions are immovable
- Bootstrap Icons (`bi-arrow-up/down`, `bi-x`) are already loaded in `base.html`
- `qform.required.value` for the unbound empty_form returns `initial=True` (set in `__init__`); `cloneNode(true)` preserves the `checked` attribute; the JS reset loop skips checkboxes
