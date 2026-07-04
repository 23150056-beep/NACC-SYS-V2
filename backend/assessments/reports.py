"""Aggregation helpers for assessment reports (Phase 4 — Monitoring & Reporting)."""


def trajectory(scores):
    """Given behavioral scores in chronological order (floats or None), classify the
    child's trend. Higher score = more concern, so a falling score means improvement.
    Returns 'improving' | 'worsening' | 'stable' | 'baseline'."""
    vals = [float(s) for s in scores if s is not None]
    if len(vals) < 2:
        return "baseline"
    delta = vals[-1] - vals[-2]
    if delta < -5:
        return "improving"
    if delta > 5:
        return "worsening"
    return "stable"


def _bucket(d, rng):
    if rng == "yearly":
        return str(d.year)
    if rng == "weekly":
        return d.strftime("%Y-W%U")
    return d.strftime("%Y-%m")  # monthly (default)


def summary(assessments, rng="monthly"):
    """Build the Agency Summary aggregates from a list of Assessment objects
    (with related `result`, `child`, `psychologist`)."""
    total = len(assessments)
    by_class, by_priority, by_case_type = {}, {}, {}
    scores, confidences, overridden = [], [], 0
    per_psy, trend = {}, {}
    latest_per_child = {}

    for a in assessments:
        r = getattr(a, "result", None)
        cls = (r.classification if r else None) or "Unscored"
        by_class[cls] = by_class.get(cls, 0) + 1
        if r and r.behavioral_score is not None:
            scores.append(float(r.behavioral_score))
        if r and r.confidence is not None:
            confidences.append(r.confidence)
        if r and r.overridden:
            overridden += 1
        rec = r.recommendations.first() if r else None
        pr = (rec.priority_level if rec else None) or "—"
        by_priority[pr] = by_priority.get(pr, 0) + 1
        ct = a.child.case_type or "—"
        by_case_type[ct] = by_case_type.get(ct, 0) + 1
        name = getattr(a.psychologist, "fullname", "") or getattr(a.psychologist, "username", "—")
        slot = per_psy.setdefault(name, {"name": name, "count": 0, "classes": {}})
        slot["count"] += 1
        slot["classes"][cls] = slot["classes"].get(cls, 0) + 1
        b = _bucket(a.assessment_date, rng)
        trend[b] = trend.get(b, 0) + 1
        latest_per_child[a.child_id] = a

    attention = []
    for a in latest_per_child.values():
        r = getattr(a, "result", None)
        if r and r.classification == "Needs Counseling Attention":
            attention.append({
                "child": a.child.fullname,
                "case_type": a.child.case_type or "—",
                "score": float(r.behavioral_score) if r.behavioral_score is not None else None,
            })

    return {
        "total": total,
        "children": len({a.child_id for a in assessments}),
        "by_classification": by_class,
        "by_priority": by_priority,
        "by_case_type": by_case_type,
        "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
        "avg_confidence": round(sum(confidences) / len(confidences)) if confidences else None,
        "overridden": overridden,
        "per_psychologist": sorted(per_psy.values(), key=lambda p: -p["count"]),
        "trend": [{"bucket": k, "count": trend[k]} for k in sorted(trend)],
        "attention": attention,
    }
