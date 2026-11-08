#!/usr/bin/env python3
"""Synthetic-test-only loopback API. Never expose to a network or use for customer files."""
from email.parser import BytesParser
from email.policy import default
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
import os
from pathlib import Path
import tempfile

from conversion_orchestrator import convert, engine_for

MAX_REQUEST = 32 * 1024 * 1024  # Development fixture safety bound only.
MAX_OUTPUT = 150 * 1024 * 1024


class DevServer(HTTPServer):
    def __init__(self, address, token, converter=convert):
        if address[0] != '127.0.0.1' or not isinstance(token, str) or len(token) < 32:
            raise ValueError('loopback and a development token of at least 32 characters are required')
        self.dev_token = token
        self.converter = converter
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'
    server_version = 'SunriseDev/0'

    def log_message(self, *_args):
        pass  # Never write document names, auth tokens or query strings to logs.

    def reply(self, status, body=b'', content_type='text/plain; charset=utf-8'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != '/api/v1/conversions':
            return self.reply(404)
        given = self.headers.get('X-Sunrise-Dev-Token', '')
        if not hmac.compare_digest(given.encode('utf-8'), self.server.dev_token.encode('utf-8')):
            return self.reply(403)
        # Development harness has no browser CORS access and is not a public origin.
        if self.headers.get('Origin') or self.headers.get('Transfer-Encoding'):
            return self.reply(403)
        try:
            length = int(self.headers.get('Content-Length', ''))
        except ValueError:
            return self.reply(411)
        if length < 1 or length > MAX_REQUEST:
            return self.reply(413)
        ctype = self.headers.get('Content-Type', '')
        if not ctype.lower().startswith('multipart/form-data;') or '\r' in ctype or '\n' in ctype:
            return self.reply(415)
        self.connection.settimeout(10)
        try:
            raw = self.rfile.read(length)
        except (OSError, TimeoutError):
            return
        if len(raw) != length:
            return self.reply(400)
        envelope = BytesParser(policy=default).parsebytes(
            b'Content-Type: ' + ctype.encode('ascii', errors='replace') + b'\r\nMIME-Version: 1.0\r\n\r\n' + raw)
        if not envelope.is_multipart() or envelope.defects:
            return self.reply(400)
        parts = list(envelope.iter_parts())
        if len(parts) != 1 or parts[0].get_param('name', header='content-disposition') != 'file':
            return self.reply(400)
        filename = parts[0].get_filename() or ''
        extension = Path(filename.replace('\\', '/')).suffix.lower()
        data = parts[0].get_payload(decode=True)
        try:
            engine_for('input' + extension)
        except ValueError:
            return self.reply(415)
        if not data:
            return self.reply(400)
        with tempfile.TemporaryDirectory(prefix='sunrise-dev-api-') as directory:
            root = Path(directory)
            source, target = root / ('input' + extension), root / 'result.pdf'
            source.write_bytes(data)
            try:
                self.server.converter(source, target)
                if not target.is_file() or target.stat().st_size > MAX_OUTPUT:
                    return self.reply(422)
                result = target.read_bytes()
            except (OSError, ValueError, RuntimeError, TimeoutError):
                return self.reply(422)
        return self.reply(200, result, 'application/pdf')


def main():
    token = os.environ.get('SUNRISE_DEV_TOKEN', '')
    # No configurable bind address: local development only.
    server = DevServer(('127.0.0.1', 8765), token)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
