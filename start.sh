#!/bin/bash

# MailSort - Start Entwicklungsumgebung
# =====================================

echo "=========================================="
echo "  MailSort - Starte Entwicklungsumgebung"
echo "=========================================="
echo ""

# Prüfe ob Azure Functions Core Tools installiert ist
if ! command -v func &> /dev/null; then
    echo "⚠️  Azure Functions Core Tools nicht gefunden!"
    echo ""
    echo "Installiere mit:"
    echo "  npm install -g azure-functions-core-tools@4 --unsafe-perm true"
    echo ""
    echo "Starte nur Frontend..."
    echo ""
    cd frontend && npm run dev
    exit 0
fi

# Starte Backend im Hintergrund
echo "🚀 Starte Backend (Port 7071)..."
cd backend
npm run build 2>/dev/null
func start &
BACKEND_PID=$!
cd ..

# Warte kurz bis Backend läuft
sleep 3

# Starte Frontend
echo "🚀 Starte Frontend (Port 5173)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=========================================="
echo "  MailSort läuft!"
echo "=========================================="
echo ""
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:7071/api"
echo ""
echo "  Drücke Ctrl+C zum Beenden"
echo ""

# Cleanup bei Beenden
cleanup() {
    echo ""
    echo "Beende MailSort..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Warte auf Prozesse
wait
