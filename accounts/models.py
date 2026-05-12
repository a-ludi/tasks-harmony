from django.contrib.auth.models import User
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    total_xp = models.IntegerField(default=0)
    xp_settings = models.ForeignKey(
        "xp.XPSettings",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )

    def __str__(self):
        return f"Profile({self.user.username})"


@receiver(post_save, sender=User)
def create_profile(sender, instance, created, **kwargs):
    if created:
        from xp.models import XPSettings
        standard = XPSettings.objects.filter(name="Standard").first()
        Profile.objects.create(user=instance, xp_settings=standard)
