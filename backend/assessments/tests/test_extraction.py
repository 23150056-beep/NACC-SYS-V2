import fitz  # PyMuPDF
from django.test import TestCase
from assessments.extraction.ocr_heuristic import OcrHeuristicExtractor


def _text_pdf(text):
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text, fontsize=11)
    return doc.tobytes()


SAMPLE = """Behavioral Checklist
1. The child is kind to others.
2. The child has trouble sleeping?
3. Does the child avoid eye contact?
"""


class OcrHeuristicExtractorTest(TestCase):
    def test_parses_text_pdf_into_questions(self):
        draft = OcrHeuristicExtractor().extract(_text_pdf(SAMPLE), "application/pdf")
        texts = [q["question_text"] for q in draft["questions"]]
        self.assertIn("The child is kind to others.", texts)
        self.assertEqual(len(draft["questions"]), 3)
        self.assertTrue(all(q["order"] == i + 1 for i, q in enumerate(draft["questions"])))
        self.assertEqual(draft["title"], "Behavioral Checklist")
