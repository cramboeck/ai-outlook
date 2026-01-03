# MailSort - Start Entwicklungsumgebung
# ======================================

Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  MailSort - Starte Entwicklungsumgebung" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = $PSScriptRoot

# Pruefe ob Dependencies installiert sind
if (-not (Test-Path "$rootDir\frontend\node_modules")) {
    Write-Host "Frontend Dependencies fehlen! Fuehre zuerst setup.ps1 aus." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "$rootDir\backend\node_modules")) {
    Write-Host "Backend Dependencies fehlen! Fuehre zuerst setup.ps1 aus." -ForegroundColor Red
    exit 1
}

# Backend bauen falls noetig
if (-not (Test-Path "$rootDir\backend\dist")) {
    Write-Host "Baue Backend..." -ForegroundColor Yellow
    Push-Location "$rootDir\backend"
    npm run build
    Pop-Location
}

Write-Host ""
Write-Host "Starte Backend (Azure Functions)..." -ForegroundColor Green
$backendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location "$dir\backend"
    func start 2>&1
} -ArgumentList $rootDir

Write-Host "Starte Frontend (Vite)..." -ForegroundColor Green
$frontendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location "$dir\frontend"
    npm run dev 2>&1
} -ArgumentList $rootDir

# Warte kurz damit die Server starten
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "===========================================" -ForegroundColor Green
Write-Host "  Server gestartet!" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Backend:  http://localhost:7071" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Druecke Ctrl+C zum Beenden" -ForegroundColor Yellow
Write-Host ""

# Zeige Live-Output von beiden Jobs
try {
    while ($true) {
        # Frontend Output
        $frontendOutput = Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue
        if ($frontendOutput) {
            $frontendOutput | ForEach-Object { Write-Host "[Frontend] $_" -ForegroundColor Cyan }
        }

        # Backend Output
        $backendOutput = Receive-Job -Job $backendJob -ErrorAction SilentlyContinue
        if ($backendOutput) {
            $backendOutput | ForEach-Object { Write-Host "[Backend] $_" -ForegroundColor Magenta }
        }

        Start-Sleep -Milliseconds 500

        # Pruefe ob Jobs noch laufen
        if ($frontendJob.State -eq 'Failed' -or $backendJob.State -eq 'Failed') {
            Write-Host "Ein Server ist abgestuerzt!" -ForegroundColor Red
            break
        }
    }
}
finally {
    Write-Host ""
    Write-Host "Beende Server..." -ForegroundColor Yellow
    Stop-Job -Job $frontendJob -ErrorAction SilentlyContinue
    Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $frontendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $backendJob -ErrorAction SilentlyContinue
    Write-Host "Server beendet." -ForegroundColor Green
}
