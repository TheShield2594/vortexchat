FROM node:20-alpine AS base

RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy workspace root files needed for npm workspace resolution
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/web/package.json ./apps/web/package.json

# Install all workspace dependencies (web + shared)
RUN npm ci --workspace=apps/web --workspace=packages/shared --include-workspace-root

# Copy source files
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build shared package first, then web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=packages/shared && \
    npm run build --workspace=apps/web

# ─── Production image ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=base /app/apps/web/public ./public
COPY --from=base --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=base --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "const http=require('http'); http.get('http://127.0.0.1:3000/', (res) => process.exit(res.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
