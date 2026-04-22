# Chess Platform

Open-source chess platform inspired by Lichess. Real-time multiplayer, Stockfish AI, matchmaking with bot fallback, Elo rating, and post-game analysis. Runs entirely on free tiers.

## One-click deploy

| Target | Button | What it deploys |
| --- | --- | --- |
| Render (backend + Postgres) | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/kayanerkama-alt/chess-platform) | NestJS API + Stockfish, free Postgres |
| Vercel (frontend) | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fkayanerkama-alt%2Fchess-platform&root-directory=apps%2Ffrontend&env=NEXT_PUBLIC_API_URL,NEXT_PUBLIC_WS_URL&envDescription=URL%20of%20your%20Render-hosted%20backend%2C%20e.g.%20https%3A%2F%2Fchess-backend-xxxx.onrender.com) | Next.js app on Vercel edge |
| Cloudflare Pages (frontend) | [![Deploy to Cloudflare Pages](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kayanerkama-alt/chess-platform) | Next.js app on Cloudflare's global CDN |
| Railway (backend) | [![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https%3A%2F%2Fgithub.com%2Fkayanerkama-alt%2Fchess-platform) | Full-stack on Railway |

After deploy, set `CORS_ORIGIN` on the backend to your frontend URL and set `NEXT_PUBLIC_API_URL` + `NEXT_PUBLIC_WS_URL` on the frontend to your backend URL. See [`DEPLOY.md`](./DEPLOY.md) for the full playbook.

## Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind + Zustand + `react-chessboard` + `chess.js`
- **Backend**: NestJS + Socket.IO + Prisma (PostgreSQL) + `chess.js` + Stockfish (optional Redis for cross-instance matchmaking)
- **Engine**: Stockfish (system binary, bundled in backend Docker image)
- **Hosting**: Backend on Render/Railway (Docker web service + Postgres), Frontend on Vercel or Cloudflare Pages

## Repo layout

```
apps/
  backend/           # NestJS API + WebSocket gateway + Stockfish worker
  frontend/          # Next.js app
packages/
  shared/            # Shared TypeScript types
render.yaml          # Render blueprint (web + postgres)
vercel.json          # Vercel configuration
apps/frontend/wrangler.toml  # Cloudflare Pages configuration
```

## Local development

Prerequisites: Node.js 20+, pnpm 9+, PostgreSQL, Stockfish (`apt install stockfish`).
Redis is optional — the backend uses an in-memory queue when `REDIS_URL` is unset, which is fine for a single backend instance.

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local

# Terminal 1
pnpm dev:backend    # http://localhost:4000

# Terminal 2
pnpm dev:frontend   # http://localhost:3000
```

## Features

- Real-time multiplayer via WebSocket with rooms, clocks, and reconnection handling
- Matchmaking queue with time-control pools
- **Auto bot-fallback**: if no human opponent is found within `BOT_FALLBACK_MS` (default 15s), you're paired with Stockfish instead of waiting forever
- Elo rating (K=32, floor 100)
- Play vs Stockfish at 21 skill levels (UCI_Elo 800–2700)
- Live eval bar + best move suggestion (opt-in)
- Post-game analysis: blunder detection, engine lines, PGN import/export
- Guest login (no signup friction) + JWT sessions
- Rate limiting (via `@nestjs/throttler`) and input validation enforced globally
- Persistent Stockfish session per `/engine/analyze` request — ~10× faster than spawn-per-ply

## Configuration

Backend env vars (`apps/backend/.env`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | Postgres connection string (required) |
| `REDIS_URL` | — | Optional. Enables cross-instance matchmaking queue |
| `JWT_SECRET` | `dev-only-secret-change-me` | JWT signing key — generate a random one in prod |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated list of allowed frontend origins |
| `STOCKFISH_PATH` | auto-detect | Path to the Stockfish binary |
| `BOT_FALLBACK_MS` | `15000` | Queue wait before auto-matching to Stockfish (0 to disable) |
| `BOT_FALLBACK_LEVEL` | `6` | Stockfish skill level for bot fallbacks (0–20) |
| `PORT` | `4000` | HTTP port |

Frontend env vars (`apps/frontend/.env.local`):

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Public URL of the backend API (e.g. `https://chess-backend-xxxx.onrender.com`) |
| `NEXT_PUBLIC_WS_URL` | Usually the same URL as `NEXT_PUBLIC_API_URL` |

## License

AGPL-3.0 (same spirit as Lichess).
