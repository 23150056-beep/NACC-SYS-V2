"""Aggregation helpers for reports. V2: engine scoring removed — aggregates
count sessions and case mix only; clinical judgment stays with the psychologist."""


def _bucket(d, rng):
    if rng == "yearly":
        return str(d.year)
    if rng == "weekly":
        return d.strftime("%Y-W%U")
    return d.strftime("%Y-%m")  # monthly (default)


def summary(assessments, rng="monthly"):
    """Build the Agency Summary aggregates from a list of Assessment objects
    (with related `child`, `psychologist`)."""
    total = len(assessments)
    by_case_type = {}
    per_psy, trend = {}, {}

    for a in assessments:
        ct = a.child.case_type or "—"
        by_case_type[ct] = by_case_type.get(ct, 0) + 1
        name = getattr(a.psychologist, "fullname", "") or getattr(a.psychologist, "username", "—")
        slot = per_psy.setdefault(name, {"name": name, "count": 0})
        slot["count"] += 1
        b = _bucket(a.assessment_date, rng)
        trend[b] = trend.get(b, 0) + 1

    return {
        "total": total,
        "children": len({a.child_id for a in assessments}),
        "by_case_type": by_case_type,
        "per_psychologist": sorted(per_psy.values(), key=lambda p: -p["count"]),
        "trend": [{"bucket": k, "count": trend[k]} for k in sorted(trend)],
    }
