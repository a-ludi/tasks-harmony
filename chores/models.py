from decimal import Decimal
from django.contrib.auth.models import User
from django.db import models
import recurrence.fields


XP_SIZE_CHOICES = [
    ("XXS", "XXS (0.5)"),
    ("XS",  "XS (1)"),
    ("S",   "S (2)"),
    ("M",   "M (3)"),
    ("L",   "L (5)"),
    ("XL",  "XL (8)"),
    ("XXL", "XXL (13)"),
    ("XXXL","XXXL (21)"),
]

XP_SIZE_VALUES: dict[str, Decimal] = {
    "XXS": Decimal("0.5"),
    "XS":  Decimal("1"),
    "S":   Decimal("2"),
    "M":   Decimal("3"),
    "L":   Decimal("5"),
    "XL":  Decimal("8"),
    "XXL": Decimal("13"),
    "XXXL":Decimal("21"),
}


class ChoreDefinition(models.Model):
    creator = models.ForeignKey(User, on_delete=models.CASCADE, related_name="chore_definitions")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    xp_size = models.CharField(max_length=4, choices=XP_SIZE_CHOICES, default="M")
    recurrence = recurrence.fields.RecurrenceField()
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    @property
    def base_xp(self) -> Decimal:
        return XP_SIZE_VALUES[self.xp_size]


class ChoreInstance(models.Model):
    definition = models.ForeignKey(ChoreDefinition, on_delete=models.CASCADE, related_name="instances")
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="chore_instances")
    streak_count = models.IntegerField(default=0)
    last_completed_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("definition", "owner")]

    def __str__(self):
        return f"{self.owner.username} / {self.definition.name}"


class Question(models.Model):
    class QuestionType(models.TextChoices):
        TEXT = "TEXT", "Text"
        INTEGER = "INTEGER", "Integer"
        BOOLEAN = "BOOLEAN", "Boolean"
        ENUM = "ENUM", "Enum"

    definition = models.ForeignKey(ChoreDefinition, on_delete=models.CASCADE, related_name="questions")
    order = models.PositiveIntegerField(default=0)
    text = models.CharField(max_length=500)
    required = models.BooleanField(default=True)
    type = models.CharField(max_length=10, choices=QuestionType.choices, default=QuestionType.TEXT)
    regex_pattern = models.CharField(max_length=200, blank=True)
    min_value = models.IntegerField(null=True, blank=True)
    max_value = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.definition.name} Q{self.order}: {self.text[:40]}"


class QuestionChoice(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="choices")
    label = models.CharField(max_length=200)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.label


class ChoreCompletion(models.Model):
    instance = models.ForeignKey(ChoreInstance, on_delete=models.CASCADE, related_name="completions")
    completed_at = models.DateTimeField()
    xp_earned = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-completed_at"]

    def __str__(self):
        return f"{self.instance} @ {self.completed_at}"


class CompletionAnswer(models.Model):
    completion = models.ForeignKey(ChoreCompletion, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(Question, on_delete=models.PROTECT, related_name="answers")
    text_value = models.TextField(blank=True, null=True)
    integer_value = models.IntegerField(null=True, blank=True)
    boolean_value = models.BooleanField(null=True, blank=True)
    enum_value = models.ForeignKey(
        QuestionChoice, on_delete=models.PROTECT, null=True, blank=True, related_name="answers"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Answer to Q{self.question_id}"
