from django.db import migrations


def add_missing_rrule(apps, schema_editor):
    schema_editor.execute(
        "UPDATE chores_choredefinition SET recurrence = recurrence || %s"
        " WHERE recurrence NOT ILIKE %s",
        ["\nRRULE:FREQ=DAILY", "%RRULE:%"],
    )


class Migration(migrations.Migration):

    dependencies = [
        ("chores", "0002_timestamps"),
    ]

    operations = [
        migrations.RunPython(add_missing_rrule, migrations.RunPython.noop),
    ]
