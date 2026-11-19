# DEV48 production QA remediation — 2026-11-19

Source: anonymous user production QA, RHWP 0.9.0, prior output marker DEV46.
10 HWP files: 7 completed (86 vector pages), 3 failed. #5 94 pages/last 20 and #10 132 pages/last 13: FONT_FAMILY_OR_VARIANT_UNAVAILABLE. #7 42 pages/last 18: OTHER_ERROR at pdf_write. No reported SVG filter or final stream timeout in this set. Duration sum 382227 ms. No original documents or filenames available.

Changes: glyph-covered, already-registered local/manual face last resort, exact face identity for textless callback where ambiguous, per-batch bounded font read cache, fixed privacy-filtered font/PNG/PDF writer diagnostics and DEV48 marker. Original glyph and PDF integrity gates remain. No automatic raster fallback. No claim these source changes repair the unknown original glyph/image/writer errors.
Verification: 5 focused dependency-independent tests executed against source in isolated JS runtime; real Chromium/Windows PC font/PDF/full release tests pending. GitHub Actions prohibited and not used. Production deployment unchanged.
