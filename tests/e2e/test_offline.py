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
        "() => caches.open('tasks-harmony-v2').then(c => c.match('/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)
    page.reload(wait_until="domcontentloaded")
    expect(page.locator("text=Offline Test")).to_be_visible()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_question_complete_button_disabled_when_offline(page: Page, live_server, context):
    """Complete button for chores with questions is still disabled offline."""
    user, pw = create_test_user("e2e_offline2")
    from django.utils import timezone
    from chores.models import Question
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Question Chore", xp_size="S", recurrence=rrule)
    Question.objects.create(definition=defn, text="How was it?", type="TEXT", order=1)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_offline2", pw)
    page.wait_for_load_state("networkidle")

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    expect(page.locator("button[data-offline-disable]:has-text('Complete')")).to_be_disabled()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_simple_complete_button_not_disabled_when_offline(page: Page, live_server, context):
    """Simple (no-questions) Complete button is NOT disabled offline — it's intercepted."""
    user, pw = create_test_user("e2e_offline3")
    from django.utils import timezone
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Simple Chore", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_offline3", pw)
    page.wait_for_load_state("networkidle")

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    complete_btn = page.locator("form[data-offline-intercept] button:has-text('Complete')")
    expect(complete_btn).to_be_enabled()
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


@pytest.mark.django_db(transaction=True)
def test_card_shows_syncing_on_mark_pending_event(page: Page, live_server, context):
    """Dispatching mark-pending on the card div switches it to Syncing... state."""
    user, pw = create_test_user("e2e_alpine1")
    from django.utils import timezone
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Alpine Chore", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_alpine1", pw)
    page.wait_for_load_state("networkidle")

    instance = ChoreInstance.objects.get(owner=user)
    card_id = f"chore-{instance.pk}"

    # Before event: form visible, Syncing button hidden
    expect(page.locator(f"#{card_id} form[data-offline-intercept]")).to_be_visible()
    expect(page.locator(f"#{card_id} button:has-text('Syncing')")).to_be_hidden()

    # Dispatch mark-pending directly on the card div
    page.evaluate(f"""
        document.getElementById('{card_id}').dispatchEvent(new CustomEvent('mark-pending'))
    """)

    # After event: Syncing visible, form hidden
    expect(page.locator(f"#{card_id} button:has-text('Syncing')")).to_be_visible()
    expect(page.locator(f"#{card_id} form[data-offline-intercept]")).to_be_hidden()


@pytest.mark.django_db(transaction=True)
def test_offline_simple_complete_shows_syncing(page: Page, live_server, context):
    """Clicking Complete while offline queues to IDB and shows Syncing... state."""
    user, pw = create_test_user("e2e_sync1")
    from django.utils import timezone
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Sync Chore", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_sync1", pw)
    page.wait_for_load_state("networkidle")

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")

    page.locator("button:has-text('Complete')").click()

    instance = ChoreInstance.objects.get(owner=user)
    card = page.locator(f"#chore-{instance.pk}")
    expect(card.locator("button:has-text('Syncing')")).to_be_visible()
    expect(card.locator("form[data-offline-intercept]")).to_be_hidden()

    # IDB has the queued entry
    pending = page.evaluate("window.PendingCompletions.getPending()")
    assert len(pending) == 1
    assert pending[0]["choreId"] == instance.pk

    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_offline_complete_syncs_on_reconnect(page: Page, live_server, context):
    """Coming back online syncs IDB entries and reloads the page showing Completed."""
    user, pw = create_test_user("e2e_sync2")
    from django.utils import timezone
    from chores.models import ChoreCompletion
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Reconnect Chore", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_sync2", pw)
    page.wait_for_load_state("networkidle")

    # Go offline and complete the chore
    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    page.locator("button:has-text('Complete')").click()

    instance = ChoreInstance.objects.get(owner=user)
    expect(page.locator(f"#chore-{instance.pk} button:has-text('Syncing')")).to_be_visible()

    # Come back online — page should reload and show Completed
    context.set_offline(False)
    with page.expect_navigation(timeout=8000):
        page.evaluate("window.dispatchEvent(new Event('online'))")
    page.wait_for_load_state("domcontentloaded")

    # Server recorded the completion
    assert ChoreCompletion.objects.filter(instance=instance).exists()

    # Card shows Completed badge
    expect(page.locator(f"#chore-{instance.pk} .badge:has-text('Completed')")).to_be_visible()

    # IDB is empty
    pending = page.evaluate("window.PendingCompletions.getPending()")
    assert pending == []


@pytest.mark.django_db(transaction=True)
def test_idb_roundtrip_now_passes(page: Page, live_server, context):
    """IDB roundtrip test now works because pending-completions.js is loaded."""
    user, pw = create_test_user("e2e_idb2")
    login_browser(page, live_server.url, "e2e_idb2", pw)
    page.wait_for_load_state("networkidle")

    result = page.evaluate("""async () => {
        await window.PendingCompletions.queueCompletion(99, '2026-06-01T00:00:00Z', 'tok2');
        const before = await window.PendingCompletions.getPending();
        await window.PendingCompletions.removePending(99);
        const after = await window.PendingCompletions.getPending();
        return { before, after };
    }""")
    assert result["before"] == [{"choreId": 99, "completedAt": "2026-06-01T00:00:00Z", "csrfToken": "tok2"}]
    assert result["after"] == []


@pytest.mark.django_db(transaction=True)
def test_offline_pending_state_restored_after_reload(page: Page, live_server, context):
    """After offline complete + page reload (from SW cache), card still shows Syncing..."""
    user, pw = create_test_user("e2e_sync3")
    from django.utils import timezone
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(creator=user, name="Persist Chore", xp_size="S", recurrence=rrule)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_sync3", pw)
    # Navigate once to warm the SW cache
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=10000)
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v2').then(c => c.match('/').then(r => !!r))",
        timeout=10000,
    )

    instance = ChoreInstance.objects.get(owner=user)

    # Go offline and complete the chore
    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    page.locator("button:has-text('Complete')").click()
    expect(page.locator(f"#chore-{instance.pk} button:has-text('Syncing')")).to_be_visible()

    # Reload while offline (served from SW cache)
    page.reload(wait_until="domcontentloaded")

    # Syncing... state should be restored from IDB on DOMContentLoaded
    page.wait_for_timeout(1000)
    expect(page.locator(f"#chore-{instance.pk} button:has-text('Syncing')")).to_be_visible()
    expect(page.locator(f"#chore-{instance.pk} form[data-offline-intercept]")).to_be_hidden()

    context.set_offline(False)
