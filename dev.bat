@echo off
echo ========================================
echo   PostPilot Development Environment
echo ========================================
echo.

REM Pull latest changes
echo [1/4] Pulling latest changes...
git pull

REM Start Docker (PostgreSQL)
echo [2/4] Starting PostgreSQL...
docker-compose up -d

REM Install dependencies if needed
echo [3/4] Checking dependencies...
cd backend
call npm install --silent
cd ../frontend
call npm install --silent
cd ..

REM Start both servers
echo [4/4] Starting servers...
echo.
echo   Backend:  http://localhost:7071/api
echo   Frontend: http://localhost:5173
echo.
echo Press Ctrl+C to stop all servers
echo.

REM Use start to open in new windows, or concurrently
call npm install concurrently --silent 2>nul
call npx concurrently -n "backend,frontend" -c "blue,green" "cd backend && npm run dev" "cd frontend && npm run dev"
