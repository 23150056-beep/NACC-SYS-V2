import io
import re

import fitz  # PyMuPDF

from assessments.extraction.base import ExtractionError, InstrumentExtractor

_QNUM = re.compile(r"^\s*(?:\d{1,3}|[a-zA-Z])[.)]\s+(.*)")
_YESNO = re.compile(r"\byes\b.*\bno\b", re.I)
_SCALE_RUN = re.compile(r"(?:\b[1-5]\b[^\S\n]*){3,}")
_RATING_HINT = re.compile(
    r"\b(never|rarely|sometimes|often|always|strongly\s+disagree|disagree|agree)\b", re.I)


def _ocr_image(image_bytes: bytes) -> str:
    try:
        import pytesseract
        from PIL import Image
    except Exception as exc:  # pragma: no cover - import guard
        raise ExtractionError("OCR engine not available. Install Pillow/pytesseract.") from exc
    try:
        return pytesseract.image_to_string(Image.open(io.BytesIO(image_bytes)))
    except pytesseract.TesseractNotFoundError as exc:
        raise ExtractionError(
            "Tesseract OCR is not installed. Install it for scanned/photo input, "
            "or type the questions manually.") from exc


def _text_from_pdf(file_bytes: bytes) -> str:
    parts = []
    with fitz.open(stream=file_bytes, filetype="pdf") as doc:
        for page in doc:
            text = page.get_text("text")
            if text.strip():
                parts.append(text)
            else:  # scanned page -> render + OCR
                parts.append(_ocr_image(page.get_pixmap(dpi=200).tobytes("png")))
    return "\n".join(parts)


def _guess_type(line: str) -> str:
    if _YESNO.search(line):
        return "yes_no"
    if _SCALE_RUN.search(line) or _RATING_HINT.search(line):
        return "rating_scale"
    return "rating_scale"


def _parse(text: str) -> dict:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    title = None
    questions = []
    for line in lines:
        match = _QNUM.match(line)
        if match:
            body = match.group(1).strip()
            questions.append({
                "question_text": body,
                "question_type": _guess_type(line),
                "options": [],
                "order": len(questions) + 1,
            })
        elif line.endswith("?") and len(line) > 8:
            questions.append({
                "question_text": line,
                "question_type": _guess_type(line),
                "options": [],
                "order": len(questions) + 1,
            })
        elif title is None and 3 <= len(line) <= 90 and not line[0].isdigit():
            title = line
    return {"title": title or "Untitled Instrument", "age_group": "", "questions": questions}


class OcrHeuristicExtractor(InstrumentExtractor):
    def extract(self, file_bytes: bytes, content_type: str) -> dict:
        if content_type == "application/pdf":
            text = _text_from_pdf(file_bytes)
        elif content_type in ("image/png", "image/jpeg"):
            text = _ocr_image(file_bytes)
        else:
            raise ExtractionError("Unsupported file type. Upload a PDF, PNG, or JPG.")
        if not text.strip():
            raise ExtractionError("Could not read any text from the file.")
        return _parse(text)
