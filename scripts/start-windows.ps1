<#
.SYNOPSIS
    Start Prelegal on Windows.
.DESCRIPTION
    Builds the image and brings the container up, then waits for the health
    endpoint before reporting the URL. Mirrors scripts/_compose.sh.
#>
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repoRoot 'docker-compose.yml'
$url = 'http://localhost:8000'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error 'Docker is not installed. See https://docs.docker.com/get-docker/'
    exit 1
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Docker is installed but not running. Start Docker Desktop, then try again.'
    exit 1
}

Write-Host 'Building and starting Prelegal...'
docker compose -f $composeFile up --build -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host -NoNewline "Waiting for $url "
foreach ($attempt in 1..60) {
    try {
        Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
        Write-Host ''
        Write-Host ''
        Write-Host "Prelegal is running at $url"
        exit 0
    }
    catch {
        Write-Host -NoNewline '.'
        Start-Sleep -Seconds 1
    }
}

Write-Host ''
Write-Error 'Timed out waiting for the app. Recent logs:'
docker compose -f $composeFile logs --tail 40
exit 1
