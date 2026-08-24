# 账盾 (Serverless Ledger) 全端 CI/CD 自动化构建指南

本指南详细说明了如何基于 **GitHub Actions** 与 **Cloudflare Pages** 实现 **Web PWA、Android、iOS、PC（Windows / macOS / Linux）** 全平台跨端打包与自动化持续集成交付。

---

## 1. CI/CD 流水线架构矩阵

```
                        ┌───────────────────────────────┐
                        │   Git Push / Tag / PR / 手动  │
                        └───────────────┬───────────────┘
                                        │
        ┌───────────────────┬───────────┴───────────┬───────────────────┐
        ▼                   ▼                       ▼                   ▼
┌──────────────┐    ┌──────────────┐        ┌──────────────┐    ┌──────────────┐
│    CI 校验   │    │ CF Pages 部署│        │  移动端打包  │    │  桌面端打包  │
│  (ci.yml)    │    │ (deploy.yml) │        │ (Android/iOS)│    │(Win/Mac/Linux│
└───────┬──────┘    └───────┬──────┘        └───────┬──────┘    └───────┬──────┘
        │                   │                       │                   │
  代码与类型检查       全栈 PWA 发布至          生成 APK / 归档        Tauri v2 打包
  全量单元测试        Cloudflare Pages        (Debug / Release)    (MSI/EXE/DMG/deb)
        │                   │                       │                   │
        └───────────────────┴───────────┬───────────┴───────────────────┘
                                        │ (Tag: v*.*.*)
                                        ▼
                        ┌───────────────────────────────┐
                        │  全端发布汇总 (release.yml)   │
                        │  - 生成 SHA256 校验和清单     │
                        │  - 自动创建 GitHub Release    │
                        │  - 附件归档全平台安装包       │
                        └───────────────────────────────┘
```

---

## 2. GitHub Actions 工作流列表

| 工作流文件 | 触发条件 | 平台与产物 | 环境变量 / Secrets 需求 |
| :--- | :--- | :--- | :--- |
| **`ci.yml`** | `push` (任意分支), `pull_request` | TypeScript 类型检查、Shared 库全量单元测试、Web 与 Server 产物编译校验 | 无需额外 Secrets |
| **`deploy-pages.yml`** | `push` (`main`/`master`), 手动调度 | 自动化构建前端并部署至 Cloudflare Pages 全栈环境 | `CLOUDFLARE_API_TOKEN`<br>`CLOUDFLARE_ACCOUNT_ID` |
| **`build-android.yml`** | `tag` (`v*`), `release/**`, 手动调度 | 基于 Capacitor + Gradle 构建 Android Debug 与 Release APK | `GITHUB_TOKEN` |
| **`build-ios.yml`** | `tag` (`v*`), `release/**`, 手动调度 | 基于 macOS Runner + Xcode 编译 iOS App 归档与工程包 | `GITHUB_TOKEN` |
| **`build-desktop.yml`** | `tag` (`v*`), `release/**`, 手动调度 | 基于 Tauri v2 + Rust 跨平台 Matrix 打包：<br>• Windows: `.msi`, `.exe`<br>• macOS: `.dmg`<br>• Linux: `.AppImage`, `.deb` | `GITHUB_TOKEN` |
| **`release.yml`** | `tag` (`v*.*.*`), 手动调度 | 全端一键打包，汇总所有平台安装包，自动计算 SHA256 校验和并创建 GitHub Release | `GITHUB_TOKEN` |

---

## 3. GitHub Secrets 与环境变量配置

在 GitHub 仓库中进入 **Settings ➔ Secrets and variables ➔ Actions ➔ New repository secret** 配置以下变量：

### 3.1 Cloudflare 部署相关
1. **`CLOUDFLARE_API_TOKEN`** (必填 - 用于自动部署 Pages):
   - 登录 [Cloudflare 控制台](https://dash.cloudflare.com/profile/api-tokens)。
   - 点击 **Create Token** ➔ 使用 **Cloudflare Pages: Edit** 模板，或自定义具备 `Cloudflare Pages: Edit` 权限的 API Token。
2. **`CLOUDFLARE_ACCOUNT_ID`** (必填 - Cloudflare 账户 ID):
   - 在 Cloudflare 控制台右侧侧边栏或 Workers & Pages 概览页中复制 **Account ID**。
3. **`VITE_TURNSTILE_SITE_KEY`** (可选 - Cloudflare Turnstile 验证码 Site Key):
   - 用于前端渲染人机验证组件。

---

## 4. 各平台本地构建与调试命令

### 4.1 全局构建与测试
```bash
# 生成全尺寸多平台图标 (PNG / ICO / ICNS / PWA)
npm run generate:icons

# 一次性编译所有子包 (Shared, Server, Client)
npm run build:all

# 运行全量单元测试与管线预检
npm test

# 校验 CI/CD 配置文件与资产就绪情况
npm run verify:pipeline
```

### 4.2 Web 端 (PWA)
```bash
# 编译生产环境 Web 资源 (输出至 packages/client/dist)
npm run build:client

# 本地预览构建产物
npm -w @ledger/client run preview
```

### 4.3 移动端 (Android / iOS)
```bash
# 1. 编译 Web 资源
npm run build:client

# 2. 首次初始化原生平台工程
npm run cap:add:android
npm run cap:add:ios

# 3. 将 Web 资源同步至原生工程
npm run cap:sync

# 4. 打开 Android Studio / Xcode 进行调试与真机运行
npm -w @ledger/client cap:open:android
npm -w @ledger/client cap:open:ios
```

### 4.4 PC 桌面端 (Tauri v2)
```bash
# 桌面端本地开发 (热重载窗口)
npm run tauri:dev

# 桌面端生产打包 (生成 Windows .msi/.exe, macOS .dmg, Linux .deb/.AppImage)
npm run tauri:build
```

---

## 5. 发布新版本全端安装包流程

当准备发布新版本时（例如 `v1.0.0`）：

1. 更新 `package.json` 及各子包中的版本号。
2. 提交代码并打上 Git Tag：
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. GitHub Actions 将自动触发 **`release.yml`**：
   - 自动并发运行 Web、Android 与 PC（Windows、macOS、Linux）构建矩阵。
   - 汇总全部安装包与安装器。
   - 自动生成 `SHA256SUMS.txt` 校验和文件。
   - 自动创建并发布 GitHub Release。
