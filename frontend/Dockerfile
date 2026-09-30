# MailSort Frontend — Multi-Stage Build
#
# stage 1: vite build. Vite bakes VITE_* env into the bundle at build time,
#          so those have to be present here as --build-arg values.
# stage 2: nginx serves the static dist with SPA fallback.

FROM node:20-slim AS build
WORKDIR /app

# Vite build-time env: passed in from docker-compose args.
ARG VITE_API_URL
ARG VITE_MSAL_CLIENT_ID
ARG VITE_MSAL_TENANT_ID
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_MSAL_CLIENT_ID=${VITE_MSAL_CLIENT_ID}
ENV VITE_MSAL_TENANT_ID=${VITE_MSAL_TENANT_ID}

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- runtime ----------
FROM nginx:1.27-alpine AS runtime

# In-container SPA fallback + gzip + long-cache for hashed assets.
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
