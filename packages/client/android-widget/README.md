# Android Widget 模板目录 (source of truth)

`packages/client/android/` 是 Capacitor 生成目录 (被 git 忽略)，**不要手工改生成目录**。
本目录是版本化模板，同步脚本负责拷贝到生成工程。

## 目录结构 (保持拷贝后相对路径)

- `res/xml/ledger_widget_info.xml` → `android/app/src/main/res/xml/ledger_widget_info.xml`
- `res/values/ledger_widget_strings.xml` → `android/app/src/main/res/values/ledger_widget_strings.xml`（Android 12+ 必需的 description 字符串，缺失则桌面不显示小部件）
- `res/layout/widget_ledger_card.xml` → `android/app/src/main/res/layout/widget_ledger_card.xml`
- `res/drawable/widget_card_bg.xml` → `android/app/src/main/res/drawable/widget_card_bg.xml`
- `java/com/ledger/serverless/widget/*.kt` → `android/app/src/main/java/com/ledger/serverless/widget/*.kt`
- `java/com/ledger/serverless/MainActivity.kt.template` → 仅参考，不直接拷贝；
  脚本向已生成的 `MainActivity.kt` 注入 `registerPlugin` 行
- `AndroidManifest.widget.snippet.xml` → 仅参考；脚本向已生成的
  `AndroidManifest.xml` 注入 receiver + deep-link

## 同步流程

```bash
# 1. 首次生成原生工程 (需 Android SDK 环境)
npm -w @ledger/client run cap:add:android

# 2. 同步 web 资源 + 本模板到原生工程
npm -w @ledger/client run cap:sync
# cap:sync = cap sync && node ../../scripts/sync-android-widget.mjs

# 仅同步小组件模板 (不跑 cap sync)
npm -w @ledger/client run widget:sync
```

脚本行为 (`scripts/sync-android-widget.mjs`)：

1. 若 `packages/client/android` 不存在 → 友好提示先跑 `cap:add:android`，退出码 0。
2. 递归拷贝 `res/` 与 `widget/*.kt` (覆盖同名文件)。
3. `MainActivity.kt` 若存在且未包含 `LedgerWidgetPlugin` → 注入 import + `registerPlugin`。
4. `AndroidManifest.xml` 若存在且未包含 `LedgerWidgetProvider` → 在 `</application>` 前注入
   receiver；若未包含 `android:scheme="ledger"` → 在 MainActivity `<activity>` 内注入 deep-link。
5. 所有注入均幂等 (已包含则跳过)。

## Payload 约定

`SharedPreferences ledger_widget_prefs / widget_data` (JSON, `WidgetPayload`)：

- `ledgerName`, `item1_label/val`, `item2_label/val`, `item3_label/val`
- `clickAction`: `record | detail | stats`
- `updatedAt`: ISO 时间 (跨天清零依据)
- `hideAmounts?`: 可选，`true` 时 Provider 显示 `****`
