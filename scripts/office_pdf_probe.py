#!/usr/bin/env python3
"""Local development probe for Office -> PDF. Not an HTTP service."""
import argparse
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile


FILTERS = {
    ".xls": "calc_pdf_Export", ".xlsx": "calc_pdf_Export",
    ".ppt": "impress_pdf_Export", ".pptx": "impress_pdf_Export",
    ".doc": "writer_pdf_Export", ".docx": "writer_pdf_Export",
}


def convert(source, destination, *, executable="soffice", timeout=90, supervised=False):
    source, destination = Path(source), Path(destination)
    extension = source.suffix.lower()
    if extension not in FILTERS or not source.is_file():
        raise ValueError("unsupported or missing input file")
    if source.resolve() == destination.resolve() or destination.exists():
        raise ValueError("destination already exists or is the input")
    if timeout <= 0 or timeout > 600:
        raise ValueError("invalid timeout")
    with tempfile.TemporaryDirectory(prefix="sunrise-office-") as tmp:
        root = Path(tmp)
        staged = root / ("input" + extension)
        shutil.copyfile(source, staged)
        out = root / "out"
        out.mkdir()
        profile = (root / "profile").as_uri()
        args = [executable, "--headless", "--nologo", "--nodefault", "--nofirststartwizard",
                f"-env:UserInstallation={profile}", "--convert-to", "pdf:" + FILTERS[extension],
                "--outdir", str(out), str(staged)]
        proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                start_new_session=(os.name == "posix" and not supervised))
        try:
            stdout, stderr = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            if os.name == "posix" and not supervised:
                os.killpg(proc.pid, signal.SIGKILL)
            else:
                proc.kill()
            proc.communicate()
            raise TimeoutError("Office conversion timed out") from exc
        pdf = out / "input.pdf"
        if proc.returncode != 0 or not pdf.is_file() or pdf.stat().st_size < 8:
            raise RuntimeError("Office conversion failed: " + stderr.decode(errors="replace")[-1000:])
        with pdf.open("rb") as f:
            if f.read(5) != b"%PDF-":
                raise RuntimeError("conversion did not produce a PDF")
        # Never overwrite an existing file, even if another process creates it meanwhile.
        with destination.open("xb") as target:
            try:
                with pdf.open("rb") as src:
                    shutil.copyfileobj(src, target)
            except Exception:
                target.close()
                destination.unlink(missing_ok=True)
                raise
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--soffice", default="soffice")
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--supervised", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    try:
        convert(args.input, args.output, executable=args.soffice, timeout=args.timeout, supervised=args.supervised)
    except (ValueError, OSError, RuntimeError, TimeoutError) as exc:
        parser.exit(1, f"Conversion failed: {exc}\n")
    print("PDF conversion completed")


if __name__ == "__main__":
    main()
