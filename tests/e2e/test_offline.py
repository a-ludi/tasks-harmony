import pytest
from chores.models import ChoreDefinition, ChoreInstance
from playwright.sync_api import Page, expect

from .conftest import create_test_user, login_browser


@pytest.mark.django_db(transaction=True)
def test_new_chore_and_edit_disabled_when_offline(page: Page, live_server, context):
    """+ New Chore and Edit dropdown item are disabled when offline."""
    user, pw = create_test_user("e2e_offl_edit")
    from django.utils import timezone

    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(
        creator=user, name="Edit Chore", xp_size="S", recurrence=rrule
    )
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_offl_edit", pw)
    page.wait_for_load_state("networkidle")

    context.set_offline(True)
    # page.evaluate("window.dispatchEvent(new Event('offline'))")

    expect(
        page.locator("button[data-offline-disable]:has-text('+ New Chore')")
    ).to_be_disabled()

    # Edit button disabled (checked via JS since it's inside a hidden dropdown)
    edit_disabled = page.evaluate(
        """
        () => {
            const btns = Array.from(document.querySelectorAll('[data-offline-disable]'));
            const edit = btns.find(b => b.textContent.trim() === 'Edit');
            return edit ? edit.disabled : null;
        }
    """
    )
    assert edit_disabled is True

    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_offline_banner_shown_when_offline(page: Page, live_server, context):
    """An offline banner appears when going offline and disappears when back online."""
    user, pw = create_test_user("e2e_banner1")
    login_browser(page, live_server.url, "e2e_banner1", pw)
    page.wait_for_load_state("networkidle")

    expect(page.locator("#offline-banner")).to_be_hidden()

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    expect(page.locator("#offline-banner")).to_be_visible()

    context.set_offline(False)
    page.evaluate("window.dispatchEvent(new Event('online'))")
    expect(page.locator("#offline-banner")).to_be_hidden()


@pytest.mark.django_db(transaction=True)
def test_offline_dashboard_served_from_cache(page: Page, live_server, context):
    user, pw = create_test_user("e2e_offline1")
    rrule = "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(
        creator=user, name="Offline Test", xp_size="S", recurrence=rrule
    )
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_offline1", pw)
    # Wait for SW to control the page, then navigate again so the SW (now active)
    # intercepts and caches the dashboard response
    page.wait_for_function(
        "() => navigator.serviceWorker.controller !== null", timeout=10000
    )
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    # Confirm the dashboard URL is in the SW cache before going offline
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v5').then(c => c.match('/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)
    page.reload(wait_until="domcontentloaded")
    expect(page.locator("text=Offline Test")).to_be_visible()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_question_complete_button_enabled_when_offline(
    page: Page, live_server, context
):
    """Complete button for question chores is NOT disabled offline — it opens a cached modal."""
    user, pw = create_test_user("e2e_offline2")
    from django.utils import timezone
    from chores.models import Question

    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(
        creator=user, name="Question Chore", xp_size="S", recurrence=rrule
    )
    Question.objects.create(definition=defn, text="How was it?", type="TEXT", order=1)
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_offline2", pw)
    page.wait_for_load_state("networkidle")

    context.set_offline(True)
    # No data-offline-disable on question Complete button — it should stay enabled
    expect(
        page.locator("button:has-text('Complete')")
    ).to_be_enabled()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_simple_complete_button_not_disabled_when_offline(
    page: Page, live_server, context
):
    """Simple (no-questions) Complete button is NOT disabled offline — it's intercepted."""
    user, pw = create_test_user("e2e_offline3")
    from django.utils import timezone

    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(
        creator=user, name="Simple Chore", xp_size="S", recurrence=rrule
    )
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_offline3", pw)
    page.wait_for_load_state("networkidle")

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    complete_btn = page.locator(
        "form[data-offline-intercept] button:has-text('Complete')"
    )
    expect(complete_btn).to_be_enabled()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_pending_completions_idb_roundtrip(page: Page, live_server, context):
    """Verify IndexedDB module exposes queueCompletion / getPending / removePending."""
    user, pw = create_test_user("e2e_idb1")
    login_browser(page, live_server.url, "e2e_idb1", pw)
    page.wait_for_load_state("networkidle")

    result = page.evaluate(
        """async () => {
        await window.PendingCompletions.queueCompletion(42, '2026-01-01T00:00:00Z', 'tok');
        const before = await window.PendingCompletions.getPending();
        await window.PendingCompletions.removePending(42);
        const after = await window.PendingCompletions.getPending();
        return { before, after };
    }"""
    )
    assert result["before"] == [
        {"choreId": 42, "completedAt": "2026-01-01T00:00:00Z", "csrfToken": "tok"}
    ]
    assert result["after"] == []


@pytest.mark.django_db(transaction=True)
def test_offline_intercept_uses_banner_state(page: Page, live_server, context):
    """Offline intercept fires when banner is visible, even if navigator.onLine is True."""
    from django.utils import timezone
    user, pw = create_test_user("e2e_banner_intercept1")
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(
        creator=user, name="BannerChore", xp_size="S", recurrence=rrule
    )
    ChoreInstance.objects.create(definition=defn, owner=user)
    login_browser(page, live_server.url, "e2e_banner_intercept1", pw)
    page.wait_for_load_state("networkidle")

    # Simulate: navigator.onLine is True but banner is shown (probe detected offline)
    page.evaluate("document.getElementById('offline-banner').style.display = '';")

    # navigator.onLine is still True; click Complete
    page.locator("form[data-offline-intercept] button:has-text('Complete')").click()

    # IDB should have the pending entry (intercept fired based on banner)
    pending_count = page.evaluate(
        "window.PendingCompletions.getPending().then(p => p.length)"
    )
    assert pending_count == 1

    # Cleanup IDB
    chore_id = page.evaluate(
        "window.PendingCompletions.getPending().then(p => p[0]?.choreId)"
    )
    page.evaluate(f"window.PendingCompletions.removePending({chore_id})")


@pytest.mark.django_db(transaction=True)
def test_pending_completions_idb_stores_answers(page: Page, live_server, context):
    """queueCompletion stores optional answers dict and getPending returns it."""
    user, pw = create_test_user("e2e_idb_ans1")
    login_browser(page, live_server.url, "e2e_idb_ans1", pw)
    page.wait_for_load_state("networkidle")

    result = page.evaluate("""
        async () => {
            await window.PendingCompletions.queueCompletion(
                42, '2026-01-01T00:00:00.000Z', 'tok', { question_7: 'great' }
            );
            const pending = await window.PendingCompletions.getPending();
            const entry = pending.find(p => p.choreId === 42);
            await window.PendingCompletions.removePending(42);
            return entry ? entry.answers : null;
        }
    """)
    assert result == {"question_7": "great"}


@pytest.mark.django_db(transaction=True)
def test_card_shows_syncing_on_mark_pending_event(page: Page, live_server, context):
    """Dispatching mark-pending on the card div switches it to Syncing... state."""
    user, pw = create_test_user("e2e_alpine1")
    from django.utils import timezone

    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(
        creator=user, name="Alpine Chore", xp_size="S", recurrence=rrule
    )
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_alpine1", pw)
    page.wait_for_load_state("networkidle")

    instance = ChoreInstance.objects.get(owner=user)
    card_id = f"chore-{instance.pk}"

    # Before event: form visible, Syncing button hidden
    expect(page.locator(f"#{card_id} form[data-offline-intercept]")).to_be_visible()
    expect(page.locator(f"#{card_id} button:has-text('Syncing')")).to_be_hidden()

    # Dispatch mark-pending directly on the card div
    page.evaluate(
        f"""
        document.getElementById('{card_id}').dispatchEvent(new CustomEvent('mark-pending'))
    """
    )

    # After event: Syncing visible, form hidden
    expect(page.locator(f"#{card_id} button:has-text('Syncing')")).to_be_visible()
    expect(page.locator(f"#{card_id} form[data-offline-intercept]")).to_be_hidden()


@pytest.mark.django_db(transaction=True)
def test_offline_simple_complete_shows_syncing(page: Page, live_server, context):
    """Clicking Complete while offline queues to IDB and shows Syncing... state."""
    user, pw = create_test_user("e2e_sync1")
    from django.utils import timezone

    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(
        creator=user, name="Sync Chore", xp_size="S", recurrence=rrule
    )
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
    defn = ChoreDefinition.objects.create(
        creator=user, name="Reconnect Chore", xp_size="S", recurrence=rrule
    )
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_sync2", pw)
    page.wait_for_load_state("networkidle")

    # Go offline and complete the chore
    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    page.locator("button:has-text('Complete')").click()

    instance = ChoreInstance.objects.get(owner=user)
    expect(
        page.locator(f"#chore-{instance.pk} button:has-text('Syncing')")
    ).to_be_visible()

    # Come back online — page should reload and show Completed
    context.set_offline(False)
    with page.expect_navigation(timeout=8000):
        page.evaluate("window.dispatchEvent(new Event('online'))")
    page.wait_for_load_state("domcontentloaded")

    # Server recorded the completion
    assert ChoreCompletion.objects.filter(instance=instance).exists()

    # Card shows Completed badge
    expect(
        page.locator(f"#chore-{instance.pk} .badge:has-text('Completed')")
    ).to_be_visible()

    # IDB is empty
    pending = page.evaluate("window.PendingCompletions.getPending()")
    assert pending == []


@pytest.mark.django_db(transaction=True)
def test_idb_roundtrip_now_passes(page: Page, live_server, context):
    """IDB roundtrip test now works because pending-completions.js is loaded."""
    user, pw = create_test_user("e2e_idb2")
    login_browser(page, live_server.url, "e2e_idb2", pw)
    page.wait_for_load_state("networkidle")

    result = page.evaluate(
        """async () => {
        await window.PendingCompletions.queueCompletion(99, '2026-06-01T00:00:00Z', 'tok2');
        const before = await window.PendingCompletions.getPending();
        await window.PendingCompletions.removePending(99);
        const after = await window.PendingCompletions.getPending();
        return { before, after };
    }"""
    )
    assert result["before"] == [
        {"choreId": 99, "completedAt": "2026-06-01T00:00:00Z", "csrfToken": "tok2"}
    ]
    assert result["after"] == []


@pytest.mark.django_db(transaction=True)
def test_offline_pending_state_restored_after_reload(page: Page, live_server, context):
    """After offline complete + page reload (from SW cache), card still shows Syncing..."""
    user, pw = create_test_user("e2e_sync3")
    from django.utils import timezone

    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(
        creator=user, name="Persist Chore", xp_size="S", recurrence=rrule
    )
    ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_sync3", pw)
    # Navigate once to warm the SW cache
    page.wait_for_function(
        "() => navigator.serviceWorker.controller !== null", timeout=10000
    )
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v5').then(c => c.match('/').then(r => !!r))",
        timeout=10000,
    )

    instance = ChoreInstance.objects.get(owner=user)

    # Go offline and complete the chore
    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    page.locator("button:has-text('Complete')").click()
    expect(
        page.locator(f"#chore-{instance.pk} button:has-text('Syncing')")
    ).to_be_visible()

    # Reload while offline (served from SW cache)
    page.reload(wait_until="domcontentloaded")

    # Syncing... state should be restored from IDB on DOMContentLoaded
    page.wait_for_timeout(1000)
    expect(
        page.locator(f"#chore-{instance.pk} button:has-text('Syncing')")
    ).to_be_visible()
    expect(
        page.locator(f"#chore-{instance.pk} form[data-offline-intercept]")
    ).to_be_hidden()

    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_login_page_in_app_shell_cache(page: Page, live_server, context):
    """Login page is pre-cached in APP_SHELL so offline logout redirect works."""
    user, pw = create_test_user("e2e_shell1")
    login_browser(page, live_server.url, "e2e_shell1", pw)
    page.wait_for_function(
        "() => navigator.serviceWorker.controller !== null", timeout=10000
    )
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v5').then(c => c.match('/accounts/login/').then(r => !!r))",
        timeout=10000,
    )


@pytest.mark.django_db(transaction=True)
def test_profile_cached_after_dashboard_load(page: Page, live_server, context):
    """Profile page is cached by the SW background fetch on dashboard load."""
    user, pw = create_test_user("e2e_prof_warm1")
    login_browser(page, live_server.url, "e2e_prof_warm1", pw)
    page.wait_for_function(
        "() => navigator.serviceWorker.controller !== null", timeout=10000
    )
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v5').then(c => c.match('/accounts/profile/').then(r => !!r))",
        timeout=10000,
    )


@pytest.mark.django_db(transaction=True)
def test_profile_inputs_disabled_when_loaded_offline(page: Page, live_server, context):
    """Profile form inputs/buttons are disabled when page is loaded while offline."""
    user, pw = create_test_user("e2e_prof_ro1")
    login_browser(page, live_server.url, "e2e_prof_ro1", pw)
    page.wait_for_function(
        "() => navigator.serviceWorker.controller !== null", timeout=10000
    )
    page.goto(f"{live_server.url}/accounts/profile/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v5').then(c => c.match('/accounts/profile/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)
    page.reload(wait_until="domcontentloaded")
    expect(page.locator("#profile-forms button[type=submit]").first).to_be_disabled()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_profile_inputs_disabled_on_going_offline(page: Page, live_server, context):
    """Profile form inputs/buttons are disabled when going offline while on the page."""
    user, pw = create_test_user("e2e_prof_ro2")
    login_browser(page, live_server.url, "e2e_prof_ro2", pw)
    page.goto(f"{live_server.url}/accounts/profile/", wait_until="networkidle")

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    expect(page.locator("#profile-forms button[type=submit]").first).to_be_disabled()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_profile_forms_disabled_on_bfcache_restore_offline(
    page: Page, live_server, context
):
    """Profile forms are disabled when profile is restored from bfcache while offline.

    profile.html hooks 'offline' and DOMContentLoaded to disable forms, but neither fires
    on a bfcache restore. A pageshow(persisted=true) listener is required.
    """
    user, pw = create_test_user("e2e_prof_bfc1")
    login_browser(page, live_server.url, "e2e_prof_bfc1", pw)
    page.goto(f"{live_server.url}/accounts/profile/", wait_until="networkidle")

    # Forms enabled while online
    expect(page.locator("#profile-forms button[type=submit]").first).to_be_enabled()

    # Go offline — Playwright dispatches offline event; forms are disabled by the offline listener
    context.set_offline(True)
    expect(page.locator("#profile-forms button[type=submit]").first).to_be_disabled()

    # Simulate bfcache-frozen state: offline event fired on a different page while profile was
    # cached. Profile's state at cache-time was "online" (forms enabled).
    page.evaluate(
        """
        document.querySelectorAll('#profile-forms input, #profile-forms select, #profile-forms textarea, #profile-forms button[type=submit]').forEach(function(el) {
            el.disabled = false;
        });
    """
    )
    expect(page.locator("#profile-forms button[type=submit]").first).to_be_enabled()

    # Simulate bfcache restore — pageshow listener must re-disable forms
    page.evaluate(
        "window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true, bubbles: false}))"
    )
    expect(page.locator("#profile-forms button[type=submit]").first).to_be_disabled()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_profile_reloads_on_reconnect(page: Page, live_server, context):
    """Going back online on the profile page triggers a reload (refreshes stale CSRF)."""
    user, pw = create_test_user("e2e_prof_ro3")
    login_browser(page, live_server.url, "e2e_prof_ro3", pw)
    page.wait_for_function(
        "() => navigator.serviceWorker.controller !== null", timeout=10000
    )
    page.goto(f"{live_server.url}/accounts/profile/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v5').then(c => c.match('/accounts/profile/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)
    page.reload(wait_until="domcontentloaded")

    context.set_offline(False)
    with page.expect_navigation(timeout=6000):
        page.evaluate("window.dispatchEvent(new Event('online'))")
    page.wait_for_load_state("networkidle")
    expect(page.locator("#profile-forms button[type=submit]").first).to_be_enabled()


@pytest.mark.django_db(transaction=True)
def test_offline_logout_redirects_to_login_with_flag(page: Page, live_server, context):
    """Clicking Logout offline navigates to the cached login page and sets the pending flag."""
    user, pw = create_test_user("e2e_logout1")
    login_browser(page, live_server.url, "e2e_logout1", pw)
    page.wait_for_function(
        "() => navigator.serviceWorker.controller !== null", timeout=10000
    )
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v5').then(c => c.match('/accounts/login/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    page.locator("#logout-form button[type=submit]").click()
    page.wait_for_url(f"{live_server.url}/accounts/login/", timeout=5000)

    assert page.evaluate("localStorage.getItem('offline_logout_pending')") == "1"
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_offline_logout_completes_server_side_on_reconnect(
    page: Page, live_server, context
):
    """After offline logout, going online auto-submits real logout; flag is cleared and profile is inaccessible."""
    user, pw = create_test_user("e2e_logout2")
    login_browser(page, live_server.url, "e2e_logout2", pw)
    page.wait_for_function(
        "() => navigator.serviceWorker.controller !== null", timeout=10000
    )
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v5').then(c => c.match('/accounts/login/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    page.locator("#logout-form button[type=submit]").click()
    page.wait_for_url(f"{live_server.url}/accounts/login/", timeout=5000)

    context.set_offline(False)
    # Wait for auto-logout flag to clear (login page script submits real logout then reloads)
    page.wait_for_function(
        "() => !localStorage.getItem('offline_logout_pending')", timeout=10000
    )

    # Server session is now cleared — profile requires login
    page.goto(f"{live_server.url}/accounts/profile/")
    assert "/accounts/login/" in page.url


@pytest.mark.django_db(transaction=True)
def test_offline_logout_shows_login_page_not_error(page: Page, live_server, context):
    """After offline logout, the cached login page is served (not a browser error page)."""
    user, pw = create_test_user("e2e_logout3")
    login_browser(page, live_server.url, "e2e_logout3", pw)
    page.wait_for_function(
        "() => navigator.serviceWorker.controller !== null", timeout=10000
    )
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v5').then(c => c.match('/accounts/login/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    page.locator("#logout-form button[type=submit]").click()
    page.wait_for_url(f"{live_server.url}/accounts/login/", timeout=5000)

    # Login form must be visible — not a browser error page
    expect(page.locator("form")).to_be_visible()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_offline_banner_shown_when_page_loaded_while_offline(
    page: Page, live_server, context
):
    """Offline banner shows on DOMContentLoaded when page is loaded while already offline."""
    user, pw = create_test_user("e2e_banner2")
    login_browser(page, live_server.url, "e2e_banner2", pw)
    page.wait_for_function(
        "() => navigator.serviceWorker.controller !== null", timeout=10000
    )
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v5').then(c => c.match('/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)
    # Reload without dispatching offline event — banner must appear via DOMContentLoaded check
    page.reload(wait_until="domcontentloaded")
    expect(page.locator("#offline-banner")).to_be_visible()
    expect(
        page.locator("button[data-offline-disable]:has-text('+ New Chore')")
    ).to_be_disabled()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_offline_logout_pending_banner_shown_on_login_page(
    page: Page, live_server, context
):
    """When offline_logout_pending is set, login page shows a pending-logout banner."""
    user, pw = create_test_user("e2e_logout4")
    login_browser(page, live_server.url, "e2e_logout4", pw)
    page.wait_for_function(
        "() => navigator.serviceWorker.controller !== null", timeout=10000
    )
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v5').then(c => c.match('/accounts/login/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    page.locator("#logout-form button[type=submit]").click()
    page.wait_for_url(f"{live_server.url}/accounts/login/", timeout=5000)

    expect(page.locator("#offline-logout-banner")).to_be_visible()
    expect(page.locator("#retry-logout-btn")).to_be_visible()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_offline_state_shown_on_simulated_bfcache_restore(
    page: Page, live_server, context
):
    """pageshow(persisted=true) while offline triggers _applyOfflineState — covers real bfcache restores.

    In a real bfcache restore, the page was loaded online (no offline UI applied). While it sat
    in bfcache, the connection dropped and the 'offline' event fired on the *current* page, not
    the cached one. When the user navigates back, the cached page is restored: DOMContentLoaded
    does NOT re-fire. Only 'pageshow' with persisted=true fires.

    Playwright headless never activates bfcache, so page.go_back() always does a full reload.
    We simulate the bfcache restore directly: go offline (Playwright dispatches the offline event,
    showing the banner), then manually clear the offline UI as a bfcache-frozen page would have it,
    then dispatch pageshow(persisted=true) and assert the banner re-appears via the listener.
    """
    user, pw = create_test_user("e2e_bfcache1")
    login_browser(page, live_server.url, "e2e_bfcache1", pw)
    page.wait_for_load_state("networkidle")

    # Page loaded online; banner hidden
    expect(page.locator("#offline-banner")).to_be_hidden()

    # Go offline — Playwright dispatches the 'offline' event, banner shows on this page
    context.set_offline(True)
    expect(page.locator("#offline-banner")).to_be_visible()

    # Simulate bfcache-frozen state: the offline event fired on a different page while this one
    # was cached in bfcache. Reset offline UI to match a page that never saw the offline event.
    page.evaluate(
        """
        document.getElementById('offline-banner').style.display = 'none';
        document.querySelectorAll('[data-offline-disabled]').forEach(btn => {
            btn.disabled = false;
            delete btn.dataset.offlineDisabled;
        });
    """
    )
    expect(page.locator("#offline-banner")).to_be_hidden()
    expect(
        page.locator("button[data-offline-disable]:has-text('+ New Chore')")
    ).to_be_enabled()

    # Simulate bfcache restore — the ONLY hook that fires in real Chrome for this case
    page.evaluate(
        "window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true, bubbles: false}))"
    )

    # The pageshow listener must call _applyOfflineState() when e.persisted && !navigator.onLine
    expect(page.locator("#offline-banner")).to_be_visible()
    expect(
        page.locator("button[data-offline-disable]:has-text('+ New Chore')")
    ).to_be_disabled()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_offline_banner_shown_when_navigating_to_cached_page(
    page: Page, live_server, context
):
    """DOMContentLoaded check shows offline banner when navigating to a different cached page while offline."""
    user, pw = create_test_user("e2e_nav_offline1")
    login_browser(page, live_server.url, "e2e_nav_offline1", pw)
    page.wait_for_function(
        "() => navigator.serviceWorker.controller !== null", timeout=10000
    )

    # Warm both pages in SW cache
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v5').then(c => c.match('/').then(r => !!r))",
        timeout=10000,
    )
    page.goto(f"{live_server.url}/accounts/profile/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v5').then(c => c.match('/accounts/profile/').then(r => !!r))",
        timeout=10000,
    )

    # Go offline — no JS 'offline' event dispatched; banner relies on DOMContentLoaded
    context.set_offline(True)

    # Navigate to the dashboard (different page, served from SW cache)
    page.goto(f"{live_server.url}/", wait_until="domcontentloaded")

    # Banner must appear via DOMContentLoaded check (!navigator.onLine)
    expect(page.locator("#offline-banner")).to_be_visible()
    expect(
        page.locator("button[data-offline-disable]:has-text('+ New Chore')")
    ).to_be_disabled()
    context.set_offline(False)


@pytest.mark.django_db(transaction=True)
def test_offline_logout_auto_completes_after_reconnect_retry(
    page: Page, live_server, context
):
    """completeLogout retries until it succeeds — even if the first online event fires before CSRF is ready."""
    user, pw = create_test_user("e2e_logout5")
    login_browser(page, live_server.url, "e2e_logout5", pw)
    page.wait_for_function(
        "() => navigator.serviceWorker.controller !== null", timeout=10000
    )
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    page.wait_for_function(
        "() => caches.open('tasks-harmony-v5').then(c => c.match('/accounts/login/').then(r => !!r))",
        timeout=10000,
    )

    # Offline logout
    context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    page.locator("#logout-form button[type=submit]").click()
    page.wait_for_url(f"{live_server.url}/accounts/login/", timeout=5000)
    assert page.evaluate("localStorage.getItem('offline_logout_pending')") == "1"

    # Come back online — the online listener (non-once) fires completeLogout
    context.set_offline(False)
    page.wait_for_function(
        "() => !localStorage.getItem('offline_logout_pending')", timeout=10000
    )

    # Session cleared — profile requires login
    page.goto(f"{live_server.url}/accounts/profile/")
    assert "/accounts/login/" in page.url


@pytest.mark.django_db(transaction=True)
def test_question_completion_offline_submit(page: Page, live_server, context):
    """Submitting question form offline stores answers in IDB and marks card Pending."""
    from django.utils import timezone
    from chores.models import Question

    user, pw = create_test_user("e2e_qoffline1")
    rrule = f"DTSTART:{timezone.now().strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(
        creator=user, name="QOfflineChore", xp_size="S", recurrence=rrule
    )
    q = Question.objects.create(definition=defn, text="How did it go?", type="TEXT", order=1)
    instance = ChoreInstance.objects.create(definition=defn, owner=user)

    login_browser(page, live_server.url, "e2e_qoffline1", pw)
    # Warm SW cache: visit dashboard (caches page + pre-warms question modal)
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=10000)
    page.goto(f"{live_server.url}/", wait_until="networkidle")
    # Wait for question modal to be pre-warmed in SW cache
    page.wait_for_function(
        f"() => caches.open('tasks-harmony-v5').then(c => c.match('/chores/{instance.pk}/questions/').then(r => !!r))",
        timeout=10000,
    )

    context.set_offline(True)

    # Open question modal (served from SW cache)
    page.locator("button:has-text('Complete')").click()
    expect(page.locator("#question-modal")).to_be_visible(timeout=5000)

    # Fill in text answer
    page.locator(f"[name='question_{q.pk}']").fill("Went great!")

    # Submit form — should be intercepted offline
    page.locator("#question-modal .btn-primary[type=submit]").click()

    # Modal should close and card should show Pending badge
    expect(page.locator("#question-modal")).to_be_hidden(timeout=5000)
    expect(page.locator(f"#chore-{instance.pk} .badge")).to_have_text("Pending", timeout=5000)

    # IDB should have the pending entry with answers
    pending = page.evaluate("""
        window.PendingCompletions.getPending().then(p => p.map(e => ({
            choreId: e.choreId, hasAnswers: !!e.answers
        })))
    """)
    assert len(pending) == 1
    assert pending[0]["choreId"] == instance.pk
    assert pending[0]["hasAnswers"] is True

    context.set_offline(False)
