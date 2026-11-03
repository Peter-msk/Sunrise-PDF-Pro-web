# R28 Official rhwp real-conversion QA
- Workflow: `.github/workflows/r28-real-rhwp.yml`
- Tests **real** upstream `rhwp v0.8.7` Linux CLI (pinned SHA-256 release asset) with genuine HWP and HWPX documents from the official `edwardkim/rhwp` repository.
- Does not use mocks. Validates PDF structure/pages/sha256 and saves the PDFs as GitHub Actions artifacts.
- Run from **GitHub → Actions → R28 Official rhwp HWP-HWPX PDF Acceptance** (workflow_dispatch); push also triggers when the workflow file changes.
- **PASS only after the GitHub Actions run completes successfully**. Committing the workflow does not mean conversion ran.
- This validates CLI in a GitHub runner; it does not mean our Cloudflare Worker can run rhwp or that the HWP/HWPX conversion backend is deployed.
- Official release Linux x86_64 tar SHA-256: `f1e541a25cfe76b6bc1daf18bf9c1f9a5ac5e03e2c01b188daaf54107214f631`.
