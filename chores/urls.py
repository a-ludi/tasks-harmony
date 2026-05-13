from django.urls import path
from . import views

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("chores/<int:pk>/complete/", views.complete, name="chore_complete"),
    path("chores/<int:pk>/questions/", views.questions, name="chore_questions"),
    path("chores/create/", views.chore_create, name="chore_create"),
]
