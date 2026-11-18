# DEV46 — RHWP 0.9.0 migration / real-document QA gate
Date: 2026-11-18 KST. Base: 1fba442f6b74adfd7da882440ae43ee65c525032 (DEV45).
Status: HOLD — registry binary unavailable in current execution environment; no new runtime, lock, or hash has been claimed or deployed.

## Evidence
Anonymous local QA JSON generated 2026-11-18T10:41:00.816Z: 25 queued, 15 done, 10 failed; 134 vector pages and zero raster pages in successes. HWP 7/12, HWPX 8/13. All 15 successes reported font substitution (3–8 families) and unmatched PC families (8–16). SVG_FILTER_EFFECT_UNSUPPORTED / other-primitive: #3,4,9,10,11,12,13,14. PDF_STREAM_TIMEOUT: #24,25 (134732 / 129993 ms). Report lacks build_revision, deployment_channel, stream_reason, stream_pending_refs and filter_primitive; it cannot establish which deployed build was tested or root cause. Original files/PDFs are not available. Do not upload originals, do not label fixture runs real conversion.

## P0 migration (internet-connected dev machine; never production)
Official release https://github.com/edwardkim/rhwp/releases/tag/v0.9.0 and https://www.npmjs.com/package/@rhwp/core/v/0.9.0 confirm public 0.9.0. Use core only, not editor. The PDF import feature is not proof of improved HWP-to-PDF export.

1. Checkout this branch, verify clean tree, confirm no deploy hook. Use Node 24.
2. From browser-local, run:
   ```cmd
   npm view @rhwp/core@0.9.0 version dist --json --registry=https://registry.npmjs.org/
   npm install --save-exact --ignore-scripts --no-audit --no-fund @rhwp/core@0.9.0 --registry=https://registry.npmjs.org/
   node -e "const fs=require('node:fs'),c=require('node:crypto'),p='node_modules/@rhwp/core/rhwp_bg.wasm',b=fs.readFileSync(p); console.log(JSON.stringify({bytes:b.length,sha256:c.createHash('sha256').update(b).digest('hex')}))"
   ```
   Validate package metadata, npm integrity and available upstream signature/provenance. Reinstall with npm ci from updated lock; verify independently installed WASM hash again. Do not use a calculated hash from an untrusted binary as proof of authenticity.
3. Update runtime pins, verified byte count and hash together. Known owners: browser-local/package.json, package-lock.json, scripts/copy-wasm.mjs, scripts/verify-engine-contract.mjs, scripts/diagnose-local.mjs, scripts/verify-local-build.mjs, tests/r66-engine-contract.mjs. Search **all active build/runtime/test/deployment** sources for old values, not historical records. No guessed digest or weakened check. Reversed test fixture must use 0.8.7 as rejected drift, not 0.9.0.
   ```cmd
   git grep -n -e 0.8.7 -e 11821756 -e 54cf95014312e605c51b98eb9021247ea79ef2bbd0a7080e11c011d0246e3989
   ```
4. Check actual API compatibility: default init, HwpDocument, pageCount, renderPageSvgWithProfile(print), font measurement and disposal, and real HWP and HWPX fixture output. Preserve self-hosted WASM and local-only privacy. Add actual engine version and build identity to UI/report; use verified build metadata, not an unverified string. Do not retain DEV44 UI marker on DEV46.
5. Update stale fixture expectations only from real 0.9.0 engine output; validate effects, original pixels, dimensions, alpha, crop, SVG geometry and PDF visual/structural integrity. If 0.9.0 differs from 0.8.7, analyze rather than silence assertions. Preserve object-preserving output; no automatic full-page raster conversion.
6. Run existing source/engine checks, targeted tests (including new DEV46 test), actual-browser gate and local build:
   ```cmd
   npm run check:source
   npm run check:engine
   npm run test:dev44
   node --test tests/dev46-real-qa-baseline.mjs
   npm run test:dev44:browser
   npm run build
   npm run verify:dist
   ```
   Chromium setup if missing: npx playwright install chromium. Browser test label and version-specific fixture must use verified DEV46 build. No production deployment.

## P0 real failures
- Re-run exactly same 25 originals in identical queue order, on identified local or isolated QA build. #3,4,9–14: record safe filter primitive/category, inspect actual SVG structure, support proven compatible image-only effects with exact appearance; unsupported effects must fail closed. Do not delete arbitrary filters or silently flatten text.
- #24,25: identify stream reason (NO_BYTES, NO_FINAL_BYTES, FINAL_BYTES_NO_END, END_SEEN_NO_COMPLETION), integrity state, refs pending, source pages, last page, cancellation and cleanup. Existing diagnostics in local-batch-qa.mjs and svg-professional.js must be used first. No unconditional timeout increase; only publish PDF after actual header/trailer/xref/page validation.
- Font substitutions are not full fidelity. Compare original PDF or Hancom-generated reference locally, correct mismatched families and measure line wrapping. Do not distribute unauthorized fonts.
- Preserve 15 previous successes; compare page counts, vector output, font layout, crop and visual parity. 25/25 completed with no regression is structural acceptance only; all 25 visual and text-search/selection reviews plus PC/mobile acceptance and actual build identity required before separate production approval.
- Regression fixture tests/dev46-real-qa-baseline.mjs records this failure distribution but is not evidence of repaired conversion.


## DEV46 continued work — verification tooling
- New `browser-local/scripts/inspect-rhwp-090-package.mjs`: obtains official registry dist metadata and npm archive in a temporary directory without lifecycle scripts; verifies SHA-512 before extracting only named files, verifies package identity and WASM validity, emits SHA-256 and byte count; no source modifications or deployment. Registry signature/provenance and browser tests are separately NOT_RUN. Node 24 and tar are target prerequisites.
- New `browser-local/scripts/compare-dev46-qa.mjs`: local-only structural comparison of the original and current 25-file JSON; rejects missing declared DEV46+ / 0.9.0 / local or QA channel identity, stale report, mismatched format/order, failed or invalid outputs, false summaries, page-count regressions and full-page raster output. Reports unmet diagnostics and font review by anonymous index. Declared identity and same-order comparison alone cannot authenticate the actual engine or original document identity. Successful structural comparison means VISUAL_REVIEW_REQUIRED only.
- Local Node 22.16.0/Linux targeted tests: 14 PASS, 0 FAIL (9 comparison cases against actual uploaded JSON; 5 synthetic archive cases). All four source/test Git blob SHAs matched remote. Comparing original JSON to itself intentionally returns BLOCKED (exit 1): 10 remaining failures, 15 font-review cases, 10 missing diagnostics. This is NOT a new document conversion test.
- Actual npm acquisition attempt blocked (DNS resolution failure in this environment); no verified 0.9.0 archive, no new WASM digest, dependency remains 0.8.7. No GitHub Actions run or production deployment in this continuation. Windows Node 24 execution and actual browser validation remain open.
- In internet-enabled Windows CMD, from repository root:
  ```cmd
  git switch fix/dev46-rhwp-090-real-qa-20261118
  git pull --ff-only
  cd browser-local
  npm run inspect:rhwp090
  npm run test:dev46:package
  set "DEV46_QA_BASELINE=C:\path\Sunrise_PDF_PRO_Web_QA_20261118104100.json"
  npm run test:dev46:real-qa
  ```
  After verified migration and actual retest export: `npm run qa:compare-dev46 -- "<baseline.json>" "<new-report.json>"`. The new report must include the actual verified engine/build identity; do not fabricate it in JSON. The current report generator does not yet emit rhwp_version; add it as part of the real engine migration, with independent runtime verification. The two opt-in tests are not added to general npm test; no duplicate or mandatory private-file test in build.


## DEV46 engine migration checkpoint — 2026-11-19 KST
- Successful official npm archive acquisition: Actions run 44399172180, artifact 14470303707. `@rhwp/core@0.9.0`, SHA-512 integrity `sha512-dEe9gtEM5QXAoJjX+fwgbN5KIo0a6X/wgwEg0LDcq9oY1ga5lD5vNkediFSSX4Xxs8VfFk//dbk71aMQ8J1uAQ==`; WASM size 26,835,482 bytes; SHA-256 `c3b0632b84881f81f2c80be7c2f9e44a4086cb01e05a6a9107a3b3c6350abc1d`; no package dependencies. Archive verified against official registry metadata and WebAssembly.validate. Independent registry signature check not run.
- Commit 999b5e32957395dbedd66a308b4d36aee0ba7365: package and lock now pin 0.9.0; build and runtime manifest, Worker route/health, local diagnostics, and QA build identity updated. The JSON field rhwp_version is null until verified bytes actually initialize the engine. No original document leaves the browser.
- Cloudflare Workers' 25 MiB individual static asset limit is exceeded by 621,082 bytes. Versioned same-origin parts are 16,777,216 and 10,058,266 bytes. Build verifies whole SHA and part sizes; runtime uses bounded stream reads and verifies SHA-256 before explicit WASM initialization. No R2 or external CDN required. The old /local/rhwp_bg.wasm route is replaced; reload existing tabs after a future approved deployment.
- First candidate CI run 44399639748: npm ci, source/engine checks, safe fonts, split WASM, Vite build and local dist verification PASS; deployment asset-size gate FAIL. Vite automatically emits a redundant oversized raw wasm-bindgen default URL asset. No browser test executed in that run.
- Follow-up commit d0cbec6145b277d3a8a766aa6c7fcb4bd3841265: narrowly scoped Vite pre-transform removes the generated fallback URL for the RHWP package (explicit verified bytes are required); added actual split binary integrity and rejection tests; reruns affected build and real browser gates with no deploy. Candidate remains HOLD until new CI results and actual 25-file original retest. No production branch, secrets, user files, Cloudflare deployment, or D1 changes.
