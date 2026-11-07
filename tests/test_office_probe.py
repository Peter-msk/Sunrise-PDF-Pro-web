import importlib.util
from pathlib import Path
import tempfile
import unittest

import fitz
from PIL import Image
from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from pptx import Presentation
from pptx.util import Inches

spec = importlib.util.spec_from_file_location("office_pdf_probe", Path(__file__).parents[1] / "scripts/office_pdf_probe.py")
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class OfficeProbeTest(unittest.TestCase):
    def test_xlsx_and_pptx_export(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            xlsx = root / "book.xlsx"
            book = Workbook()
            sheet = book.active
            sheet.title = "Summary"
            sheet.append(["Category", "Amount"])
            sheet.append(["North", 30])
            sheet.append(["South", 50])
            chart = BarChart()
            chart.add_data(Reference(sheet, min_col=2, min_row=1, max_row=3), titles_from_data=True)
            sheet.add_chart(chart, "D2")
            sheet.print_area = "A1:L20"
            sheet.sheet_properties.pageSetUpPr.fitToPage = True
            sheet.page_setup.fitToWidth = 1
            sheet.page_setup.fitToHeight = 1
            book.save(xlsx)
            pptx = root / "slides.pptx"
            picture = root / "red.png"
            Image.new("RGB", (80, 50), (220, 30, 30)).save(picture)
            presentation = Presentation()
            for index, title in enumerate(("First Slide", "Second Slide")):
                slide = presentation.slides.add_slide(presentation.slide_layouts[6])
                textbox = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(8), Inches(1))
                textbox.text = title
                if index == 1:
                    slide.shapes.add_picture(str(picture), Inches(1), Inches(2), width=Inches(2))
                    table = slide.shapes.add_table(2, 2, Inches(4), Inches(2), Inches(4), Inches(1)).table
                    table.cell(0, 0).text = "TABLE MARKER"
            presentation.save(pptx)
            for source, expected_pages, expected_text in [(xlsx, 1, "North"), (pptx, 2, "Second Slide")]:
                result = root / (source.stem + ".pdf")
                probe.convert(source, result, timeout=90)
                with fitz.open(result) as pdf:
                    self.assertEqual(len(pdf), expected_pages)
                    self.assertIn(expected_text, " ".join(p.get_text() for p in pdf))
                    if source == pptx:
                        self.assertIn("TABLE MARKER", pdf[1].get_text())
                        self.assertGreaterEqual(len(pdf[1].get_images()), 1)
                    if source == xlsx:
                        self.assertGreater(len(pdf[0].get_drawings()), 0)
                with self.assertRaises(ValueError):
                    probe.convert(source, result)

    def test_reject_unknown_and_missing(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                probe.convert(Path(temp)/"missing.hwp", Path(temp)/"out.pdf")


if __name__ == "__main__":
    unittest.main()
