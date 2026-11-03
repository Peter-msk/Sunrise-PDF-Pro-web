# R28 rhwp Linux conversion backend — GitHub source package

## Contents
- `backend/r28_backend_runtime.tar.gz` — real, unmodified R27 Python/FastAPI job API with R28 HMAC authentication adapter (18 runtime source files; SHA-256 `c7b430c663f41491922855704df065f81eebfd9fb3e732de404356d113c1f9c4`)
- `backend/Dockerfile` — verifies that archive, downloads pinned official rhwp Linux v0.8.7 release, and installs it
- `backend/docker-entrypoint.sh` — fails closed without backend origin, users file and HMAC secret

This code is a **deploy-ready origin bundle, not an active cloud backend**.

## Build on an eligible x86_64 Linux host
```bash
docker build -f backend/Dockerfile -t sunrise-pdf-pro-origin:r28 .
```
Requires network access to the official GitHub release at build time, and Linux support for nested `bubblewrap` namespaces / `prlimit` on the actual host. The backend **refuses conversion** if those protections are unavailable.

## Required secure deployment
- Separate dedicated HTTPS upstream host, for example `https://<your-real-host>` — do not reuse the Cloudflare Worker host as an origin
- Non-root, single ASGI worker, persistent `/var/lib/sunrise` volume, egress restrictions and an HTTPS reverse proxy with the backend hostname
- User password-hash JSON mounted read-only (operator creates using the bundled `tools/create_web_user.py`), not committed to Git
- Environment: `SUNRISE_WEB_PUBLIC_ORIGIN=https://sunrise-pdf-pro-web.ko-pg.workers.dev`, `SUNRISE_WEB_BACKEND_HOST=<real TLS origin hostname>`, `SUNRISE_WEB_USERS_FILE=<mounted users.json>`, `SUNRISE_EDGE_HMAC_SECRET=<random 32+ chars>`
- Set Cloudflare Worker **secret bindings** `SUNRISE_BACKEND_ORIGIN=https://<real TLS origin>` and `SUNRISE_EDGE_HMAC_SECRET=<same secret>` only after validating the origin.
- Never enable `SUNRISE_WEB_DEV_HTTP=1` in production.

The Worker signs timestamp, nonce, HTTP method and exact path/query using HMAC-SHA256. The Python origin rejects unsigned, altered, stale and replayed requests. Application cookies, CSRF, account authorization, SHA-256 PDF integrity and upload limits remain enforced separately.

## Verified in development
- R28 inherited tests: 311 passed, 1 skipped.
- Added signed-request live TCP backend test: 9/9 checks passed (the official executable is missing **in the local build environment**, so PDF upload correctly fails closed).
- Official Linux CLI genuine HWP/HWPX→PDF **does pass** in GitHub Actions; see [live run 41636542190](https://github.com/Peter-msk/Sunrise-PDF-Pro-web-/actions/runs/41636542190).
- Full Worker→HTTPS origin→PDF E2E: **not yet tested or deployed**. Actual Cloudflare Containers API returned that Workers Paid is required.

## Security and release gate
Do not expose the backend directly on the internet without HMAC/TLS controls and sandbox verification. Never put user documents, API tokens, secrets or real user data in the image/repo. GitHub Actions test does not certify complex typography, picture rendering or whole-service readiness.
