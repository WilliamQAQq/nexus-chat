// Nexus Chat - 零依赖本地服务器
// 1. 提供 public/ 下的静态文件
// 2. /api/proxy 转发 API 请求（解决浏览器跨域 CORS 问题），支持流式响应
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 8787;
// 默认只监听本机，避免成为开放代理。如需局域网访问可设置 HOST=0.0.0.0
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// 不转发给上游的请求头
const DROP_REQ_HEADERS = new Set([
  'host', 'connection', 'content-length', 'x-target-url', 'origin', 'referer',
  'cookie', 'accept-encoding', 'keep-alive', 'transfer-encoding', 'upgrade',
]);
// 不回传给浏览器的响应头（Node fetch 已自动解压）
const DROP_RES_HEADERS = new Set([
  'content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive',
  'access-control-allow-origin', 'set-cookie',
]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleProxy(req, res) {
  const target = req.headers['x-target-url'];
  let url;
  try {
    url = new URL(target);
    if (!/^https?:$/.test(url.protocol)) throw new Error('仅支持 http/https');
  } catch (e) {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: { message: `无效的目标地址: ${target ?? '(空)'}` } }));
    return;
  }

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!DROP_REQ_HEADERS.has(k) && !k.startsWith('sec-')) headers[k] = v;
  }
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const body = hasBody ? await readBody(req) : undefined;

  const ac = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ac.abort(); });

  try {
    const upstream = await fetch(url, { method: req.method, headers, body, signal: ac.signal });
    const outHeaders = { 'cache-control': 'no-cache' };
    upstream.headers.forEach((v, k) => { if (!DROP_RES_HEADERS.has(k)) outHeaders[k] = v; });
    res.writeHead(upstream.status, outHeaders);
    res.flushHeaders?.();
    if (upstream.body) {
      for await (const chunk of upstream.body) res.write(chunk);
    }
    res.end();
  } catch (e) {
    if (ac.signal.aborted) return; // 浏览器主动取消
    console.error('[proxy]', url.href, e.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: { message: `代理请求失败: ${e.cause?.message || e.message}` } }));
  }
}

function serveStatic(reqPath, res) {
  const relPath = reqPath.endsWith('/') ? reqPath + 'index.html' : reqPath;
  const filePath = path.resolve(PUBLIC_DIR, '.' + relPath);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); });
    stream.pipe(res);
  });
}

http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }
  if (pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end('{"ok":true,"proxy":true}');
    return;
  }
  if (pathname === '/api/proxy') {
    handleProxy(req, res).catch((e) => {
      try { if (!res.headersSent) res.writeHead(500); res.end(e.message); } catch {}
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  serveStatic(pathname, res);
}).listen(PORT, HOST, () => {
  console.log(`\n  Nexus Chat 已启动 →  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n`);
});
