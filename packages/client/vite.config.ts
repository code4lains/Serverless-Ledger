import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

/**
 * WebDAV 开发环境 CORS 代理插件
 * 允许在 npm run dev (http://localhost:3000) 调试时透明转发 WebDAV 请求至坚果云/群晖 NAS
 */
function webdavDevProxyPlugin(): Plugin {
  return {
    name: 'webdav-dev-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/webdav-proxy')) {
          return next();
        }

        const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const target = reqUrl.searchParams.get('target') || (req.headers['x-target-url'] as string);

        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, MKCOL');
          res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Depth, If-Match, If-None-Match, x-target-url');
          res.statusCode = 204;
          res.end();
          return;
        }

        if (!target) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing target URL' }));
          return;
        }

        try {
          const targetParsed = new URL(target);
          const isHttps = targetParsed.protocol === 'https:';
          const client = isHttps ? https : http;

          const forwardHeaders: Record<string, any> = { ...req.headers };
          delete forwardHeaders.host;
          delete forwardHeaders['x-target-url'];
          forwardHeaders.host = targetParsed.host;

          const proxyReq = client.request(
            target,
            {
              method: req.method,
              headers: forwardHeaders,
              rejectUnauthorized: false,
            },
            (proxyRes) => {
              res.statusCode = proxyRes.statusCode || 200;
              for (const [key, val] of Object.entries(proxyRes.headers)) {
                if (key.toLowerCase() !== 'access-control-allow-origin') {
                  res.setHeader(key, val as any);
                }
              }
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, MKCOL');
              res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Depth, If-Match, If-None-Match, x-target-url');
              res.setHeader('Access-Control-Expose-Headers', 'ETag, Last-Modified, Content-Length, Depth');
              proxyRes.pipe(res);
            }
          );

          proxyReq.on('error', (err) => {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ error: `Proxy Error: ${err.message}` }));
          });

          req.pipe(proxyReq);
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  clearScreen: false,
  plugins: [react(), webdavDevProxyPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-xlsx': ['xlsx'],
          'vendor-dexie': ['dexie'],
          'vendor-lucide': ['lucide-react'],
        },
      },
    },
  },
});
