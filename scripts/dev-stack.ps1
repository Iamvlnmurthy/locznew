<#
.SYNOPSIS
    Starts, stops or reports on the local LocZ backing services.

.DESCRIPTION
    PostgreSQL, Redis, Meilisearch and MinIO run as plain processes on this machine
    rather than as Windows services — installing services needs administrator rights,
    and the development stack should not require them.

    The cost of that choice is that a reboot leaves nothing running, and until this
    script existed the recovery was four half-remembered commands. Now:

        ./scripts/dev-stack.ps1 start
        ./scripts/dev-stack.ps1 status
        ./scripts/dev-stack.ps1 stop

    Credentials come from .env — this file contains none. If you moved the binaries,
    override the roots with LOCZ_PG_HOME / LOCZ_STACK_HOME.

.NOTES
    Production runs these as containers (docker-compose.yml). This script is for the
    native development stack only.
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'status', 'restart')]
    [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'

$PgHome    = if ($env:LOCZ_PG_HOME)    { $env:LOCZ_PG_HOME }    else { "$HOME\locz-pg" }
$StackHome = if ($env:LOCZ_STACK_HOME) { $env:LOCZ_STACK_HOME } else { "$HOME\locz-stack" }

$RepoRoot = Split-Path -Parent $PSScriptRoot
$EnvFile  = Join-Path $RepoRoot '.env'

# --------------------------------------------------------------------------
# .env is the single source of credentials, so this script never carries any.
# --------------------------------------------------------------------------
function Get-EnvValue {
    param([string]$Name, [string]$Default = '')

    if (-not (Test-Path $EnvFile)) { return $Default }

    foreach ($line in Get-Content $EnvFile) {
        if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)$") {
            # Values may be quoted because some contain shell metacharacters.
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }

    return $Default
}

function Test-Port {
    param([int]$Port)
    $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-ForPort {
    param([int]$Port, [string]$Name, [int]$TimeoutSeconds = 30)

    for ($elapsed = 0; $elapsed -lt $TimeoutSeconds; $elapsed++) {
        if (Test-Port $Port) {
            Write-Host "  $Name is listening on $Port" -ForegroundColor Green
            return $true
        }
        Start-Sleep -Seconds 1
    }

    Write-Host "  $Name did not come up on port $Port within ${TimeoutSeconds}s" -ForegroundColor Red
    return $false
}

# --------------------------------------------------------------------------
# Services
# --------------------------------------------------------------------------
function Start-Postgres {
    if (Test-Port 5432) { Write-Host '  PostgreSQL already running' -ForegroundColor DarkGray; return }

    Write-Host 'Starting PostgreSQL…'
    # Launch pg_ctl outside PowerShell's native-output pipeline. The postgres process
    # can inherit that pipeline and keep it open after pg_ctl exits, which makes stack
    # recovery appear to hang even though the database is already accepting connections.
    # Wait-ForPort remains the bounded source of truth for startup success.
    $pgData = Join-Path $PgHome 'data'
    $pgLog  = Join-Path $PgHome 'logs\postgres.log'
    Start-Process -FilePath "$PgHome\pgsql\bin\pg_ctl.exe" `
        -ArgumentList '-D', "`"$pgData`"", '-l', "`"$pgLog`"", 'start' `
        -WorkingDirectory $PgHome `
        -WindowStyle Hidden
    Wait-ForPort -Port 5432 -Name 'PostgreSQL' | Out-Null
}

function Stop-Postgres {
    if (-not (Test-Port 5432)) { return }
    Write-Host 'Stopping PostgreSQL…'
    # Fast shutdown: disconnect clients but still checkpoint cleanly.
    & "$PgHome\pgsql\bin\pg_ctl.exe" -D "$PgHome\data" -m fast -w stop | Out-Null
}

function Start-Redis {
    if (Test-Port 6379) { Write-Host '  Redis already running' -ForegroundColor DarkGray; return }

    Write-Host 'Starting Redis…'
    $redisHome = Get-ChildItem "$StackHome\redis" -Directory |
        Where-Object { Test-Path (Join-Path $_.FullName 'redis-server.exe') } |
        Select-Object -First 1

    if (-not $redisHome) { throw "redis-server.exe not found under $StackHome\redis" }

    Start-Process -FilePath (Join-Path $redisHome.FullName 'redis-server.exe') `
        -ArgumentList '--appendonly', 'yes', '--dir', "$StackHome\data\redis" `
        -WorkingDirectory $redisHome.FullName `
        -WindowStyle Hidden
    Wait-ForPort -Port 6379 -Name 'Redis' | Out-Null
}

function Start-Meilisearch {
    if (Test-Port 7700) { Write-Host '  Meilisearch already running' -ForegroundColor DarkGray; return }

    Write-Host 'Starting Meilisearch…'
    $key = Get-EnvValue -Name 'MEILI_MASTER_KEY'
    if (-not $key) { throw 'MEILI_MASTER_KEY is not set in .env' }

    Start-Process -FilePath "$StackHome\bin\meilisearch.exe" `
        -ArgumentList '--db-path', "$StackHome\data\meili", '--master-key', $key, '--env', 'development' `
        -WorkingDirectory $StackHome `
        -WindowStyle Hidden
    Wait-ForPort -Port 7700 -Name 'Meilisearch' | Out-Null
}

function Start-Minio {
    if (Test-Port 9000) { Write-Host '  MinIO already running' -ForegroundColor DarkGray; return }

    Write-Host 'Starting MinIO…'
    $env:MINIO_ROOT_USER     = Get-EnvValue -Name 'STORAGE_ACCESS_KEY_ID'
    $env:MINIO_ROOT_PASSWORD = Get-EnvValue -Name 'STORAGE_SECRET_ACCESS_KEY'

    if (-not $env:MINIO_ROOT_USER -or -not $env:MINIO_ROOT_PASSWORD) {
        throw 'STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY are not set in .env'
    }

    Start-Process -FilePath "$StackHome\bin\minio.exe" `
        -ArgumentList 'server', "$StackHome\data\minio", '--console-address', ':9001' `
        -WorkingDirectory $StackHome `
        -WindowStyle Hidden
    Wait-ForPort -Port 9000 -Name 'MinIO' | Out-Null
}

function Stop-ByPort {
    param([int]$Port, [string]$Name)

    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) { return }

    Write-Host "Stopping $Name…"
    $connections | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

function Show-Status {
    Write-Host ''
    Write-Host 'LocZ development stack' -ForegroundColor Cyan
    Write-Host '----------------------'

    foreach ($service in @(
        @{ Name = 'PostgreSQL'; Port = 5432 },
        @{ Name = 'Redis'; Port = 6379 },
        @{ Name = 'Meilisearch'; Port = 7700 },
        @{ Name = 'MinIO'; Port = 9000 },
        @{ Name = 'API'; Port = 4000 },
        @{ Name = 'Web'; Port = 3000 },
        @{ Name = 'Admin'; Port = 3001 }
    )) {
        $up = Test-Port $service.Port
        $label = if ($up) { 'up  ' } else { 'down' }
        $colour = if ($up) { 'Green' } else { 'DarkGray' }
        Write-Host ("  {0,-12} {1,-6} :{2}" -f $service.Name, $label, $service.Port) -ForegroundColor $colour
    }

    Write-Host ''
    Write-Host 'The API, web and admin apps are started separately with npm run dev.' -ForegroundColor DarkGray
    Write-Host ''
}

switch ($Action) {
    'start' {
        Start-Postgres
        Start-Redis
        Start-Meilisearch
        Start-Minio
        Show-Status
    }
    'stop' {
        Stop-ByPort -Port 9000 -Name 'MinIO'
        Stop-ByPort -Port 7700 -Name 'Meilisearch'
        Stop-ByPort -Port 6379 -Name 'Redis'
        Stop-Postgres
        Show-Status
    }
    'restart' {
        & $PSCommandPath stop
        & $PSCommandPath start
    }
    default { Show-Status }
}
