$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

if (-not (Test-Path "package.json")) {
  Write-Host "package.json not found. Please place this script in project root." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Dependencies not found, running npm install..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install failed. Check network or npm config." -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

Write-Host "Starting dev server..." -ForegroundColor Green
npm run dev

