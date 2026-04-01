param(
    [switch]$SingleWindow,
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5000
)

$root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

function Get-ListeningProcessIds {
    param(
        [int[]]$Ports
    )

    $ids = @()
    foreach ($port in $Ports) {
        try {
            $ids += Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
                Select-Object -ExpandProperty OwningProcess -Unique
        } catch {
            continue
        }
    }

    return @($ids | Where-Object { $_ } | Sort-Object -Unique)
}

function Wait-PortsReleased {
    param(
        [int[]]$Ports,
        [int]$MaxAttempts = 12,
        [int]$DelaySeconds = 1
    )

    for ($attempt = 0; $attempt -lt $MaxAttempts; $attempt++) {
        $busy = Get-ListeningProcessIds -Ports $Ports
        if (-not $busy -or $busy.Count -eq 0) {
            return
        }
        Start-Sleep -Seconds $DelaySeconds
    }

    $remaining = Get-ListeningProcessIds -Ports $Ports
    if ($remaining -and $remaining.Count -gt 0) {
        throw "Ports $($Ports -join ', ') are still busy after cleanup. Remaining PIDs: $($remaining -join ', ')"
    }
}

function Stop-DevListeners {
    param(
        [int[]]$Ports
    )

    $listenerIds = Get-ListeningProcessIds -Ports $Ports
    if (-not $listenerIds -or $listenerIds.Count -eq 0) {
        return
    }

    foreach ($procId in $listenerIds) {
        Write-Host "Stopping existing listener PID $procId on target dev ports..."
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
        } catch {
            cmd.exe /c "taskkill /PID $procId /T /F" | Out-Null
        }
    }

    Wait-PortsReleased -Ports $Ports
}

function Resolve-PythonPath {
    param(
        [string]$RepoRoot,
        [string]$BackendRoot
    )

    $candidates = @(
        (Join-Path $RepoRoot '.venv\Scripts\python.exe'),
        (Join-Path $RepoRoot 'venv\Scripts\python.exe'),
        (Join-Path $RepoRoot 'env\Scripts\python.exe'),
        (Join-Path $BackendRoot '.venv\Scripts\python.exe'),
        (Join-Path $BackendRoot 'venv\Scripts\python.exe'),
        (Join-Path $BackendRoot 'env\Scripts\python.exe')
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd) {
        return $pythonCmd.Source
    }

    throw "Python was not found. Create a virtualenv or install Python."
}

$pythonPath = Resolve-PythonPath -RepoRoot $root -BackendRoot $backend
Stop-DevListeners -Ports @($BackendPort, $FrontendPort)

if ($SingleWindow) {
    Write-Host "Starting backend as a background job and frontend in this window..."
    $job = Start-Job -ScriptBlock {
        param($backendPath, $pythonExe, $port)
        Set-Location -Path $backendPath
        & $pythonExe -m uvicorn app.main:app --reload --port $port
    } -ArgumentList $backend, $pythonPath, $BackendPort

    Write-Host "Backend started as Job Id $($job.Id). To stop: Stop-Job -Id $($job.Id)"
    Write-Host "Starting frontend in current window..."
    Set-Location -Path $frontend
    & npm.cmd run dev -- --port $FrontendPort --strictPort
    return
}

Write-Host "Starting backend in a new PowerShell window..."
$backendCmd = "Set-Location -Path '$backend'; & '$pythonPath' -m uvicorn app.main:app --reload --port $BackendPort"
Start-Process powershell -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-Command',$backendCmd

Start-Sleep -Seconds 1

Write-Host "Starting frontend in a new PowerShell window..."
$frontendCmd = "Set-Location -Path '$frontend'; & npm.cmd run dev -- --port $FrontendPort --strictPort"
Start-Process powershell -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-Command',$frontendCmd

Write-Host "Started backend and frontend. Check the opened windows for logs."
