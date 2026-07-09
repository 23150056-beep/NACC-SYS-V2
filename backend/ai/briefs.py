"""Pre-session brief assembly, shared by the on-demand view and the prefetcher (F2)."""
from datetime import date

from ai import prompts


def _age(child):
    if not child.birth_date:
        return "unknown"
    today = date.today()
    years = today.year - child.birth_date.year - (
        (today.month, today.day) < (child.birth_date.month, child.birth_date.day))
    return str(years)


def build_brief_prompt(child):
    pa = child.pre_assessments.filter(status="completed").first()
    result = child.result_entries.first()
    remarks = list(child.remarks.all()[:5])
    problems = list(child.problems.filter(resolved=False)[:6])
    survey = child.opinionnaire_invites.filter(status="submitted").first()
    survey_text = "\n".join(
        f"- {q}: {str(a)[:300]}" for q, a in (survey.answers or {}).items()
    ) if survey else "- not answered yet"
    return prompts.BRIEF.format(
        opinionnaire=survey_text,
        first_name=child.fullname.split(" ")[0] if child.fullname else "the child",
        age=_age(child),
        gender=child.gender or "unspecified",
        case_type=child.case_type or "unspecified",
        pre_assessment=(f"{pa.date}, instruments: "
                        f"{', '.join(i.title for i in pa.instruments.all()) or 'none'}"
                        if pa else "none completed"),
        latest_result=(f"{result.classification or ''} — {result.summary[:400]}"
                       if result else "none"),
        problems="; ".join(p.description for p in problems) or "none open",
        remarks="\n".join(f"- {r.date}: {r.text[:200]}" for r in remarks) or "- none",
    )
