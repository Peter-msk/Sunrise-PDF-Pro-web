#!/usr/bin/env python3
"""Compare candidate and reference PDFs locally; results require visual review."""
import argparse
import difflib
import json
import math
import re
from pathlib import Path

import fitz


def normalized_text(page):
    return re.sub(r"\s+", " ", page.get_text("text")).strip()


def compare(reference, candidate, dpi=96):
    if not 36 <= dpi <= 200:
        raise ValueError("DPI must be between 36 and 200")
    with fitz.open(reference) as ref, fitz.open(candidate) as out:
        if ref.needs_pass or out.needs_pass:
            raise ValueError("Password-protected PDFs are not supported")
        result = {"reference_pages": len(ref), "candidate_pages": len(out),
                  "page_count_equal": len(ref) == len(out), "dpi": dpi, "pages": []}
        for i in range(min(len(ref), len(out))):
            a, b = ref[i], out[i]
            ar, br = a.rect, b.rect
            at, bt = normalized_text(a), normalized_text(b)
            # The ratio is only a text-content signal, not layout fidelity.
            # Bound comparison cost for large pages; disclose truncation in report.
            limit = 20000
            ratio = difflib.SequenceMatcher(None, at[:limit], bt[:limit], autojunk=True).ratio() if at or bt else None
            item = {"page": i + 1, "reference_size_pt": [round(ar.width, 2), round(ar.height, 2)],
                    "candidate_size_pt": [round(br.width, 2), round(br.height, 2)],
                    "reference_rotation": a.rotation, "candidate_rotation": b.rotation,
                    "size_equal": abs(ar.width-br.width) <= 0.5 and abs(ar.height-br.height) <= 0.5,
                    "reference_text_chars": len(at), "candidate_text_chars": len(bt),
                    "text_similarity": round(ratio, 4) if ratio is not None else None,
                    "text_comparison_truncated": len(at) > limit or len(bt) > limit}
            # Render to grayscale; avoid allocations on unusually large pages.
            w, h = math.ceil(ar.width*dpi/72), math.ceil(ar.height*dpi/72)
            if item["size_equal"] and w*h <= 16_000_000:
                matrix = fitz.Matrix(dpi/72, dpi/72)
                pa = a.get_pixmap(matrix=matrix, colorspace=fitz.csGRAY, alpha=False)
                pb = b.get_pixmap(matrix=matrix, colorspace=fitz.csGRAY, alpha=False)
                if (pa.width, pa.height, pa.stride) == (pb.width, pb.height, pb.stride):
                    delta = sum(abs(x-y) for x, y in zip(pa.samples, pb.samples))
                    item["grayscale_mean_absolute_difference"] = round(delta/(len(pa.samples)*255), 6)
                else:
                    item["render_comparison_skipped"] = "render dimensions differ"
            else:
                item["render_comparison_skipped"] = "page sizes differ or render exceeds pixel limit"
            result["pages"].append(item)
        result["notice"] = "Indicators only; human review is required. No fidelity or conversion success is certified."
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--dpi", type=int, default=96)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.resolve() in {args.reference.resolve(), args.candidate.resolve()}:
        parser.error("output must not overwrite either input")
    try:
        report = compare(args.reference, args.candidate, args.dpi)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (ValueError, OSError, RuntimeError) as exc:
        parser.exit(2, f"Comparison failed: {exc}\n")
    print(f"Report saved: {args.output}")


if __name__ == "__main__":
    main()
