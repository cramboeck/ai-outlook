#!/bin/sh
# Nightly Postgres backup for MailSort.
# Called from the postgres-backup sidecar container. Uses PG* env vars
# (PGHOST/PGUSER/PGPASSWORD/PGDATABASE) already provided by compose.

set -eu

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/backups/mailsort_${TIMESTAMP}.sql.gz"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"

echo "[backup] Starting pg_dump → ${OUT}"
pg_dump --format=plain --no-owner --no-privileges \
  | gzip -9 > "${OUT}.tmp"

# Atomic rename so an incomplete dump never masquerades as valid.
mv "${OUT}.tmp" "${OUT}"

SIZE="$(stat -c%s "${OUT}" 2>/dev/null || stat -f%z "${OUT}")"
echo "[backup] Wrote ${OUT} (${SIZE} bytes)"

# Prune anything older than RETENTION days.
echo "[backup] Pruning backups older than ${RETENTION} days"
find /backups -maxdepth 1 -name 'mailsort_*.sql.gz' -type f -mtime "+${RETENTION}" -print -delete

# Report current backup inventory count.
COUNT="$(find /backups -maxdepth 1 -name 'mailsort_*.sql.gz' -type f | wc -l)"
echo "[backup] Done. ${COUNT} backup(s) currently retained."
