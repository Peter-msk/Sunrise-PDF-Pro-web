import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from types import SimpleNamespace

import fitz

spec = importlib.util.spec_from_file_location('conversion_orchestrator', Path(__file__).parents[1] / 'scripts/conversion_orchestrator.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class OrchestratorTest(unittest.TestCase):
    def test_routes(self):
        for extension in ('.hwp', '.HWPX'):
            self.assertEqual(module.engine_for('file' + extension), 'hancom')
        for extension in ('.xls', '.xlsx', '.ppt', '.pptx', '.doc', '.docx'):
            self.assertEqual(module.engine_for('file' + extension), 'libreoffice')
        with self.assertRaises(ValueError):
            module.engine_for('file.png')

    def test_success_only_for_structurally_openable_pdf(self):
        with tempfile.TemporaryDirectory() as folder:
            source, output = Path(folder)/'source.pptx', Path(folder)/'output.pdf'
            source.write_bytes(b'test source')
            def good(args, **kwargs):
                self.assertEqual(Path(args[1]).name, 'office_pdf_probe.py')
                with fitz.open() as pdf:
                    pdf.new_page()
                    pdf.save(args[-1])
                return SimpleNamespace(returncode=0)
            self.assertEqual(module.convert(source, output, run=good), {'engine':'libreoffice','pages':1})
            self.assertTrue(output.exists())
            with self.assertRaises(ValueError):
                module.convert(source, output, run=good)

    def test_failed_invalid_and_timeout_leave_no_output(self):
        with tempfile.TemporaryDirectory() as folder:
            source, output = Path(folder)/'source.hwp', Path(folder)/'output.pdf'
            source.write_bytes(b'test source')
            def failed(args, **kwargs):
                self.assertEqual(Path(args[1]).name, 'hancom_pdf_probe.py')
                return SimpleNamespace(returncode=1)
            with self.assertRaises(RuntimeError):
                module.convert(source, output, run=failed)
            def corrupt(args, **kwargs):
                Path(args[-1]).write_bytes(b'%PDF-not-real')
                return SimpleNamespace(returncode=0)
            with self.assertRaises(ValueError):
                module.convert(source, output, run=corrupt)
            def timeout(args, **kwargs):
                raise subprocess.TimeoutExpired(args, kwargs['timeout'])
            with self.assertRaises(TimeoutError):
                module.convert(source, output, run=timeout)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
