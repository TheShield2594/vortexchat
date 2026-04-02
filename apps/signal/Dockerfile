FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./

# Copy the signal server and shared package manifests
COPY apps/signal/package.json apps/signal/package.json
COPY packages/shared/package.json packages/shared/package.json

# Install only signal server dependencies (workspace-aware)
RUN npm install --workspace=apps/signal --omit=dev --ignore-scripts

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/signal/node_modules ./apps/signal/node_modules 2>/dev/null || true

# Copy shared package source (used as raw TS by signal server)
COPY packages/shared ./packages/shared

# Copy signal server source
COPY apps/signal ./apps/signal

# Copy root package.json so node can resolve workspaces
COPY package.json ./

WORKDIR /app/apps/signal
RUN npx tsc

FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 signaluser

COPY --from=builder /app/apps/signal/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/signal/package.json ./package.json

USER signaluser

EXPOSE 3001
ENV PORT 3001

CMD ["node", "dist/index.js"]
