# Sunrise PDF PRO — local browser converter

- Official upstream: [edwardkim/rhwp](https://github.com/edwardkim/rhwp), MIT License, tag v0.8.7.
- Direct dependency: `@rhwp/core@0.8.7` WASM for **local HWP/HWPX parsing and SVG page rendering**.
- `pdf-lib@1.17.1` assembles locally rasterized page images into a downloadable PDF. No network conversion API or server upload.
- Original HWP/HWPX files never leave the browser. WASM/JS are static site assets.
- Limitations: **rasterized image PDF** (text not searchable/selectable), font differences and SVG rendering limitations; maximum 20 MiB and 120 pages. It is not the native `rhwp export-pdf` CLI and should not be called text-preserving/vector PDF.

```bash
cd browser-local
npm install
npm run build
npm run preview
```

`npm run build` copies the exact package WASM into `public/` and builds the JS. `dist/` contains standalone static HTML, JS and WASM. These files can be hosted as Cloudflare Workers Static Assets **without a paid API or Linux container**. First verify the GitHub Actions real-browser HWP/HWPX PDF test; only then switch the public Worker UI.

Source provenance: include upstream under `vendor/rhwp-upstream` as a pinned Git submodule. MIT license copied to `THIRD_PARTY_RHWP_LICENSE.txt`; copyright retained.

**Security:** the engine generates SVG from untrusted documents. The implementation rejects active elements, external resources and scripts. Browser CSP limits network, no backend upload path. Input documents are never sent off device, but native SVG/font layout may vary by system.
