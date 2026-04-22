# Deployment

The project ships with one-click deploy buttons for Render, Vercel, Cloudflare Pages, and Railway. Pick any combo of **one backend + one frontend**.

## Backend — Render (recommended)

Click **Deploy to Render** in the [README](./README.md#one-click-deploy). It reads [`render.yaml`](./render.yaml) and provisions:

- `chess-postgres` — free Postgres
- `chess-backend` — Docker web service (NestJS + Stockfish)

The Dockerfile installs the `stockfish` apt package so the binary is present at `/usr/games/stockfish`. On boot the container runs `prisma migrate deploy` (falling back to `prisma db push` if no migrations exist) then `node dist/main.js`.

> Render removed the free Redis plan. This blueprint skips Redis entirely and uses an in-memory matchmaking queue inside the backend. That's fine for a single backend instance; upgrade to a paid Redis (or Upstash) if you scale past one.

After the web service is live, copy its public URL (e.g. `https://chess-backend-xxxx.onrender.com`) and set `CORS_ORIGIN` on the service to your frontend origin (see the frontend section).

### Automated (used by Devin sessions)

```bash
curl -sX POST https://api.render.com/v1/blueprints \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"repo":"https://github.com/kayanerkama-alt/chess-platform","branch":"main"}'
```

## Backend — Railway (alternative)

Click **Deploy on Railway** in the README. Railway will detect the Dockerfile at `apps/backend/Dockerfile`, provision Postgres, and expose the HTTP port. Set the same env vars as in Render.

## Frontend — Vercel

Click **Deploy with Vercel** in the README and set these env vars when prompted:

- `NEXT_PUBLIC_API_URL` → `https://<your-backend>.onrender.com`
- `NEXT_PUBLIC_WS_URL` → same (Socket.IO upgrades to WebSocket)

The frontend root is `apps/frontend`. The Vercel button link already sets `root-directory=apps/frontend`.

Manual deploy:

```bash
npx vercel --yes --cwd apps/frontend
npx vercel env add NEXT_PUBLIC_API_URL production
npx vercel env add NEXT_PUBLIC_WS_URL production
npx vercel deploy --prod --cwd apps/frontend
```

## Frontend — Cloudflare Pages

Two options:

### Dashboard (easiest)

1. In Cloudflare → Workers & Pages → Create → Pages → Connect to Git.
2. Select the repo.
3. Framework preset: **Next.js**.
4. Build command: `pnpm install --no-frozen-lockfile && pnpm --filter @chess/frontend exec next-on-pages`.
5. Build output directory: `apps/frontend/.vercel/output/static`.
6. Root directory: `/`.
7. Env vars: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, and `NODE_VERSION=20`.

### Wrangler CLI

```bash
cd apps/frontend
pnpm install --no-frozen-lockfile
pnpm exec next-on-pages
npx wrangler pages deploy .vercel/output/static --project-name chess-frontend
```

`apps/frontend/wrangler.toml` pins Node 20 and the `nodejs_compat` runtime flag so Next.js server components work on Cloudflare's runtime.

## Post-deploy checklist

- [ ] Backend `CORS_ORIGIN` set to the frontend origin (Vercel URL or `*.pages.dev`)
- [ ] Frontend `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` set to the backend URL
- [ ] Visit `https://<backend>/health` — expect `{ "ok": true, "ts": ... }`
- [ ] Visit the frontend root — a guest session should be created automatically in the top-right nav
- [ ] Queue a game in `/play` — after ~15s with no opponent you should be paired with `StockfishAI`

## Troubleshooting

**`CORS` errors in the browser console** — `CORS_ORIGIN` on the backend doesn't include the exact frontend origin. It must include scheme + host + optional port. Comma-separate multiple values.

**Render free Postgres expired** — Render free Postgres instances are destroyed after 30 days. Re-provision by deleting and re-applying the blueprint, or upgrade to the starter plan.

**WebSocket disconnects / polling-only** — some corporate networks block raw WebSockets. The client already falls back to long-polling automatically; nothing to do.

**`Stockfish not found`** — the Dockerfile installs the `stockfish` apt package. If you're running without Docker, set `STOCKFISH_PATH` to the absolute path of your binary.
