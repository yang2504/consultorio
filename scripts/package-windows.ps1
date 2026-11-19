param([string]$Output)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath "$root/package.json" -Raw | ConvertFrom-Json).version
if (!$Output) { $Output = Join-Path $root "Consultorio-Windows-x64-v$version.zip" }
$outputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Output)
if (Test-Path -LiteralPath $outputPath) { throw "El ZIP ya existe: $outputPath" }
$nodeVersion = 'v22.23.4'
$archive = "node-$nodeVersion-win-x64.zip"
$origin = "https://nodejs.org/dist/$nodeVersion"
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$temp = Join-Path $tempRoot ('consultorio-package-' + [guid]::NewGuid())
$stage = Join-Path $temp 'Consultorio'
Push-Location $root
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la compilacion del frontend.' }
    New-Item -ItemType Directory -Path $stage, "$stage/backend", "$stage/frontend", "$stage/runtime" | Out-Null
    Copy-Item -LiteralPath package.json, package-lock.json, README.md -Destination $stage
    Copy-Item -LiteralPath scripts/Iniciar-Consultorio.cmd, scripts/Demostracion.cmd -Destination $stage
    Copy-Item -LiteralPath backend/src -Destination "$stage/backend" -Recurse
    Copy-Item -LiteralPath frontend/dist -Destination "$stage/frontend" -Recurse
    Push-Location $stage
    try {
        npm ci --omit=dev --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Fallo la instalacion del backend.' }
    } finally { Pop-Location }

    $download = Join-Path $temp $archive
    Invoke-WebRequest -UseBasicParsing -Uri "$origin/$archive" -OutFile $download
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "$origin/SHASUMS256.txt").Content
    $line = ($checksums -split '\r?\n') | Where-Object { $_.EndsWith("  $archive") }
    $sha256 = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($download)
    try { $hash = [BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $sha256.Dispose() }
    if (!$line -or $hash -ne ($line -split '\s+')[0]) {
        throw 'El runtime descargado no coincide con su SHA-256.'
    }
    tar.exe -xf $download -C $temp
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la extraccion del runtime.' }
    $nodeFolder = Join-Path $temp "node-$nodeVersion-win-x64"
    Copy-Item -LiteralPath "$nodeFolder/node.exe", "$nodeFolder/LICENSE" -Destination "$stage/runtime"
    tar.exe -a -cf $outputPath -C $temp Consultorio
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la creacion del ZIP.' }
    Get-Item -LiteralPath $outputPath
} finally {
    Pop-Location
    $resolved = [IO.Path]::GetFullPath($temp)
    if ((Split-Path -Parent $resolved) -eq $tempRoot -and (Split-Path -Leaf $resolved) -match '^consultorio-package-[0-9a-f-]{36}$' -and (Test-Path -LiteralPath $resolved)) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
