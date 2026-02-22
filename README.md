# bio-adapt
# bio-adapt (Cloudflare Pages)

Cloudflare Pages 全栈项目结构：

- `frontend/`：Vue 3 + Vite + TypeScript
- `functions/api/health.ts`
- `functions/api/advice.ts`（SSE）

## Cloudflare Pages 构建配置

在 Cloudflare Pages 项目中配置：

- **Root directory**: `frontend`
- **Build command**: `npm run build`
- **Build output directory**: `dist`

Functions 目录使用仓库根目录下的 `functions/`。

## 本地开发

```bash
cd frontend
npm install
npm run dev
```

## 构建

```bash
cd frontend
npm run build
```

## API

- `GET /api/health` -> `{ ok: true, ts: string }`
- `POST /api/advice` -> `text/event-stream`（SSE 流式建议）
