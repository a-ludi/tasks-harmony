import os
import pytest
from playwright.sync_api import sync_playwright

# playwright fixtures run inside an asyncio event loop; this lets Django's
# synchronous ORM work safely within it during E2E tests.
os.environ.setdefault("DJANGO_ALLOW_ASYNC_UNSAFE", "true")


@pytest.fixture(scope="session")
def browser_type_launch_args():
    # Required in Docker: running as root needs --no-sandbox; /dev/shm is
    # limited to 64 MB by default which crashes the Chromium renderer.
    return {"args": ["--no-sandbox", "--disable-dev-shm-usage"]}


@pytest.fixture(scope="session")
def browser_context_args():
    return {"ignore_https_errors": True}


def create_test_user(username="tester", password="testpass123"):
    from django.contrib.auth.models import User
    from xp.models import XPSettings
    XPSettings.objects.get_or_create(
        name="Standard",
        defaults={
            "max_streak_multiplier": 2.0,
            "streak_approach_rate": 0.1,
            "decay_approach_rate": 0.05,
            "decay_floor": 0.5,
        },
    )
    user, _ = User.objects.get_or_create(username=username)
    user.set_password(password)
    user.save()
    return user, password


def login_browser(page, live_url, username="tester", password="testpass123"):
    page.goto(f"{live_url}/accounts/login/")
    page.fill("[name=username]", username)
    page.fill("[name=password]", password)
    page.click("[type=submit]")
    page.wait_for_url(f"{live_url}/")
