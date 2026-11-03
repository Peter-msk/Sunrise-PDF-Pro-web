# R29 — Cloudflare Worker independent browser-local route

- Public Worker route (after deployment): `/local/` — browser-local conversion UI.
- Official rhwp WASM v0.8.7 source is pinned in `vendor/rhwp-upstream` with MIT copyright; pinned npm package builds local Javascript bundle.
- Main own source files: `browser-local/`, generated static bundle `worker-assets/local-bundle.js`.
- The Worker serves `/local/assets/local-bundle.js` from our own GitHub-committed bundle, and proxies the **public non-document WASM binary** from pinned `cdn.jsdelivr.net/npm/@rhwp/core@0.8.7/rhwp_bg.wasm` only after exact byte count+SHA-256 validation.
- SHA-256: `54cf95014312e605c51b98eb9021247ea79ef2bbd0a7080e11c011d0246e3989`, size `11821756` bytes.
- The user's source HWP/HWPX remains in the browser; no server upload, login, paid API or Linux backend is required.
- The browser renders SVG pages to PNG canvases then packages image pages using pdf-lib. Text is **not searchable/selectable** and complex layout quality remains a separate gate.
- Existing `/` staging UI and `/api/*` (fail-closed pending backend) remain unchanged.
- Existing `sunrise-pdf-editor` Cloudflare Worker is not modified.
- Browser E2E test [GitHub Actions run 41641674622](https://github.com/Peter-msk/Sunrise-PDF-Pro-web-/actions/runs/41641674622) validated genuine HWP & HWPX to downloadable PDFs.
- Production route must be inspected through Cloudflare deployment and user browser; GitHub Actions alone cannot prove the live CDN fetch path works.

### Important note
While this approach uses no conversion API, it currently fetches static public rhwp WASM bytes through the Worker from a pinned npm CDN, which is not fully self-hosted. Replacing this with Cloudflare Workers Static Assets is the next supply-chain hardening step.
