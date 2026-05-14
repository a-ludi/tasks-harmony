from django.contrib import admin
from .models import ChoreDefinition, ChoreInstance, Question, QuestionChoice, ChoreCompletion, CompletionAnswer


class QuestionInline(admin.TabularInline):
    model = Question
    extra = 0


@admin.register(ChoreDefinition)
class ChoreDefinitionAdmin(admin.ModelAdmin):
    list_display = ["name", "creator", "xp_size"]
    inlines = [QuestionInline]


@admin.register(ChoreInstance)
class ChoreInstanceAdmin(admin.ModelAdmin):
    list_display = ["definition", "owner", "is_active", "streak_count", "last_completed_at"]


@admin.register(ChoreCompletion)
class ChoreCompletionAdmin(admin.ModelAdmin):
    list_display = ["instance", "completed_at", "xp_earned"]
