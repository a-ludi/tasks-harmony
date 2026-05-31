import re as _re

import pytest
from playwright.sync_api import Page, expect
from .conftest import create_test_user, login_browser


@pytest.mark.django_db(transaction=True)
def test_full_create_flow_chore_appears_on_dashboard(page: Page, live_server):
    user, pw = create_test_user("e2e_create")
    login_browser(page, live_server.url, "e2e_create", pw)
    page.click("text=+ New Chore")
    page.wait_for_selector("#chore-form-modal.show [name=name]")
    page.fill("[name=name]", "New E2E Chore")
    page.select_option("[name=xp_size]", "L")
    page.select_option("[name=recurrence_freq]", "DAILY")
    page.fill("[name=recurrence_dtstart]", "2026-01-01")
    page.click("button:has-text('Create')")
    page.wait_for_url(f"{live_server.url}/")
    expect(page.locator("text=New E2E Chore")).to_be_visible()


@pytest.mark.django_db(transaction=True)
def test_edit_chore_updates_card_on_dashboard(page: Page, live_server):
    from chores.models import ChoreDefinition, ChoreInstance
    user, pw = create_test_user("e2e_edit")
    rrule = "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Old Name", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_edit", pw)
    page.goto(f"{live_server.url}/chores/{defn.pk}/edit/")
    page.fill("[name=name]", "Updated Name")
    page.select_option("[name=xp_size]", "XL")
    page.click("button:has-text('Edit')")
    page.wait_for_url(f"{live_server.url}/")
    expect(page.locator("text=Updated Name")).to_be_visible()


@pytest.mark.django_db(transaction=True)
def test_question_arrows_reorder_in_create_modal(page: Page, live_server):
    user, pw = create_test_user("e2e_arrows")
    login_browser(page, live_server.url, "e2e_arrows", pw)

    page.click("text=+ New Chore")
    page.wait_for_selector("#chore-form-modal.show")

    page.click("#add-question")
    page.locator(".question-form").nth(0).locator("[name$='-text']").fill("Alpha")
    page.click("#add-question")
    page.locator(".question-form").nth(1).locator("[name$='-text']").fill("Beta")

    # Move Alpha down
    page.locator(".question-form").nth(0).locator("button[title='Move down']").click()

    assert page.locator(".question-form").nth(0).locator("[name$='-text']").input_value() == "Beta"
    assert page.locator(".question-form").nth(1).locator("[name$='-text']").input_value() == "Alpha"


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
    expect(form.locator("[data-field-conditional='ENUM']")).to_be_hidden()

    type_select.select_option("BOOLEAN")
    expect(form.locator("[data-field-conditional='TEXT']")).to_be_hidden()
    expect(form.locator("[data-field-conditional='INTEGER']")).to_be_hidden()
    expect(form.locator("[data-field-conditional='ENUM']")).to_be_hidden()

    type_select.select_option("ENUM")
    expect(form.locator("[data-field-conditional='ENUM']")).to_be_visible()
    expect(form.locator("[data-field-conditional='TEXT']")).to_be_hidden()
    expect(form.locator("[data-field-conditional='INTEGER']")).to_be_hidden()


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

    page.wait_for_selector("[aria-label='Card options']")
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
    expect(form.locator("[data-field-conditional='ENUM']")).to_be_visible()

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


@pytest.mark.django_db(transaction=True)
def test_remove_new_question_then_create_succeeds(page: Page, live_server):
    """Adding then removing a question must not leave a ghost form that fails validation."""
    from chores.models import ChoreDefinition, Question
    user, pw = create_test_user("e2e_rmq")
    login_browser(page, live_server.url, "e2e_rmq", pw)

    page.click("text=+ New Chore")
    page.wait_for_selector("#chore-form-modal.show")
    page.fill("[name=name]", "No Questions Chore")

    page.click("#add-question")
    page.locator(".question-form").first.locator("[name$='-text']").fill("Temp question")

    page.locator(".question-form").first.locator("button:has-text('Remove')").click()
    expect(page.locator("#question-formset .question-form")).to_have_count(0)

    page.click("button:has-text('Create')")
    page.wait_for_url(f"{live_server.url}/", timeout=5000)
    expect(page.locator("text=No Questions Chore")).to_be_visible()
    # Modal should be gone — chore was created without questions
    expect(page.locator("#chore-form-modal.show")).to_have_count(0)
