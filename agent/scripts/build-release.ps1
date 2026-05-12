$ErrorActionPreference = "Stop"

$agentRoot = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $agentRoot "dist"
$repoRoot = Split-Path -Parent $agentRoot

New-Item -ItemType Directory -Force -Path $dist | Out-Null

Push-Location $agentRoot
try {
  $commitTs = (& git -C $repoRoot log -1 --format=%ct 2>$null)
  if (-not $commitTs) { $commitTs = [int][double]::Parse((Get-Date -UFormat %s)) }
  $commitSha = (& git -C $repoRoot rev-parse --short HEAD 2>$null)
  if (-not $commitSha) { $commitSha = "local" }
  $agentVersion = "$commitTs-$commitSha"
  $ldflags = "-s -w -X main.version=$agentVersion"

  function Invoke-GoBuild([string]$arch, [string]$outputPath) {
    $env:GOARCH = $arch
    & go build -trimpath -ldflags $ldflags -o $outputPath ./cmd/pulseops-agent
    if ($LASTEXITCODE -ne 0) {
      throw "go build failed for $arch"
    }
  }

  $env:GOOS = "linux"
  Invoke-GoBuild "amd64" (Join-Path $dist "pulseops-agent-linux-amd64")
  Invoke-GoBuild "arm64" (Join-Path $dist "pulseops-agent-linux-arm64")

  $amd64Checksum = (Get-FileHash -Algorithm SHA256 (Join-Path $dist "pulseops-agent-linux-amd64")).Hash.ToLowerInvariant()
  $arm64Checksum = (Get-FileHash -Algorithm SHA256 (Join-Path $dist "pulseops-agent-linux-arm64")).Hash.ToLowerInvariant()

  $manifest = @"
{
  "version": "$agentVersion",
  "assets": {
    "linux-amd64": "pulseops-agent-linux-amd64",
    "linux-arm64": "pulseops-agent-linux-arm64"
  },
  "checksums": {
    "pulseops-agent-linux-amd64": "$amd64Checksum",
    "pulseops-agent-linux-arm64": "$arm64Checksum"
  }
}
"@

  [System.IO.File]::WriteAllText(
    (Join-Path $dist "latest.json"),
    $manifest,
    [System.Text.UTF8Encoding]::new($false)
  )
}
finally {
  Remove-Item Env:GOOS -ErrorAction SilentlyContinue
  Remove-Item Env:GOARCH -ErrorAction SilentlyContinue
  Pop-Location
}

Write-Host "Agent binaries built in $dist"
