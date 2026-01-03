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

# Beende alte Prozesse auf den Ports
Write-Host "Beende alte Server-Prozesse..." -ForegroundColor Yellow
$port7071 = netstat -ano | Select-String ":7071.*LISTENING" | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1
$port5173 = netstat -ano | Select-String ":5173.*LISTENING" | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1

if ($port7071) {
    Write-Host "  Beende Prozess auf Port 7071 (PID: $port7071)" -ForegroundColor Gray
    taskkill /PID $port7071 /F 2>$null
}
if ($port5173) {
    Write-Host "  Beende Prozess auf Port 5173 (PID: $port5173)" -ForegroundColor Gray
    taskkill /PID $port5173 /F 2>$null
}

Start-Sleep -Seconds 1

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
