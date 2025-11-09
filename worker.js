addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

// 从环境变量获取密钥（生产环境必须设置）
const SECRET_KEY = typeof globalThis.SECRET_KEY !== 'undefined' 
  ? globalThis.SECRET_KEY 
  : "default_key";

async function handleRequest(request) {
  try {
    const url = new URL(request.url);

    // 根路径返回主页信息
    if (url.pathname === "/") {
      return new Response("Under maintenance...", {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // 解析路径：/密钥/目标URL
    const pathSegments = url.pathname.split('/').filter(segment => segment);
    
    // 验证路径格式
    if (pathSegments.length < 2) {
      return new Response("Invalid request format", { 
        status: 400,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    // 提取并验证密钥
    const providedKey = pathSegments[0];
    if (providedKey !== SECRET_KEY) {
      return new Response("Access denied", { 
        status: 403,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    // 处理目标URL
    const encodedTarget = pathSegments.slice(1).join('/');
    let actualUrlStr = decodeURIComponent(encodedTarget);
    actualUrlStr = ensureProtocol(actualUrlStr, url.protocol) + url.search;

    // 创建新请求
    const modifiedRequest = new Request(actualUrlStr, {
      headers: filterHeaders(request.headers),
      method: request.method,
      body: request.body,
      redirect: 'manual'
    });

    // 获取响应
    const response = await fetch(modifiedRequest);
    
    // 处理重定向
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      return handleRedirect(response, providedKey);
    }
    
    // 处理 HTML 内容
    let body = response.body;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const text = await response.text();
      body = replaceRelativePaths(text, url.protocol, url.host, actualUrlStr, providedKey);
    }

    // 创建修改后的响应
    const modifiedResponse = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });

    // 设置响应头
    setNoCacheHeaders(modifiedResponse.headers);
    setCorsHeaders(modifiedResponse.headers);

    return modifiedResponse;
  } catch (error) {
    return new Response("Service unavailable", {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

function ensureProtocol(url, defaultProtocol) {
  url = url.trim();
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return defaultProtocol + url;
  return defaultProtocol + "//" + url;
}

function handleRedirect(response， key) {
  const location = response。headers。get('location');
  if (!location) return response;
  
  try {
    const absoluteUrl = new URL(location, response。url);
    const newLocation = `/${key}/${encodeURIComponent(absoluteUrl.toString())}`;
    
    const headers = new Headers(response.headers);
    headers.set('Location'， newLocation);
    
    return new Response(response.body, {
      status: response.status,
      headers: headers
    });
  } catch (e) {
    return response;
  }
}

function replaceRelativePaths(text, protocol, host, actualUrl, key) {
  const baseUrl = new URL(actualUrl);
  const proxyPrefix = `${protocol}//${host}/${key}/`;
  
  return text
    。替换(/(href|src|action)=["']([^"']+)["']/gi， (match， attr， url) => {
      if (!url || url.startsWith('#') || url.includes('://') || url.startsWith('javascript:')) {
        return match;
      }
      
      try {
        const absoluteUrl = new URL(url, baseUrl);
        return `${attr}="${proxyPrefix}${encodeURIComponent(absoluteUrl.toString())}"`;
      } catch (e) {
        return match;
      }
    });
}

function filterHeaders(headers) {
  const newHeaders = new Headers();
  for (const [name， value] / headers.entries()) {
    if (!name.startsWith('cf-') && 
        !name.startsWith('x-forwarded-') && 
        name.toLowerCase() !== 'host') {
      newHeaders.set(name, value);
    }
  }
  return newHeaders;
}

function setNoCacheHeaders(headers) {
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  headers.set('Pragma'， 'no-cache');
  headers.set('Expires', '0');
}

function setCorsHeaders(headers) {
  headers。set('Access-Control-Allow-Origin'， '*');
  headers。set('Access-Control-Allow-Methods'， 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', '*');
}
