<#
.SYNOPSIS
    Stop Prelegal on Windows.
.DESCRIPTION
    Brings the container down. The database goes with it, which is the intended
    behaviour while the schema is still changing.
#>
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repoRoot 'docker-compose.yml'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error 'Docker is not installed. See https://docs.docker.com/get-docker/'
    exit 1
}

docker compose -f $composeFile down
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Prelegal stopped. Its database went with it, by design.'
