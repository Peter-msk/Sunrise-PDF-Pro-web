#!/usr/bin/env python3
"""Compare two conversion PDFs without uploading or modifying either document.

Local-only QA helper. Dependencies: pip install pymupdf.
"""
import argparse
import hashlib
import json
from pathlib import Path


def inspect_document(path):
    import fitz

    pages = []
    with fitz.open(path) as pdf:
        for index, page in enumerate(pdf):
            images = page.get_images(full=True)
            fonts = page.get_fonts(full=True)
            page_info = {
                "page": index + 1,
                "width_pt": round(page.rect.width, 2),
                "height_pt": round(page.rect.height, 2),
                "text_chars": len(page.get_text()),
                "font_objects": len(fonts),
                "vector_drawings": len(page.get_drawings()),
                "image_objects": len(images),
                "largest_image_pixels": max((i[2] * i[3] for i in images), default=0),
            }
            pages.append(page_info)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return {
        "filename": path.name,
        "bytes": path.stat().st_size,
        "sha256": digest,
        "page_count": len(pages),
        "total_text_chars": sum(x["text_chars"] for x in pages),
        "total_font_objects": sum(x["font_objects"] for x in pages),
        "total_vector_drawings": sum(x["vector_drawings"] for x in pages),
        "pages": pages,
    }


def compare(left, right):
    same_count = left["page_count"] == right["page_count"]
    per_page = []
    for i in range(min(left["page_count"], right["page_count"])):
        a, b = left["pages"][i], right["pages"][i]
        per_page.append({
            "page": i + 1,
            "same_orientation": (a["width_pt"] >= a["height_pt"]) == (b["width_pt"] >= b["height_pt"]),
            "width_difference_pt": round(b["width_pt"] - a["width_pt"], 2),
            "height_difference_pt": round(b["height_pt"] - a["height_pt"], 2),
            "text_chars_difference": b["text_chars"] - a["text_chars"],
            "vector_drawing_difference": b["vector_drawings"] - a["vector_drawings"],
            "image_difference": b["image_objects"] - a["image_objects"],
        })
    return {
        "same_page_count": same_count,
        "text_layer_preserved": right["total_text_chars"] > 0 if left["total_text_chars"] > 0 else None,
        "vector_content_preserved": right["total_vector_drawings"] > 0 if left["total_vector_drawings"] > 0 else None,
        "comparisons": per_page,
        "note": "Quantitative object comparison only; page raster diff and typography review must be verified separately.",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("reference", type=Path, help="Trusted PC conversion PDF")
    parser.add_argument("candidate", type=Path, help="Web conversion PDF")
    parser.add_argument("--output", type=Path, help="Optional JSON report (never uploads inputs)")
    args = parser.parse_args()
    for path in (args.reference, args.candidate):
        if not path.is_file() or path.suffix.lower() != ".pdf":
            parser.error("Both inputs must be existing PDF files.")
    pc = inspect_document(args.reference)
    web = inspect_document(args.candidate)
    report = {"reference": pc, "candidate": web, "comparison": compare(pc, web)}
    data = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(data + "\n", encoding="utf-8")
    else:
        print(data)


if __name__ == "__main__":
    main()
