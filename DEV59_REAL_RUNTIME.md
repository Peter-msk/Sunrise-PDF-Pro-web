# DEV59 — real-runtime acceptance preparation and partial execution

Baseline audit 6c9824ef1289e55510aa1d751143707da8c7e7d3. No core/production source changes. No GitHub Actions, production build, deployment or merge.
- Runtime availability checked in the current Linux container: Node v22.16.0, npm 10.9.2, system Chromium 144.0.7559.96. npm view pdf-lib@1.17.1 failed EAI_AGAIN; direct git ls-remote failed DNS resolution too. No cached pinned pdf-lib/@pdf-lib/fontkit/RHWP packages were located. Global fontkit 2.0.4 is not the pinned @pdf-lib/fontkit 1.1.1 and was not substituted. No actual full npm installation attempted after DNS preflight failed.
- REAL platform-only checks executed in system Chromium via Python Playwright with the existing fixture data (string length/FNV-1a cross-check PNG 108/98908519, JPEG 892/77d60eba). Native createImageBitmap dimensions 2x2 for both; PNG canvas RGBA pixels [255,0,0,255,0,255,0,128,0,0,255,255,0,0,0,0]; JPEG RGBA pixels [74,75,5,255,175,176,106,255,55,56,0,255,215,216,146,255]. Both native decoder checks PASS. These are source-image decode results, not PDF rendering or actual RHWP conversion. Node v22.16.0 native Blob/DecompressionStream trial of the copied verifyDirectPng function passed exact expansion, too-long expansion rejection and too-short expansion rejection (3/3). This repeats earlier pending-platform confirmation, not an npm suite.
- Shared original media and text fixtures, without altering assertions. 13/13 affected DEV53 and DEV55 dependency-free regression cases passed from fetched branch sources via isolated V8 import adapters and mock PDF/font services; two new runner files passed transformed JS syntax parsing, not actual ESM dependency resolution or execution.
- New test:dev59:browser uses actual pinned pdf-lib / @pdf-lib/fontkit / PDF.js, hash-verified approved font and real Chromium. Synthetic PageLayerTree gate requires parsers to agree on PDF page count, expected page dimensions, exact Hangul extraction, two embedded images, ten rendered pixel sample comparisons (clipping, RGB/alpha, stroke-only interior and JPEG), expected unsupported equation rejection. Then attempts actual public MIT HWPX through RHWP WASM, reports per-page blocker counts/errors, requires actual saved parseable output and matching page count; even successful public conversion is CONVERTED_UNVERIFIED_VISUAL, not visual parity. Desktop and Pixel 7 browser emulation are two separate contexts, external HTTP(S) blocked, stage timeout 120 seconds. No physical mobile equivalence. Gate is newly authored, has NOT RUN: real library/browser dependencies and approved font unavailable in this environment.
- Open gates: full native npm run test:dev58; full DEV59 synthetic saved PDF/pixel tests, public RHWP HWPX; physical Windows/Android/iOS and actual memory/wall-time measurements; DEV60 original 25 files; DEV56 compound borders and DEV57 equations remain incomplete. No deployment or claims of normal full converter operation.

## Reproducible local commands (Windows CMD, from repository clone)
git fetch origin
git switch --track origin/dev/direct-pdf-dev59-20261120
cd browser-local
npm ci
node scripts/install-safe-fonts.mjs
npx playwright install chromium
npm run check:source
npm run test:dev58
npm run test:dev59:browser

If tracking branch already exists use git switch dev/direct-pdf-dev59-20261120. Use a supported Node version for the pinned dependency lockfile. Preserve evidence and nonzero exits. Do not proceed to deployment or count desktop mobile emulation as physical-device certification.
