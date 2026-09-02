/**
 * Cloudflare Pages Function - 纯无状态 WebDAV CORS 转发代理
 * 零数据库、零运行时依赖，仅用于解决 Web 浏览器同源策略 (CORS) 限制
 */
/**
 * 校验目标主机名/IP 是否属于私有网络、内网、保留地址或回环地址 (SSRF 防护)
 */
function isPrivateOrBlockedHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');

  if (!host) {
    return true;
  }

  // 1. 域名与主机名黑名单
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.home.arpa') ||
    host.endsWith('.intranet') ||
    host.endsWith('.corp') ||
    host === 'instance-data' ||
    host === 'metadata' ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }

  // 2. 拦截单标签内网主机名（如 http://nas/ 或 http://router/）
  if (!host.includes('.') && !host.includes(':')) {
    return true;
  }

  // 3. IPv4 地址范围拦截
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = host.match(ipv4Regex);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1, 5).map(Number);
    if (octets.some((n) => n < 0 || n > 255 || isNaN(n))) {
      return true; // 非法 IPv4
    }
    const [a, b, c] = octets;

    // 0.0.0.0/8 (当前网络)
    if (a === 0) return true;
    // 10.0.0.0/8 (私有网络 RFC 1918)
    if (a === 10) return true;
    // 127.0.0.0/8 (回环地址 Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (链路本地 / 云平台元数据 Link-Local & Metadata)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (私有网络 RFC 1918: 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 (私有网络 RFC 1918)
    if (a === 192 && b === 168) return true;
    // 100.64.0.0/10 (运营商级 NAT - RFC 6598: 100.64.0.0 - 100.127.255.255)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 192.0.0.0/24 (IETF 协议分配)
    if (a === 192 && b === 0 && c === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1 文档保留)
    if (a === 192 && b === 0 && c === 2) return true;
    // 198.18.0.0/15 (网络基准测试: 198.18.0.0 - 198.19.255.255)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2 文档保留)
    if (a === 198 && b === 51 && c === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3 文档保留)
    if (a === 203 && b === 0 && c === 113) return true;
    // 224.0.0.0/4 与 240.0.0.0/4 (多播与保留/广播地址: 224.0.0.0 - 255.255.255.255)
    if (a >= 224) return true;

    return false;
  }

  // 4. IPv6 地址范围拦截
  if (host.includes(':')) {
    // 回环地址 ::1 与 未指定地址 ::
    if (host === '::1' || host === '::' || host === '0:0:0:0:0:0:0:1' || host === '0:0:0:0:0:0:0:0') {
      return true;
    }
    // 链路本地地址 fe80::/10 (fe80: - febf:)
    if (/^fe[89ab]/i.test(host)) {
      return true;
    }
    // 唯一本地地址 Unique Local fc00::/7 (fc00: - fdff:)
    if (/^f[cd]/i.test(host)) {
      return true;
    }
    // IPv4 映射的 IPv6 (::ffff:127.0.0.1 等)
    if (host.startsWith('::ffff:')) {
      const embeddedIpv4 = host.substring(7);
      if (ipv4Regex.test(embeddedIpv4)) {
        return isPrivateOrBlockedHost(embeddedIpv4);
      }
      return true;
    }
    // 文档与保留前缀
    if (host.startsWith('2001:db8:') || host.startsWith('2001:0db8:') || host.startsWith('100::')) {
      return true;
    }
  }

  return false;
}

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

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid target URL' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }

  // 协议白名单校验：仅允许 http: 与 https:
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    return new Response(
      JSON.stringify({ error: 'Invalid target protocol: only http: and https: are allowed' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }

  // SSRF 防护：严格拦截私有、内网、保留与回环地址
  if (isPrivateOrBlockedHost(targetUrl.hostname)) {
    return new Response(
      JSON.stringify({ error: 'Access to private, internal or loopback network addresses is forbidden' }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }

  try {
    const forwardHeaders = new Headers(request.headers);
    forwardHeaders.delete('host');
    forwardHeaders.delete('x-target-url');

    const response = await fetch(targetUrl.toString(), {
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
