<#
Sunrise PDF PRO(web) gated production deployment.
Default: build/test only. -Deploy allows Wrangler production upload only after all gates PASS.
Does not enable GitHub Actions, merge main, migrate D1 or replace secrets.
#>
[CmdletBinding()]
param([switch]$Deploy, [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$worker = 'sunrise-pdf-pro-web'
$branchExpected = 'fix/dev40-original-pdf-acceptance-20261116'
$repo = (Resolve-Path -LiteralPath $RepoRoot).Path
$log = Join-Path ([System.IO.Path]::GetTempPath()) ('SunrisePdfProRelease_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.log')

function Invoke-Checked([string]$command, [string[]]$arguments) {
    Write-Host ('RUN ' + $command + ' ' + ($arguments -join ' ')) -ForegroundColor Cyan
    & $command @arguments
    if ($LASTEXITCODE -ne 0) { throw ('RELEASE_GATE_FAILED: ' + $command + ' exited ' + $LASTEXITCODE) }
}
function Assert-Asset([string]$relative) {
    if (-not (Test-Path -LiteralPath (Join-Path $repo $relative))) {
        throw ('RELEASE_ASSET_MISSING: ' + $relative)
    }
}
Push-Location -LiteralPath $repo
try {
    foreach ($file in @('wrangler.jsonc', 'package.json', 'browser-local/package.json',
                        'browser-local/package-lock.json', 'src/worker.js')) {
        Assert-Asset $file
    }
    $config = Get-Content -Raw -LiteralPath 'wrangler.jsonc' | ConvertFrom-Json
    if ($config.name -ne $worker -or $config.main -ne 'src/worker.js' -or
        $config.assets.directory -ne './browser-local/dist') {
        throw 'RELEASE_WORKER_CONFIG_MISMATCH'
    }
    $branch = (& git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -ne $branchExpected) {
        throw ('RELEASE_BRANCH_MISMATCH: expected ' + $branchExpected + ' actual ' + $branch)
    }
    $dirty = @(git status --porcelain)
    if ($LASTEXITCODE -ne 0 -or @($dirty | Where-Object { $_.Trim() }).Count -gt 0) {
        throw 'RELEASE_WORKTREE_NOT_CLEAN'
    }
    $sha = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $sha -notmatch '^[0-9a-f]{40}$') {
        throw 'RELEASE_COMMIT_UNAVAILABLE'
    }
    $node = (& node -p 'process.versions.node').Trim()
    if ($LASTEXITCODE -ne 0 -or [int]($node.Split('.')[0]) -lt 22) {
        throw 'NODE_VERSION_UNSUPPORTED: Node.js 22+ required'
    }
    Write-Host ('SOURCE_BRANCH=' + $branch + ' SHA=' + $sha)
    Write-Host ('RELEASE_LOG=' + $log)
    Start-Transcript -Path $log | Out-Null
    try {
        Invoke-Checked npm @('--prefix','browser-local','ci','--ignore-scripts','--no-audit','--no-fund')
        Invoke-Checked npm @('--prefix','browser-local','run','check:source')
        Invoke-Checked npm @('--prefix','browser-local','run','check:engine')
        Invoke-Checked npm @('--prefix','browser-local','test')
        Invoke-Checked npm @('--prefix','browser-local','run','build')
        Invoke-Checked npm @('--prefix','browser-local','run','verify:dist')
        Invoke-Checked node @('scripts/verify-browser-build.mjs')
        Invoke-Checked node @('scripts/test-worker-assets.mjs')
        foreach ($file in @('browser-local/dist/app.html', 'browser-local/dist/rhwp_bg.wasm',
                            'browser-local/dist/assets/local-bundle.js',
                            'browser-local/dist/fonts/HakgyoansimBareonbatangR.ttf',
                            'browser-local/dist/fonts/NotoSansSymbols2-Regular.ttf',
                            'browser-local/dist/fonts/NotoSans-Regular.ttf',
                            'browser-local/dist/fonts/NotoSansYi-Regular.ttf')) {
            Assert-Asset $file
        }
        Write-Host 'RELEASE_BUILD_GATES_PASS (25-document visual acceptance remains separate)' -ForegroundColor Green
        if (-not $Deploy) {
            Write-Host 'DEPLOY_SKIPPED: build-only mode; use -Deploy after accepting real-document QA'
            return
        }
        Write-Host ('DEPLOYING_WORKER=' + $worker + ' COMMIT=' + $sha) -ForegroundColor Yellow
        Invoke-Checked npx @('--yes','wrangler@4','deploy','--config','wrangler.jsonc')
        $origin = 'https://sunrise-pdf-pro-web.ko-pg.workers.dev'
        foreach ($url in @($origin + '/', $origin + '/local/',
                           $origin + '/local/rhwp_bg.wasm',
                           $origin + '/local/fonts/NotoSans-Regular.ttf',
                           $origin + '/local/fonts/NotoSansYi-Regular.ttf')) {
            $response = Invoke-WebRequest -Uri $url -Method Head -TimeoutSec 30 -MaximumRedirection 3
            if ([int]$response.StatusCode -ne 200) {
                throw ('POST_DEPLOY_SMOKE_FAILED: ' + $url + ' HTTP ' + $response.StatusCode)
            }
            Write-Host ('HTTP_200 ' + $url) -ForegroundColor Green
        }
        Write-Host ('PRODUCTION_DEPLOY_AND_HTTP_SMOKE_PASS: ' + $sha) -ForegroundColor Green
    } finally {
        Stop-Transcript | Out-Null
    }
} finally {
    Pop-Location
}
