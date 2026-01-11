#!/bin/bash
echo "========================================"
echo "  PostPilot Development Environment"
echo "========================================"
echo

# Pull latest changes
echo "[1/4] Pulling latest changes..."
git pull

# Start Docker (PostgreSQL)
echo "[2/4] Starting PostgreSQL..."
docker-compose up -d

# Install dependencies if needed
echo "[3/4] Checking dependencies..."
(cd backend && npm install --silent)
(cd frontend && npm install --silent)

# Install concurrently if not present
npm install concurrently --silent 2>/dev/null

# Start both servers
echo "[4/4] Starting servers..."
echo
echo "  Backend:  http://localhost:7071/api"
echo "  Frontend: http://localhost:5173"
echo
echo "Press Ctrl+C to stop all servers"
echo

npx concurrently -n "backend,frontend" -c "blue,green" \
  "cd backend && npm run dev" \
  "cd frontend && npm run dev"
