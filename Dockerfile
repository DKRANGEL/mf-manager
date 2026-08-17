# syntax = docker/dockerfile:1

ARG NODE_VERSION=24.13.1
FROM node:${NODE_VERSION}-slim AS base

WORKDIR /app
ENV NODE_ENV="production"

# ── Instala dependências (layer cacheável) ────────────────────────────────────
FROM base AS deps
COPY package-lock.json package.json ./
RUN npm ci --omit=dev

# ── Imagem final ──────────────────────────────────────────────────────────────
FROM base

# Chromium + fontes para geração de PDF (Chrome headless via puppeteer-core)
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium fonts-liberation fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 8080
CMD ["node", "src/server.js"]
