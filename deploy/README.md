# MailSort — Hetzner-Deployment

Läuft neben anderen Docker-Apps auf demselben Host. Der host-seitige nginx
terminiert TLS und routet public Traffic auf die MailSort-Container.

## Voraussetzungen

- Docker + Docker Compose auf dem Host
- Bestehendes host-nginx mit certbot
- Eine (Sub-)Domain mit A-Record auf den Host, z.B. `mailsort.example.com`
- Azure-AD-App-Registration (Multi-Tenant, siehe `SETUP.md` im Repo-Root)
- Azure-OpenAI-Deployment ODER ein erreichbarer Ollama-Host

## Erst-Deployment (10 Minuten)

### 1. Repo aufs Server klonen
```bash
sudo mkdir -p /opt/mailsort && sudo chown $USER: /opt/mailsort
cd /opt/mailsort
git clone https://github.com/cramboeck/ai-outlook.git .
git checkout claude/mailsort-ai-outlook-BP7Qb
```

### 2. Prod-Konfiguration anlegen
```bash
cp .env.prod.example .env.prod
$EDITOR .env.prod
```

Alle Werte, die mit `change-me` / `your-*` markiert sind, ersetzen. Speziell:

- `PUBLIC_URL` — die volle HTTPS-Adresse
- `POSTGRES_PASSWORD` — mind. 32 Zeichen zufällig (`openssl rand -base64 32`)
- `AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET` + `AZURE_TENANT_ID`
- `AZURE_OPENAI_*` **oder** `OPENAI_*` — ein Block, nicht beide

### 3. Container bauen und starten
```bash
docker compose -f docker-compose.mailsort.yml --env-file .env.prod up -d --build
```

Der erste Build dauert ~3–5 Min (Node-Deps + Vite-Build).

### 4. DB-Migrationen laufen lassen
```bash
docker compose -f docker-compose.mailsort.yml --env-file .env.prod \
  exec backend npx tsx src/db/migrate.ts
```

*(Der Migrator läuft mit tsx — auch im Prod-Image installiert weil er nicht Teil des kompilierten JS ist.)*

Ausgabe muss enden mit `✅ Applied N migration(s)` oder `✅ Database is up to date`.

### 5. Host-nginx konfigurieren
```bash
sudo cp deploy/nginx-mailsort.conf /etc/nginx/sites-available/mailsort.conf
sudo $EDITOR /etc/nginx/sites-available/mailsort.conf
# → mailsort.example.com durch echte Domain ersetzen
sudo ln -s /etc/nginx/sites-available/mailsort.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 6. HTTPS via Let's Encrypt
```bash
sudo certbot --nginx -d mailsort.example.com
```

Certbot injiziert die Cert-Pfade automatisch in `mailsort.conf` und lädt nginx.

### 7. Health-Check
```bash
curl https://mailsort.example.com/api/health
```

Erwartete Antwort:
```json
{"status":"healthy","database":"connected","engine":"postgresql",...}
```

## Update-Deployment

Für jeden neuen Commit auf dem Prod-Branch:

```bash
cd /opt/mailsort
git pull
docker compose -f docker-compose.mailsort.yml --env-file .env.prod up -d --build

# Bei neuen Migrationen zusätzlich:
docker compose -f docker-compose.mailsort.yml --env-file .env.prod \
  exec backend npx tsx src/db/migrate.ts
```

Rolling: zuerst Backend, dann Frontend — Compose macht das automatisch,
solange die Backend-Health-Checks grün gehen.

## Backups

Der `mailsort-postgres-backup`-Container macht **nächtlich um 02:15 UTC**
einen `pg_dump | gzip` in `mailsort-postgres-backups`.

Restore aus einem Backup:
```bash
# Backup-Datei aus dem Volume holen
docker run --rm -v mailsort-postgres-backups:/backups alpine \
  ls -la /backups

# Wiederherstellen (macht die aktuelle DB platt!)
BACKUP=mailsort_20260420T021500Z.sql.gz
docker run --rm -v mailsort-postgres-backups:/backups alpine \
  gunzip -c /backups/${BACKUP} > /tmp/restore.sql

docker compose -f docker-compose.mailsort.yml exec -T postgres \
  psql -U mailsort -d mailsort < /tmp/restore.sql
```

Off-Site-Backup empfohlen: eine Cron auf dem Host, die den `mailsort-postgres-backups`-Ordner zu Hetzner Storage Box / S3 synced.

## Diagnose

```bash
# Live-Logs von allen Containern
docker compose -f docker-compose.mailsort.yml logs -f

# Nur Backend
docker compose -f docker-compose.mailsort.yml logs -f backend

# Ist die DB erreichbar aus dem Backend?
docker compose -f docker-compose.mailsort.yml exec backend \
  node -e "require('pg').Client && console.log('pg lib loaded')"

# Container-Status + Health
docker compose -f docker-compose.mailsort.yml ps
```

## Alles wieder abbauen

```bash
docker compose -f docker-compose.mailsort.yml --env-file .env.prod down
```

Mit `-v` zusätzlich werden Volumes gelöscht — **das killt alle Daten und Backups**, nur bewusst nutzen:
```bash
docker compose -f docker-compose.mailsort.yml --env-file .env.prod down -v
```

## Häufige Stolpersteine

| Symptom | Ursache | Fix |
|---|---|---|
| `502 Bad Gateway` beim Aufruf | Container nicht up oder Port-Mapping falsch | `docker compose ps` — sind alle drei up? `.env.prod`-Ports mit `nginx-mailsort.conf` konsistent? |
| Frontend lädt, API-Calls 404 | `VITE_API_URL` beim Build falsch gesetzt | `.env.prod` prüfen, `--build` beim Compose-Command mitgeben |
| Login-Popup schließt sofort | Azure-AD Redirect-URI nicht registriert | Im Azure-Portal: App-Registration → Authentifizierung → `https://mailsort.example.com` hinzufügen |
| „consent_required" beim ersten Login | Admin-Consent für Graph-Scopes fehlt | Azure-Portal → API-Berechtigungen → „Admin-Zustimmung erteilen" |
| Copilot-Panel erscheint nicht | `AZURE_CLIENT_SECRET` fehlt oder Tenant hat keine Copilot-Lizenz | Backend-Logs nach `copilot:` grep'en, Ursache siehe `SETUP.md` §4 |
