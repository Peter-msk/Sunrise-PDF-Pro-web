#!/usr/bin/env python3
"""Offline prototype routing; not an upload API or a security boundary."""
import argparse
import math
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile

import fitz

HANCOM = {'.hwp', '.hwpx'}
OFFICE = {'.xls', '.xlsx', '.ppt', '.pptx', '.doc', '.docx'}


def engine_for(path):
    suffix = Path(path).suffix.lower()
    if suffix in HANCOM:
        return 'hancom'
    if suffix in OFFICE:
        return 'libreoffice'
    raise ValueError('지원하지 않는 문서 형식입니다.')


def inspect_pdf(path):
    try:
        with fitz.open(path) as doc:
            if not doc.is_pdf or doc.is_encrypted or doc.needs_pass or len(doc) < 1:
                raise ValueError('PDF를 열거나 쪽수를 확인할 수 없습니다.')
            # Reading every page catches many structurally damaged results.
            for page in doc:
                if page.rect.is_infinite or page.rect.is_empty or not all(math.isfinite(v) for v in page.rect):
                    raise ValueError('PDF 쪽 크기가 올바르지 않습니다.')
            return len(doc)
    except Exception as exc:
        raise ValueError('변환 결과가 유효한 PDF가 아닙니다.') from exc


def run_supervised(args, *, stdin, stdout, stderr, timeout, check, env):
    """Terminate POSIX process group on timeout, including inherited children.

    Windows only terminates the immediate adapter; COM/child lifetime is unresolved.
    """
    proc = subprocess.Popen(args, stdin=stdin, stdout=stdout, stderr=stderr, env=env,
                            start_new_session=(os.name == 'posix'))
    try:
        code = proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        if os.name == 'posix':
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        else:
            proc.kill()
        proc.wait()
        raise
    finally:
        if os.name == 'posix':
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
    return subprocess.CompletedProcess(args, code)


def convert(source, destination, *, timeout=120, run=run_supervised):
    source, destination = Path(source), Path(destination)
    engine = engine_for(source)
    if not source.is_file():
        raise ValueError('입력 파일이 없습니다.')
    if destination.suffix.lower() != '.pdf' or destination.exists() or source.resolve() == destination.resolve():
        raise ValueError('새 PDF 출력 경로가 필요합니다.')
    if not 1 <= timeout <= 600:
        raise ValueError('변환 시간 제한이 올바르지 않습니다.')
    adapter = Path(__file__).resolve().parent / ('hancom_pdf_probe.py' if engine == 'hancom' else 'office_pdf_probe.py')
    with tempfile.TemporaryDirectory(prefix='sunrise-orchestrator-') as tmp:
        candidate = Path(tmp) / 'result.pdf'
        args = [sys.executable, str(adapter)]
        if engine == 'libreoffice':
            args.append('--supervised')
            # Outer supervisor owns the group and should expire before the adapter.
            args.extend(['--timeout', str(min(600, timeout + 5))])
        args.extend([str(source.resolve()), str(candidate)])
        env = os.environ.copy()
        env.update({'TMPDIR': tmp, 'TMP': tmp, 'TEMP': tmp})
        try:
            result = run(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, timeout=timeout, check=False, env=env)
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError('변환 시간이 초과되었습니다.') from exc
        if result.returncode != 0 or not candidate.is_file():
            raise RuntimeError('문서 변환 엔진이 실패했습니다.')
        pages = inspect_pdf(candidate)
        with destination.open('xb') as output:
            try:
                with candidate.open('rb') as pdf:
                    shutil.copyfileobj(pdf, output)
            except Exception:
                output.close()
                destination.unlink(missing_ok=True)
                raise
        return {'engine': engine, 'pages': pages}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--timeout', type=int, default=120)
    args = parser.parse_args()
    try:
        result = convert(args.input, args.output, timeout=args.timeout)
    except (ValueError, RuntimeError, TimeoutError, OSError) as exc:
        parser.exit(1, f'{exc}\n')
    print(f"{result['engine']}: {result['pages']} pages")


if __name__ == '__main__':
    main()
