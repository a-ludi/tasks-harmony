import pytest
from datetime import datetime, timezone, timedelta
from django.utils import timezone as dj_tz
from django.contrib.auth.models import User
from chores.models import ChoreDefinition, ChoreInstance, ChoreCompletion


def make_chore(user, rrule="DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"):
    defn = ChoreDefinition.objects.create(
        creator=user, name="Test Chore", xp_size="M", recurrence=rrule
    )
    return ChoreInstance.objects.create(definition=defn, owner=user)


@pytest.mark.django_db
def test_complete_returns_html_fragment(client, django_user_model):
    user = django_user_model.objects.create_user(username="g1", password="pw")
    client.force_login(user)
    inst = make_chore(user)
    ts = dj_tz.now().isoformat()
    response = client.post(
        f"/chores/{inst.pk}/complete/",
        {"completed_at": ts},
        HTTP_HX_REQUEST="true",
    )
    assert response.status_code == 200
    assert b"<!DOCTYPE" not in response.content  # fragment, not full page


@pytest.mark.django_db
def test_complete_creates_chore_completion(client, django_user_model):
    user = django_user_model.objects.create_user(username="g2", password="pw")
    client.force_login(user)
    inst = make_chore(user)
    ts = dj_tz.now().isoformat()
    client.post(f"/chores/{inst.pk}/complete/", {"completed_at": ts}, HTTP_HX_REQUEST="true")
    assert ChoreCompletion.objects.filter(instance=inst).count() == 1


@pytest.mark.django_db
def test_complete_stores_client_submitted_timestamp(client, django_user_model):
    user = django_user_model.objects.create_user(username="g3", password="pw")
    client.force_login(user)
    inst = make_chore(user)
    ts = dj_tz.now().replace(microsecond=0)
    client.post(
        f"/chores/{inst.pk}/complete/",
        {"completed_at": ts.isoformat()},
        HTTP_HX_REQUEST="true",
    )
    completion = ChoreCompletion.objects.get(instance=inst)
    assert abs((completion.completed_at - ts).total_seconds()) < 2


@pytest.mark.django_db
def test_complete_increments_streak_on_consecutive_completions(client, django_user_model):
    user = django_user_model.objects.create_user(username="g4", password="pw")
    client.force_login(user)
    now = dj_tz.now()
    # Hourly chore: window 1 = [now-3h, now-2h), window 2 = [now-2h, now-1h)
    start = now - timedelta(hours=3)
    rrule = f"DTSTART:{start.strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=HOURLY"
    inst = make_chore(user, rrule)
    ts1 = (now - timedelta(hours=2, minutes=30)).isoformat()  # window 1
    client.post(f"/chores/{inst.pk}/complete/", {"completed_at": ts1}, HTTP_HX_REQUEST="true")
    inst.refresh_from_db()
    assert inst.streak_count == 1
    ts2 = (now - timedelta(hours=1, minutes=30)).isoformat()  # window 2
    client.post(f"/chores/{inst.pk}/complete/", {"completed_at": ts2}, HTTP_HX_REQUEST="true")
    inst.refresh_from_db()
    assert inst.streak_count == 2


@pytest.mark.django_db
def test_complete_resets_streak_after_missed_window(client, django_user_model):
    user = django_user_model.objects.create_user(username="g5", password="pw")
    client.force_login(user)
    now = dj_tz.now()
    # Hourly chore: window 1 = [now-4h, now-3h), window 2 = [now-3h, now-2h), window 3 = [now-2h, now-1h)
    start = now - timedelta(hours=4)
    rrule = f"DTSTART:{start.strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=HOURLY"
    inst = make_chore(user, rrule)
    ts1 = (now - timedelta(hours=3, minutes=30)).isoformat()  # window 1
    client.post(f"/chores/{inst.pk}/complete/", {"completed_at": ts1}, HTTP_HX_REQUEST="true")
    inst.refresh_from_db()
    assert inst.streak_count == 1
    ts3 = (now - timedelta(hours=1, minutes=30)).isoformat()  # window 3, skipping window 2
    client.post(f"/chores/{inst.pk}/complete/", {"completed_at": ts3}, HTTP_HX_REQUEST="true")
    inst.refresh_from_db()
    assert inst.streak_count == 1  # reset


@pytest.mark.django_db
def test_complete_updates_total_xp_atomically(client, django_user_model):
    user = django_user_model.objects.create_user(username="g6", password="pw")
    client.force_login(user)
    inst = make_chore(user)
    xp_before = user.profile.total_xp
    ts = dj_tz.now().isoformat()
    client.post(f"/chores/{inst.pk}/complete/", {"completed_at": ts}, HTTP_HX_REQUEST="true")
    user.profile.refresh_from_db()
    completion = ChoreCompletion.objects.get(instance=inst)
    assert user.profile.total_xp == xp_before + completion.xp_earned


@pytest.mark.django_db
def test_complete_rejects_future_timestamp(client, django_user_model):
    user = django_user_model.objects.create_user(username="g7", password="pw")
    client.force_login(user)
    inst = make_chore(user)
    future = (dj_tz.now() + timedelta(hours=1)).isoformat()
    response = client.post(
        f"/chores/{inst.pk}/complete/", {"completed_at": future}, HTTP_HX_REQUEST="true"
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_complete_rejects_stale_timestamp(client, django_user_model):
    user = django_user_model.objects.create_user(username="g8", password="pw")
    client.force_login(user)
    inst = make_chore(user)
    stale = (dj_tz.now() - timedelta(hours=49)).isoformat()
    response = client.post(
        f"/chores/{inst.pk}/complete/", {"completed_at": stale}, HTTP_HX_REQUEST="true"
    )
    assert response.status_code == 400
