param([string]$Baseline = 'aa52044')
$tools = if ($env:WS_TOOLS) { $env:WS_TOOLS } else { 'C:\Users\ronan\webspheres-tools' }
$node = Join-Path $tools 'node\node.exe'
$root = Split-Path $PSScriptRoot -Parent
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git) { $git = Get-ChildItem "$env:LOCALAPPDATA\GitHubDesktop" -Filter git.exe -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like '*\git\cmd\git.exe' } | Select-Object -First 1 -ExpandProperty FullName }
$base = Join-Path $env:TEMP "webspheres-baseline-$Baseline"
if (-not (Test-Path $base)) {
    & $git -C $root archive --format=zip -o "$base.zip" $Baseline
    Expand-Archive "$base.zip" -DestinationPath $base
    Remove-Item "$base.zip"
}
$env:WS_BASELINE = $base
$env:WS_TOOLS = $tools
$suites = 'host-tests.mjs', 'kin-tests.mjs', 'observer-browser.cjs', 'scene-browser.cjs', 'hands-browser.cjs', 'settings-browser.cjs', 'seq-browser.cjs', 'layout-browser.cjs', 'host-browser.cjs', 'kin-browser.cjs', 'nopeer.cjs'
$failed = @()
foreach ($s in $suites) {
    Write-Output "===== $s"
    & $node (Join-Path $PSScriptRoot $s)
    if ($LASTEXITCODE -ne 0) { $failed += $s }
}
Write-Output ''
if ($failed.Count) { Write-Output "FAILED: $($failed -join ', ')"; exit 1 }
Write-Output "ALL $($suites.Count) SUITES PASSED"
