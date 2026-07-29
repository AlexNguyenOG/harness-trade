# Run the Harness portal Vite server and restart it if it exits.
# Use this from a normal PowerShell / Terminal window (outside Cursor) so
# the process is not torn down when agent shells end.
#
#   .\scripts\keep-portal-dev.ps1
#   .\scripts\keep-portal-dev.ps1 3001
#   .\scripts\keep-portal-dev.cmd   # opens a dedicated window

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

Write-Host "Harness portal dev server on http://127.0.0.1:${Port}/terminal"
Write-Host "Log: $Log"
Write-Host "Ctrl+C stops the keeper (and the current Vite child)."
Write-Host ""

while ($true) {
  Write-Log "starting vite :$Port"
  # cmd.exe redirection keeps UTF-8 and mirrors the bash keeper.
  cmd /c "bunx vite --host 127.0.0.1 --port $Port >> `"$Log`" 2>&1"
  Write-Log "vite exited code=$LASTEXITCODE; restarting in 2s"
  Start-Sleep -Seconds 2
}
