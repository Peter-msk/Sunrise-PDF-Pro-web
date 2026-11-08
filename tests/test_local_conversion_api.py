import http.client
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest

import fitz
from pptx import Presentation
from pptx.util import Inches

sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
from local_conversion_api import DevServer


TOKEN = 'test-token-' + 'x' * 32


def multipart(name, filename, content):
    boundary = 'sunrise-fixture-6814'
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
            'Content-Type: application/octet-stream\r\n\r\n').encode() + content + f'\r\n--{boundary}--\r\n'.encode()
    return body, f'multipart/form-data; boundary={boundary}'


class LocalApiTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.paths = []
        def fake(source, target):
            self.paths.append((source, target))
            with fitz.open() as pdf:
                pdf.new_page().insert_text((50, 50), 'OK')
                pdf.save(target)
        self.server = DevServer(('127.0.0.1', 0), TOKEN, fake)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()
        self.temp.cleanup()

    def post(self, content, *, filename='slide.pptx', field='file', token=TOKEN, origin=None):
        body, ctype = multipart(field, filename, content)
        headers = {'Content-Type':ctype, 'X-Sunrise-Dev-Token':token}
        if origin is not None:
            headers['Origin'] = origin
        con = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=10)
        try:
            con.request('POST', '/api/v1/conversions', body, headers)
            response = con.getresponse()
            return response.status, response.getheader('Content-Type'), response.read()
        finally:
            con.close()

    def test_token_origin_and_input_guards(self):
        self.assertEqual(self.post(b'x', token='invalid')[0], 403)
        self.assertEqual(self.post(b'x', origin='https://example.com')[0], 403)
        self.assertEqual(self.post(b'x', field='other')[0], 400)
        self.assertEqual(self.post(b'x', filename='bad.exe')[0], 415)
        self.assertEqual(self.paths, [])

    def test_pdf_and_temp_cleanup(self):
        status, mime, data = self.post(b'synthetic')
        self.assertEqual((status,mime), (200,'application/pdf'))
        with fitz.open(stream=data, filetype='pdf') as pdf:
            self.assertEqual(len(pdf), 1)
        self.assertFalse(self.paths[0][0].exists())
        self.assertFalse(self.paths[0][1].exists())

    def test_actual_pptx_through_loopback_and_libreoffice(self):
        # Synthetic data only; no user documents leave the local host.
        from conversion_orchestrator import convert
        self.server.converter = convert
        presentation = Presentation()
        slide = presentation.slides.add_slide(presentation.slide_layouts[6])
        slide.shapes.add_textbox(Inches(1), Inches(1), Inches(6), Inches(1)).text = 'Local API test'
        path = Path(self.temp.name) / 'fixture.pptx'
        presentation.save(path)
        body, ctype = multipart('file', path.name, path.read_bytes())
        con = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=100)
        try:
            con.request('POST', '/api/v1/conversions', body, {'Content-Type':ctype, 'X-Sunrise-Dev-Token':TOKEN})
            response = con.getresponse()
            result = response.read()
            self.assertEqual(response.status, 200)
            with fitz.open(stream=result, filetype='pdf') as pdf:
                self.assertEqual(len(pdf), 1)
                self.assertIn('Local API test', pdf[0].get_text())
        finally:
            con.close()

    def test_web_client_to_local_api_end_to_end(self):
        # Node runs the actual browser-compatible client with a test-only transport.
        from conversion_orchestrator import convert
        self.server.converter = convert
        presentation = Presentation()
        slide = presentation.slides.add_slide(presentation.slide_layouts[6])
        slide.shapes.add_textbox(Inches(1), Inches(1), Inches(6), Inches(1)).text = 'Web client test'
        root = Path(self.temp.name)
        source, output = root / 'fixture.pptx', root / 'output.pdf'
        presentation.save(source)
        script = '''
import {readFile,writeFile} from 'node:fs/promises';
import {convertRemote} from './browser-local/src/remote-office-prototype.mjs';
const bytes=await readFile(process.env.TEST_INPUT);
const file=new File([bytes],'fixture.pptx');
const request=(url,opts)=>fetch(`http://127.0.0.1:${process.env.TEST_PORT}${url}`, {
 ...opts, headers:{'X-Sunrise-Dev-Token':process.env.TEST_TOKEN}
});
const result=await convertRemote(file,{request});
await writeFile(process.env.TEST_OUTPUT,Buffer.from(await result.pdf.arrayBuffer()));
'''
        env = os.environ.copy()
        env.update(TEST_INPUT=str(source), TEST_OUTPUT=str(output),
                   TEST_PORT=str(self.server.server_port), TEST_TOKEN=TOKEN)
        process = subprocess.run(['node', '--input-type=module', '-e', script], cwd=Path(__file__).parents[1],
                                 env=env, capture_output=True, timeout=120)
        self.assertEqual(process.returncode, 0, process.stderr.decode(errors='replace'))
        with fitz.open(output) as pdf:
            self.assertEqual(len(pdf), 1)
            self.assertIn('Web client test', pdf[0].get_text())


if __name__ == '__main__':
    unittest.main()
