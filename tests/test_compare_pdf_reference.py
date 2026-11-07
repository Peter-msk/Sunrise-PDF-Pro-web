import importlib.util
import tempfile
import unittest
from pathlib import Path
import fitz

spec = importlib.util.spec_from_file_location("compare_pdf_reference", Path(__file__).parents[1] / "scripts/compare_pdf_reference.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ComparePdfTest(unittest.TestCase):
    def test_identical_and_changed_document(self):
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp)/"a.pdf", Path(tmp)/"b.pdf"
            with fitz.open() as pdf:
                pdf.new_page().insert_text((72, 72), "Reference text")
                pdf.save(a)
            same = module.compare(a, a)
            self.assertTrue(same["page_count_equal"])
            self.assertEqual(same["pages"][0]["text_similarity"], 1.0)
            self.assertEqual(same["pages"][0]["grayscale_mean_absolute_difference"], 0)
            with fitz.open() as pdf:
                pdf.new_page().insert_text((72, 72), "Different text")
                pdf.new_page(width=200, height=300)
                pdf.save(b)
            diff = module.compare(a, b)
            self.assertFalse(diff["page_count_equal"])
            self.assertLess(diff["pages"][0]["text_similarity"], 1)
            self.assertGreater(diff["pages"][0]["grayscale_mean_absolute_difference"], 0)

    def test_invalid_dpi(self):
        with self.assertRaises(ValueError):
            module.compare("a", "b", 500)


if __name__ == "__main__":
    unittest.main()
