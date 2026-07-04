from django.db import migrations


def copy_titles(apps, schema_editor):
    """Carry v1 questionnaire titles/metadata into the V2 catalog.
    Titles and bibliographic facts only — questions were never copied."""
    Questionnaire = apps.get_model("assessments", "Questionnaire")
    InstrumentCatalog = apps.get_model("clinical", "InstrumentCatalog")
    for qn in Questionnaire.objects.all():
        InstrumentCatalog.objects.get_or_create(
            title=qn.title,
            owner_id=qn.owner_id,
            defaults={
                "age_range": qn.age_group or "",
                "notes": qn.description or "",
                "category": "behavioral",
                "active": qn.status == "active",
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ("clinical", "0001_initial"),
        ("assessments", "0013_remove_response_question_remove_response_assessment_and_more"),
    ]

    operations = [
        migrations.RunPython(copy_titles, migrations.RunPython.noop),
    ]
