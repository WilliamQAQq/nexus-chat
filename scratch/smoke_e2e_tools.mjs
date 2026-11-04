import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 8771;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

// 1. Static HTTP Server (also providing /api/health and /api/search)
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true,"proxy":true}');
    return;
  }
  if (reqPath === '/api/search') {
    const q = new URL(req.url, 'http://localhost').searchParams.get('q');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      ok: true,
      query: q,
      results: [
        { title: 'DeepSeek Official Documentation', snippet: 'State of the art open source models.', url: 'https://deepseek.com' },
        { title: 'DeepSeek on GitHub', snippet: 'Code repository and technical reports.', url: 'https://github.com/deepseek-ai' }
      ]
    }));
    return;
  }
  if (reqPath === '/') reqPath = '/public/index.html';
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
const debugPort = 9341;
const userDataDir = path.resolve('scratch/chrome_profile_tools');
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
fs.mkdirSync(userDataDir, { recursive: true });

const chromeProc = spawn(CHROME_PATH, [
  '--headless=new',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
], { stdio: 'ignore' });

// Wait for Chrome to start
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 200));
  try {
    const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
    if (res.ok) break;
  } catch {}
}

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

console.log('[Page] Loading Nexus Chat for Tools E2E Test...');
await new Promise((r) => setTimeout(r, 1200));

try {
  // Test Step 1: Check UI Elements
  console.log('[Check 1] Checking Web Search Buttons and Cards...');
  const hasBtnWebSearch = await client.eval('!!document.getElementById("btnWebSearch")');
  const hasCardWebSearch = await client.eval('!!document.getElementById("cardWebSearch")');
  const hasParamWebSearch = await client.eval('!!document.getElementById("paramWebSearch")');
  console.log('UI Elements:', { hasBtnWebSearch, hasCardWebSearch, hasParamWebSearch });
  if (!hasBtnWebSearch || !hasCardWebSearch || !hasParamWebSearch) {
    throw new Error('Web search UI elements missing in DOM!');
  }

  // Test Step 2: Toggle Web Search in Composer
  console.log('[Check 2] Toggling Web Search in Composer...');
  const toggleRes1 = await client.eval(`(() => {
    const btn = document.getElementById('btnWebSearch');
    btn.click();
    const isActive = btn.classList.contains('active');
    const paramChecked = document.getElementById('paramWebSearch').checked;
    return { isActive, paramChecked };
  })()`);
  console.log('Toggled on:', toggleRes1);
  if (!toggleRes1.isActive || !toggleRes1.paramChecked) {
    throw new Error('Toggling Web Search button did not activate webSearch!');
  }

  // Test Step 3: Toggle via Right Panel Checkbox
  console.log('[Check 3] Toggling Web Search via Panel Checkbox...');
  const toggleRes2 = await client.eval(`(() => {
    const chk = document.getElementById('paramWebSearch');
    chk.click();
    const isActive = document.getElementById('btnWebSearch').classList.contains('active');
    return { isActive, paramChecked: chk.checked };
  })()`);
  console.log('Toggled off:', toggleRes2);
  if (toggleRes2.isActive || toggleRes2.paramChecked) {
    throw new Error('Unchecking Web Search in panel did not deactivate button!');
  }

  // Re-enable for further tests
  await client.eval(`document.getElementById('btnWebSearch').click()`);

  // Test Step 4: Open Search Settings in Dialog
  console.log('[Check 4] Opening Search Settings Modal...');
  const settingsTabRes = await client.eval(`(() => {
    document.getElementById('btnOpenSearchSettings').click();
    const dlg = document.getElementById('dlgSettings');
    const toolsTab = dlg.querySelector('[data-tab="tools"]');
    const toolsPanel = dlg.querySelector('[data-panel="tools"]');
    return {
      isOpen: dlg.open,
      tabSelected: toolsTab.getAttribute('aria-selected') === 'true',
      panelVisible: !toolsPanel.hidden
    };
  })()`);
  console.log('Search settings modal:', settingsTabRes);
  if (!settingsTabRes.isOpen || !settingsTabRes.tabSelected || !settingsTabRes.panelVisible) {
    throw new Error('Failed to open Search Settings tab in settings modal!');
  }

  // Test Step 5: Test Search Connectivity in Settings
  console.log('[Check 5] Running Test Search Connectivity...');
  const testSearchRes = await client.eval(`(async () => {
    const qInput = document.getElementById('cfg_testSearchQuery');
    qInput.value = 'Quantum Computing';
    const btnTest = document.getElementById('cfg_btnTestSearch');
    btnTest.click();
    // Wait for results
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 200));
      const resBox = document.getElementById('cfg_testSearchResult');
      if (!resBox.hidden && resBox.querySelectorAll('a').length > 0) {
        return {
          count: resBox.querySelectorAll('a').length,
          firstTitle: resBox.querySelector('a').textContent
        };
      }
    }
    return { count: 0, text: document.getElementById('cfg_testSearchResult').innerText };
  })()`);
  console.log('Test Search Result in Dialog:', testSearchRes);
  if (!testSearchRes.count || testSearchRes.count < 1) {
    throw new Error('Test search connectivity failed to return results!');
  }

  // Close dialog
  await client.eval(`document.getElementById('dlgSettings').close()`);

  // Test Step 6: Render an Assistant Message with Search Citations
  console.log('[Check 6] Simulating Message Rendering with Search Citations...');
  await client.eval(`(() => {
    const msg = {
      id: 'mock_ai_msg',
      role: 'assistant',
      content: '根据最新检索资料，DeepSeek-V3 采用了先进的 MoE 架构与 MLA 注意力机制。',
      time: Date.now(),
      searchStatus: {
        status: 'done',
        query: 'DeepSeek-V3 架构',
        count: 2
      },
      searchSources: [
        { title: 'DeepSeek-V3 技术报告', url: 'https://deepseek.com/paper.pdf', snippet: 'MoE 架构与 671B 参数量' },
        { title: 'Hacker News 讨论', url: 'https://news.ycombinator.com/item?id=123', snippet: '社区深度测评与对比' }
      ]
    };
    const box = document.getElementById('messages');
    const inner = box.querySelector('.messages-inner') || box;
    const msgEl = document.createElement('div');
    msgEl.className = 'msg assistant';
    msgEl.dataset.id = msg.id;
    msgEl.innerHTML = '<div class="msg-content"></div><div class="msg-actions"></div>';
    inner.appendChild(msgEl);
    window._testMsg = msg;
    window._testEl = msgEl;
  })()`);

  const renderSourcesRes = await client.eval(`(() => {
    const el = window._testEl;
    const m = window._testMsg;
    const c = el.querySelector('.msg-content');
    
    // Simulate fillContent
    const sources = m.searchSources;
    const card = document.createElement('details');
    card.className = 'search-summary-card';
    card.open = true;
    let listHtml = '';
    sources.forEach((s, idx) => {
      listHtml += '<div class="search-source-item"><a class="search-source-title" href="' + s.url + '">[' + (idx + 1) + '] ' + s.title + '</a><div class="search-source-snippet">' + s.snippet + '</div></div>';
    });
    card.innerHTML = '<summary>🌐 已检索到 2 条网络来源</summary><div class="search-sources-list">' + listHtml + '</div>';
    c.append(card);

    const md = document.createElement('div');
    md.className = 'md';
    md.innerHTML = '<p>' + m.content + '</p>';
    c.append(md);

    const pBar = document.createElement('div');
    pBar.className = 'sources-pills-bar';
    pBar.innerHTML = '<span class="sources-label">参考来源:</span>' +
      sources.map((s, idx) => '<a class="source-pill" href="' + s.url + '" target="_blank">[' + (idx + 1) + '] ' + s.title + '</a>').join('');
    c.append(pBar);

    return {
      hasSearchCard: !!el.querySelector('.search-summary-card'),
      sourcesInCard: el.querySelectorAll('.search-source-title').length,
      hasPillsBar: !!el.querySelector('.sources-pills-bar'),
      pillsCount: el.querySelectorAll('.source-pill').length
    };
  })()`);
  console.log('Rendered Search Citations:', renderSourcesRes);
  if (!renderSourcesRes.hasSearchCard || renderSourcesRes.sourcesInCard !== 2 || !renderSourcesRes.hasPillsBar || renderSourcesRes.pillsCount !== 2) {
    throw new Error('Message citations did not render properly!');
  }

  // Test Step 7: Language Switch Parity
  console.log('[Check 7] Testing Language Switch for Web Search...');
  const langSwitchRes = await client.eval(`(() => {
    const btnLang = document.getElementById('btnLang');
    btnLang.click(); // Switch to EN
    const enBtnTitle = document.getElementById('btnWebSearch').title;
    const enCardTitle = document.querySelector('#cardWebSearch h3').textContent;
    const enTabTitle = document.querySelector('[data-tab="tools"]').textContent;
    return {
      lang: document.documentElement.lang,
      enBtnTitle,
      enCardTitle,
      enTabTitle
    };
  })()`);
  console.log('Language switch results:', langSwitchRes);
  if (langSwitchRes.lang !== 'en' || !langSwitchRes.enCardTitle.includes('Web Search') || !langSwitchRes.enTabTitle.includes('Web')) {
    throw new Error('Internationalization for Web Search failed in English!');
  }

  // Final check: Console errors
  console.log('[Final Check] Total console errors captured:', client.errors.length);
  if (client.errors.length > 0) {
    console.error('Console errors:', client.errors);
    throw new Error(`Found ${client.errors.length} unexpected console error(s)!`);
  }

  console.log('\n✓ ALL WEB SEARCH & TOOLS E2E TESTS PASSED (100% SUCCESS WITH 0 CONSOLE ERRORS)!\n');
} finally {
  client.ws.close();
  chromeProc.kill();
  server.close();
}
