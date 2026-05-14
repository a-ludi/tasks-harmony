from pathlib import Path
from django.conf import settings
from django.contrib import admin
from django.http import FileResponse
from django.urls import path, include


def service_worker_view(request):
    sw_path = Path(settings.BASE_DIR) / "static" / "js" / "service-worker.js"
    return FileResponse(sw_path.open("rb"), content_type="application/javascript")


urlpatterns = [
    path("admin/", admin.site.urls),
    path("accounts/", include("accounts.urls")),
    path("service-worker.js", service_worker_view, name="service_worker"),
    path("", include("chores.urls")),
]
