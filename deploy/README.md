# MailSort — Deployment auf srv-docker01 (Hetzner)

MailSort läuft neben **ramboflow** und **bookstack** auf demselben Docker-Host.
Kein neuer Reverse-Proxy: der bestehende `ramboflow-nginx` proxied auf MailSort.
Zertifikate laufen über den bestehenden `ramboflow-certbot`.

## Architektur

```
Internet
   │
   ▼  Port 443
┌─────────────────────┐
│   ramboflow-nginx   │ ← unverändert, bekommt neuen vhost für mail.ramboeck.it
└──────────┬──────────┘
           │  Container-DNS: mailsort-backend / mailsort-frontend
           ▼
      timetracking_app_ramboflow-network   ← shared external network
           │
    ┌──────┴──────┐
    ▼             ▼
┌────────┐  ┌──────────┐
│frontend│  │ backend  │
│ (nginx)│  │  (node)  │
└────────┘  └────┬─────┘
                 │  mailsort-net (privat, isoliert)
                 ▼
           ┌──────────┐   ┌──────────────────┐
           │postgres  │←──│ postgres-backup  │ (täglich 02:15 UTC)
           └──────────┘   └──────────────────┘
```

## Voraussetzungen

- Docker >= 24, Compose v2 ✓ (`Server 29.1.3` bei dir)
- Domain / Subdomain, A-Record auf den Host, z.B. `mail.ramboeck.it`
- Azure-AD-App-Registration (Multi-Tenant, siehe `SETUP.md`)
- Azure-OpenAI-Deployment oder Ollama-Erreichbarkeit

## Erst-Deployment

### 1. Repo klonen

```bash
sudo mkdir -p /opt/mailsort && sudo chown $USER: /opt/mailsort
cd /opt/mailsort
git clone https://github.com/cramboeck/ai-outlook.git .
git checkout claude/mailsort-ai-outlook-BP7Qb
```

### 2. Prod-Config erstellen

```bash
cp .env.prod.example .env.prod
$EDITOR .env.prod
```

Werte anpassen:
- `PUBLIC_URL=https://mail.ramboeck.it`
- `POSTGRES_PASSWORD` — `openssl rand -base64 32` und rein
- `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_TENANT_ID`
- **einen** AI-Provider-Block ausfüllen (Azure OpenAI oder Ollama)

### 3. Container bauen und starten

```bash
sudo docker compose -f docker-compose.mailsort.yml --env-file .env.prod up -d --build
```

Erst-Build dauert ~4-6 Minuten auf ARM64. Danach:

```bash
sudo docker compose -f docker-compose.mailsort.yml --env-file .env.prod ps
```

Erwartet: alle 4 Container mit `(healthy)`.

### 4. DB-Migrationen

```bash
sudo docker compose -f docker-compose.mailsort.yml --env-file .env.prod \
  exec backend npx tsx src/db/migrate.ts
```

Ausgabe muss enden mit `✅ Applied N migration(s)` oder `✅ Database is up to date`.

### 5. Zertifikat für neue Subdomain holen

Der `ramboflow-certbot`-Container ist bereits da — wir nutzen ihn.

**5a.** Der HTTP-Redirect-Block muss temporär auch ohne SSL-Cert funktionieren.
Erst einen minimalen HTTP-only Block in `nginx.production.conf` einfügen:

```nginx
server {
    listen 80;
    server_name mail.ramboeck.it;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 404; }
}
```

nginx reloaden:
```bash
sudo docker exec ramboflow-nginx nginx -t
sudo docker exec ramboflow-nginx nginx -s reload
```

**5b.** DNS-A-Record auf den Server-IP setzen (Falls noch nicht). Prüfen:
```bash
dig +short mail.ramboeck.it
```

**5c.** Zertifikat holen (via ramboflow-certbot):
```bash
sudo docker exec ramboflow-certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d mail.ramboeck.it \
  --email deine@email.de --agree-tos --no-eff-email
```

**5d.** Jetzt den finalen vhost-Snippet aus `deploy/nginx-mailsort.conf` einfügen:
```bash
# Öffne die nginx-Config
sudo $EDITOR /home/timetracking_app/timetracking_app/nginx/nginx.production.conf
```

Kopiere den kompletten Inhalt von `deploy/nginx-mailsort.conf` in den `http { ... }`
Block, direkt neben die anderen `server { }` Blöcke. Ersetze `mail.ramboeck.it`
falls du eine andere Subdomain nutzt.

Den temporären HTTP-only Block aus 5a löschen (der neue Snippet hat einen
vollwertigen HTTP-Redirect drin).

```bash
sudo docker exec ramboflow-nginx nginx -t
sudo docker exec ramboflow-nginx nginx -s reload
```

### 6. Sanity-Check

```bash
curl -sSf https://mail.ramboeck.it/api/health | jq
```

Erwartete Antwort:
```json
{
  "status": "healthy",
  "database": "connected",
  "engine": "postgresql",
  ...
}
```

Im Browser: `https://mail.ramboeck.it` → MailSort-Landing-Page.

## Update-Deployment

Nach neuen Commits:

```bash
cd /opt/mailsort
git pull
sudo docker compose -f docker-compose.mailsort.yml --env-file .env.prod up -d --build

# Nur wenn neue Migrationen dabei waren:
sudo docker compose -f docker-compose.mailsort.yml --env-file .env.prod \
  exec backend npx tsx src/db/migrate.ts
```

## Backup & Restore

Der `mailsort-postgres-backup`-Container macht **nächtlich 02:15 UTC** einen
`pg_dump | gzip` ins Volume `mailsort-postgres-backups`.

**Backups auflisten:**
```bash
sudo docker run --rm -v mailsort-postgres-backups:/backups alpine ls -la /backups
```

**Restore (überschreibt aktuelle DB!):**
```bash
BACKUP=mailsort_20260420T021500Z.sql.gz

sudo docker run --rm -v mailsort-postgres-backups:/backups alpine \
  gunzip -c /backups/${BACKUP} > /tmp/restore.sql

sudo docker compose -f docker-compose.mailsort.yml --env-file .env.prod exec -T \
  postgres psql -U mailsort -d mailsort < /tmp/restore.sql
```

**Off-Site empfohlen:** Cron auf dem Host sichert `/var/lib/docker/volumes/mailsort-postgres-backups/` auf Hetzner Storage Box.

## Diagnose

```bash
# Alle Container + Health
sudo docker compose -f docker-compose.mailsort.yml --env-file .env.prod ps

# Backend-Logs
sudo docker compose -f docker-compose.mailsort.yml --env-file .env.prod logs -f backend

# Von ramboflow-nginx aus prüfen ob mailsort-backend erreichbar
sudo docker exec ramboflow-nginx wget -qO- http://mailsort-backend:7071/api/health

# Von ramboflow-nginx aus prüfen ob mailsort-frontend erreichbar
sudo docker exec ramboflow-nginx wget -qO- http://mailsort-frontend/ | head -20
```

## Docker-Group (Bequemlichkeit)

Wenn du kein `sudo` bei jedem `docker`-Command tippen willst:

```bash
sudo usermod -aG docker $USER
# Neu einloggen, dann funktioniert docker ohne sudo
```

## Alles zurückbauen

```bash
# Container weg, Daten + Backups bleiben
sudo docker compose -f docker-compose.mailsort.yml --env-file .env.prod down

# Nginx vhost zurücknehmen: die eingefügten server{} Blöcke in
# /home/timetracking_app/timetracking_app/nginx/nginx.production.conf löschen
# und ramboflow-nginx reloaden.

# Volumes UND Backups löschen (nicht umkehrbar):
sudo docker compose -f docker-compose.mailsort.yml --env-file .env.prod down -v
```

## Häufige Stolpersteine

| Symptom | Ursache | Fix |
|---|---|---|
| `502 Bad Gateway` von nginx | mailsort-container down oder nicht im shared network | `docker inspect mailsort-frontend` → `Networks: timetracking_app_ramboflow-network` muss drin sein |
| `nginx: host not found in upstream "mailsort-backend"` | MailSort läuft noch nicht ODER nginx wurde vor MailSort-up gereloaded | `docker compose ps` prüfen, dann `docker exec ramboflow-nginx nginx -s reload` |
| Certbot-Renewal schlägt fehl | Der neue vhost-HTTP-Block hat kein `/.well-known/acme-challenge/`-mapping | im Snippet oben ist es drin — nicht rausbauen |
| Frontend lädt, API 404 | `VITE_API_URL` beim Build falsch | `.env.prod` prüfen (`PUBLIC_URL=https://...`), Frontend neu bauen mit `--build` |
| Login-Popup schließt sofort | Redirect-URI nicht in Azure AD | Azure Portal → App-Registrierung → Authentifizierung → `https://mail.ramboeck.it` hinzufügen |
| Copilot-Panel erscheint nicht | Client-Secret fehlt oder kein Consent | Logs nach `copilot:` grep'en, siehe `SETUP.md` §4 |
