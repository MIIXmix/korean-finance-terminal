# Korean Finance Terminal — one-click local launcher (Windows / PowerShell)
# Sets up the backend venv + deps, builds the frontend, then serves the app on
# 127.0.0.1 (loopback only) and opens it in your browser.

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$Port = 8000
$Bind = "127.0.0.1"

function Find-Exe($candidates) {
    foreach ($name in $candidates) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    return $null
}

Write-Host "== Korean Finance Terminal ==" -ForegroundColor Cyan

# --- Prerequisites -----------------------------------------------------------
$python = Find-Exe @("python", "python3", "py")
if (-not $python) {
    Write-Host "Python 3.11+ is required but was not found." -ForegroundColor Red
    Write-Host "Install it from https://www.python.org/downloads/ and re-run this script."
    Read-Host "Press Enter to exit"; exit 1
}
$node = Find-Exe @("node")
$npm = Find-Exe @("npm", "npm.cmd")
if (-not $node -or -not $npm) {
    Write-Host "Node.js 18+ (with npm) is required but was not found." -ForegroundColor Red
    Write-Host "Install it from https://nodejs.org/ and re-run this script."
    Read-Host "Press Enter to exit"; exit 1
}

# --- Backend venv + dependencies --------------------------------------------
$venvPython = Join-Path $PSScriptRoot "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Yellow
    & $python -m venv "backend\.venv"
}
Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
& $venvPython -m pip install --quiet --upgrade pip
& $venvPython -m pip install --quiet -r "backend\requirements.txt"

# --- Frontend build ----------------------------------------------------------
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies (first run)..." -ForegroundColor Yellow
    & $npm install
}
if (-not (Test-Path "dist\index.html")) {
    Write-Host "Building frontend..." -ForegroundColor Yellow
    & $npm run build
}

# --- Launch ------------------------------------------------------------------
Write-Host ""
Write-Host "Starting on http://$Bind`:$Port  (loopback only)" -ForegroundColor Green
Write-Host "On first launch you'll set a master password. Press Ctrl+C to stop." -ForegroundColor Green
Start-Process "http://$Bind`:$Port"
& $venvPython -m uvicorn backend.app.main:app --host $Bind --port $Port
