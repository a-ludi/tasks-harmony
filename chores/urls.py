from django.urls import path
from . import views

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("chores/<int:pk>/complete/", views.complete, name="chore_complete"),
    path("chores/<int:pk>/questions/", views.questions, name="chore_questions"),
    path("chores/new/", views.create_chore, name="chore_create"),
    path("chores/<int:definition_id>/edit/", views.edit_chore, name="chore_edit"),
    path("chores/<int:instance_id>/deactivate/", views.deactivate_chore, name="chore_deactivate"),
]
