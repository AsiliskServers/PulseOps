$ErrorActionPreference = "Stop"

$agentRoot = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $agentRoot "dist"

New-Item -ItemType Directory -Force -Path $dist | Out-Null

Push-Location $agentRoot
try {
  $env:GOOS = "linux"
  $env:GOARCH = "amd64"
  go build -trimpath -ldflags="-s -w" -o (Join-Path $dist "pulseops-agent-linux-amd64") ./cmd/pulseops-agent

  $env:GOARCH = "arm64"
  go build -trimpath -ldflags="-s -w" -o (Join-Path $dist "pulseops-agent-linux-arm64") ./cmd/pulseops-agent
}
finally {
  Remove-Item Env:GOOS -ErrorAction SilentlyContinue
  Remove-Item Env:GOARCH -ErrorAction SilentlyContinue
  Pop-Location
}

Write-Host "Agent binaries built in $dist"
