from django.db import migrations


def create_standard_settings(apps, schema_editor):
    XPSettings = apps.get_model("xp", "XPSettings")
    XPSettings.objects.get_or_create(
        name="Standard",
        defaults={
            "max_streak_multiplier": 2.0,
            "streak_approach_rate": 0.1,
            "decay_approach_rate": 0.05,
            "decay_floor": 0.5,
        },
    )


def delete_standard_settings(apps, schema_editor):
    XPSettings = apps.get_model("xp", "XPSettings")
    XPSettings.objects.filter(name="Standard").delete()


class Migration(migrations.Migration):
    dependencies = [("xp", "0001_initial")]
    operations = [migrations.RunPython(create_standard_settings, delete_standard_settings)]
