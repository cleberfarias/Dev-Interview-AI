
param(
	[switch]$SingleWindow
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

# Detect common virtualenv folder names
$venvCandidates = @('.venv','venv','env','.env')
$venvPath = $null
foreach ($c in $venvCandidates) {
	$p = Join-Path $root $c
	if (Test-Path $p) { $venvPath = $p; break }
}

function Build-ActivateSnippet($venv) {
	if (-not $venv) { return '' }
	return ". '$venv\\Scripts\\Activate.ps1';"
}

$activateSnippet = Build-ActivateSnippet $venvPath

if ($SingleWindow) {
	Write-Host "Starting backend as a background job and frontend in this window..."
	$script = {
		param($backendPath, $activateCmd)
		Set-Location -Path $backendPath
		Invoke-Expression $activateCmd
		uvicorn app.main:app --reload --port 8000
	}
	$job = Start-Job -ScriptBlock $script -ArgumentList $backend, $activateSnippet
	Write-Host "Backend started as Job Id $($job.Id). To stop: Stop-Job -Id $($job.Id)"

	Write-Host "Starting frontend in current window..."
	Set-Location -Path $frontend
	npm run dev
	return
}

Write-Host "Starting backend in a new PowerShell window..."
$backendCmd = "Set-Location -Path '$backend'; $activateSnippet uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList '-NoExit','-Command',$backendCmd

Start-Sleep -Seconds 1

Write-Host "Starting frontend in a new PowerShell window..."
$frontendCmd = "Set-Location -Path '$frontend'; npm run dev"
Start-Process powershell -ArgumentList '-NoExit','-Command',$frontendCmd

Write-Host "Started backend and frontend. Check the opened windows for logs." 
