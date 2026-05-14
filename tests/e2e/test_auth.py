import pytest
from playwright.sync_api import Page, expect
from .conftest import create_test_user, login_browser


@pytest.mark.django_db(transaction=True)
def test_login_wrong_credentials_shows_error(page: Page, live_server):
    """Regression: wrong credentials must render an inline error alert on the login page."""
    create_test_user("e2e_auth1", "correct99!")
    page.goto(f"{live_server.url}/accounts/login/")
    page.fill("[name=username]", "e2e_auth1")
    page.fill("[name=password]", "wrongpass")
    page.click("[type=submit]")
    expect(page.locator(".alert-danger")).to_be_visible()
    assert "/accounts/login/" in page.url


@pytest.mark.django_db(transaction=True)
def test_chore_form_modal_body_is_scrollable(page: Page, live_server):
    """Regression: chore-form modal body must have overflow-y:auto so it scrolls
    rather than extending past the bottom of the viewport."""
    user, pw = create_test_user("e2e_scroll1")
    login_browser(page, live_server.url, "e2e_scroll1", pw)
    page.click("text=+ New Chore")
    page.wait_for_selector("#chore-form-modal.show")
    overflow_y = page.locator("#chore-form-modal .modal-body").evaluate(
        "el => getComputedStyle(el).overflowY"
    )
    assert overflow_y in ("auto", "scroll")


@pytest.mark.django_db(transaction=True)
def test_question_modal_body_is_scrollable(page: Page, live_server):
    """Regression: question modal body must have overflow-y:auto."""
    from chores.models import ChoreDefinition, ChoreInstance, Question
    from django.utils import timezone

    user, pw = create_test_user("e2e_scroll2")
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Q Chore", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)
    Question.objects.create(definition=defn, order=1, text="How was it?", required=True, type="TEXT")

    login_browser(page, live_server.url, "e2e_scroll2", pw)
    page.click("button:has-text('Complete')")
    page.wait_for_selector("#question-modal.show")
    overflow_y = page.locator("#question-modal .modal-body").evaluate(
        "el => getComputedStyle(el).overflowY"
    )
    assert overflow_y in ("auto", "scroll")
