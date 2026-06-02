param(
    [string]$OutputName = "korean_finance_terminal_project.zip"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ArtifactRoot = Join-Path $ProjectRoot "artifacts"
$Stage = Join-Path $ArtifactRoot "korean_finance_terminal"
$ZipPath = Join-Path $ArtifactRoot $OutputName

New-Item -ItemType Directory -Force -Path $ArtifactRoot | Out-Null

if (Test-Path $Stage) {
    $ResolvedStage = Resolve-Path $Stage
    $ResolvedArtifactRoot = Resolve-Path $ArtifactRoot
    if (-not $ResolvedStage.Path.StartsWith($ResolvedArtifactRoot.Path)) {
        throw "Refusing to remove staging path outside artifact root: $ResolvedStage"
    }
    Remove-Item -LiteralPath $ResolvedStage.Path -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $Stage | Out-Null

$ExcludeDirs = @(
    (Join-Path $ProjectRoot "node_modules"),
    (Join-Path $ProjectRoot "backend\.venv"),
    (Join-Path $ProjectRoot ".data"),
    (Join-Path $ProjectRoot ".runlogs"),
    (Join-Path $ProjectRoot ".pytest_cache"),
    (Join-Path $ProjectRoot "artifacts")
)

$ExcludeFiles = @(
    "*.zip",
    ".env",
    "*.log"
)

robocopy $ProjectRoot $Stage /E /XD $ExcludeDirs /XF $ExcludeFiles | Out-Null
if ($LASTEXITCODE -gt 7) {
    throw "robocopy failed with exit code $LASTEXITCODE"
}

Get-ChildItem -Recurse $Stage -Directory -Force |
    Where-Object { $_.Name -in @(".venv", "node_modules", ".data", ".runlogs", ".pytest_cache", "__pycache__") } |
    Remove-Item -Recurse -Force

if (Test-Path $ZipPath) {
    Remove-Item -LiteralPath $ZipPath -Force
}

Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $ZipPath -CompressionLevel Optimal

Add-Type -AssemblyName System.IO.Compression.FileSystem
$Archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
try {
    $Forbidden = $Archive.Entries | Where-Object {
        $_.FullName -eq ".env" -or
        $_.FullName -like "*/.env" -or
        $_.FullName -like "node_modules/*" -or
        $_.FullName -like "backend/.venv/*" -or
        $_.FullName -like "*.data/*" -or
        $_.FullName -like "*secret.key" -or
        $_.FullName -like "*.db"
    }
    if ($Forbidden) {
        throw "Unsafe package content detected: $($Forbidden[0].FullName)"
    }
}
finally {
    $Archive.Dispose()
}

if (Test-Path $Stage) {
    $ResolvedStage = Resolve-Path $Stage
    $ResolvedArtifactRoot = Resolve-Path $ArtifactRoot
    if ($ResolvedStage.Path.StartsWith($ResolvedArtifactRoot.Path)) {
        Remove-Item -LiteralPath $ResolvedStage.Path -Recurse -Force
    }
}

Get-Item $ZipPath | Select-Object FullName, Length
