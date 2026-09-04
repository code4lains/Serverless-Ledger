/**
 * 账盾 (Serverless Ledger) - Service Worker
 * 离线静态资源持久化缓存与网络降级处理
 * 践行《项目技术白皮书 4.1 & 7.3》规范
 */

const CACHE_NAME = 'serverless-ledger-v3.1.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest',
];

// 安装生命周期：预缓存核心应用壳资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 激活生命周期：清理旧版本缓存并立即接管控制权
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 请求拦截与离线缓存策略
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. API 接口请求：直通网络，失败时返回网络错误（由本地 Dexie.js 离线层全权接管）
  if (url.pathname.startsWith('/api')) {
    return; // 默认交给浏览器发起网络请求
  }

  // 2. 页面导航请求 (SPA 单页路由)：优先网络，离线时降级到缓存的 /index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('/index.html') || caches.match('/');
      })
    );
    return;
  }

  // 3. 静态资源请求 (JS, CSS, 图片, 图标, 字体)：Stale-While-Revalidate 策略
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === 'basic'
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // 离线且未命中网络，此时如果有缓存则返回缓存
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
