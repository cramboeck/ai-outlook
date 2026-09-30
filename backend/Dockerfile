# MailSort Backend — Multi-Stage Build
#
# stage 1: install + typescript build with the full dev toolchain
# stage 2: slim runtime image with only prod deps + compiled JS

FROM node:20-slim AS build
WORKDIR /app

# Install build-time dependencies for optional native modules (better-sqlite3
# is a fallback that ships in package.json — we ship the module even though
# prod uses Postgres, so the require() at import time doesn't crash).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:20-slim AS runtime
WORKDIR /app

# Runtime needs libstdc++ for better-sqlite3 loading — even when unused —
# because require('better-sqlite3') happens at module import.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r mailsort && useradd -r -g mailsort -d /app -s /sbin/nologin mailsort

COPY --from=build --chown=mailsort:mailsort /app/dist ./dist
COPY --from=build --chown=mailsort:mailsort /app/node_modules ./node_modules
COPY --from=build --chown=mailsort:mailsort /app/package.json ./
COPY --from=build --chown=mailsort:mailsort /app/src/db/schema.sql ./src/db/schema.sql
COPY --from=build --chown=mailsort:mailsort /app/src/db/migrations ./src/db/migrations

USER mailsort
EXPOSE 7071

ENV NODE_ENV=production
ENV PORT=7071
ENV LOG_LEVEL=info

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:7071/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# tini as PID 1 — proper signal handling for graceful shutdown.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.js"]
