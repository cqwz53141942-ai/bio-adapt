# bio-adapt

Cloudflare Pages full-stack structure:

- `frontend/` - Vue 3 + Vite + TypeScript
- `functions/api/health.ts`
- `functions/api/advice.ts` (SSE)

## Cloudflare Pages build settings

Set these in the Cloudflare Pages project:

- `Root directory`: `frontend`
- `Build command`: `npm run build`
- `Build output directory`: `dist`

The Functions directory lives at the repository root as `functions/`.

## Local development

```bash
cd frontend
npm install
npm run dev
```

## Build

```bash
cd frontend
npm run build
```

## API

- `GET /api/health` -> `{ ok: true, ts: string }`
- `POST /api/advice` -> `text/event-stream` (SSE streaming advice)
