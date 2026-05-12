import pytest
from django.contrib.auth.models import User
from xp.models import XPSettings
from accounts.models import Profile


@pytest.mark.django_db
def test_standard_xp_settings_exists():
    assert XPSettings.objects.filter(name="Standard").exists()


@pytest.mark.django_db
def test_creating_user_creates_profile_with_standard_settings():
    user = User.objects.create_user(username="alice", password="pw")
    assert hasattr(user, "profile")
    assert user.profile.xp_settings.name == "Standard"
    assert user.profile.total_xp == 0
