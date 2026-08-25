import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

console.log('=== Verifying Full-Client CI/CD & Build Pipeline Readiness ===\n');

let errorCount = 0;

function checkFile(relPath, description) {
  const fullPath = path.join(ROOT, relPath);
  if (fs.existsSync(fullPath)) {
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
      console.error(`✗ [FAIL] Expected file but found directory: ${relPath} (${description})`);
      errorCount++;
      return false;
    }
    console.log(`✓ [PASS] ${description}: ${relPath} (${stat.size} bytes)`);
    return true;
  } else {
    console.error(`✗ [FAIL] Missing required file: ${relPath} (${description})`);
    errorCount++;
    return false;
  }
}

function checkJson(relPath, validator, description) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`✗ [FAIL] Missing JSON file: ${relPath}`);
    errorCount++;
    return;
  }
  try {
    const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    validator(content);
    console.log(`✓ [PASS] Validated JSON: ${relPath} (${description})`);
  } catch (err) {
    console.error(`✗ [FAIL] JSON validation failed for ${relPath}:`, err.message);
    errorCount++;
  }
}

// 1. Check GitHub Actions Workflows
console.log('\n--- 1. Checking GitHub Actions CI/CD Workflows ---');
checkFile('.github/workflows/ci.yml', 'CI Validation & Test Workflow');
checkFile('.github/workflows/deploy-pages.yml', 'Cloudflare Pages Deploy Workflow');
checkFile('.github/workflows/build-android.yml', 'Android Capacitor APK Build Workflow');
checkFile('.github/workflows/build-ios.yml', 'iOS Capacitor Build Workflow');
checkFile('.github/workflows/build-desktop.yml', 'PC Desktop Tauri v2 Cross-platform Build Workflow');
checkFile('.github/workflows/release.yml', 'Full-Client Unified Release Workflow');

// 2. Check Tauri v2 Desktop Configuration
console.log('\n--- 2. Checking Tauri v2 Desktop Configuration ---');
checkFile('packages/client/src-tauri/Cargo.toml', 'Tauri Cargo.toml Rust manifest');
checkFile('packages/client/src-tauri/build.rs', 'Tauri build.rs script');
checkFile('packages/client/src-tauri/src/main.rs', 'Tauri main.rs binary entry');
checkFile('packages/client/src-tauri/src/lib.rs', 'Tauri lib.rs library entry');
checkFile('packages/client/src-tauri/capabilities/default.json', 'Tauri v2 Permissions Capability');

checkJson('packages/client/src-tauri/tauri.conf.json', (conf) => {
  if (!conf.productName || !conf.identifier || !conf.bundle) {
    throw new Error('tauri.conf.json is missing productName, identifier, or bundle config');
  }
  if (!conf.bundle.icon || conf.bundle.icon.length === 0) {
    throw new Error('tauri.conf.json bundle icons list is empty');
  }
}, 'Tauri Configuration');

// 3. Check Tauri Icons
console.log('\n--- 3. Checking Multi-Platform Icons ---');
checkFile('packages/client/src-tauri/icons/32x32.png', 'Tauri 32x32 icon');
checkFile('packages/client/src-tauri/icons/128x128.png', 'Tauri 128x128 icon');
checkFile('packages/client/src-tauri/icons/128x128@2x.png', 'Tauri 256x256 icon');
checkFile('packages/client/src-tauri/icons/icon.png', 'Tauri 512x512 icon');
checkFile('packages/client/src-tauri/icons/icon.ico', 'Windows ICO icon');
checkFile('packages/client/src-tauri/icons/icon.icns', 'macOS ICNS icon');

// 4. Check Mobile & PWA Configuration
console.log('\n--- 4. Checking Mobile & PWA Configuration ---');
checkFile('packages/client/capacitor.config.ts', 'Capacitor Config');
checkFile('packages/client/public/manifest.webmanifest', 'Web App Manifest');
checkFile('packages/client/public/sw.js', 'PWA Service Worker');
checkFile('packages/client/public/pwa-192x192.png', 'PWA 192x192 Icon');
checkFile('packages/client/public/pwa-512x512.png', 'PWA 512x512 Icon');
checkFile('packages/client/public/favicon.ico', 'Web Favicon ICO');

// 5. Check Cloudflare Functions
console.log('\n--- 5. Checking Cloudflare Pages Functions ---');
checkFile('functions/api/[[route]].ts', 'Cloudflare Pages Functions API route handler');

// 6. Check Monorepo Scripts
console.log('\n--- 6. Checking Monorepo package.json Scripts ---');
checkJson('package.json', (pkg) => {
  const requiredScripts = ['build', 'build:client', 'build:server', 'build:shared', 'test'];
  for (const s of requiredScripts) {
    if (!pkg.scripts[s]) {
      throw new Error(`Missing script "${s}" in root package.json`);
    }
  }
}, 'Root package.json scripts');

console.log('\n======================================================');
if (errorCount === 0) {
  console.log('🎉 ALL CI/CD AND MULTI-PLATFORM BUILD PIPELINE CHECKS PASSED! 🎉\n');
  process.exit(0);
} else {
  console.error(`💥 Pipeline verification failed with ${errorCount} error(s)!\n`);
  process.exit(1);
}
