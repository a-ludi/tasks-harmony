import pytest
from playwright.sync_api import Page, expect
from .conftest import create_test_user, login_browser


@pytest.mark.django_db(transaction=True)
def test_full_create_flow_chore_appears_on_dashboard(page: Page, live_server):
    user, pw = create_test_user("e2e_create")
    login_browser(page, live_server.url, "e2e_create", pw)
    page.click("text=+ New Chore")
    page.fill("[name=name]", "New E2E Chore")
    page.select_option("[name=xp_size]", "L")
    page.fill("[name=recurrence]", "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY")
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
