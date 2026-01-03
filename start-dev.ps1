# MailSort - Start Development (2 Fenster)
# =========================================

Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  MailSort - Starte Entwicklungsumgebung" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = $PSScriptRoot

# Git Pull
Write-Host "Hole neueste Aenderungen..." -ForegroundColor Yellow
git pull

# Backend bauen
Write-Host "Baue Backend..." -ForegroundColor Yellow
Push-Location "$rootDir\backend"
npm run build
Pop-Location

Write-Host ""
Write-Host "Starte Server in separaten Fenstern..." -ForegroundColor Green
Write-Host ""

# Backend in neuem Fenster starten
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\backend'; Write-Host 'Backend Server' -ForegroundColor Magenta; func start"

# Kurz warten damit Backend zuerst startet
Start-Sleep -Seconds 2

# Frontend in neuem Fenster starten
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\frontend'; Write-Host 'Frontend Server' -ForegroundColor Cyan; npm run dev"

Write-Host "===========================================" -ForegroundColor Green
Write-Host "  Server gestartet in separaten Fenstern!" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Backend:  http://localhost:7071" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Schliesse die Terminal-Fenster zum Beenden." -ForegroundColor Yellow
Write-Host ""

# Oeffne Browser nach kurzer Wartezeit
Start-Sleep -Seconds 4
Start-Process "http://localhost:5173"
