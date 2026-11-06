# Sunrise PDF PRO Web — R40-DEV4 Release Candidate

> Status: Release candidate for validation. The existing Cloudflare production version must remain unchanged until the branch passes CI, downloaded PDF/ZIP inspection, and document-quality acceptance.

## Service

- GitHub: `Peter-msk/Sunrise-PDF-Pro-web` (main is production)
- Worker: `sunrise-pdf-pro-web` (independent from `sunrise-pdf-editor`)
- Production URL: <https://sunrise-pdf-pro-web.ko-pg.workers.dev/local/>
- Uploads: HWP/HWPX sources are processed inside the user's browser; no document upload API.

## R40 behavior

1. Choose or drag multiple `.hwp`/`.hwpx` files. They are processed sequentially to avoid shared font-layout state corruption.
2. **Default `professional`**: `@rhwp/core@0.8.7` WASM parses the document; `renderPageSvgWithProfile(page, 'print')` supplies SVG to the PDFKit object-preserving renderer. Searchable text depends on glyph/font coverage and the source.
3. Unsupported SVG/font/glyph layout must fail explicitly; never silently fall back to page images in default mode. A draft PDF is discarded on failure/cancellation.
4. **Optional `stable`**: user-selected raster PDF compatibility mode. The preview image is not the PDF representation.
5. Results have per-file PDFs and, for two or more successes, one ZIP. Per-file failures can be retried and existing completed files remain downloadable.
6. Bundled Nanum Gothic/Myeongjo fonts and optional user-supplied local TTF/OTF. Original Hancom COM-grade pagination/typography is **not guaranteed**.

### Limits and known unknowns

The web build does **not** run the Windows Hancom COM automation engine. A rhwp CLI conversion success is not proof of browser-export fidelity. Complex tables, drawings, mixed pages, character width transforms and uncommon fonts need comparison with the same document rendered by Hancom software. Some documents may reject rather than produce incorrect PDFs. Default professional mode cannot claim 100% source compatibility.

## Build and verification

Requires Node.js 22.12+ and browser-local lockfile. From repository root:

```sh
npm run build
npx wrangler deploy --dry-run
```

`npm run build` runs `npm ci`, browser-local tests, the Vite/WASM build and static Worker route checks. For a real browser conversion gate, use GitHub Actions **R40 Professional Batch PDF Real Browser E2E**. This checks bundled WASM, actual HWP+HWPX downloads, the combined ZIP, strict PDF parsing, extracted text, and unexpected PDF image XObjects. The suite must pass before production promotion.

A document-quality acceptance test using user-provided HWP/HWPX and Hancom-produced reference PDFs remains a separate release gate: compare page counts, A4/custom paper sizes, tables, drawings, text layout and font substitution on representative multi-page documents.

## Deployment

Cloudflare Workers Builds monitors GitHub `main`, executes `npm run build` and `npx wrangler deploy`. **Merging to main triggers production deployment**; keep feature/release branches in draft until CI and PDF inspection pass. Avoid any changes to the unrelated `sunrise-pdf-editor` Worker. In case of a regression, roll back only `sunrise-pdf-pro-web` to the previously known-good Worker version.

See `docs/R40_DEV4_HWPX_TEXT_LENGTH.md`, `docs/R40_DEV3_BATCH_HANDOVER.md`, `docs/R40_DEV2_OBJECT_PRESERVATION.md` and `RELEASE_R40_DEV4_STATUS.md` for previous findings and release acceptance decisions.