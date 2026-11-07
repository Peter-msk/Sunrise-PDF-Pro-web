# R42 layout and object fidelity checkpoint — 2026-11-07 KST

Status: DEVELOPMENT CHECKPOINT. Production remains R41; full Hancom/Excel reference equivalence is NOT VERIFIED.

## Implemented and verified

- Larger queue/output review workspace, selected-file outline, failure states and readable controls.
- Self-hosted PDF.js 6.5.438 renders the saved PDF bytes with page navigation, zoom and per-file save. Serialize paint cancellation so rapid page/zoom/file changes cannot reuse a busy canvas or replace a newer result with stale output. Preview canvas never generates HWP PDF pages.
- HWP/HWPX entry accepts only object-preserving export. rhwp 0.8.7 WASM interprets the document; print-profile SVG text and primitives are written with PDFKit. The old full-page image export entry/selector is removed.
- Embedded PNG/JPEG binary base64 containing // no longer triggers the external URL detector. Actual external URLs remain blocked.
- Locally defined arrow markers are supported.
- Embedded SVG images are decoded within bounded size/depth/count limits, independently sanitized, and inlined as vector primitives. Two viewports preserve intrinsic picture dimensions and internal viewBox mapping. Internal IDs/references are scoped; parent CSS selectors cannot cross image-document boundaries. Unverified hidden-image visibility is rejected. Scripts, external references, foreign executable content and malformed XML remain blocked.
- Same-origin PDF worker route and CSP worker-src self; route method and asset-boundary tests pass.

## Evidence

Implementation commit: eeb1f2662835c01064a38593f04f23e2ea4c1166.

- 80 local regression tests passed, including real vector PDF pixel/color/position checks and no-raster-image assertions.
- CI rich document run 42348624584: PASS — 7 actual application exports, 15 PDF pages, every page rendered/inspected; desktop, 390px mobile width, rapid navigation/zoom/file-switch checks; no document upload or external requests.
- CI font regression 42348624619: PASS.
- CI Excel/image regression 42348624576: PASS. The Excel path tested here is still the existing cell-reflow implementation, not a newly connected native engine.
- Initial rich CI failed because its PDF inspector attempted Pillow-based image extraction without Pillow. The inspector now counts image-object metadata through PyMuPDF; conversion and visual assertions were retained. Final rich CI passes.

| Example | Pages | PDF image objects |
| --- | ---: | --- |
| footnote-tbox-01.hwp | 1 | 0 |
| group-drawing-02.hwp | 1 | 0 |
| hwpers_test4_complex_table.hwp | 1 | 0 |
| centered_cell_nested_table.hwpx | 1 | 0 |
| test-image.hwpx | 5 | 1 original picture per page |
| svg_picture_repro.hwpx | 3 | 0, SVG pictures stay vector |
| hwp_table_test_saved.hwp | 3 | 0, contains 10 parsed tables including merged cells |

The name hwpers_test4_complex_table.hwp is not proof of table content: native rhwp explain reports zero tables. It is excluded as evidence of complex-table fidelity. The additional hwp_table_test_saved.hwp has ten tables with verified merged-cell structures. Sources are pinned by SHA-256 in browser-local/tests/r42-fixtures.mjs.

## Office layout feasibility — local only

scripts/verify-office-layout.py creates synthetic XLSX and XLS test examples and exports them through a separate native LibreOffice path. This script is a QA probe, not an HTTP service or integrated browser converter. Dependencies: Python openpyxl, Pillow, PyMuPDF, a local soffice executable, and the bundled Nanum fonts. Run it in the supplied primary runtime with a new empty output folder.

Both formats exported two pages, preserving table fills, chart vectors, an original image, headers/footers, print area, hidden-sheet exclusion, portrait/landscape pages and cell comments as PDF Text annotations. Explicit checks cover embedded Korean font presence, no ### numeric overflow, formula total 10,553,400, expected page orientation and visible objects. All four native candidate pages were visually reviewed. The XLS and XLSX candidates have small geometry differences; no pixel-equivalence claim is made.

Runtime used: LibreOfficeDev 26.8.0.0.alpha0, build 2c87e51eeaa2b413ff4ae097b2705eea1995d8e5. This development runtime is not approved as a production engine. Native namespace isolation is unavailable on the local host. Only generated examples were processed; no user document upload endpoint was added.

## Outstanding release requirements

1. Hancom-produced reference PDFs for precise font/line/page/object geometry, background and annotation comparisons. Existing export/visible-object checks do not certify every source object or every document.
2. Stable Office runtime version, actual host/container isolation, transport/data-handling decision and native engine connection. Current web XLS/XLSX still reflows cells and does not preserve charts/styles/print layout.
3. Production deployment and live verification after those requirements are satisfied. Unit or CI success alone is not a release gate pass.
