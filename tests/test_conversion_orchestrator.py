import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from types import SimpleNamespace

import fitz

spec = importlib.util.spec_from_file_location('conversion_orchestrator', Path(__file__).parents[1] / 'scripts/conversion_orchestrator.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class OrchestratorTest(unittest.TestCase):
    @unittest.skipUnless(os.name == 'posix', 'POSIX process groups required')
    def test_timeout_terminates_parent_and_inherited_child(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            marker, survived = root / 'ready', root / 'survived'
            child = ('import pathlib,sys,time; pathlib.Path(sys.argv[1]).write_text("ready"); '
                     'time.sleep(12); pathlib.Path(sys.argv[2]).write_text("survived")')
            code = ('import subprocess,sys,time; '
                    'subprocess.Popen([sys.executable,"-c",sys.argv[1],sys.argv[2],sys.argv[3]]); '
                    'time.sleep(60)')
            args = [sys.executable, '-c', code, child, str(marker), str(survived)]
            with self.assertRaises(subprocess.TimeoutExpired):
                module.run_supervised(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                      stderr=subprocess.DEVNULL, timeout=10, check=False, env=os.environ.copy())
            self.assertTrue(marker.exists(), 'child did not start before timeout')
            time.sleep(4)
            self.assertFalse(survived.exists(), 'child continued running after timeout')

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
            temporary_dirs = []
            def timeout(args, **kwargs):
                temporary_dirs.append(Path(kwargs['env']['TMPDIR']))
                (temporary_dirs[-1] / 'temporary-document').write_text('temporary')
                raise subprocess.TimeoutExpired(args, kwargs['timeout'])
            with self.assertRaises(TimeoutError):
                module.convert(source, output, run=timeout)
            self.assertFalse(output.exists())
            self.assertFalse(temporary_dirs[0].exists())


if __name__ == '__main__':
    unittest.main()
