import pytest
from django.contrib.auth.models import User
from django.db import transaction
from xp.models import XPSettings
from accounts.models import Profile
from chores.models import ChoreDefinition, ChoreInstance


@pytest.mark.django_db
def test_standard_xp_settings_exists():
    assert XPSettings.objects.filter(name="Standard").exists()


@pytest.mark.django_db
def test_creating_user_creates_profile_with_standard_settings():
    user = User.objects.create_user(username="alice", password="pw")
    assert hasattr(user, "profile")
    assert user.profile.xp_settings.name == "Standard"
    assert user.profile.total_xp == 0


@pytest.mark.django_db
def test_creating_chore_definition_and_instance_in_transaction(django_user_model):
    user = django_user_model.objects.create_user(username="bob", password="pw")
    with transaction.atomic():
        defn = ChoreDefinition.objects.create(
            creator=user,
            name="Dishes",
            xp_size="S",
            recurrence="RRULE:FREQ=DAILY",
        )
        inst = ChoreInstance.objects.create(definition=defn, owner=user)
    assert ChoreDefinition.objects.filter(name="Dishes").exists()
    assert ChoreInstance.objects.filter(owner=user, definition=defn).exists()


@pytest.mark.django_db
def test_deactivating_instance_excludes_from_active_query(django_user_model):
    user = django_user_model.objects.create_user(username="carol", password="pw")
    defn = ChoreDefinition.objects.create(
        creator=user, name="Sweep", xp_size="XS", recurrence="RRULE:FREQ=WEEKLY"
    )
    inst = ChoreInstance.objects.create(definition=defn, owner=user)
    inst.is_active = False
    inst.save()
    assert not ChoreInstance.objects.filter(owner=user, is_active=True).exists()
