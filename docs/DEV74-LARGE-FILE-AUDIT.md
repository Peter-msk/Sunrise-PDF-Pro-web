# DEV74 — Large/complex file audit and handoff

Status: targeted code improvements committed; full release acceptance pending. No Actions launch, merge, deployment or production D1 mutation.

## Implemented
- No fixed whole input-file byte ceiling, queue-count cap or document page cap was found in the inspected main converter path; the existing practical runtime/format limits remain.
- Per-page SVG source: 64 → 192 Mi characters. Per embedded PNG compressed data: 48 → 96 MiB. Aggregate page PNG source 128 MiB, decoded/output pixel budgets, vector path/node complexity, external-resource rejection, ZIP expansion and PDF structural validation remain guarded.
- PDFKit final stream: 120 seconds without actual new bytes, instead of 120 seconds of total finalization time. Zero-byte data does not extend the timer.
- Spreadsheet layout: avoid duplicated cell objects, transient row height arrays, unnecessary per-page preview SVG, argument-count limit and retain fewer parsed sheet objects. Wide-sheet readability constraints and spreadsheet format bounds remain.
- ZIP32 entry-count/size limits retained; above 128 MiB aggregate output, archive generation is explicit rather than automatically duplicating large data. Individual PDF downloads remain available. Automatic PDF.js preview of a result over 128 MiB is deferred; manual preview remains available. These thresholds are behavior choices, not admission limits.

## Evidence (local / connector-fetched sources)
- Synthetic HWPX fixtures based on existing public image fixture: 80,461,998 bytes (5 page-break paragraphs, 5300 x 5060 bitmap) and 3,228,903 bytes (105 page-break paragraphs, 105 picture references). Synthetic XLSX: 1,358,622 bytes, three sheets, 30,000 data rows, 240,000 data cells and 30,000 cached formulas. All three ZIP CRC and XML checks passed. HWPX page counts are intended paragraph counts, not renderer-confirmed counts.
- Actual decoded embedded BMP: 5300 x 5060, RGB. Re-encoded PNG: 78,130,286 bytes. Actual base64 SVG: 104,173,800 characters, rejected by old source cap and admitted by new cap. Full render and image normalization not established by this admission test.
- GitHub-fetched spreadsheet layout functions with a matching synthetic 240,000-cell workload: 240,027 cell objects including headings, 813 planned pages; all three final row markers and merged headers retained. Not a full SheetJS parse or PDF rendering test.
- 20 focused checks (18 dynamic/logic, 2 static), plus 3 generated package checks. Includes actual local Node tests of source admission and idle timeout, and source-based large-sheet/ZIP checks. The newly committed complete regression script itself has not been run against the full dependency graph. Historical DEV73 629/629 PASS does not cover DEV74 changes.
- Direct Git clone is unavailable due DNS in the current environment. Whole-repository audit and end-to-end real-document conversion remain unverified; no blanket unlimited-resource or perfect-fidelity claim.

## Manual Windows CMD
```cmd
git clone --branch fix/dev74-large-complex-files-20261125 --single-branch https://github.com/Peter-msk/Sunrise-PDF-Pro-web.git
cd Sunrise-PDF-Pro-web
npm run build:release
npm run test:large
npm --prefix browser-local run test:hwp -- "C:\QA\DEV74_large_image_5pages.hwpx"
```

For the long HWPX fixture, repeat the last command with its path. Test XLSX using the normal converter UI. Use a reference PDF from a trusted native renderer for page-by-page comparison. Do not use the old main branch for this candidate. Existing DEV73 database and release prerequisites still apply; see root README.