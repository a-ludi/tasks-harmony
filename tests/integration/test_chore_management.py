import pytest
import re as _re
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
        "recurrence_freq": "WEEKLY",
        "recurrence_interval": "1",
        "recurrence_dtstart": "2026-01-01",
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
        "recurrence_freq": "DAILY",
        "recurrence_interval": "1",
        "recurrence_dtstart": "2026-01-01",
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
        "recurrence_freq": "DAILY",
        "recurrence_interval": "1",
        "recurrence_dtstart": "2026-01-01",
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


@pytest.mark.django_db
def test_create_chore_htmx_get_returns_modal_fragment(client, django_user_model):
    user = django_user_model.objects.create_user(username="h_c1", password="pw")
    client.force_login(user)
    response = client.get("/chores/new/", HTTP_HX_REQUEST="true")
    assert response.status_code == 200
    assert b"<html" not in response.content
    assert b"Create" in response.content


@pytest.mark.django_db
def test_create_chore_htmx_post_success_returns_hx_redirect(client, django_user_model):
    user = django_user_model.objects.create_user(username="h_c2", password="pw")
    client.force_login(user)
    response = client.post("/chores/new/", {
        "name": "Walk", "description": "", "xp_size": "S",
        "recurrence_freq": "DAILY", "recurrence_interval": "1",
        "recurrence_dtstart": "2026-01-01",
        "questions-TOTAL_FORMS": "0", "questions-INITIAL_FORMS": "0",
        "questions-MIN_NUM_FORMS": "0", "questions-MAX_NUM_FORMS": "1000",
    }, HTTP_HX_REQUEST="true")
    assert response.status_code == 200
    assert response["HX-Redirect"] == "/"


@pytest.mark.django_db
def test_create_chore_htmx_post_invalid_returns_form_fragment(client, django_user_model):
    user = django_user_model.objects.create_user(username="h_c3", password="pw")
    client.force_login(user)
    response = client.post("/chores/new/", {
        "name": "",
        "questions-TOTAL_FORMS": "0", "questions-INITIAL_FORMS": "0",
        "questions-MIN_NUM_FORMS": "0", "questions-MAX_NUM_FORMS": "1000",
    }, HTTP_HX_REQUEST="true")
    assert response.status_code == 200
    assert b"<html" not in response.content
    assert "HX-Redirect" not in response


@pytest.mark.django_db
def test_edit_chore_htmx_get_returns_modal_fragment(client, django_user_model):
    user = django_user_model.objects.create_user(username="h_e1", password="pw")
    client.force_login(user)
    defn = ChoreDefinition.objects.create(
        creator=user, name="Sweep", xp_size="S",
        recurrence="DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY",
    )
    response = client.get(f"/chores/{defn.pk}/edit/", HTTP_HX_REQUEST="true")
    assert response.status_code == 200
    assert b"<html" not in response.content
    assert b"Sweep" in response.content


@pytest.mark.django_db
def test_edit_chore_htmx_post_success_returns_hx_redirect(client, django_user_model):
    user = django_user_model.objects.create_user(username="h_e2", password="pw")
    client.force_login(user)
    defn = ChoreDefinition.objects.create(
        creator=user, name="Sweep", xp_size="S",
        recurrence="DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY",
    )
    response = client.post(f"/chores/{defn.pk}/edit/", {
        "name": "Sweep Updated", "description": "", "xp_size": "M",
        "recurrence_freq": "DAILY", "recurrence_interval": "1",
        "recurrence_dtstart": "2026-01-01",
        "questions-TOTAL_FORMS": "0", "questions-INITIAL_FORMS": "0",
        "questions-MIN_NUM_FORMS": "0", "questions-MAX_NUM_FORMS": "1000",
    }, HTTP_HX_REQUEST="true")
    assert response.status_code == 200
    assert response["HX-Redirect"] == "/"


@pytest.mark.django_db
def test_dashboard_shows_chore_description(client, django_user_model):
    user = django_user_model.objects.create_user(username="desc1", password="pw")
    client.force_login(user)
    rrule = "DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
    defn = ChoreDefinition.objects.create(
        creator=user, name="Vacuum", description="Clean under sofa every week",
        xp_size="S", recurrence=rrule,
    )
    ChoreInstance.objects.create(definition=defn, owner=user)
    response = client.get("/")
    assert b"Clean under sofa every week" in response.content


@pytest.mark.django_db
def test_chore_modal_order_field_is_hidden_input(client, django_user_model):
    user = django_user_model.objects.create_user(username="ordhid1", password="pw")
    client.force_login(user)
    response = client.get("/chores/new/", HTTP_HX_REQUEST="true")
    content = response.content.decode()
    match = _re.search(
        r'<input[^>]+name="questions-__prefix__-order"[^>]*>',
        content,
    )
    assert match, "order input not found in modal HTML"
    assert 'type="hidden"' in match.group(0), f"order input is not hidden: {match.group(0)}"


@pytest.mark.django_db
def test_chore_modal_scheduling_fields_in_responsive_grid(client, django_user_model):
    user = django_user_model.objects.create_user(username="grid1", password="pw")
    client.force_login(user)
    response = client.get("/chores/new/", HTTP_HX_REQUEST="true")
    assert b"col-12 col-md-6 col-lg-3" in response.content


@pytest.mark.django_db
def test_chore_modal_question_form_has_form_switch(client, django_user_model):
    user = django_user_model.objects.create_user(username="sw1", password="pw")
    client.force_login(user)
    response = client.get("/chores/new/", HTTP_HX_REQUEST="true")
    assert b"form-switch" in response.content


@pytest.mark.django_db
def test_chore_modal_question_conditional_field_wrappers(client, django_user_model):
    user = django_user_model.objects.create_user(username="cond1", password="pw")
    client.force_login(user)
    response = client.get("/chores/new/", HTTP_HX_REQUEST="true")
    content = response.content.decode()
    assert 'data-field-conditional="INTEGER"' in content
    assert 'data-field-conditional="TEXT"' in content
    assert 'data-field-conditional="ENUM"' in content


@pytest.mark.django_db
def test_chore_modal_enum_choices_has_list_ui(client, django_user_model):
    user = django_user_model.objects.create_user(username="enum1", password="pw")
    client.force_login(user)
    response = client.get("/chores/new/", HTTP_HX_REQUEST="true")
    assert b"enum-choices-list" in response.content


