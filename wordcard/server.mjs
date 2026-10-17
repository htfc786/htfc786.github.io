#!/usr/bin/env node
/* ============================================================
 * server.mjs —— 零依赖静态服务器
 * ------------------------------------------------------------
 * 浏览器原生 ESM 不能从 file:// 加载，词表也要用 fetch 获取，
 * 所以本地运行时需要这个服务器。它只做静态文件服务：
 *   node server.mjs [--port 8080] [--host 0.0.0.0]
 * 部署到任意静态托管（Nginx / GitHub Pages / OSS）时不需要它。
 * ============================================================ */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const PORT = Number(argValue('port', process.env.PORT || 8080));
const HOST = argValue('host', process.env.HOST || '0.0.0.0');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, 'Method Not Allowed');
    }

    const url = new URL(req.url, 'http://localhost');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return send(res, 400, 'Bad Request');
    }
    if (pathname.includes('\0')) return send(res, 400, 'Bad Request');

    let target = normalize(join(ROOT, pathname));
    if (target !== ROOT && !target.startsWith(ROOT + sep)) {
      return send(res, 403, 'Forbidden');
    }

    let info = await stat(target).catch(() => null);
    if (info?.isDirectory()) {
      target = join(target, 'index.html');
      info = await stat(target).catch(() => null);
    }
    if (!info?.isFile()) {
      return send(res, 404, '<!doctype html><meta charset="utf-8"><title>404</title>' +
        '<p style="font:16px/1.6 system-ui;padding:2rem">404 Not Found</p>' +
        '<p style="font:14px/1.6 system-ui;padding:0 2rem;color:#666">' +
        '<a href="/import.html">去数据导入页</a></p>', 'text/html; charset=utf-8');
    }

    res.writeHead(200, {
      'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(target).pipe(res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, 'Internal Server Error');
    else res.destroy();
  }
});

function lanUrls(port) {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) urls.push(`http://${item.address}:${port}/`);
    }
  }
  return urls;
}

server.listen(PORT, HOST, () => {
  const actual = server.address().port;
  console.log('单词卡制作 · 本地服务已启动');
  console.log(`  本机   http://localhost:${actual}/`);
  if (HOST === '0.0.0.0') {
    for (const url of lanUrls(actual)) console.log(`  局域网 ${url}`);
  }
  console.log('  Ctrl+C 停止');
});
