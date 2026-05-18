from django.db import models


class XPSettings(models.Model):
    name = models.CharField(max_length=100, unique=True)
    max_streak_multiplier = models.FloatField(default=2.0)
    streak_approach_rate = models.FloatField(default=0.1)
    decay_approach_rate = models.FloatField(default=0.05)
    decay_floor = models.FloatField(default=0.5)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "XP Settings"
        verbose_name_plural = "XP Settings"

    def __str__(self):
        return self.name
