# 账盾 (Serverless Ledger v2) 开发与部署手册

本项目为 **账盾 (Serverless Ledger v2)** 跨端个人财务与记账应用。采用 **"Local-First & Offline-by-Default"（本地优先，默认离线）** 架构，前端基于 React 18 + Vite + Dexie.js (IndexedDB) + Web Crypto API 打造零知识本地安全保险库，并支持 **Cloudflare Workers + D1** 作为可选的边缘云同步中继。

---

## 1. 核心特性 (Features)

- ⚡ **100% 本地优先架构 (Local-First)**：以本机 IndexedDB 为唯一第一权威数据源，0ms 冷启动，无网络、无服务端也能 100% 完整使用记账、统计、预算、分类、周期记账与备份导入导出。
- 🛡️ **Web Crypto 本地安全保险库**：基于浏览器原生 Web Crypto API（`PBKDF2` 100,000 轮 + `AES-GCM-256` 硬件加速），敏感数据落盘加密，支持 16 位高熵应急恢复凭证（`XXXX-XXXX-XXXX-XXXX`）一键找回。
- ☁️ **可插拔云端同步 (`ISyncAdapter`)**：服务端定位为可选的云同步中继。未配置同步时完全休眠（0 轮询、0 请求）；配置后支持时序重放、双向增量与 Last-Write-Wins (LWW) 冲突合并。
- 🪙 **绝对整数金额精度 (Integer Cents)**：底层金额一律以“分”为最小整数单位存储，杜绝浮点精度丢失。
- 📚 **多账本独立核算体系**：日常、生意、旅行、家庭等独立核算与隔离管理。
- 🎯 **多维度月度预算管理**：支持月度总预算与各大核心分类预算进度追踪与超支预警。
- 📥 **离线账单导入与端到端加密备份**：支持离线微信/支付宝/通用 CSV 及 Excel 导入导出，并支持导出 `.enc.json` 端到端加密备份包。
- 🌐 **灵活的多端交付与纯静态部署**：
  - **纯前端静态部署**：可直接部署于 GitHub Pages、Vercel、Netlify 或任何静态文件托管服务器，无需任何后端服务！
  - **全栈一体化部署**：配合 Cloudflare Pages / Workers + D1 实现全球低延迟多端同步。
  - **跨端打包**：通过 Capacitor (Android / iOS) 与 Tauri v2 (Windows / macOS / Linux) 打包为原生应用。

---

## 2. 架构总览 (Architecture Overview)

```
Serverless-Ledger/
├── packages/
│   ├── shared/                # 前后端共享类型定义、DTO 模型、存储抽象 Repository 接口、加密类型与规则引擎
│   │   ├── src/
│   │   │   ├── storage.ts     # IUserRepository, ILedgerRepository, ISyncAdapter 等抽象契约
│   │   │   ├── cryptoTypes.ts # EncryptedPayload, VaultMetadata 数据结构
│   │   │   ├── models.ts      # 业务模型定义
│   │   │   ├── money.ts       # 整数分高精度换算
│   │   │   ├── categories.ts  # 77+ 预置层级分类
│   │   │   ├── csv.ts         # CSV 导入导出与智能账单分类匹配引擎
│   │   │   └── index.ts
│   │   └── package.json
│   ├── server/                # 可选边缘同步 API (Cloudflare Workers + Hono.js + D1)
│   │   ├── src/
│   │   │   ├── repositories/  # D1UserRepository, D1TransactionRepository 等 7 大 Repository
│   │   │   ├── routes/        # 纯同步与认证路由 (/api/auth, /api/transactions/sync, /api/health 等)
│   │   │   ├── middleware/    # JWT 身份鉴权
│   │   │   └── index.ts       # Hono 应用入口
│   │   └── wrangler.toml      # Cloudflare D1 绑定配置
│   └── client/                # 本地优先前端 (React 18 + Vite + Tailwind CSS + Dexie v5 + WebCrypto)
│       ├── src/
│       │   ├── auth/          # 本地零知识保险库认证 (localAuth.ts)
│       │   ├── crypto/        # Web Crypto 加密引擎 (PBKDF2 + AES-GCM)
│       │   ├── db/            # Dexie.js v5 本地 IndexedDB 权威数据库
│       │   ├── sync/          # ISyncAdapter & CloudflareSyncAdapter 云同步适配器
│       │   ├── api/           # localStore (纯本地 CRUD), cloudAuth (云认证), httpClient (底层网络)
│       │   ├── components/    # 记账、明细、统计、分类、预算、同步设置、保险库、Onboarding 引导等组件
│       │   ├── App.tsx        # 根组件 (0ms 离线冷启动)
│       │   └── main.tsx
│       ├── capacitor.config.ts # Capacitor 跨端移动打包配置 (Android/iOS)
│       ├── src-tauri/         # Tauri v2 桌面端打包配置 (Windows/macOS/Linux)
│       └── vite.config.ts
├── docs/                      # v2 架构设计、加密方案与迁移指南
├── scripts/                   # 自动化单测与构建管线验证脚本
└── package.json               # Monorepo 统一任务编排脚本
```

---

## 3. 本地开发与快速上手 (Quick Start)

### 3.1 环境要求
- **Node.js**：`>= 18.0.0`
- **npm**：`>= 9.0.0`

### 3.2 安装依赖
```bash
npm install
```

### 3.3 运行全量测试套件
```bash
# 运行全量测试 (包含共享库单测、Web Crypto 加密防篡改测试、本地存储测试、客户端同步适配器测试及构建管线验证)
npm test

# 运行服务端 Repository 与同步测试
npm run test:server
```

### 3.4 启动本地开发
```bash
# 模式 A: 纯前端离线独立运行 (无需后端)
npm run dev:client

# 模式 B: 前后端并发联调 (前端 + Cloudflare Workers D1 本地模拟器)
npm run dev
```
打开浏览器访问 `http://localhost:3000` 即可开始使用。

---

## 4. 部署方案 (Deployment Options)

### 方案 A：纯前端静态部署 (推荐 / 零运维成本)
由于账盾 v2 为 100% 本地优先架构，前端静态产物完全独立，可直接部署在任何静态托管服务上：
1. 构建前端静态资源：
   ```bash
   npm run build:client
   ```
2. 将 `packages/client/dist` 目录上传至 **GitHub Pages**、**Vercel**、**Netlify** 或 **Cloudflare Pages** 即可。

### 方案 B：Cloudflare Pages 全栈一体化部署 (带 D1 云同步)
若需要多设备云端增量同步中继：
1. 登录 Cloudflare 控制台创建 D1 数据库：
   ```bash
   npx wrangler d1 create serverless_ledger_db
   ```
2. 执行远程数据库迁移：
   ```bash
   npm run db:migrate:remote
   ```
3. 在 Cloudflare Pages 中连接 GitHub 仓库，设置构建命令为 `npm run build`，输出目录为 `packages/client/dist`，并绑定 D1 数据库。

---

## 5. 跨端应用构建 (Cross-Platform Mobile & Desktop)

- **Android / iOS**：
  ```bash
  npm run cap:sync
  npm run cap:open:android # 或 cap:open:ios
  ```
- **Windows / macOS / Linux (Tauri v2)**：
  ```bash
  npm run tauri:dev
  npm run tauri:build
  ```

---

## 6. 技术文档与参考

- 📘 [`docs/v2-架构设计.md`](./docs/v2-架构设计.md)：本地优先与可插拔云同步架构详解
- 📘 [`docs/v2-加密方案.md`](./docs/v2-加密方案.md)：Web Crypto 密钥生命周期与安全规范
- 📘 [`docs/v2-迁移指南.md`](./docs/v2-迁移指南.md)：v1 到 v2 数据自动升级与迁移指南
