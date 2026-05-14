import pytest
from django.utils import timezone as dj_tz
from chores.models import ChoreDefinition, ChoreInstance, ChoreCompletion, Question, QuestionChoice, CompletionAnswer


def make_chore_with_question(user):
    defn = ChoreDefinition.objects.create(
        creator=user, name="Watering", xp_size="S",
        recurrence="DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY"
    )
    inst = ChoreInstance.objects.create(definition=defn, owner=user)
    q = Question.objects.create(
        definition=defn, order=1, text="How many litres?",
        required=True, type="INTEGER", min_value=1, max_value=20
    )
    return inst, q


@pytest.mark.django_db
def test_question_modal_get_returns_form(client, django_user_model):
    user = django_user_model.objects.create_user(username="h1", password="pw")
    client.force_login(user)
    inst, q = make_chore_with_question(user)
    response = client.get(f"/chores/{inst.pk}/questions/")
    assert response.status_code == 200
    assert b"How many litres?" in response.content


@pytest.mark.django_db
def test_valid_answers_create_completion_and_answers(client, django_user_model):
    user = django_user_model.objects.create_user(username="h2", password="pw")
    client.force_login(user)
    inst, q = make_chore_with_question(user)
    ts = dj_tz.now().isoformat()
    response = client.post(
        f"/chores/{inst.pk}/questions/",
        {"completed_at": ts, f"question_{q.pk}": "5"},
        HTTP_HX_REQUEST="true",
    )
    assert response.status_code == 200
    assert ChoreCompletion.objects.filter(instance=inst).count() == 1
    completion = ChoreCompletion.objects.get(instance=inst)
    answer = CompletionAnswer.objects.get(completion=completion, question=q)
    assert answer.integer_value == 5


@pytest.mark.django_db
def test_invalid_answer_returns_form_with_errors_no_completion(client, django_user_model):
    user = django_user_model.objects.create_user(username="h3", password="pw")
    client.force_login(user)
    inst, q = make_chore_with_question(user)
    ts = dj_tz.now().isoformat()
    response = client.post(
        f"/chores/{inst.pk}/questions/",
        {"completed_at": ts, f"question_{q.pk}": "999"},  # exceeds max_value=20
        HTTP_HX_REQUEST="true",
    )
    assert response.status_code == 200
    assert ChoreCompletion.objects.filter(instance=inst).count() == 0


@pytest.mark.django_db
def test_invalid_answer_response_keeps_modal_open_not_body(client, django_user_model):
    """Error response must include the chore card as primary (so the card isn't
    replaced with modal HTML) and put the error form into #question-modal-content
    as an OOB swap so the modal stays open."""
    user = django_user_model.objects.create_user(username="h4", password="pw")
    client.force_login(user)
    inst, q = make_chore_with_question(user)
    ts = dj_tz.now().isoformat()
    response = client.post(
        f"/chores/{inst.pk}/questions/",
        {"completed_at": ts, f"question_{q.pk}": "999"},
        HTTP_HX_REQUEST="true",
    )
    content = response.content.decode()
    assert f'id="chore-{inst.pk}"' in content, "chore card must be primary so card is not destroyed"
    assert 'id="question-modal-content"' in content, "error form must target modal-content via OOB"
    assert 'hx-swap-oob' in content, "OOB swap attribute must be present"
    assert response.get("HX-Validation-Error") == "true", "header must signal error so JS keeps modal open"


@pytest.mark.django_db
def test_valid_answer_response_excludes_close_oob(client, django_user_model):
    """Success response must NOT swap out the modal element — Bootstrap's hide()
    (called from hx-on::after-request in the template) handles the close and
    properly removes the backdrop."""
    user = django_user_model.objects.create_user(username="h5", password="pw")
    client.force_login(user)
    inst, q = make_chore_with_question(user)
    ts = dj_tz.now().isoformat()
    response = client.post(
        f"/chores/{inst.pk}/questions/",
        {"completed_at": ts, f"question_{q.pk}": "5"},
        HTTP_HX_REQUEST="true",
    )
    content = response.content.decode()
    assert 'hx-swap-oob="innerHTML:#question-modal' not in content, "modal element must not be replaced via OOB"
    assert f'id="chore-{inst.pk}"' in content
    assert 'id="xp-counter"' in content
