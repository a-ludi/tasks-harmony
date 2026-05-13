from django.urls import path
from . import views

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("complete/<int:pk>/", views.complete, name="chore_complete"),
    path("questions/<int:pk>/", views.questions, name="chore_questions"),
    path("create/", views.chore_create, name="chore_create"),
]
