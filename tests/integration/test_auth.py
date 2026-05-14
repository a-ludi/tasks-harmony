import pytest


@pytest.mark.django_db
def test_login_wrong_password_shows_error(client, django_user_model):
    """Regression: wrong password must display an inline error, not silently stay on the page."""
    django_user_model.objects.create_user(username="auth1", password="correct99!")
    response = client.post("/accounts/login/", {"username": "auth1", "password": "wrongpass"})
    assert response.status_code == 200
    assert b"correct username and password" in response.content


@pytest.mark.django_db
def test_login_nonexistent_user_shows_error(client):
    """Regression: non-existent username must also show the error message."""
    response = client.post("/accounts/login/", {"username": "nobody", "password": "pw"})
    assert response.status_code == 200
    assert b"correct username and password" in response.content


@pytest.mark.django_db
def test_login_correct_credentials_redirects(client, django_user_model):
    django_user_model.objects.create_user(username="auth2", password="correct99!")
    response = client.post("/accounts/login/", {"username": "auth2", "password": "correct99!"})
    assert response.status_code == 302
