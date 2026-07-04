"""Free, deterministic behavioral scoring. No external services."""

NORMAL = "Normal"
NEEDS_MONITORING = "Needs Monitoring"
NEEDS_ATTENTION = "Needs Counseling Attention"

BOUNDARY_LOW, BOUNDARY_HIGH = 34, 67
BOUNDARY_MARGIN = 15          # points from a boundary at which the verdict is "decisive"
W_COVERAGE, W_DECISIVENESS = 0.5, 0.5


def confidence_for(coverage, behavioral):
    """0-100 certainty: how much data we have (coverage) and how clear the verdict is."""
    if behavioral is None:
        return 0
    margin = min(abs(behavioral - BOUNDARY_LOW), abs(behavioral - BOUNDARY_HIGH))
    decisiveness = min(margin / BOUNDARY_MARGIN, 1.0)
    return round(100 * (W_COVERAGE * coverage + W_DECISIVENESS * decisiveness))


def classify(score):
    if score is None:
        return NEEDS_MONITORING
    if score < BOUNDARY_LOW:
        return NORMAL
    if score < BOUNDARY_HIGH:
        return NEEDS_MONITORING
    return NEEDS_ATTENTION


def concern_for(question, answer):
    """Return a concern value in [0, 1], or None if this answer is not scorable."""
    answer = (answer or "").strip()
    qtype = question.question_type
    if qtype == "rating_scale":
        try:
            v = int(float(answer))
        except (TypeError, ValueError):
            return None
        if v < 1 or v > 5:
            return None
        return (v - 1) / 4 if question.concern_direction != "lower" else (5 - v) / 4
    if qtype == "yes_no":
        concern_answer = "yes" if question.concern_direction != "lower" else "no"
        return 1.0 if answer.lower() == concern_answer else 0.0
    if qtype in ("multiple_choice", "emotion"):
        opts = question.concern_options or []
        if not opts:
            return None
        return 1.0 if answer in opts else 0.0
    return None


def score(questionnaire, responses):
    """responses: iterable of {"question": <id>, "answer": <text>}."""
    questions = {q.id: q for q in questionnaire.questions.all()}
    items = []
    for r in responses:
        qid = r.get("question")
        try:
            q = questions.get(int(qid))
        except (TypeError, ValueError):
            q = None
        if q is None:
            continue
        c = concern_for(q, str(r.get("answer", "")))
        if c is None:
            continue
        items.append((q, c))
    total = len(questions)
    scored = len(items)
    coverage = scored / total if total else 0.0
    if scored == 0:
        return {"behavioral_score": None, "classification": NEEDS_MONITORING,
                "scored_count": 0, "total_count": total, "top_concerns": [],
                "confidence": confidence_for(coverage, None)}
    behavioral = round(sum(c for _, c in items) / scored * 100, 2)
    top = [q.question_text for q, c in sorted(items, key=lambda x: x[1], reverse=True) if c >= 0.5][:2]
    return {"behavioral_score": behavioral, "classification": classify(behavioral),
            "scored_count": scored, "total_count": total, "top_concerns": top,
            "confidence": confidence_for(coverage, behavioral)}
