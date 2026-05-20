from django.conf import settings


def connectivity(request):
    return {"CONNECTIVITY_TIMEOUT": settings.CONNECTIVITY_TIMEOUT}
