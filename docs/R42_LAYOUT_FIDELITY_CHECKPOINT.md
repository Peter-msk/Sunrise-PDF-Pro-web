# R42 UI / conversion fidelity checkpoint — 2026-11-07 KST

Status: IN DEVELOPMENT. Not a release gate pass. Production is still R41.

## Implemented

- Wider document queue/output workspace, larger text and touch targets, selected file outline, separate failure rows.
- Self-hosted PDF.js 6.5.438 renders actual generated PDF bytes. Previous/next, page count, 100/150/200% preview, selected-result download. Canvas is screen-only; it does not generate HWP PDF pages.
- HWP/HWPX conversion entry rejects every engine except professional. The former stable/full-page image PDF branch and user selector were removed. rhwp 0.8.7 WASM remains the parser/layout engine; print-profile SVG text/shapes are written with PDFKit. This is not a native Hancom COM engine and does not prove Hancom layout equivalence.
- Valid embedded PNG/JPEG base64 containing // no longer triggers the external URL detector. Real protocol-relative URLs remain blocked.
- Locally defined SVG arrow markers are now accepted by preflight; the pinned SVG-to-PDFKit renderer supports these objects. External marker references remain blocked.
- Same-origin PDF worker route and CSP worker-src self, including GET/HEAD and POST rejection checks.

## Observed browser checks

Six synthetic upstream rhwp v0.8.7 corpus examples, manually selected through the actual application. Before: 3 done / 3 failed. After: 5 done / 1 failed.

| Example | Before | After |
| --- | --- | --- |
| footnote-tbox-01.hwp | done | done |
| group-drawing-02.hwp | unsupported marker | done |
| hwpers_test4_complex_table.hwp | done | done |
| centered_cell_nested_table.hwpx | done | done |
| test-image.hwpx | image data incorrectly rejected | done, 5 pages |
| svg_picture_repro.hwpx | embedded SVG reference blocked | still blocked |

The generated test-image PDF preview was navigated from page 1 to 5, including 150% zoom and fit mode. These checks establish export completion and viewer operation, not visual equivalence to Hancom output. Source samples came from edwardkim/rhwp v0.8.7 fuzz/corpus, extracted individually from an incomplete archive; no claim is made that the whole archive is valid.

## Validation

- Browser-local automated suite: 73 tests passed.
- Vite build: passed; bundle-size advisory remains.
- Static asset/WASM/font/PDF-worker verification: passed.
- Worker route/CSP/health checks: passed.

## Outstanding — do not mark complete

1. Safely preserve embedded SVG picture objects without permitting external resources or rasterizing HWP pages.
2. Side-by-side source/reference PDF comparison for headers, footers, page backgrounds, notes/comments, fonts, textbox position, table boundaries, embedded images and page breaks. Current examples do not certify every object class. No genuine Hancom reference PDF corpus has been established for these examples.
3. XLS/XLSX currently reflow cell data and do not preserve original styles, charts, drawings or print layout. A native spreadsheet layout/export path is required. No native Office runtime is deployed or connected to the browser.
4. Mobile layout and full new-viewer E2E CI run, render cancellation/rapid page navigation regression, actual PDF file inspection and object-level comparison.
5. Release only after the above quality gates are resolved. Do not replace the R41 production deployment with this checkpoint merely because unit tests pass.
