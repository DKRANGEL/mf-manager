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

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 8080
CMD ["node", "src/server.js"]
