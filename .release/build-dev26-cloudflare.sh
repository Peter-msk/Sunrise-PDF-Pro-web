#!/usr/bin/env bash
set -euo pipefail

# Sunrise PDF PRO(web) R65 -> DEV26 release, pinned and fail-closed.
# Run only on the dedicated release branch after the prior Chromium E2E PASS.
if [[ "${CF_PAGES_BRANCH:-${WORKERS_CI_BRANCH:-release/dev26-cloud-build-20261112}}" != "release/dev26-cloud-build-20261112" ]]; then
  echo 'Unexpected branch; refusing DEV26 production build' >&2
  exit 41
fi

BASE='2a11edbdb3d1413b3ef4a6eccb150dd442c2f7cf'
PATCH='.release/DEV26_R65_INTEGRATED_DIFF.patch'
FIX='.release/DEV26_TEST_JPEG_FIX.patch'
HOTFIX='.release/DEV26_REAL_FAILURES_HOTFIX.patch'

test "$(git hash-object "$PATCH")" = 'd8e7b953237f2930965ec7a41b3ab2470273c3da'
echo "5821e41d655f5d87b11fcf2b4b8b7bfdec8be0f3fd5f33292211dfb7e7592d96  $PATCH" | sha256sum -c -
echo "42b9cf09b541eb0d555e852abbc8db0043cb59145d872b745be62bdd81e37118  $FIX" | sha256sum -c -
echo "e1d085013ab1bb78baf0a6bda5e1cffa0f38571b3a3a32e26b4de9edc2de82b3  $HOTFIX" | sha256sum -c -

# Must be an R65 descendant. If checkout history is shallow, verify via the
# original exact main anchor rather than allowing a different baseline.
if git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  git merge-base --is-ancestor "$BASE" HEAD
else
  test "$(git show HEAD:browser-local/src/svg-professional.js | git hash-object --stdin)" = '192b7ed5c6ed0df5202e9ac02fe99013eb5e3ae2'
fi

git apply --binary --check "$PATCH"
git apply --binary "$PATCH"
git apply --check "$FIX"
git apply "$FIX"
git apply --check "$HOTFIX"
git apply "$HOTFIX"
git diff --check

test -f browser-local/tests/r66-svg-vector-budget.mjs
node --version
npm run build
npm --prefix browser-local run verify:dist
node scripts/verify-browser-build.mjs
node scripts/test-worker-assets.mjs
test -s browser-local/dist/rhwp_bg.wasm
sha256sum browser-local/dist/rhwp_bg.wasm
test -f browser-local/tests/r66-real-failure-compat.mjs
printf '%s\n' 'DEV26 REAL FAILURE HOTFIX BUILD & FULL TEST PASS'
