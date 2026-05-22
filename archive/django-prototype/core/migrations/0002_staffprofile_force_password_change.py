from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="staffprofile",
            name="force_password_change",
            field=models.BooleanField(default=False),
        ),
    ]

