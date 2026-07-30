# Run the Harness portal Vite server and restart it if it exits.
# Prefer scripts/keep-portal-dev.cmd (loops even if this script is Ctrl+C'd).
#
#   .\scripts\keep-portal-dev.cmd
#   .\scripts\keep-portal-dev.ps1 3001

param(
  [int]$Port = 3001
)

$ErrorActionPreference = "Continue"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Portal = Join-Path $Root "apps\portal"
$LogDir = Join-Path $Root ".logs"
$Log = Join-Path $LogDir "portal-vite-$Port.log"

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
  [System.Environment]::GetEnvironmentVariable("Path", "User")

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Host "ERROR: bun not found on PATH. Install bun, then re-run."
  exit 1
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $Portal

function Write-Log([string]$Message) {
  $line = "[$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))] $Message"
  Write-Host $line
  Add-Content -Path $Log -Value $line -Encoding utf8
}

# Treat Ctrl+C as a restart signal inside the .cmd outer loop, not a silent stop.
[Console]::TreatControlCAsInput = $false

Write-Host "Harness portal on http://127.0.0.1:${Port}/terminal"
Write-Host "Log: $Log"
Write-Host "Close this window to stop. (Ctrl+C restarts via the .cmd loop.)"
Write-Host ""

while ($true) {
  Write-Log "starting vite :$Port"

  # Run Vite as its own process so we can detect death via Wait + port check.
  $proc = Start-Process -FilePath "bun" `
    -ArgumentList @("x", "vite", "--host", "127.0.0.1", "--port", "$Port") `
    -WorkingDirectory $Portal `
    -NoNewWindow `
    -PassThru

  if (-not $proc) {
    Write-Log "failed to spawn vite; retrying in 2s"
    Start-Sleep -Seconds 2
    continue
  }

  Write-Host "vite pid=$($proc.Id) — waiting"
  Wait-Process -Id $proc.Id -ErrorAction SilentlyContinue
  $code = $proc.ExitCode
  Write-Log "vite exited code=$code; restarting in 2s"
  Start-Sleep -Seconds 2
}
