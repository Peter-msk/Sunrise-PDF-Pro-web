# R28 Real conversion + secure edge bridge — release status

## Completed and evidenced

1. **Official rhwp v0.8.7 genuine conversion PASS** — [GitHub Actions run 41636542190](https://github.com/Peter-msk/Sunrise-PDF-Pro-web-/actions/runs/41636542190). Upstream public HWP sample → 1-page PDF (1546 bytes); HWPX sample → 1-page PDF (1634 bytes). PDF files and structured JSON are stored as Actions artifacts.
2. **Linux backend image build PASS** — [GitHub Actions run 41637866326](https://github.com/Peter-msk/Sunrise-PDF-Pro-web-/actions/runs/41637866326). Fixed actual GLIBC_2.39 mismatch by upgrading base from Debian 12 to Debian 13 trixie. Official rhwp version and Python API import tests passed **inside the Docker image**.
3. **Backend source included in GitHub** — [backend/README.md](backend/README.md) and checksum-verified runtime tarball. Native rhwp Linux asset digest: `f1e541a25cfe76b6bc1daf18bf9c1f9a5ac5e03e2c01b188daaf54107214f631`. Backend source tarball SHA-256: `c7b430c663f41491922855704df065f81eebfd9fb3e732de404356d113c1f9c4`.
4. **Cloudflare Worker gateway code deployed** — browser UI, `GET /api/edge-health`, authenticated HMAC forwarding only if origin+secret configured. Both bindings currently absent, so all conversion requests fail closed. The separate PDF Editor Worker is unchanged.
5. **Local Python regression** — 312 passed, one skipped for unavailable Linux namespace capability. **Actual local TCP** signed-auth job API sequence 9/9 passed (without official binary locally).

## Not yet completed

- A persistent trusted Linux origin deployment. Cloudflare Containers API rejected this account because Workers Paid is required; an external trusted Linux host or eligible Containers plan is needed.
- Real Worker→HTTPS origin→PDF **browser end-to-end conversion**.
- Robust PDF visual fidelity comparison across tables, figures, fonts, multi-page documents and actual user documents.

**Release gating remains blocked.** Actual sample conversion PASS does not equal hosted service PASS. Do not configure public Worker backend bindings until the origin host, trusted TLS, HMAC secrets, user accounts, sandbox/namespace/egress safety and storage policies are verified.
