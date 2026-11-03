# Sunrise PDF PRO Web — R28 Edge-to-Backend bridge

## Deployed runtime

- Cloudflare Worker: `sunrise-pdf-pro-web` — unchanged name, not the PDF Editor.
- GitHub canonical frontend: `public/index.html`, `public/style.css`, `public/app.js`.
- Bundled Worker: `src/worker.js` (regenerate if editing the three frontend files).
- API integration: fail-closed unless **both** Worker secrets are configured.

## Worker secrets/variables (Cloudflare dashboard, NOT in GitHub)

- `SUNRISE_BACKEND_ORIGIN` = dedicated **https://** Linux API origin (no path/query, never the Worker URL)
- `SUNRISE_EDGE_HMAC_SECRET` = random secret of at least 32 characters, identical to the backend's protected environment value

On every API request the Worker attaches signed headers: timestamp, random nonce and HMAC-SHA256 over `timestamp\\nnonce\\nMETHOD\\n/path?query`. Backend rejects unsigned, expired, altered and replayed requests.

The Worker allows only same-origin writes and never follows backend redirects. It does not handle user credentials itself; authenticated login, sessions, CSRF, job authorization and results remain the responsibility of the Linux FastAPI backend.

## Backend runtime

Cloudflare Containers currently requires a Workers Paid plan for this account; it returned an unauthorized plan-required response. A native `rhwp` CLI therefore cannot run in the current edge Worker. Deploy the R28 Linux backend bundle on a separate trusted host, with `bubblewrap`, `prlimit`, official pinned `rhwp` and persistent storage. Never expose that origin directly without HMAC validation.

## Test

`GET /api/edge-health` returns `backend_configured: false` until both Worker settings exist. `POST /api/jobs` returns 503 while unconfigured; no fake PDF is generated.

**Actual HWP/HWPX conversion is unverified** and must not be advertised as working until the official CLI generated and the application validated real PDFs.
