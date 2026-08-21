# 极简记账 (Serverless Ledger) 开发管线手册

本项目为《极简记账 APP 项目技术白皮书》规划的跨端极简记账应用。采用 **一套前端代码多端交付**（Web PWA、Android、iOS、Windows、macOS）与 **Cloudflare Serverless + D1 SQLite 数据库** 架构。

---

## 1. 架构总览 (Architecture Overview)

```
Serverless-Ledger/
├── packages/
│   ├── shared/                # 前后端共享类型定义、DTO 模型与金额计算工具
│   │   ├── src/
│   │   │   ├── models.ts      # User, Ledger, Category, Transaction, Budget 数据模型
│   │   │   ├── money.ts       # 整数分 (Integer Cents) 与 元 的安全高精度换算
│   │   │   └── index.ts
│   │   └── package.json
│   ├── server/                # 后端 API (Cloudflare Workers + Hono.js + D1)
│   │   ├── src/
│   │   │   ├── routes/        # /api/health, /api/categories, /api/ledgers, /api/transactions
│   │   │   └── index.ts       # Hono 应用入口、CORS 中间件与错误捕获
│   │   ├── migrations/        # Cloudflare D1 SQLite 结构与种子数据迁移脚本
│   │   │   └── 0001_initial_schema.sql
│   │   ├── wrangler.toml      # Workers & D1 绑定配置
│   │   └── package.json
│   └── client/                # 前端 (React 18 + Vite + Tailwind CSS + Dexie.js)
│       ├── src/
│       │   ├── api/           # API 客户端 (支持请求 Cloudflare Workers API)
│       │   ├── db/            # Dexie.js 本地 IndexedDB 数据库 (离线优先)
│       │   ├── App.tsx        # 极简记账交互 (3秒记账流、莫兰迪色系、Dark Mode)
│       │   └── main.tsx
│       ├── capacitor.config.ts # Capacitor 跨端打包配置 (Android/iOS)
│       ├── src-tauri/         # Tauri 桌面端与跨平台打包配置
│       │   └── tauri.conf.json
│       ├── vite.config.ts     # Vite 本地代理配置 (转发 /api 至 :8787)
│       └── package.json
├── package.json               # Monorepo 统一管线与任务编排脚本
├── tsconfig.base.json         # 统一 TypeScript 基础配置
└── 项目白皮书.md               # 原始需求与设计白皮书
```

---

## 2. 快速开始 (Quick Start)

### 2.1 安装依赖
在项目根目录下执行：
```bash
npm install
```

### 2.2 本地 D1 数据库迁移
在开发前，先对本地 D1 SQLite 数据库执行迁移脚本（创建 5 张核心表并写入系统预置分类）：
```bash
npm run db:migrate:local
```

### 2.3 一键启动本地前后端联调
在根目录下执行：
```bash
npm run dev
```
此命令将并发启动：
- **Cloudflare Workers API 本地服务**：`http://127.0.0.1:8787` (带本地 D1 SQLite 绑定)
- **Vite 前端开发服务器**：`http://localhost:3000` (自动反向代理 `/api` 请求到 `:8787`)

打开浏览器访问 `http://localhost:3000` 即可体验应用。

---

## 3. 核心设计规范实现

### 3.1 离线优先 (Offline-First)
- 用户新增流水账单时，前端首先无阻碍写入本地 **IndexedDB**（基于 `Dexie.js`），初始状态为 `pending`。
- 网络正常时自动同步至 Cloudflare D1 并标记为 `synced`；弱网或无网时依然可秒级记账，网络恢复后支持一键或静默批量增量同步（`POST /api/transactions/sync`）。

### 3.2 金额精度规范 (Integer Cents)
- 金额一律以“分”为单位存储为整数（`Integer`），杜绝浮点数计算误差。
- 工具库 `@ledger/shared` 提供了 `toCents(12.34) -> 1234` 和 `toYuan(1234) -> 12.34`，以及格式化显示函数 `formatMoney(1234) -> "¥12.34"`。

---

## 4. 跨平台打包指南 (Multi-platform Packaging)

### 4.1 Web 端 (Cloudflare Pages)
```bash
npm run build:client
# 产物位于 packages/client/dist，可直接一键部署到 Cloudflare Pages
```

### 4.2 移动端 (Capacitor for Android / iOS)
```bash
# 1. 编译前端产物
npm run build:client

# 2. 添加原生平台 (首次运行)
npm run -w @ledger/client cap:add:android
npm run -w @ledger/client cap:add:ios

# 3. 同步 Web 资源到原生工程
npm run cap:sync

# 4. 在 Android Studio / Xcode 中打开并编译
npm run -w @ledger/client cap:open:android
npm run -w @ledger/client cap:open:ios
```

### 4.3 桌面端 (Tauri for Windows / macOS / Linux)
```bash
# 开发模式 (启动桌面窗口并热重载)
npm run tauri:dev

# 生成安装包 (Windows .msi/.exe, macOS .dmg/app, Linux .deb/AppImage)
npm run tauri:build
```

---

## 5. Cloudflare 线上部署 (Production Deployment)

### 5.1 部署 Workers API
1. 在 Cloudflare 控制台创建 D1 数据库：
   ```bash
   npx wrangler d1 create serverless_ledger_db
   ```
2. 将生成的 `database_id` 填入 `packages/server/wrangler.toml` 中的 `database_id` 字段。
3. 执行云端 D1 数据库迁移：
   ```bash
   npm run db:migrate:remote
   ```
4. 部署 API Worker：
   ```bash
   npm run -w @ledger/server deploy
   ```
