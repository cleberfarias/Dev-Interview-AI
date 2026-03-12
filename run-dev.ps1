param(
    [switch]$SingleWindow,
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5000
)

$root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

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
    npm.cmd run dev -- --port $FrontendPort --strictPort
    return
}

Write-Host "Starting backend in a new PowerShell window..."
$backendCmd = "Set-Location -Path '$backend'; & '$pythonPath' -m uvicorn app.main:app --reload --port $BackendPort"
Start-Process powershell -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-Command',$backendCmd

Start-Sleep -Seconds 1

Write-Host "Starting frontend in a new PowerShell window..."
$frontendCmd = "Set-Location -Path '$frontend'; npm.cmd run dev -- --port $FrontendPort --strictPort"
Start-Process powershell -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-Command',$frontendCmd

Write-Host "Started backend and frontend. Check the opened windows for logs."
