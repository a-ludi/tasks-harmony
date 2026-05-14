import datetime
import pytest
from playwright.sync_api import Page, expect
from .conftest import create_test_user, login_browser
from chores.models import ChoreDefinition, ChoreInstance


@pytest.mark.django_db(transaction=True)
def test_all_four_card_states_render(page: Page, live_server):
    user, pw = create_test_user("e2e_states")
    from django.utils import timezone
    now = timezone.now()

    def make(name, dtstart, last_completed=None):
        rrule = f"DTSTART:{dtstart}\nRRULE:FREQ=WEEKLY"
        defn = ChoreDefinition.objects.create(creator=user, name=name, xp_size="S", recurrence=rrule)
        inst = ChoreInstance.objects.create(definition=defn, owner=user, last_completed_at=last_completed)
        return inst

    make("Due Chore", now.strftime("%Y%m%dT%H%M%SZ"))
    # dtstart 8 days ago, weekly → last occurrence 1 day ago; completed 12h ago → Completed
    eight_days = now - datetime.timedelta(days=8)
    make("Completed Chore", eight_days.strftime("%Y%m%dT%H%M%SZ"), last_completed=now - datetime.timedelta(hours=12))
    next_week = now + datetime.timedelta(days=7)
    make("Upcoming Chore", next_week.strftime("%Y%m%dT%H%M%SZ"))
    two_weeks = now - datetime.timedelta(days=14)
    make("Overdue Chore", two_weeks.strftime("%Y%m%dT%H%M%SZ"))

    login_browser(page, live_server.url, "e2e_states", pw)
    expect(page.get_by_text("Due Chore", exact=True)).to_be_visible()
    expect(page.get_by_text("Completed Chore", exact=True)).to_be_visible()
    expect(page.get_by_text("Upcoming Chore", exact=True)).to_be_visible()
    expect(page.get_by_text("Overdue Chore", exact=True)).to_be_visible()

    expect(page.locator(".badge").get_by_text("Overdue", exact=True)).to_be_visible()
    expect(page.locator(".badge").get_by_text("Due", exact=True)).to_be_visible()
    expect(page.locator(".badge").get_by_text("Completed", exact=True)).to_be_visible()
    expect(page.locator(".badge").get_by_text("Upcoming", exact=True)).to_be_visible()


@pytest.mark.django_db(transaction=True)
def test_complete_no_questions_no_page_reload(page: Page, live_server):
    user, pw = create_test_user("e2e_complete")
    from django.utils import timezone
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Quick Task", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    navigated = []
    page.on("framenavigated", lambda _: navigated.append(1))
    login_browser(page, live_server.url, "e2e_complete", pw)
    navigated.clear()

    page.click("button:has-text('Complete')")
    page.wait_for_selector(".badge:has-text('Completed')")
    assert len(navigated) == 0, "Full page reload occurred"


@pytest.mark.django_db(transaction=True)
def test_complete_with_questions_modal_opens_and_card_updates(page: Page, live_server):
    user, pw = create_test_user("e2e_modal")
    from django.utils import timezone
    from chores.models import Question
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Modal Task", xp_size="M", recurrence=rrule)
    inst = ChoreInstance.objects.create(definition=defn, owner=user)
    Question.objects.create(definition=defn, order=1, text="Rate it (1-5)?", required=True, type="INTEGER", min_value=1, max_value=5)

    login_browser(page, live_server.url, "e2e_modal", pw)
    page.click("button:has-text('Complete')")
    expect(page.locator("#question-modal")).to_be_visible()
    page.fill("[name*='question_']", "3")
    page.click(".modal-footer button[type=submit]")
    page.wait_for_selector(".badge:has-text('Completed')")
    expect(page.locator("#question-modal")).not_to_be_visible()
