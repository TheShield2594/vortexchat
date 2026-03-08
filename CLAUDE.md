## VortexChat Hardening Sprint (Active)

- We are closing Tier 1 and Tier 2 gaps from docs/mvp-core-features.md
- That file is the SINGLE SOURCE OF TRUTH — update it when completing any feature
- Stack: Next.js App Router, TypeScript, Supabase, Socket.IO, WebRTC, pnpm monorepo
- Monorepo structure: apps/web (Next.js frontend + API routes), packages/shared (types, permissions, utilities), signal server (Socket.IO for voice/WebRTC)
- Import permissions from @vortex/shared — never hardcode permission bits
- Every new API endpoint needs permission checks using existing proxy/auth patterns
- Every moderation action needs audit logging
- Follow existing patterns — look before you build
- `proxy.ts` is the correct file for request interception (Next.js 16 renamed `middleware.ts` → `proxy.ts`, exported function `middleware` → `proxy`). Do NOT create or reference `middleware.ts`.