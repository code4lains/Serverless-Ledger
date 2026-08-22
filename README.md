# 账盾 (Serverless Ledger) 开发管线手册

本项目为 **账盾 (Serverless Ledger)** 跨端个人财务与记账应用。采用 **一套前端代码多端交付**（Web PWA、Android、iOS、Windows、macOS）与 **Cloudflare Serverless + D1 SQLite 数据库** 架构，提供四大模块（记账、统计、分类、我的）与离线优先体验。

---

## 1. 架构总览 (Architecture Overview)

```
Serverless-Ledger/
├── functions/                 # Cloudflare Pages Functions 全栈一体化适配层
│   └── api/
│       └── [[route]].ts       # 路由代理层：将 /api/* 请求无缝对接 Hono API
├── packages/
│   ├── shared/                # 前后端共享类型定义、DTO 模型与金额计算工具
│   │   ├── src/
│   │   │   ├── models.ts      # User, Ledger, Category, Transaction, Budget 数据模型
│   │   │   ├── money.ts       # 整数分 (Integer Cents) 与 元 的安全高精度换算
│   │   │   └── index.ts
│   │   └── package.json
│   ├── server/                # 后端 API (Cloudflare Workers / Pages Functions + Hono.js + D1)
│   │   ├── src/
│   │   │   ├── routes/        # /api/health, /api/auth, /api/categories, /api/ledgers, /api/transactions
│   │   │   └── index.ts       # Hono 应用入口、CORS 中间件与错误捕获
│   │   ├── migrations/        # Cloudflare D1 SQLite 结构与种子数据迁移脚本
│   │   │   └── 0001_initial_schema.sql
│   │   ├── wrangler.toml      # Workers & D1 绑定配置
│   │   └── package.json
│   └── client/                # 前端 (React 18 + Vite + Tailwind CSS + Dexie.js)
│       ├── src/
│       │   ├── api/           # API 客户端 (支持离线优先 + 自动增量同步)
│       │   ├── db/            # Dexie.js 本地 IndexedDB 数据库 (离线优先)
│       │   ├── components/    # 统计(StatisticsView)、分类(CategoriesView)、我的(ProfileView)与各弹窗
│       │   ├── App.tsx        # 底部四大板块导航 (记账、统计、分类、我的)
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

## 4. Cloudflare 线上部署指南 (Production Deployment)

本项目支持 **Cloudflare Pages 全栈一体化部署**（前端页面 + 后端 API + D1 数据库共享同源域名，零 CORS 困扰，仅需连接一次 GitHub）。

### 4.1 第一步：创建 D1 数据库并初始化表结构
1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 进入左侧侧边栏：**Storage & Databases（存储和数据库）** ➔ **D1 SQL Database**。
3. 点击 **Create database（创建数据库）**：
   - 数据库名称填入：`serverless_ledger_db`
   - 点击 **Create** 保存。
4. 进入该数据库详情页，切换到 **Console（控制台）** 标签页。
5. 打开项目中的 `packages/server/migrations/0001_initial_schema.sql` 文件，复制里面的全部 SQL 语句，粘贴进控制台并点击 **Execute（执行）**。
   *(执行完成后切换到 **Tables** 标签页，确认 `users`、`ledgers`、`categories`、`transactions`、`budgets` 5 张表已生成并包含系统预置分类)*。

### 4.2 第二步：在 Cloudflare Pages 导入 GitHub 仓库并部署
1. 在 Cloudflare 控制台左侧进入 **Compute (Workers) / Workers & Pages**。
2. 点击 **Create application（创建应用程序）** ➔ 切换到 **Pages** 标签页 ➔ 点击 **Connect to Git（连接到 Git）**。
3. 选择已推送到 GitHub 的 `Serverless-Ledger` 仓库，点击 **Begin setup（开始设置）**。
4. 配置构建参数：
   - **Project name（项目名称）**：`serverless-ledger`（可自定义）
   - **Production branch（生产分支）**：`main`（或 `master`）
   - **Framework preset（框架预设）**：`None` 或 `Vite`
   - **Root directory（根目录）**：留空或填 `/`
   - **Build command（构建命令）**：
     ```bash
     npm run build:client
     ```
   - **Build output directory（构建输出目录）**：
     ```bash
     packages/client/dist
     ```
5. 点击底部的 **Save and Deploy（保存并部署）**。

### 4.3 第三步：绑定 D1 数据库与环境变量
1. 首次部署完成后，进入该 Pages 项目的管理详情页。
2. 点击顶部导航栏 **Settings（设置）** ➔ 左侧侧边栏选择 **Functions（函数）**。
3. 向下滚动找到 **D1 Database Bindings（D1 数据库绑定）**，点击 **Add binding（添加绑定）**：
   - **Variable name（变量名称）**：填 `DB`（必须大写）
   - **D1 database（数据库）**：在下拉列表中选中第 4.1 步创建的 `serverless_ledger_db`
   - 点击 **Save（保存）**。
4. 在 **Settings（设置）** ➔ **Environment Variables（环境变量）** 中添加以下变量：
   - **`JWT_SECRET`**：输入一段自定义的随机强密钥（用于 JWT 鉴权加签）。
   - **`TURNSTILE_SECRET_KEY`**：Cloudflare Turnstile 人机验证 Secret Key（用于服务端校验）。
   - **`VITE_TURNSTILE_SITE_KEY`**：Cloudflare Turnstile 人机验证 Site Key（用于前端渲染验证组件）。

### 4.4 第四步：申请与配置 Cloudflare Turnstile 人机验证 (可选但推荐)
1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，在左侧侧边栏进入 **Turnstile**。
2. 点击 **Add site（添加站点）**：
   - **Site name（站点名称）**：填入 `serverless-ledger`
   - **Domain（域名）**：添加你的 Pages 分配域名（如 `serverless-ledger.pages.dev`）以及本地联调域名 `localhost`、`127.0.0.1`。
   - **Widget Mode（微件模式）**：选择 **Managed（托管）** 或 **Non-interactive（非交互）**。
   - 点击 **Create**。
3. 创建完成后复制 **Site Key** 与 **Secret Key**：
   - 将 **Site Key** 配置到 Pages 环境变量中的 **`VITE_TURNSTILE_SITE_KEY`**（本地开发可写入 `packages/client/.env`）。
   - 将 **Secret Key** 配置到 Pages 环境变量中的 **`TURNSTILE_SECRET_KEY`**。
4. **重试部署使绑定与环境变量生效**：
   - 切换到 Pages 的 **Deployments（部署）** 页面，在最近一条部署记录右侧点击 **`...` ➔ Retry deployment（重试部署）**。

部署完成后，打开 Pages 分配的域名（形如 `https://serverless-ledger.pages.dev`）即可直接开始使用！

---

## 5. 跨平台客户端打包指南 (Multi-platform Packaging)

### 5.1 移动端 (Capacitor for Android / iOS)
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

### 5.2 桌面端 (Tauri for Windows / macOS / Linux)
```bash
# 开发模式 (启动桌面窗口并热重载)
npm run tauri:dev

# 生成安装包 (Windows .msi/.exe, macOS .dmg/app, Linux .deb/AppImage)
npm run tauri:build
```
