class ExtractionError(Exception):
    """Raised when an uploaded instrument cannot be read into a draft."""


class InstrumentExtractor:
    """Turns an uploaded instrument file into a draft questionnaire dict:
    {"title": str, "age_group": str, "questions": [
        {"question_text": str, "question_type": str, "options": list, "order": int}, ...]}
    Swap implementations (OCR/heuristic now; LLM later) without touching callers.
    """

    def extract(self, file_bytes: bytes, content_type: str) -> dict:
        raise NotImplementedError
