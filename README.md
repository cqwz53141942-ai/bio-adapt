# bio-adapt

Cloudflare Pages 全栈项目结构：

- `frontend/` - Vue 3 + Vite + TypeScript
- `functions/api/health.ts`
- `functions/api/advice.ts`（SSE）

## Cloudflare Pages 构建配置

在 Cloudflare Pages 项目中设置：

- `Root directory`: 留空
- `Build command`: `cd frontend && npm ci && npm run build`
- `Build output directory`: `frontend/dist`

Functions 目录位于仓库根目录 `functions/`。

## Turnstile 防刷

后端与前端分别配置环境变量：

- `TURNSTILE_SECRET`：Cloudflare Turnstile Secret Key（后端校验用，未配置会自动跳过校验）
- `VITE_TURNSTILE_SITE_KEY`：Cloudflare Turnstile Site Key（前端渲染组件用）

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
