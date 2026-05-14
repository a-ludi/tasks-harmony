import pytest


@pytest.mark.django_db
def test_profile_requires_login(client):
    response = client.get("/accounts/profile/")
    assert response.status_code == 302
    assert "/accounts/login/" in response["Location"]


@pytest.mark.django_db
def test_profile_get_shows_user_info(client, django_user_model):
    user = django_user_model.objects.create_user(
        username="prof1", password="pw", email="prof1@example.com"
    )
    client.force_login(user)
    response = client.get("/accounts/profile/")
    assert response.status_code == 200
    assert b"prof1" in response.content
    assert b"prof1@example.com" in response.content


@pytest.mark.django_db
def test_profile_get_shows_xp_and_settings(client, django_user_model):
    user = django_user_model.objects.create_user(username="prof2", password="pw")
    client.force_login(user)
    response = client.get("/accounts/profile/")
    assert response.status_code == 200
    # total_xp default is 0
    assert b"0" in response.content
    # XP settings name ("Standard") must appear
    assert b"Standard" in response.content


@pytest.mark.django_db
def test_profile_post_info_updates_user(client, django_user_model):
    user = django_user_model.objects.create_user(username="prof3", password="pw")
    client.force_login(user)
    response = client.post("/accounts/profile/", {
        "action": "info",
        "first_name": "Alice",
        "last_name": "Smith",
        "email": "alice@example.com",
    })
    assert response.status_code == 302
    user.refresh_from_db()
    assert user.first_name == "Alice"
    assert user.last_name == "Smith"
    assert user.email == "alice@example.com"


@pytest.mark.django_db
def test_profile_post_info_invalid_email_does_not_save(client, django_user_model):
    user = django_user_model.objects.create_user(
        username="prof4", password="pw", email="original@example.com"
    )
    client.force_login(user)
    response = client.post("/accounts/profile/", {
        "action": "info",
        "first_name": "Bob",
        "last_name": "",
        "email": "not-an-email",
    })
    assert response.status_code == 200
    user.refresh_from_db()
    assert user.email == "original@example.com"


@pytest.mark.django_db
def test_profile_post_password_change_updates_password(client, django_user_model):
    user = django_user_model.objects.create_user(username="prof5", password="oldpass99!")
    client.force_login(user)
    response = client.post("/accounts/profile/", {
        "action": "password",
        "old_password": "oldpass99!",
        "new_password1": "Newpass123!",
        "new_password2": "Newpass123!",
    })
    assert response.status_code == 302
    user.refresh_from_db()
    assert user.check_password("Newpass123!")


@pytest.mark.django_db
def test_profile_post_password_wrong_old_does_not_change(client, django_user_model):
    user = django_user_model.objects.create_user(username="prof6", password="oldpass99!")
    client.force_login(user)
    response = client.post("/accounts/profile/", {
        "action": "password",
        "old_password": "wrongpass",
        "new_password1": "Newpass123!",
        "new_password2": "Newpass123!",
    })
    assert response.status_code == 200
    user.refresh_from_db()
    assert user.check_password("oldpass99!")
