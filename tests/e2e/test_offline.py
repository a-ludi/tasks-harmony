import pytest
from playwright.sync_api import Page, expect
from .conftest import create_test_user, login_browser
from chores.models import ChoreDefinition, ChoreInstance


@pytest.mark.django_db(transaction=True)
def test_offline_dashboard_served_from_cache(page: Page, live_server, context):
    user, pw = create_test_user("e2e_offline1")
    rrule = "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Offline Test", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_offline1", pw)
    # Wait for SW to control the page, then navigate again so the SW (now active)
    # intercepts and caches the dashboard response
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=10000)
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    # Confirm the dashboard URL is in the SW cache before going offline
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v1').then(c => c.match('/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)
    page.reload(wait_until="domcontentloaded")
    expect(page.locator("text=Offline Test")).to_be_visible()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_complete_button_disabled_when_offline(page: Page, live_server, context):
    user, pw = create_test_user("e2e_offline2")
    from django.utils import timezone
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Offline Btn", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_offline2", pw)
    page.wait_for_load_state("networkidle")

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    complete_btn = page.locator("button:has-text('Complete')")
    expect(complete_btn).to_be_disabled()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_pending_completions_idb_roundtrip(page: Page, live_server, context):
    """Verify IndexedDB module exposes queueCompletion / getPending / removePending."""
    user, pw = create_test_user("e2e_idb1")
    login_browser(page, live_server.url, "e2e_idb1", pw)
    page.wait_for_load_state("networkidle")

    result = page.evaluate("""async () => {
        await window.PendingCompletions.queueCompletion(42, '2026-01-01T00:00:00Z', 'tok');
        const before = await window.PendingCompletions.getPending();
        await window.PendingCompletions.removePending(42);
        const after = await window.PendingCompletions.getPending();
        return { before, after };
    }""")
    assert result["before"] == [{"choreId": 42, "completedAt": "2026-01-01T00:00:00Z", "csrfToken": "tok"}]
    assert result["after"] == []
