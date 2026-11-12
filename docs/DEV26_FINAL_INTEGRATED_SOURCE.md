# DEV26 final integrated source — development only

Original source: R65 main `2a11edbdb3d1413b3ef4a6eccb150dd442c2f7cf`.
Audited QA parent: `8961f8fbf697fcdf5c1c9ce70734f48af11d2354`.
Cumulative code: eight pinned `.release/*.patch` applied sequentially by
`.release/build-dev26-cloudflare.sh`, including binary fixtures.

This branch commits the resulting actual browser/source files. For
subsequent validation of this branch use `npm run build`, not the
legacy patch-applying builder (it must not run twice). Production
deployment, merging main, and admin/D1 mutation are NOT part of
this source-integration action.

Previous real Chromium QA on audited parent:
https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43181829604

Known open acceptance gates: Windows Chrome/Edge real installed
fonts, suspended/minimized browser limits, genuine complex HWP/HWPX
fidelity against Hancom PDF, admin document-open failures, and
administrator authenticated E2E. PPT/PPTX remains unsupported.
