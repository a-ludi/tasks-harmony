import pytest
from datetime import datetime, timezone, timedelta
from django.contrib.auth.models import User
from django.test import Client
from chores.models import ChoreDefinition, ChoreInstance


def make_chore(user, name, rrule, xp_size="M"):
    defn = ChoreDefinition.objects.create(
        creator=user, name=name, xp_size=xp_size, recurrence=rrule
    )
    inst = ChoreInstance.objects.create(definition=defn, owner=user)
    return inst


@pytest.mark.django_db
def test_dashboard_requires_login(client):
    response = client.get("/")
    assert response.status_code == 302
    assert "/accounts/login/" in response["Location"]


@pytest.mark.django_db
def test_dashboard_shows_active_chores(client, django_user_model):
    user = django_user_model.objects.create_user(username="dave", password="pw")
    client.force_login(user)
    make_chore(user, "Dishes", "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY")
    response = client.get("/")
    assert response.status_code == 200
    assert b"Dishes" in response.content


@pytest.mark.django_db
def test_dashboard_excludes_inactive_chores(client, django_user_model):
    user = django_user_model.objects.create_user(username="eve", password="pw")
    client.force_login(user)
    inst = make_chore(user, "Hidden Chore", "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY")
    inst.is_active = False
    inst.save()
    response = client.get("/")
    assert b"Hidden Chore" not in response.content


@pytest.mark.django_db
def test_dashboard_only_shows_own_chores(client, django_user_model):
    owner = django_user_model.objects.create_user(username="greta", password="pw")
    visitor = django_user_model.objects.create_user(username="hans", password="pw")
    make_chore(owner, "Owner Chore", "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY")
    client.force_login(visitor)
    response = client.get("/")
    assert b"Owner Chore" not in response.content
    assert b"No active chores" in response.content


@pytest.mark.django_db
def test_dashboard_orders_overdue_before_due(client, django_user_model):
    user = django_user_model.objects.create_user(username="frank", password="pw")
    client.force_login(user)
    # due chore — starts today
    from django.utils import timezone as dj_tz
    now = dj_tz.now()
    today_rrule = f"DTSTART:{now.strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    make_chore(user, "Due Chore", today_rrule)
    # overdue chore — started 2 days ago, not completed
    old_start = now - timedelta(days=2)
    old_rrule = f"DTSTART:{old_start.strftime('%Y%m%dT%H%M%SZ')}\nRRULE:FREQ=DAILY"
    make_chore(user, "Overdue Chore", old_rrule)
    response = client.get("/")
    content = response.content.decode()
    assert content.index("Overdue Chore") < content.index("Due Chore")


@pytest.mark.django_db
def test_dashboard_both_modals_have_scrollable_class(client, django_user_model):
    """Regression: question and chore-form modals must carry modal-dialog-scrollable
    so their body content scrolls instead of overflowing the viewport."""
    user = django_user_model.objects.create_user(username="scroll1", password="pw")
    client.force_login(user)
    response = client.get("/")
    content = response.content.decode()
    assert content.count("modal-dialog-scrollable") >= 2
