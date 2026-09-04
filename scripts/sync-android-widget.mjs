// scripts/sync-android-widget.mjs
// 将 packages/client/android-widget/ 模板同步到 Capacitor 生成工程
// packages/client/android/app/src/main/。Node ESM，无第三方依赖。
// - 缺 android 目录时友好提示并退出 0 (不要崩)。
// - import() 仅做定义不抛错；直接 `node scripts/...` 时执行同步。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const clientDir = path.join(repoRoot, 'packages', 'client');
const templateDir = path.join(clientDir, 'android-widget');
const androidDir = path.join(clientDir, 'android');
const destMain = path.join(androidDir, 'app', 'src', 'main');

const RECEIVER_SNIPPET = `        <receiver
            android:name="com.ledger.serverless.widget.LedgerWidgetProvider"
            android:exported="true"
            android:label="\\u8d26\\u76fe">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/ledger_widget_info" />
        </receiver>
`;

const DEEPLINK_SNIPPET = `            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:scheme="ledger"
                    android:host="widget" />
            </intent-filter>
`;

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirRecursive(srcDir, destDir, filter) {
  if (!fs.existsSync(srcDir)) return [];
  const out = [];
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(srcDir, e.name);
    const d = path.join(destDir, e.name);
    if (e.isDirectory()) {
      out.push(...copyDirRecursive(s, d, filter));
    } else if (!filter || filter(s)) {
      copyFile(s, d);
      out.push(d);
    }
  }
  return out;
}

function injectMainActivity(destMainPath) {
  let mainPath = path.join(destMainPath, 'java', 'com', 'ledger', 'serverless', 'MainActivity.java');
  let isJava = true;
  if (!fs.existsSync(mainPath)) {
    mainPath = path.join(destMainPath, 'java', 'com', 'ledger', 'serverless', 'MainActivity.kt');
    isJava = false;
  }
  if (!fs.existsSync(mainPath)) {
    console.log(`[widget-sync] skip MainActivity inject (not found either .java or .kt): ${mainPath}`);
    return 'missing';
  }

  let src = fs.readFileSync(mainPath, 'utf8');

  // 1. 注入 import
  const importLine = isJava ? 'import com.ledger.serverless.widget.LedgerWidgetPlugin;' : 'import com.ledger.serverless.widget.LedgerWidgetPlugin';
  if (!src.includes('com.ledger.serverless.widget.LedgerWidgetPlugin')) {
    if (src.includes('import com.getcapacitor.BridgeActivity')) {
      src = src.replace(
        /import com\.getcapacitor\.BridgeActivity;?/,
        `$& \n${importLine}`
      );
    } else {
      src = src.replace(/(package\s+[^\n]+\n)/, `$1\n${importLine}\n`);
    }
  }

  // 2. 注入 registerPlugin (必须在 super.onCreate 之前调用，否则 Bridge 已完成创建无法生效)
  const registerLine = isJava ? 'registerPlugin(LedgerWidgetPlugin.class);' : 'registerPlugin(LedgerWidgetPlugin::class.java)';

  // 如果已经包含 registerPlugin，但顺序在 super.onCreate 之后，自动纠正顺序
  if (src.includes('registerPlugin(LedgerWidgetPlugin')) {
    if (/super\.onCreate\([^)]*\);?\s*registerPlugin\(LedgerWidgetPlugin/s.test(src)) {
      src = src.replace(
        /(super\.onCreate\([^)]*\);?)\s*(registerPlugin\(LedgerWidgetPlugin[^)]*\);?)/s,
        '$2\n        $1'
      );
      fs.writeFileSync(mainPath, src, 'utf8');
      console.log('[widget-sync] Fixed registerPlugin order in MainActivity (now before super.onCreate).');
      return 'reordered';
    }
    console.log('[widget-sync] MainActivity already contains registerPlugin in correct order, skip.');
    return 'skipped';
  }

  if (isJava) {
    if (/public\s+void\s+onCreate/.test(src)) {
      src = src.replace(/(public\s+void\s+onCreate[^{]*\{\s*)/, `$1\n        ${registerLine}\n`);
    } else {
      src = src.replace(/(public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{)/, `$1\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        ${registerLine}\n        super.onCreate(savedInstanceState);\n    }\n`);
    }
  } else {
    if (/override\s+fun\s+onCreate/.test(src)) {
      src = src.replace(/(override\s+fun\s+onCreate[^{]*\{\s*)/, `$1\n        ${registerLine}\n`);
    } else if (/class\s+MainActivity[^\n{]*\{/.test(src)) {
      src = src.replace(/(class\s+MainActivity[^\n{]*\{\n?)/, `$1    override fun onCreate(savedInstanceState: android.os.Bundle?) {\n        ${registerLine}\n        super.onCreate(savedInstanceState)\n    }\n`);
    } else if (/class\s+MainActivity[^\n{]*$/.test(src.replace(/\r/g, '').split('\n').find((l) => l.includes('class MainActivity')) ?? '')) {
      src = src.replace(/(class\s+MainActivity[^\n{]*)/, `$1 {\n    override fun onCreate(savedInstanceState: android.os.Bundle?) {\n        ${registerLine}\n        super.onCreate(savedInstanceState)\n    }\n}`);
    } else {
      console.log('[widget-sync] WARN: cannot locate MainActivity class body, skip register inject.');
      return 'warn';
    }
  }

  fs.writeFileSync(mainPath, src, 'utf8');
  console.log('[widget-sync] MainActivity injected with LedgerWidgetPlugin.');
  return 'injected';
}

function injectManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    console.log(`[widget-sync] skip Manifest inject (not found): ${manifestPath}`);
    return 'missing';
  }
  let src = fs.readFileSync(manifestPath, 'utf8');
  let changed = false;

  if (!src.includes('LedgerWidgetProvider')) {
    if (src.includes('</application>')) {
      // receiver 中的 label 用中文“账盾”原文写回，避免 \u 转义残留
      const receiver = RECEIVER_SNIPPET.replace('\\u8d26\\u76fe', '账盾');
      src = src.replace('</application>', `${receiver}    </application>`);
      changed = true;
      console.log('[widget-sync] Manifest injected with widget receiver.');
    } else {
      console.log('[widget-sync] WARN: </application> not found, skip receiver inject.');
    }
  } else {
    // 若此前已注入但为 android:exported="false"，自动修正为 true
    if (/LedgerWidgetProvider[\s\S]*?android:exported="false"/.test(src) || /android:exported="false"[\s\S]*?LedgerWidgetProvider/.test(src)) {
      src = src.replace(
        /(<receiver[^>]*?LedgerWidgetProvider[^>]*?)android:exported="false"/g,
        '$1android:exported="true"',
      ).replace(
        /android:exported="false"([^>]*?LedgerWidgetProvider)/g,
        'android:exported="true"$1',
      );
      changed = true;
      console.log('[widget-sync] Manifest updated LedgerWidgetProvider android:exported="false" -> "true".');
    } else {
      console.log('[widget-sync] Manifest already contains LedgerWidgetProvider, skip receiver.');
    }
  }

  if (!src.includes('android:scheme="ledger"')) {
    const activityCloseIdx = src.indexOf('</activity>');
    if (activityCloseIdx !== -1) {
      src = src.slice(0, activityCloseIdx) + DEEPLINK_SNIPPET + src.slice(activityCloseIdx);
      changed = true;
      console.log('[widget-sync] Manifest injected with ledger deep-link.');
    } else {
      console.log('[widget-sync] WARN: </activity> not found, skip deep-link inject.');
    }
  } else {
    console.log('[widget-sync] Manifest already contains ledger scheme, skip deep-link.');
  }

  if (changed) fs.writeFileSync(manifestPath, src, 'utf8');
  return changed ? 'injected' : 'skipped';
}

export function syncAndroidWidget() {
  if (!fs.existsSync(templateDir)) {
    console.log(`[widget-sync] template dir missing: ${templateDir}`);
    return { ok: false, reason: 'no-template' };
  }
  if (!fs.existsSync(androidDir)) {
    console.log('[widget-sync] android/ 目录不存在（Capacitor 生成目录，被 git 忽略）。');
    console.log('[widget-sync] 请先运行: npm -w @ledger/client run cap:add:android');
    return { ok: true, reason: 'no-android' };
  }

  const copied = [];
  copied.push(...copyDirRecursive(path.join(templateDir, 'res'), path.join(destMain, 'res')));
  copied.push(
    ...copyDirRecursive(
      path.join(templateDir, 'java'),
      path.join(destMain, 'java'),
      (p) => (p.endsWith('.java') || p.endsWith('.kt')) && !p.endsWith('.template'),
    ),
  );
  for (const f of copied) console.log(`[widget-sync] copied: ${path.relative(repoRoot, f)}`);

  const mainStatus = injectMainActivity(destMain);
  const manifestStatus = injectManifest(path.join(destMain, 'AndroidManifest.xml'));

  console.log(`[widget-sync] done. files=${copied.length} mainActivity=${mainStatus} manifest=${manifestStatus}`);
  return { ok: true, copied, mainStatus, manifestStatus };
}

// 直接 `node scripts/sync-android-widget.mjs` 时执行；被 import 时不执行副作用。
const invokedAsMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedAsMain) {
  try {
    syncAndroidWidget();
  } catch (err) {
    // 验收要求:无 android 目录等场景不崩；未知错误也友好提示并退出 0
    console.log(`[widget-sync] finished with warning: ${err?.message ?? err}`);
  }
}
