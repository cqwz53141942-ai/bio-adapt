# bio-adapt

Cloudflare Pages 全栈项目结构：

- `frontend/` - Vue 3 + Vite + Vue Router + TypeScript
- `functions/api/health.ts`
- `functions/api/advice.ts`（SSE）

## 页面结构

- `/input`：输入页（城市、出生时间、性别、症状、可穿戴数据、Turnstile、人机验证、检查服务状态）
- `/result`：结果页（流式分段建议展示）

## Cloudflare Pages 构建配置

在 Cloudflare Pages 项目中设置：

- `Root directory`: 留空
- `Build command`: `cd frontend && npm ci && npm run build`
- `Build output directory`: `frontend/dist`

Functions 目录位于仓库根目录 `functions/`。

## 环境变量

Turnstile 防刷：

- `TURNSTILE_SECRET`：Cloudflare Turnstile Secret Key（后端校验用，未配置会自动跳过校验）
- `VITE_TURNSTILE_SITE_KEY`：Cloudflare Turnstile Site Key（前端渲染组件用）

中医后台分析（可选）：

- `TCM_BACKEND_URL`：后端分析服务地址（配置后将优先调用，失败则自动回退本地规则引擎）
- `TCM_BACKEND_API_KEY`：后端分析服务 API Key（可选）

说明：天气按城市维度做短 TTL 缓存，切换城市会重新计算建议。

## 本地开发

```bash
cd frontend
npm install
npm run dev
```

## 构建

```bash
npm --prefix frontend run build
```

## API

- `GET /api/health` -> `{ ok: true, ts: string }`
- `POST /api/advice` -> `text/event-stream`（SSE 流式建议）
