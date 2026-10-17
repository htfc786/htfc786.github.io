#!/usr/bin/env node
/* ============================================================
 * edit.mjs —— 可视化编辑的端到端测试
 * ------------------------------------------------------------
 * 用 Chrome DevTools Protocol 直接操作真实页面，验证：
 *   1) 在预览里改字 → 回写到数据（右侧文本框跟着变）
 *   2) 重新渲染后修改还在（说明改的是数据，不只是 DOM）
 *   3) 附加信息同时印在两面时，改一面另一面同步
 *
 * 跑法：node tests/edit.mjs        （需要 google-chrome / chromium）
 * ============================================================ */
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_UNDER_TEST = 'file://' + join(ROOT, 'index.html');
const PORT = 9333;

const CHROME = process.env.CHROME ||
  ['google-chrome', 'chromium', 'chromium-browser'].find((c) => {
    try { execSync(`command -v ${c}`, { stdio: 'ignore' }); return true; }
    catch { return false; }
  });
if (!CHROME) { console.error('找不到 Chrome，设置 CHROME=... 环境变量'); process.exit(2); }

const profile = mkdtempSync(join(tmpdir(), 'wordcard-cdp-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1440,1000', URL_UNDER_TEST,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('连不上 Chrome 调试端口');
}

let ws, seq = 0;
const waiting = new Map();
function send(method, params) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const msg = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (msg.result?.exceptionDetails) {
    throw new Error('页面脚本报错: ' + JSON.stringify(msg.result.exceptionDetails.exception?.description || msg.result.exceptionDetails));
  }
  return msg.result?.result?.value;
}
async function waitFor(expression, label, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(100);
  }
  throw new Error('超时等待: ' + label);
}

let pass = 0, fail = 0;
function check(cond, label, detail = '') {
  if (cond) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + (detail ? '  → ' + detail : '')); fail++; }
}

try {
  const page = await target();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    const w = waiting.get(msg.id);
    if (w) { waiting.delete(msg.id); w.resolve(msg); }
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  await waitFor("!!document.querySelector('.sheet--front .main')", '页面渲染出卡片');

  /* ---- 1. 在预览里改字 ---- */
  await evaluate(`(() => {
    const el = document.querySelector('.sheet--front .main[data-field="front"]');
    el.innerText = 'TESTWORD';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(700);   // 等文本框同步的防抖
  check(await evaluate("document.getElementById('data').value.split('\\n')[0].startsWith('TESTWORD')"),
    '预览里改字 → 回写到数据（文本框第一行以 TESTWORD 开头）');

  /* ---- 2. 重新渲染后仍然保留 ---- */
  await evaluate("document.getElementById('btn-fit').click()");   // 触发一次完整 render
  await sleep(700);
  check(await evaluate("document.querySelector('.sheet--front .main').innerText.indexOf('TESTWORD') === 0"),
    '重新渲染后修改仍在（改的是数据，不只是 DOM）');

  /* ---- 3. 附加信息印在两面时互相同步 ---- */
  await evaluate(`(() => {
    const sel = [...document.querySelectorAll('select')]
      .find(s => [...s.options].some(o => o.value === 'both'));
    sel.value = 'both';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await sleep(700);
  const noteCount = await evaluate("document.querySelectorAll('.note[data-field=\"note\"]').length");
  check(noteCount >= 4, '附加信息切到"两面"后，页面上出现两面的小字（' + noteCount + ' 处）');

  await evaluate(`(() => {
    const el = document.querySelector('.note[data-field="note"]');
    el.innerText = 'SYNCED-NOTE';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(400);
  check(await evaluate(`[...document.querySelectorAll('.note[data-field="note"]')]
      .filter(n => n.innerText.indexOf('SYNCED-NOTE') >= 0).length >= 2`),
    '改一面，另一面的同一张卡同步更新');
} catch (err) {
  console.error('FAIL  测试异常：' + err.message);
  fail++;
} finally {
  try { ws?.close(); } catch {}
  chrome.kill('SIGKILL');
  rmSync(profile, { recursive: true, force: true });
}

console.log('----');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
