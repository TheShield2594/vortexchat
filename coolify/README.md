# Vortex — Coolify Deployment Guide

## Prerequisites
- Coolify installed on your server
- Domain or subdomain configured
- Supabase deployed (use Coolify's one-click Supabase template)

## Deployment Steps

### 1. Deploy Supabase via Coolify

1. In Coolify, go to **New Resource → One-click deploys → Supabase**
2. Follow the setup wizard
3. Note your:
   - Supabase URL (e.g., `https://supabase.yourdomain.com`)
   - `anon` key (from Studio → Settings → API)
   - `service_role` key (from Studio → Settings → API)
4. Run migrations via the Supabase CLI:
   ```bash
   npx supabase db push --db-url postgresql://postgres:password@supabase.yourdomain.com:5432/postgres
   ```

### 2. Deploy the Signaling Server

1. In Coolify: **New Resource → Application → Dockerfile**
2. Connect your GitHub/Gitea repo
3. Set **Dockerfile location**: `apps/signal/Dockerfile`
4. Set environment variables:
   ```
   PORT=3001
   SUPABASE_URL=https://supabase.yourdomain.com
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ALLOWED_ORIGINS=https://vortex.yourdomain.com
   ```
5. Set domain: `signal.yourdomain.com`
6. Enable **WebSocket support** in Coolify proxy settings
7. Set proxy timeout to **300s** for persistent WS connections
8. Deploy!

### 3. Deploy the Web App

1. In Coolify: **New Resource → Application → Dockerfile**
2. Connect your GitHub/Gitea repo
3. Set **Dockerfile location**: `apps/web/Dockerfile`
4. Set environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://supabase.yourdomain.com
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_SIGNAL_URL=wss://signal.yourdomain.com
   NEXT_PUBLIC_APP_URL=https://vortex.yourdomain.com
   ```
5. Set domain: `vortex.yourdomain.com`
6. Deploy!

## Network Requirements

### WebRTC / TURN Server
WebRTC P2P works without a TURN server on most networks. For users behind
strict NATs (common in corporate environments), deploy `coturn`:

```yaml
# In your Coolify docker-compose or as a separate service:
coturn:
  image: coturn/coturn:latest
  ports:
    - "3478:3478/udp"
    - "3478:3478/tcp"
    - "49152-49200:49152-49200/udp"
  command: >
    -n --log-file=stdout
    --min-port=49152 --max-port=49200
    --realm=yourdomain.com
    --lt-cred-mech
    --user=vortex:yourpassword
```

Then add the TURN server to `useVoice.ts` iceServers:
```typescript
iceServers: [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "turn:yourdomain.com:3478", username: "vortex", credential: "yourpassword" },
]
```

### SSL/TLS
WebRTC **requires HTTPS** in production. Coolify's Caddy reverse proxy
handles SSL automatically via Let's Encrypt. Just set your domain and it works.

### Firewall Ports
Open these ports on your server:
- 80, 443 — HTTP/HTTPS (Caddy)
- 3478/udp — TURN (if using coturn)
- 49152-49200/udp — TURN media relay

## Supabase Storage Buckets
After deploying, create these buckets in Supabase Studio → Storage:
- `avatars` (public)
- `server-icons` (public)
- `attachments` (private)

Or run migration `00003_storage_buckets.sql` directly.

## Minimum Server Specs
| Users | RAM | CPU | Storage |
|-------|-----|-----|---------|
| 1-20  | 4GB | 2   | 40GB    |
| 20-50 | 8GB | 4   | 100GB   |
| 50+   | 16GB| 8   | 250GB+  |
