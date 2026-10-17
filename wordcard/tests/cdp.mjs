/* ============================================================
 * cdp.mjs —— 测试用极简 Chrome DevTools Protocol 封装
 * 不依赖 Playwright / Puppeteer，只用到 Node 自带的 WebSocket。
 * ============================================================ */
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHROME = process.env.CHROME ||
  ['google-chrome', 'chromium', 'chromium-browser'].find((candidate) => {
    try { execSync(`command -v ${candidate}`, { stdio: 'ignore' }); return true; }
    catch { return false; }
  });

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function findChrome() {
  if (!CHROME) throw new Error('找不到 Chrome，设置 CHROME=... 环境变量');
  return CHROME;
}

export async function launch({
  url,
  port = 9300 + Math.floor(Math.random() * 400),
  width = 1440,
  height = 900,
} = {}) {
  if (!CHROME) throw new Error('找不到 Chrome，设置 CHROME=... 环境变量');
  const profile = mkdtempSync(join(tmpdir(), 'wordcard-cdp-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, url,
  ], { stdio: 'ignore' });

  let page = null;
  for (let i = 0; i < 80; i++) {
    if (chrome.exitCode !== null) throw new Error('Chrome 启动失败');
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      page = list.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) break;
    } catch { /* 还没起来 */ }
    await sleep(150);
  }
  if (!page) throw new Error('连不上 Chrome 调试端口');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const waiting = new Map();
  let seq = 0;

  ws.addEventListener('message', (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.method === 'Page.javascriptDialogOpening') {
      send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
      return;
    }
    const waiter = waiting.get(msg.id);
    if (waiter) {
      waiting.delete(msg.id);
      if (msg.error) waiter.reject(new Error(msg.error.message || 'CDP error'));
      else waiter.resolve(msg.result);
    }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  function send(method, params = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error('页面脚本报错: ' + (details.exception?.description || details.text));
    }
    return result.result?.value;
  }

  async function waitFor(expression, { timeout = 8000, label = expression } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        if (await evaluate(expression)) return true;
      } catch { /* 页面还在跳转 */ }
      await sleep(120);
    }
    throw new Error('超时等待: ' + label);
  }

  async function screenshot(path) {
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(path, Buffer.from(result.data, 'base64'));
  }

  async function setViewport(viewportWidth, viewportHeight, mobile = false) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: 1,
      mobile,
    });
  }

  async function navigate(nextUrl) {
    await send('Page.navigate', { url: nextUrl });
  }

  async function close() {
    try { ws.close(); } catch { /* ignore */ }
    chrome.kill('SIGKILL');
    rmSync(profile, { recursive: true, force: true });
  }

  return { send, evaluate, waitFor, screenshot, setViewport, navigate, close, sleep };
}
