import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('xp', '0002_standard_xp_settings'),
    ]

    operations = [
        migrations.AddField(
            model_name='xpsettings',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='xpsettings',
            name='modified_at',
            field=models.DateTimeField(auto_now=True),
        ),
    ]
