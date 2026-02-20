# Vortex — Deployment Guide

Vortex runs on three cloud services:

| Service | What it hosts |
|---------|---------------|
| [Vercel](https://vercel.com) | Next.js web app |
| [Railway](https://railway.app) | WebRTC signaling server (WebSockets) |
| [Supabase Cloud](https://supabase.com) | Database, Auth, Realtime, Storage |

---

## 1. Supabase Cloud

1. Create a project at [app.supabase.com](https://app.supabase.com).
2. From **Settings → API** copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`
3. Run migrations against your cloud database:
   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
4. In Supabase dashboard → **Authentication → URL Configuration**, set:
   - **Site URL**: `https://your-app.vercel.app`
   - **Redirect URLs**: `https://your-app.vercel.app/**`
5. Create Storage buckets (**Storage → New bucket**):
   - `avatars` — public
   - `server-icons` — public
   - `attachments` — private

   (These are also created automatically by migration `00003_storage_buckets.sql`.)

---

## 2. Signal Server → Railway

The WebRTC signaling server runs persistent WebSocket connections and must be hosted on a platform that supports long-lived TCP connections. Railway is the recommended option.

### Deploy to Railway

1. Install the [Railway CLI](https://docs.railway.app/develop/cli):
   ```bash
   npm install -g @railway/cli
   railway login
   ```
2. From the repo root, link and deploy the signal app:
   ```bash
   cd apps/signal
   railway init        # create a new Railway project
   railway up          # build & deploy from Dockerfile
   ```
3. Set environment variables in the Railway dashboard (or via CLI):
   ```
   PORT=3001
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ALLOWED_ORIGINS=https://your-app.vercel.app
   ```
4. In Railway, enable **Public Networking** for the service and copy the generated URL (e.g., `https://vortex-signal.up.railway.app`).
   Use this URL as `NEXT_PUBLIC_SIGNAL_URL` in the Vercel environment — prefix with `wss://` for WebSockets.

### Railway config

`apps/signal/railway.toml` is already configured. Railway will detect the `Dockerfile` in `apps/signal/` automatically.

---

## 3. Web App → Vercel

### Connect repo

1. Go to [vercel.com/new](https://vercel.com/new) and import your GitHub repo.
2. In **Configure Project**, set:
   - **Root Directory**: `apps/web`
   - Framework will be auto-detected as **Next.js**
3. The `apps/web/vercel.json` overrides the build and install commands to use Turborepo from the monorepo root.

### Environment variables

Add these in **Vercel → Project → Settings → Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL      = https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = <anon-key>
SUPABASE_SERVICE_ROLE_KEY     = <service-role-key>
NEXT_PUBLIC_SIGNAL_URL        = wss://vortex-signal.up.railway.app
NEXT_PUBLIC_APP_URL           = https://your-app.vercel.app
```

Set all variables for **Production**, **Preview**, and **Development** environments as needed.

### Deploy

Push to `main` — Vercel deploys automatically on every push.

---

## WebRTC Notes

### STUN / TURN
WebRTC P2P works without a TURN server on most home and mobile networks. For users behind strict corporate NATs, add a TURN server (e.g., [Metered TURN](https://www.metered.ca/tools/openrelay/) has a free tier):

```typescript
// apps/web/lib/webrtc/useVoice.ts  iceServers section
iceServers: [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: "turn:your-turn-server.com:3478",
    username: "your-username",
    credential: "your-credential",
  },
]
```

### SSL
WebRTC **requires HTTPS**. Vercel and Railway both provision TLS automatically — no extra configuration needed.

---

## Local Development

For local dev, use the Supabase CLI to run a local Supabase instance:

```bash
# Start local Supabase (Docker required)
npx supabase start
npx supabase db push        # apply migrations

# Copy and fill in env files
cp apps/web/.env.local.example apps/web/.env.local
cp apps/signal/.env.example apps/signal/.env
# Paste the keys printed by `npx supabase status`

# Install dependencies
npm install

# Run web + signal in parallel
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The `docker-compose.yml` at the root can be used to test a containerised build locally but is not part of the production deployment.
