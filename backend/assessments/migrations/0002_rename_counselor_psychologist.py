# Rename the Assessment.counselor field to Assessment.psychologist.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('assessments', '0001_initial'),
    ]

    operations = [
        migrations.RenameField(
            model_name='assessment',
            old_name='counselor',
            new_name='psychologist',
        ),
    ]
