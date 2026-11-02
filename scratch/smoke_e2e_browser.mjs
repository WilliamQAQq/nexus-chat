import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 8766;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

// 1. Static HTTP Server
const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/public/index.html';
  const localFile = path.resolve('.' + reqPath);
  if (!fs.existsSync(localFile) || fs.statSync(localFile).isDirectory()) {
    res.writeHead(404);
    res.end('Not found: ' + reqPath);
    return;
  }
  const ext = path.extname(localFile);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(localFile).pipe(res);
});

await new Promise((resolve) => server.listen(PORT, resolve));
console.log(`[Test Server] Serving on http://localhost:${PORT}`);

// 2. Launch Headless Chrome
const debugPort = 9334;
const userDataDir = path.resolve('scratch/chrome_profile_e2e');
fs.mkdirSync(userDataDir, { recursive: true });

const chromeProc = spawn(CHROME_PATH, [
  '--headless=new',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 200));
  try {
    const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
    if (res.ok) {
      const data = await res.json();
      wsUrl = data.webSocketDebuggerUrl;
      break;
    }
  } catch {}
}

if (!wsUrl) {
  chromeProc.kill();
  server.close();
  throw new Error('Failed to connect to Chrome debugging endpoint');
}

console.log('[Chrome] Connected to debugger at', wsUrl);

class CDPClient {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 1;
    this.callbacks = new Map();
    this.errors = [];
  }

  async open() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      } else if (data.method === 'Runtime.consoleAPICalled') {
        const type = data.params.type;
        const text = data.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        if (type === 'error') {
          console.error('[Console Error]', text);
          this.errors.push(text);
        } else {
          console.log(`[Console ${type}]`, text);
        }
      } else if (data.method === 'Runtime.exceptionThrown') {
        const desc = data.params.exceptionDetails?.exception?.description || data.params.exceptionDetails?.text;
        console.error('[Uncaught Exception]', desc);
        this.errors.push(desc);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result?.value;
  }
}

const newPageRes = await fetch(`http://127.0.0.1:${debugPort}/json/new?http://localhost:${PORT}/public/index.html`, { method: 'PUT' });
const pageInfo = await newPageRes.json();
const client = new CDPClient(pageInfo.webSocketDebuggerUrl);
await client.open();

await client.send('Runtime.enable');
await client.send('Page.enable');

console.log('[Page] Loading Nexus Chat...');
await new Promise((r) => setTimeout(r, 1200));

try {
  // Test 1: Initial state (Chinese default)
  const title = await client.eval('document.title');
  const htmlLang = await client.eval('document.documentElement.lang');
  const btnLangText = await client.eval('document.getElementById("btnLang")?.textContent');
  console.log('Initial state -> lang:', htmlLang, '| title:', title, '| btnLang:', btnLangText);
  if (!title.includes('新对话')) throw new Error('Expected Chinese initial title');
  if (btnLangText !== 'EN') throw new Error('Expected btnLang to display "EN" in Chinese mode');

  // Test 2: Switch to English via Topbar #btnLang button
  console.log('[Step 2] Clicking #btnLang to switch to English...');
  await client.eval('document.getElementById("btnLang").click()');
  await new Promise((r) => setTimeout(r, 300));

  const enLang = await client.eval('document.documentElement.lang');
  const enTitle = await client.eval('document.title');
  const enBtn = await client.eval('document.getElementById("btnLang").textContent');
  const enPlaceholder = await client.eval('document.getElementById("input").placeholder');
  console.log('English mode -> lang:', enLang, '| title:', enTitle, '| btnLang:', enBtn);
  if (enLang !== 'en') throw new Error(`Expected lang="en", got "${enLang}"`);
  if (!enTitle.includes('New Chat')) throw new Error(`Expected title with "New Chat", got "${enTitle}"`);
  if (enBtn !== '中') throw new Error(`Expected btnLang to display "中" in English mode, got "${enBtn}"`);
  if (!enPlaceholder.includes('Type a message')) throw new Error('Placeholder not translated to English');

  // Test 3: Verify Right Panel parameter definitions are in English
  const paramLabels = await client.eval(`Array.from(document.querySelectorAll('.param-head label')).map(el => el.textContent.trim())`);
  console.log('Parameter labels in English:', paramLabels);
  if (!paramLabels.some(l => l.includes('Temperature'))) throw new Error('Missing Temperature parameter');
  if (!paramLabels.some(l => l.includes('Max Output Tokens'))) throw new Error('Missing Max Output Tokens parameter');

  // Test 4: Open Compact & Summary Dialog and check translation
  console.log('[Step 4] Opening Compact & Summary Dialog...');
  await client.eval('document.getElementById("btnCompact").click()');
  await new Promise((r) => setTimeout(r, 300));

  const isCompactOpen = await client.eval('document.getElementById("dlgCompact").open');
  if (!isCompactOpen) throw new Error('Compact dialog did not open');

  const compactTitle = await client.eval('document.getElementById("dlgCompactTitle")?.textContent');
  const tabCompactText = await client.eval('document.querySelector("[data-ctab=compact]")?.textContent');
  const tabSummaryText = await client.eval('document.querySelector("[data-ctab=summary]")?.textContent');
  const cpKeepLabel = await client.eval('document.querySelector("[data-i18n=cpKeepLabel]")?.textContent');
  console.log('Compact Dialog in EN -> title:', compactTitle, '| tabs:', tabCompactText, '/', tabSummaryText, '| keep:', cpKeepLabel);
  if (!compactTitle.includes('Context Compression')) throw new Error('Compact title not in English');
  if (!tabCompactText.includes('Context Compression')) throw new Error('Compact tab label not in English');
  if (!tabSummaryText.includes('Conversation Summary')) throw new Error('Summary tab label not in English');

  // Switch to Summary Tab
  await client.eval('document.querySelector("[data-ctab=summary]").click()');
  await new Promise((r) => setTimeout(r, 200));
  const genSummaryBtnText = await client.eval('document.getElementById("sm_generate").textContent');
  console.log('Summary generate button text:', genSummaryBtnText);
  if (!genSummaryBtnText.includes('AI Generate Summary')) throw new Error('Generate summary button not in English');

  await client.eval('document.getElementById("dlgCompact").close()');

  // Test 5: Open Settings Dialog and verify General Tab language select
  console.log('[Step 5] Opening Settings Dialog...');
  await client.eval('document.getElementById("btnSettings").click()');
  await new Promise((r) => setTimeout(r, 300));

  const isSettingsOpen = await client.eval('document.getElementById("dlgSettings").open');
  if (!isSettingsOpen) throw new Error('Settings dialog did not open');

  // Switch to General Tab
  await client.eval('document.querySelector("#dlgSettings [data-tab=general]").click()');
  await new Promise((r) => setTimeout(r, 200));

  const langSelect = await client.eval('document.getElementById("set_language").value');
  console.log('Settings language select current value:', langSelect);
  if (langSelect !== 'en') throw new Error(`Expected set_language to be "en", got "${langSelect}"`);

  // Switch language via settings dropdown to zh-CN
  console.log('[Step 6] Switching language to zh-CN via settings dropdown...');
  await client.eval(`
    const sel = document.getElementById("set_language");
    sel.value = "zh-CN";
    sel.dispatchEvent(new Event("change"));
  `);
  await new Promise((r) => setTimeout(r, 400));

  const backZhLang = await client.eval('document.documentElement.lang');
  const backZhTitle = await client.eval('document.title');
  const backZhBtn = await client.eval('document.getElementById("btnLang").textContent');
  console.log('Switched back to Chinese via settings -> lang:', backZhLang, '| title:', backZhTitle, '| btnLang:', backZhBtn);
  if (backZhLang !== 'zh-CN') throw new Error(`Expected lang="zh-CN", got "${backZhLang}"`);
  if (!backZhTitle.includes('新对话')) throw new Error(`Expected title "新对话", got "${backZhTitle}"`);
  if (backZhBtn !== 'EN') throw new Error(`Expected btnLang="EN", got "${backZhBtn}"`);

  // Check localStorage persistence
  const savedSettings = await client.eval('localStorage.getItem("nexus.settings")');
  console.log('Persisted settings in localStorage:', savedSettings);
  if (!savedSettings || !savedSettings.includes('"language":"zh-CN"')) {
    throw new Error('Settings did not persist language="zh-CN" in localStorage');
  }

  await client.eval('document.getElementById("dlgSettings").close()');

  // Test 7: Verify 0 console errors or exceptions throughout test
  if (client.errors.length > 0) {
    throw new Error(`Encountered ${client.errors.length} browser errors: ` + client.errors.join('; '));
  }

  console.log('✓ ALL 7 E2E SMOKE TESTS PASSED PERFECTLY WITH ZERO ERRORS & EXCEPTIONS!');
} finally {
  client.ws.close();
  chromeProc.kill();
  server.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}
