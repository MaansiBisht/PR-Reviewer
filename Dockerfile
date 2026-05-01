# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ── Stage 2: Compile TypeScript backend ──────────────────────────────────────
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Only production deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled backend
COPY --from=backend-builder /app/dist ./dist

# Built frontend — served as static files by Express
COPY --from=web-builder /app/web/dist ./web/dist

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "dist/index.js"]
