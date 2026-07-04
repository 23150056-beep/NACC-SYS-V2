"""Free template recommendations. Swap get_recommender() for an LLM later."""

DISCLAIMER = ("This is decision support, not a diagnosis; the final determination "
              "rests with the licensed professional.")

_TEMPLATES = {
    "Normal": ("Low",
               "The child appears to be adjusting well; responses show no significant behavioral concerns.",
               "continue routine periodic check-ins"),
    "Needs Monitoring": ("Medium",
                         "Some responses indicate mild-to-moderate behavioral concerns{focus}.",
                         "increase observation, schedule a follow-up within 4 weeks, and introduce light supportive measures"),
    "Needs Counseling Attention": ("High",
                                   "Responses indicate notable behavioral concerns requiring attention{focus}.",
                                   "arrange focused counseling support, coordinate with the house parent or guardian, and reassess within 1-2 weeks"),
}


def recommend(result):
    classification = result.get("classification", "Needs Monitoring")
    priority, summary_tpl, actions = _TEMPLATES.get(classification, _TEMPLATES["Needs Monitoring"])
    top = result.get("top_concerns") or []
    focus = f", notably around: {'; '.join(top)}" if top else ""
    summary = summary_tpl.format(focus=focus)
    text = f"{summary} Suggested actions: {actions}. {DISCLAIMER}"
    return {"recommendation_text": text, "priority_level": priority}


def get_recommender():
    # Swap point: return an LLM-backed callable here once budget exists.
    return recommend
