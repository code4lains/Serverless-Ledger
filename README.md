# 账盾 (Serverless Ledger v3)

> **去中心化 · 100% 本地优先 · 零知识加密保险库 · WebDAV 私有云快照同步**

**账盾 (Serverless Ledger v3)** 是一款专注于数据主权与财务隐私的现代化个人记账与资产管理应用。v3 版本彻底剥离了服务端后端运行环境与集中式数据库（D1/Cloudflare Workers），转型为**纯静态客户端应用 (Pure Static SPA)**，并将多端同步演进为**基于 Web Crypto 原生加密的 WebDAV 全量快照同步（`.enc.json`）**。

---

## 🌟 核心特性 (Features)

- ⚡ **100% 本地优先权威架构 (Local-First)**：以本机 IndexedDB (Dexie.js) 为唯一第一权威数据源，0ms 冷启动，无网络、无服务端亦可 100% 完整使用记账、明细、报表、预算、多账本、分类、周期记账与账单导入导出。
- 🛡️ **银行级零知识加密保险库**：基于原生 Web Crypto API（`PBKDF2` 100,000 轮 + `AES-GCM-256` 硬件加速），敏感数据在本地与远端均以密文安全落盘，并支持 16 位高熵应急恢复凭证（`XXXX-XXXX-XXXX-XXXX`）离线重置主密码。
- ☁️ **私有云 WebDAV 全量加密快照同步**：支持对接群晖/威联通 NAS、坚果云、Nextcloud 等标准 WebDAV 服务。数据在上传前完成客户端端到端加密，云端仅存储 `.enc.json` 密文包，云端服务商无法获知任何明细。
- 🪙 **绝对整数金额精度 (Integer Cents)**：底层金额存储与运算一律以“分”为最小整数单位，彻底杜绝浮点精度丢失。
- 📚 **多账本独立核算与合并体系**：支持日常、旅行、生意、家庭等独立账本隔离核算，并支持本地无损账本合并。
- 🎯 **多维度月度预算限额**：支持月度总预算与各大核心支出分类的限额进度追踪、实时剩余额度计算与超支预警。
- 📥 **离线账单导入与端到端备份**：支持离线微信/支付宝 CSV 账单解析智能自动分类，支持导出/还原端到端加密备份包。
- 🌐 **零服务器成本与多端交付**：
  - **静态托管**：可一键部署至 Cloudflare Pages、Vercel、Netlify、GitHub Pages 或自建 Nginx/Docker。
  - **多端原生支持**：通过 Tauri v2 打包 Windows / macOS / Linux 桌面端，通过 Capacitor 打包 Android / iOS 移动端。

---

## 🏗️ 架构概览 (Architecture Overview)

```
Serverless-Ledger/
├── packages/
│   ├── shared/                # 跨端通用模型、DTO、金额精度、77+ 分类、WebDAV 契约与预算引擎
│   │   ├── src/
│   │   │   ├── storage.ts     # ISyncAdapter, SyncConfig, RemoteSnapshotMetadata
│   │   │   ├── cryptoTypes.ts # EncryptedPayload, VaultMetadata 数据结构
│   │   │   ├── models.ts      # Transaction, Category, Ledger, Budget, RecurringRule
│   │   │   ├── money.ts       # 整数分与元双向无损换算
│   │   │   ├── categories.ts  # 预置树形层级分类
│   │   │   ├── budget.ts      # 预算消耗计算引擎
│   │   │   ├── csv.ts         # CSV 导出与微信/支付宝账单智能识别
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── client/                # 纯静态前端 (React 18 + Vite + Tailwind CSS + Dexie + WebCrypto)
│       ├── src/
│       │   ├── auth/          # 本地保险库生命周期与会话管理 (localAuth.ts)
│       │   ├── crypto/        # PBKDF2 + AES-GCM-256 原生加解密引擎 (index.ts)
│       │   ├── db/            # Dexie v6 本地 IndexedDB 权威数据库
│       │   ├── sync/          # WebDAV 适配器、加密快照导出/恢复与同步配置
│       │   │   ├── webdavAdapter.ts # 原生 fetch 实现 PROPFIND / GET / PUT / MKCOL
│       │   │   ├── snapshotSync.ts  # 快照同步主流程与冲突检测
│       │   │   └── syncConfig.ts    # WebDAV 参数持久化与配置事件
│       │   ├── api/           # localStore (纯本地 CRUD), syncManager, client (统一门面)
│       │   ├── components/    # 记账、明细、统计、分类、预算、WebDAV 设置、VaultModal 等组件
│       │   ├── App.tsx        # 核心根组件 (0ms 离线秒开)
│       │   └── main.tsx
│       ├── capacitor.config.ts # Capacitor 跨端移动打包配置 (Android/iOS)
│       ├── src-tauri/         # Tauri v2 桌面端打包配置 (Windows/macOS/Linux)
│       └── vite.config.ts
├── docs/                      # v3 架构设计与技术文档
├── scripts/                   # 自动化单测与构建管线校验脚本
└── package.json               # Monorepo 统一任务编排脚本
```

---

## 🚀 快速上手 (Quick Start)

### 1. 环境要求
- **Node.js**：`>= 18.0.0`
- **npm**：`>= 9.0.0`

### 2. 安装与运行
```bash
# 1. 安装依赖
npm install

# 2. 启动本地开发预览
npm run dev

# 3. 运行全量单元测试与构建验证
npm test
```
启动后在浏览器打开 `http://localhost:3000` 即可直接使用。

---

## 🌐 静态托管部署指南 (Static Deployment)

因为账盾 v3 为纯客户端静态应用，无需任何后端服务器或云数据库配置，您可以将 `packages/client/dist` 部署到任意静态托管平台：

### 方案 A：Cloudflare Pages (推荐)
1. 在 Cloudflare 控制台新建 **Pages** 项目，连接到您的 GitHub 仓库。
2. 配置构建参数：
   - **Framework preset**：`None`
   - **Build command**：`npm run build`
   - **Build output directory**：`packages/client/dist`
   - **Node.js Version**：`18` 或以上（在环境变量设置 `NODE_VERSION=20`）
3. 点击 **Save and Deploy** 即可获得全球 Anycast CDN 高速访问与自动 HTTPS。

### 方案 B：Vercel / Netlify / GitHub Pages
- **构建命令**：`npm run build`
- **发布目录**：`packages/client/dist`

### 方案 C：自建 Nginx / Docker
```nginx
server {
    listen 80;
    server_name ledger.yourdomain.com;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## ☁️ WebDAV 同步配置指南 (WebDAV Setup)

在账盾「设置」页面中，启用 **WebDAV 快照同步** 并填入连接凭据：

### 1. 坚果云 (Nutstore)
- **服务器 URL**：`https://dav.jianguoyun.com/dav/`
- **账号**：您的坚果云注册邮箱
- **密码**：坚果云后台「账户信息 -> 安全选项 -> 第三方应用管理」中生成的**应用专用密码**
- **快照路径**：`/ServerlessLedger/ledger-vault.enc.json`（应用会自动调用 `MKCOL` 创建父目录）

### 2. 群晖 NAS (Synology WebDAV Server)
- **服务器 URL**：`https://nas.yourdomain.com:5006/` 或 `http://192.168.1.100:5005/`
- **账号**：NAS 拥有读写权限的用户名
- **密码**：NAS 用户密码
- **快照路径**：`/home/ServerlessLedger/ledger-vault.enc.json`

### 3. Nextcloud / OwnCloud
- **服务器 URL**：`https://nextcloud.yourdomain.com/remote.php/dav/files/USERNAME/`
- **账号**：Nextcloud 用户名
- **密码**：Nextcloud 应用令牌或密码
- **快照路径**：`/ServerlessLedger/ledger-vault.enc.json`

---

## 🔒 跨域访问 (CORS) 说明

- **原生客户端 (Tauri / Capacitor)**：桌面端与移动端原生应用发起网络请求不受浏览器同源策略限制，可直连任意 WebDAV 地址。
- **Web 网页端**：由于浏览器同源策略（CORS）限制，WebDAV 服务器（如群晖或自建 Nginx）需配置允许跨域头：
  ```nginx
  add_header 'Access-Control-Allow-Origin' '*' always;
  add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, MKCOL' always;
  add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, Depth, If-Match, If-None-Match' always;
  ```

---

## 📱 跨端打包 (Cross-Platform)

- **Android / iOS (Capacitor)**：
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

## 📄 开源与许可证

本项目基于 [MIT 许可证](./LICENSE) 开源发布。
