/**
 * Cloudflare Pages Function - 纯无状态 WebDAV CORS 转发代理
 * 零数据库、零运行时依赖，仅用于解决 Web 浏览器同源策略 (CORS) 限制
 */
export async function onRequest(context: { request: Request }): Promise<Response> {
  const { request } = context;

  // 统一响应头
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, MKCOL',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Depth, If-Match, If-None-Match, x-target-url',
    'Access-Control-Expose-Headers': 'ETag, Last-Modified, Content-Length, Depth',
    'Access-Control-Max-Age': '86400',
  };

  // 处理 OPTIONS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const url = new URL(request.url);
  const target = url.searchParams.get('target') || request.headers.get('x-target-url');

  if (!target) {
    return new Response(JSON.stringify({ error: 'Missing target parameter' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }

  try {
    const forwardHeaders = new Headers(request.headers);
    forwardHeaders.delete('host');
    forwardHeaders.delete('x-target-url');

    const response = await fetch(target, {
      method: request.method,
      headers: forwardHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      redirect: 'follow',
    });

    const responseHeaders = new Headers(response.headers);
    for (const [key, val] of Object.entries(corsHeaders)) {
      responseHeaders.set(key, val);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `WebDAV Proxy Error: ${err?.message}` }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}
