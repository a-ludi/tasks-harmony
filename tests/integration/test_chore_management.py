import pytest
from django.utils import timezone as dj_tz
from chores.models import ChoreDefinition, ChoreInstance, ChoreCompletion, Question


@pytest.mark.django_db
def test_create_chore_saves_definition_and_instance(client, django_user_model):
    user = django_user_model.objects.create_user(username="i1", password="pw")
    client.force_login(user)
    response = client.post("/chores/new/", {
        "name": "Vacuum",
        "description": "Living room",
        "xp_size": "L",
        "recurrence": "DTSTART:20260101T000000Z\nRRULE:FREQ=WEEKLY",
        "questions-TOTAL_FORMS": "0",
        "questions-INITIAL_FORMS": "0",
        "questions-MIN_NUM_FORMS": "0",
        "questions-MAX_NUM_FORMS": "1000",
    })
    assert response.status_code == 302
    assert ChoreDefinition.objects.filter(name="Vacuum").exists()
    defn = ChoreDefinition.objects.get(name="Vacuum")
    assert ChoreInstance.objects.filter(definition=defn, owner=user).exists()


@pytest.mark.django_db
def test_edit_chore_updates_definition_not_completions(client, django_user_model):
    user = django_user_model.objects.create_user(username="i2", password="pw")
    client.force_login(user)
    defn = ChoreDefinition.objects.create(
        creator=user, name="Sweep", xp_size="S",
        recurrence="DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
    )
    inst = ChoreInstance.objects.create(definition=defn, owner=user)
    ChoreCompletion.objects.create(instance=inst, completed_at=dj_tz.now(), xp_earned=3)

    client.post(f"/chores/{defn.pk}/edit/", {
        "name": "Sweep Updated",
        "description": "",
        "xp_size": "M",
        "recurrence": "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY",
        "questions-TOTAL_FORMS": "0",
        "questions-INITIAL_FORMS": "0",
        "questions-MIN_NUM_FORMS": "0",
        "questions-MAX_NUM_FORMS": "1000",
    })
    defn.refresh_from_db()
    assert defn.name == "Sweep Updated"
    assert ChoreCompletion.objects.filter(instance=inst).count() == 1


@pytest.mark.django_db
def test_create_chore_with_questions_saves_questions(client, django_user_model):
    user = django_user_model.objects.create_user(username="i3", password="pw")
    client.force_login(user)
    response = client.post("/chores/new/", {
        "name": "Run",
        "description": "",
        "xp_size": "M",
        "recurrence": "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY",
        "questions-TOTAL_FORMS": "1",
        "questions-INITIAL_FORMS": "0",
        "questions-MIN_NUM_FORMS": "0",
        "questions-MAX_NUM_FORMS": "1000",
        "questions-0-text": "Distance (km)?",
        "questions-0-type": "INTEGER",
        "questions-0-required": "on",
        "questions-0-order": "1",
        "questions-0-min_value": "1",
        "questions-0-max_value": "100",
    })
    assert response.status_code == 302
    defn = ChoreDefinition.objects.get(name="Run")
    assert Question.objects.filter(definition=defn, text="Distance (km)?").exists()


@pytest.mark.django_db
def test_deactivate_removes_from_dashboard(client, django_user_model):
    user = django_user_model.objects.create_user(username="i4", password="pw")
    client.force_login(user)
    defn = ChoreDefinition.objects.create(
        creator=user, name="Hide Me", xp_size="S",
        recurrence="DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
    )
    inst = ChoreInstance.objects.create(definition=defn, owner=user)
    client.post(f"/chores/{inst.pk}/deactivate/")
    inst.refresh_from_db()
    assert not inst.is_active
    response = client.get("/")
    assert b"Hide Me" not in response.content
