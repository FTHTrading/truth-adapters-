# Proves a fresh copy installs and passes from nothing.
# Copies the tree (minus node_modules, dist, data, keys, .git) to a temp dir,
# installs with a frozen lockfile, typechecks and runs the full suite.
$ErrorActionPreference = "Stop"
$src = Split-Path -Parent $PSScriptRoot
$dst = Join-Path ([System.IO.Path]::GetTempPath()) ("truth-fresh-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $dst | Out-Null
# Exclude only the ROOT keys dir (real witness keys); vectors/keys holds committed test-only keys and must copy.
robocopy $src $dst /E /XD node_modules dist data .git .wrangler "$src\keys" /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with $LASTEXITCODE" }
Push-Location $dst
try {
  Write-Host "fresh copy: $dst"
  pnpm install --frozen-lockfile --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw "install failed" }
  pnpm typecheck
  if ($LASTEXITCODE -ne 0) { throw "typecheck failed" }
  pnpm test
  if ($LASTEXITCODE -ne 0) { throw "tests failed" }
  node scripts/vectors.ts --check
  if ($LASTEXITCODE -ne 0) { throw "vectors drifted" }
  Write-Host "FRESH CHECK: PASS"
} finally {
  Pop-Location
  Remove-Item -Recurse -Force $dst
}
