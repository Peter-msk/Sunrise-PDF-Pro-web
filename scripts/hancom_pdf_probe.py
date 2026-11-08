#!/usr/bin/env python3
"""Local, single-document Hancom automation probe. Requires installed Hancom on Windows."""
import argparse
import os
from pathlib import Path
import tempfile


def convert(source, output):
    if os.name != "nt":
        raise RuntimeError("Windows and installed Hancom Office are required")
    source, output = Path(source).resolve(), Path(output).resolve()
    if source.suffix.lower() not in {".hwp", ".hwpx"} or not source.is_file():
        raise ValueError("HWP or HWPX input required")
    if output.exists() or output == source:
        raise ValueError("destination exists or is the input")
    import pythoncom
    import win32com.client
    pythoncom.CoInitialize()
    hwp = None
    try:
        hwp = win32com.client.DispatchEx("HWPFrame.HwpObject")
        # An operator-installed, approved security module is required.
        if not hwp.RegisterModule("FilePathCheckDLL", "SecurityModule"):
            raise RuntimeError("Hancom security module is not configured")
        with tempfile.TemporaryDirectory(prefix="sunrise-hancom-") as tmp:
            candidate = Path(tmp) / "output.pdf"
            if not hwp.Open(str(source), "", ""):
                raise RuntimeError("Hancom could not open document")
            if not hwp.SaveAs(str(candidate), "PDF", ""):
                raise RuntimeError("Hancom PDF export failed")
            if not candidate.is_file() or candidate.stat().st_size < 8:
                raise RuntimeError("Hancom produced no PDF")
            with candidate.open("rb") as f:
                if f.read(5) != b"%PDF-":
                    raise RuntimeError("Hancom output is not a PDF")
            with output.open("xb") as dest:
                try:
                    with candidate.open("rb") as src:
                        import shutil
                        shutil.copyfileobj(src, dest)
                except Exception:
                    dest.close()
                    output.unlink(missing_ok=True)
                    raise
    finally:
        try:
            if hwp is not None:
                hwp.Quit()
        finally:
            pythoncom.CoUninitialize()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        convert(args.input, args.output)
    except Exception as exc:
        parser.exit(1, f"Conversion failed: {exc}\n")
    print("PDF conversion completed")


if __name__ == "__main__":
    main()
