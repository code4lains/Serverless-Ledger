# 账盾 (Serverless Ledger) 开发与部署手册

本项目为 **账盾 (Serverless Ledger)** 跨端个人财务与记账应用。采用 **一套前端代码多端交付**（Web PWA、Android、iOS、Windows、macOS、Linux）与 **Cloudflare Serverless + D1 SQLite 数据库** 架构，提供四大模块（记账、统计、分类、我的）、全量离线优先体验与私有化数据掌控。

---

## 1. 核心特性 (Features)

- 🔒 **数据私有与安全掌控**：基于 Cloudflare 全球边缘计算与 D1 SQLite 分布式数据库，无第三方广告与数据爬取。
- ⚡ **离线优先架构 (Offline-First)**：弱网或无网络环境下依然毫秒级快速记账（写入本地 IndexedDB），网络恢复后自动双向增量同步。
- 🪙 **绝对整数金额精度 (Integer Cents)**：底层金额一律以“分”为最小整数单位存储，杜绝浮点精度丢失。
- 📚 **多账本独立核算体系**：日常、生意、旅行、家庭等独立核算与隔离管理。
- 🎯 **多维度月度预算管理**：支持月度总预算与各大核心分类预算进度追踪与超支预警。
- 📥 **智能 CSV 账单导入与导出**：自动识别并智能映射微信支付、支付宝及通用记账 CSV 账单，支持全量 JSON/CSV 数据备份。
- 🎟️ **注册模式与邀请体系 (`REG_MODE`)**：支持关闭注册、邀请注册模式及自由注册模式，老用户记账后自动解锁专属邀请资格。
- 🔑 **密码恢复码机制**：8 位字母数字凭证，注册与登录时自动生成并提供下载文本凭证（`帐盾密码恢复码.txt`），凭恢复码快速找回密码。
- 🗑️ **用户注销与数据清理**：彻底级联清除云端与本地全部账单、账本、分类、预算与邀请码，注销前直接提供一键数据导出备份。

---

## 2. 架构总览 (Architecture Overview)

```
Serverless-Ledger/
├── functions/                 # Cloudflare Pages Functions 全栈一体化适配层
│   └── api/
│       └── [[route]].ts       # 路由代理层：将 /api/* 请求无缝对接 Hono API
├── packages/
│   ├── shared/                # 前后端共享类型定义、DTO 模型、金额计算与规则引擎
│   │   ├── src/
│   │   │   ├── models.ts      # User, Ledger, Category, Transaction, Budget, InviteCode 数据模型
│   │   │   ├── money.ts       # 整数分 (Integer Cents) 与 元 的安全高精度换算
│   │   │   ├── categories.ts  # 77+ 系统预置全层级分类定义
│   │   │   ├── csv.ts         # RFC 4180 CSV 导入导出与智能账单分类匹配引擎
│   │   │   ├── utils.ts       # 邀请码资格计算与通用工具
│   │   │   └── index.ts
│   │   └── package.json
│   ├── server/                # 后端 API (Cloudflare Workers / Pages Functions + Hono.js + D1)
│   │   ├── src/
│   │   │   ├── routes/        # /api/health, /api/auth, /api/categories, /api/ledgers, /api/transactions, /api/budgets
│   │   │   ├── middleware/    # JWT 身份鉴权与可选鉴权中间件
│   │   │   ├── utils/         # 密码哈希、JWT 签发、Turnstile 人机验证
│   │   │   └── index.ts       # Hono 应用入口、CORS 中间件与错误捕获
│   │   ├── migrations/        # Cloudflare D1 SQLite 数据库迁移脚本 (0001_initial_schema.sql)
│   │   ├── wrangler.toml      # Workers & D1 本地与生产环境绑定配置
│   │   └── package.json
│   └── client/                # 前端 (React 18 + Vite + Tailwind CSS + Dexie.js)
│       ├── src/
│       │   ├── api/           # API 客户端 (支持离线优先 + 网络状态感知 + 自动重放队列)
│       │   ├── db/            # Dexie.js 本地 IndexedDB 数据库
│       │   ├── components/    # 统计、分类、预算、邀请码、数据管理、密码恢复、注销等弹窗组件
│       │   ├── App.tsx        # 根组件与四大板块导航
│       │   └── main.tsx
│       ├── capacitor.config.ts # Capacitor 跨端移动打包配置 (Android/iOS)
│       ├── src-tauri/         # Tauri v2 桌面端跨平台打包配置 (Windows/macOS/Linux)
│       ├── vite.config.ts     # Vite 本地代理配置 (转发 /api 至 :8787)
│       └── package.json
├── docs/                      # 架构规范与 CI/CD 构建发布手册
├── package.json               # Monorepo 统一管线与任务编排脚本
└── tsconfig.base.json         # 统一 TypeScript 基础配置
```

---

## 3. 本地开发与快速上手 (Quick Start)

### 3.1 环境要求
- **Node.js**：`>= 18.0.0`
- **npm**：`>= 9.0.0`

### 3.2 安装依赖
在项目根目录下执行：
```bash
npm install
```

### 3.3 本地 D1 数据库初始化与迁移
在开发前，先对本地模拟的 D1 SQLite 数据库执行迁移脚本（创建所有数据表并预置分类与初始测试邀请码）：
```bash
npm run db:migrate:local
```

### 3.4 启动本地前后端并发联调
在根目录下执行：
```bash
npm run dev
```
此命令将并发启动：
- **后端 Cloudflare Workers API**：`http://127.0.0.1:8787`（挂载本地 D1 SQLite 模拟器）
- **前端 Vite 开发服务器**：`http://localhost:3000`（自动反向代理 `/api/*` 请求至 `:8787`）

打开浏览器访问 `http://localhost:3000` 即可开始使用。

### 3.5 运行全量测试套件
```bash
# 运行全部测试 (共享库单测 + 服务端完整业务管线测试 + 离线同步测试)
npm test

# 仅运行服务端端到端管线测试 (需先启动本地后端)
npm run test:server
```

---

## 4. Cloudflare 生产环境部署指南 (Cloudflare Deployment)

本项目推荐采用 **Cloudflare Pages 全栈一体化部署**。前端静态资源与后端 API 路由运行在同一个 Pages 域名下，天然同源、零跨域（CORS）困扰，且直接绑定 Cloudflare D1 边缘数据库。

```
                              ┌──────────────────────────────────────────────┐
                              │            Cloudflare 全球边缘网络            │
                              │                                              │
用户请求 ──────── (HTTPS) ─────►  Cloudflare Pages (serverless-ledger.pages.dev)│
                              │  ├── 静态页面 assets/ (*.js, *.css, *.html)   │
                              │  └── Functions API 路由 (/api/*)              │
                              │       │                                      │
                              │       ▼                                      │
                              │  Cloudflare D1 SQL 数据库 (serverless_ledger_db)│
                              └──────────────────────────────────────────────┘
```

---

### 4.1 第一步：创建 Cloudflare D1 数据库

1. 登录 [Cloudflare 控制台 (Dashboard)](https://dash.cloudflare.com/)。
2. 进入左侧导航栏：**Storage & Databases（存储和数据库）** ➔ **D1 SQL Database**。
3. 点击 **Create database（创建数据库）**：
   - **Database name（数据库名称）**：填入 `serverless_ledger_db`
   - 点击 **Create** 保存。
4. 创建成功后，记录详情页展示的 **Database ID**（形如 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）。

---

### 4.2 第二步：执行线上 D1 数据库迁移（初始化表结构）

您可以通过以下两种方式之一初始化线上数据库结构：

#### 推荐方式 A：使用 Wrangler 命令行一键迁移
在本地终端根目录下运行（需先完成 `npx wrangler login` 授权）：
```bash
npm run db:migrate:remote
```
Wrangler 将自动执行 `packages/server/migrations/` 中的全量迁移脚本：
- `0001_initial_schema.sql`：包含全部核心表结构（用户、账本、分类、流水、预算、邀请码、周期记账规则）、索引与全量预置分类/邀请码数据。

#### 备用方式 B：在 Cloudflare Dashboard 控制台中手动执行
若未配置本地 Wrangler 登录，可直接在控制台操作：
1. 进入该 D1 数据库详情页，切换到 **Console（控制台）** 标签页。
2. 打开项目 `packages/server/migrations/0001_initial_schema.sql` 文件，将其中的全量 SQL 内容复制粘贴进控制台并点击 **Execute（执行）**。
3. 执行完成后切换到 **Tables** 标签页，确认 `users`、`ledgers`、`categories`、`transactions`、`budgets`、`invite_codes`、`recurring_rules` 7 张数据表均已就绪。

---

### 4.3 第三步：在 Cloudflare Pages 导入并部署项目

1. 在 Cloudflare 控制台左侧进入 **Compute (Workers) ➔ Workers & Pages**。
2. 点击 **Create application（创建应用程序）** ➔ 切换至 **Pages** 标签页 ➔ 点击 **Connect to Git（连接到 Git）**。
3. 选择您在 GitHub / GitLab 上的 `Serverless-Ledger` 仓库，点击 **Begin setup（开始设置）**。
4. 填写构建参数：
   - **Project name（项目名称）**：`serverless-ledger`（可自定义）
   - **Production branch（生产分支）**：`main`（或 `master`）
   - **Framework preset（框架预设）**：`None` 或 `Vite`
   - **Root directory（根目录）**：填 `/`（或留空）
   - **Build command（构建命令）**：
     ```bash
     npm run build:client
     ```
   - **Build output directory（构建输出目录）**：
     ```bash
     packages/client/dist
     ```
5. 点击底部的 **Save and Deploy（保存并部署）**。

---

### 4.4 第四步：配置 D1 数据库绑定与环境变量（核心）

首次部署完成后，需将 Cloudflare D1 数据库与所需环境变量注入到 Pages Functions 中：

#### 1. 绑定 D1 数据库
1. 进入该 Pages 项目详情页，点击顶部 **Settings（设置）** ➔ 左侧选择 **Functions（函数）**。
2. 向下滚动找到 **D1 Database Bindings（D1 数据库绑定）**，点击 **Add binding（添加绑定）**：
   - **Variable name（变量名称）**：`DB`（**必须全大写**，服务端代码通过 `c.env.DB` 访问）
   - **D1 database（数据库）**：在下拉列表中选择第 4.1 步创建的 `serverless_ledger_db`
   - 点击 **Save（保存）**。

#### 2. 配置环境变量 (Environment Variables)
在 **Settings（设置）** ➔ **Environment Variables（环境变量）** 中点击 **Add variables（添加变量）**，配置以下变量：

| 变量名 | 类型 | 必填/默认值 | 详细说明 |
| :--- | :--- | :--- | :--- |
| **`REG_MODE`** | `String` / `Number` | **可选 (默认为 `1`)** | **系统注册模式控制**：<br>• `0`：**关闭注册**。系统禁止任何新用户注册（仅已注册用户可登录）。<br>• `1`（默认）：**邀请注册模式**。新用户注册必须填写有效邀请码。系统预置创世邀请码（如 `INV-WELCOME`），老用户记账满 3 天后自动解锁新邀请码。<br>• `2`：**自由注册模式**。任何人无需邀请码即可自由注册。 |
| **`JWT_SECRET`** | `String` (加密文本) | **必填** | **JWT 鉴权签名密钥**：建议填写一段包含大小写字母、数字及符号的 32 位以上高强度随机字符串（用于生成和校验用户的登录 Token）。 |
| **`TURNSTILE_SECRET_KEY`** | `String` (加密文本) | **可选** | **Cloudflare Turnstile 服务端密钥**：用于注册、登录及重置密码时的人机验证二次校验。若不配置则跳过服务端人机校验。 |
| **`TURNSTILE_SITE_KEY`** / **`VITE_TURNSTILE_SITE_KEY`** | `String` (纯文本) | **可选** | **Cloudflare Turnstile 前端站点公钥**：配置后服务端将通过 `/api/auth/config` 动态下发给 Web 端与手机 APK / 桌面端客户端渲染人机验证微件。 |

> 💡 **提示**：环境变量配置完成后，请切换至 Pages 的 **Deployments（部署）** 页面，在最新的部署记录右侧点击 **`...` ➔ Retry deployment（重试部署）**，使新环境变量与 D1 绑定正式生效。

---

### 4.5 第五步：申请 Cloudflare Turnstile 人机验证 (可选但推荐)

Turnstile 是 Cloudflare 提供的智能无感人机验证（类似 Google reCAPTCHA 但更轻量隐私）：

1. 登录 Cloudflare 控制台，在左侧进入 **Turnstile**。
2. 点击 **Add site（添加站点）**：
   - **Site name（站点名称）**：`serverless-ledger`
   - **Domain（域名列表）**：**务必填入** 您的 Pages / Workers 生产域名（如 `ledger.yourdomain.top`、`serverless-ledger.pages.dev`）以及 **`localhost`**、`127.0.0.1`（**注意：手机打包成 APK 安装后 WebView 以 `localhost` 源运行，添加 `localhost` 可确保手机 App 与桌面端能够正常渲染与通过验证**）。
   - **Widget Mode（微件模式）**：选择 **Managed（托管）**。
   - 点击 **Create**。
3. 复制生成的 **Site Key** 与 **Secret Key**：
   - 将 **Site Key** 填入 Pages / Workers 环境变量 **`TURNSTILE_SITE_KEY`**（或 `VITE_TURNSTILE_SITE_KEY`）。
   - 将 **Secret Key** 填入 Pages / Workers 环境变量 **`TURNSTILE_SECRET_KEY`**。
4. 部署或重试部署后，无论 Web 端还是手机 APK 客户端均会自动获取公钥并启用人机安全验证。

---

## 5. 跨平台客户端打包指南 (Multi-Platform Build)

本项目支持将单一 Web 前端打包为全平台原生应用：

### 5.1 移动端 App (Android / iOS via Capacitor)
```bash
# 1. 编译 Web 生产产物
npm run build:client

# 2. 首次初始化原生工程
npm run -w @ledger/client cap:add:android
npm run -w @ledger/client cap:add:ios

# 3. 同步 Web 资源至原生工程
npm run cap:sync

# 4. 在 Android Studio / Xcode 中打开工程进行签名打包
npm run -w @ledger/client cap:open:android
npm run -w @ledger/client cap:open:ios
```

### 5.2 桌面端应用 (Windows / macOS / Linux via Tauri v2)
```bash
# 1. 自动生成多尺寸全平台图标 (PNG / ICO / ICNS)
npm run generate:icons

# 2. 桌面端本地开发热重载调试
npm run tauri:dev

# 3. 构建发布安装包 (Windows .msi/.exe, macOS .dmg, Linux .deb/.AppImage)
npm run tauri:build
```

---

## 6. 全自动化 CI/CD 流水线 (GitHub Actions)

项目内置了工业级 GitHub Actions 工作流（详见 [docs/CICD_PIPELINE.md](docs/CICD_PIPELINE.md)）：

- **`ci.yml`**：提交代码时自动进行全量类型检查、代码规范、单元测试与编译预检。
- **Cloudflare Pages 原生 Git 集成**：推送到 `main` 分支时由 Cloudflare 自动检测并完成构建上线。
- **`build-android.yml` / `build-ios.yml` / `build-desktop.yml`**：推 Tag 时自动触发移动端与多系统桌面端编译。
- **`release.yml`**：打 Tag（如 `v1.0.0`）时，并发构建全端全平台安装包、生成 `SHA256SUMS.txt` 并自动发布至 GitHub Releases 附件列表。

---

## 7. 常见问题排查 (FAQ & Troubleshooting)

### Q1: 部署后打开网页提示 404 或网络请求失败？
- **检查 D1 绑定**：确保在 Pages 的 **Settings ➔ Functions ➔ D1 Database Bindings** 中将变量名设置为 `DB`（区分大小写）并正确选中了数据库。
- **重试部署**：绑定或修改环境变量后，必须点击 **Retry deployment（重试部署）** 才会注入到 Functions 运行时。

### Q2: 注册时提示“当前系统为邀请注册模式，请输入邀请码”？
- 系统默认开启了邀请注册模式（`REG_MODE=1`）。
- 您可以使用数据库预置的创世邀请码：`INV-WELCOME`、`INV-SYSTEM1` 进行首次管理员注册。
- 如需开放自由注册，只需将 Pages 环境变量 **`REG_MODE`** 设置为 `2` 并重试部署即可。

### Q3: 忘记密码如何找回？
- 在登录界面点击“**忘记密码？**”，输入您的邮箱和 8 位密码恢复码（如 `A8K9M2X7`，不区分大小写）即可重置新密码。
- 密码恢复码会在您首次注册或登录时自动弹出提供复制与下载（文件名为 `帐盾密码恢复码.txt`），亦可在已登录状态下的“我的”➔“账号与安全”中查看。

### Q4: 如何彻底注销账号并清空个人数据？
- 登录后进入“我的”➔“账号与安全”➔点击“**注销账号**”。
- 弹窗中提供一键导出 CSV/JSON 备份按钮，输入“`确认注销`”确认后将从云端及本地彻底删除全部关联账本与流水。

---

## 8. 开源协议 (License)

本项目采用 [MIT License](LICENSE) 协议开源。欢迎 Star 与 Fork！

