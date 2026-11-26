# DEV75 — Remove application conversion ceilings

Base: DEV74 cd33f0c09a3ac0ac4487123494b02f0674484fa0.

## Policy
Do not reject a supported, structurally valid document merely because of a fixed application input size, page count, vector complexity, image count or pixel budget. Preserve original pixel dimensions for PNG/JPEG where the decoder supports them; no automatic large-image downsampling. Explicit test limits remain injectable. Conversion defaults for file read, image codec, SVG raster, font read, GIF/PNG normalization and PDF finalization use cancellation rather than fixed timeouts. A genuinely stuck native task may require tab reload; synchronous WASM cannot be interrupted by JS timers.

Wide/tall spreadsheet layouts extend the logical PDF paper and preserve vector cells. Where required, scale the whole physical page proportionally to the 14,400-point media box compatibility range. No claim of reproducing spreadsheet charts or all original print formatting.

## Verification
12 focused assertions executed on the fetched modified sources: 8 SVG/PNG/JPEG/placement assertions and 4 mocked spreadsheet layout/draw assertions. 5300x5060 and 20000x10000 preserve dimension plans; 2,228,286-byte JPEG metadata parsed; 240-column layout with tall row emitted bounded vector drawing coordinates including final column. This is NOT an actual 200 MP image decode or full PDF conversion.
New regression command: npm run test:unrestricted. Full dependency build and test suite not run; direct git clone cannot resolve github.com in current runtime. Legacy regression expectations partly updated; additional incompatibilities may remain. No GitHub Actions or Cloudflare deployment launched for DEV75.

## Technical boundaries
Browser ArrayBuffer/string/Canvas/WASM limits, PDF page dimensions, format-specific constraints, PNG exact inflated scanline length/checksum, ZIP32/ZIP64 unsupported formats, XLSX compression ratio/path validation, SVG unsafe resources/scripts/events, unsupported font or geometry features, and invalid metadata checks remain. Real RAM exhaustion, browser process termination and synchronous engine stalls are still possible. This is removal of application resource ceilings in inspected paths, not an unlimited-resource or complete format-support guarantee. ZIP packaging is a separate operation, not a PDF conversion restriction.

DEV74 Cloudflare build terminated at clone; existing active worker remains dc6de856 at last lookup. Do not claim DEV75 is live before verified deployment.
