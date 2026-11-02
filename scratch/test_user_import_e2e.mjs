import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 8768;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
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

const debugPort = 9336;
const userDataDir = path.resolve('scratch/chrome_profile_user_import');
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

console.log('[Page] Loading Nexus Chat...');
await new Promise((r) => setTimeout(r, 1200));

const userJsonContent = fs.readFileSync('c:\\Users\\chatt\\Downloads\\gemini-code-1793652838261.json', 'utf8');

try {
  // Test 1: Import the user's gemini json file via World Info modal
  console.log('[Step 1] Opening World Info modal and importing user JSON...');
  await client.eval('document.getElementById("btnLorebooks").click()');
  await new Promise((r) => setTimeout(r, 300));

  // Simulate file selection on loreFileInput
  await client.eval(`
    {
      const content = ${JSON.stringify(userJsonContent)};
      const file = new File([content], "gemini-code-1793652838261.json", { type: "application/json" });
      const input = document.getElementById("loreFileInput");
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  `);
  await new Promise((r) => setTimeout(r, 600));

  const bookName = await client.eval('document.getElementById("lb_name").value');
  const entriesCount = await client.eval('document.querySelectorAll("#loreEntryList .lore-entry-item").length');
  console.log('[Step 1 Result] Imported Book -> name:', bookName, '| entries count:', entriesCount);
  if (!bookName.includes('William Tian')) throw new Error('World Info name did not match William Tian');
  if (entriesCount < 5) throw new Error(`Expected at least 5 entries, got ${entriesCount}`);

  // Test 2: Test trigger keywords in Lore Tester
  console.log('[Step 2] Testing trigger with "纯金"...');
  await client.eval(`
    {
      const inp = document.getElementById("loreTestInput");
      inp.value = "我打算在莫斯科用一块纯金兑换当地货币。";
      inp.dispatchEvent(new Event("input"));
    }
  `);
  await new Promise((r) => setTimeout(r, 300));

  const resGold = await client.eval('document.getElementById("loreTestResults")?.textContent');
  console.log('Lore tester result for "纯金":', resGold);
  if (!resGold.includes('随身空间') && !resGold.includes('弱点')) {
    throw new Error('Lore tester did not trigger for "纯金"');
  }

  console.log('[Step 2.1] Testing trigger with "SVD"...');
  await client.eval(`
    {
      const inp = document.getElementById("loreTestInput");
      inp.value = "他在密林深处校准SVD狙击步枪的瞄准镜。";
      inp.dispatchEvent(new Event("input"));
    }
  `);
  await new Promise((r) => setTimeout(r, 300));

  const resSvd = await client.eval('document.getElementById("loreTestResults")?.textContent');
  console.log('Lore tester result for "SVD":', resSvd);
  if (!resSvd.includes('随身空间') && !resSvd.includes('核心档案')) {
    throw new Error('Lore tester did not trigger for "SVD"');
  }

  await client.eval('document.getElementById("dlgLorebooks").close()');

  // Test 3: Import via Character Card Library modal
  console.log('[Step 3] Opening Character Library modal and importing user JSON as Character Card...');
  await client.eval('document.getElementById("btnCharacters").click()');
  await new Promise((r) => setTimeout(r, 300));

  await client.eval(`
    {
      const content = ${JSON.stringify(userJsonContent)};
      const file = new File([content], "william-tian.json", { type: "application/json" });
      const input = document.getElementById("charFileInput");
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  `);
  await new Promise((r) => setTimeout(r, 600));

  const charName = await client.eval('document.getElementById("ch_name").value');
  const charDesc = await client.eval('document.getElementById("ch_description").value');
  const charFirstMes = await client.eval('document.getElementById("ch_first_mes").value');
  console.log('[Step 3 Result] Imported Character -> name:', charName);
  console.log('Description preview:', charDesc.slice(0, 100));
  console.log('First message preview:', charFirstMes.slice(0, 60));

  if (!charName.includes('William Tian')) throw new Error('Character name mismatch');
  if (!charDesc.includes('落难西欧学者')) throw new Error('Character description should contain archetype');
  if (!charFirstMes.includes('谨慎')) throw new Error('Character first message should be synthesized');

  // Test 4: Start Chat with William Tian
  console.log('[Step 4] Starting chat with William Tian...');
  await client.eval('document.getElementById("btnCharNewChat").click()');
  await new Promise((r) => setTimeout(r, 400));

  const chatTitle = await client.eval('document.getElementById("chatTitle").textContent');
  const firstMsg = await client.eval('document.querySelector(".msg.assistant .md")?.textContent');
  console.log('[Step 4 Result] Chat title:', chatTitle);
  console.log('Assistant greeting:', firstMsg);
  if (!chatTitle.includes('William Tian')) throw new Error('Chat title should be William Tian');
  if (!firstMsg) throw new Error('Assistant greeting should be present');

  // Test 5: Verify Right Panel Status Cards
  console.log('[Step 5] Checking right panel status cards...');
  const charBannerName = await client.eval('document.getElementById("charNameText").textContent');
  const loreStatus = await client.eval('document.getElementById("loreStatusHint").textContent');
  console.log('Right panel -> char banner:', charBannerName, '| lore status:', loreStatus);
  if (!charBannerName.includes('William Tian')) throw new Error('Character banner name mismatch');
  if (!loreStatus.includes('触发') && !loreStatus.includes('active')) throw new Error('Lore status should reflect active lore');

  // Test 6: Verify 0 console errors
  if (client.errors.length > 0) {
    throw new Error(`Encountered ${client.errors.length} browser errors: ` + client.errors.join('; '));
  }

  console.log('✓ ALL USER FILE IMPORT & TRIGGER TESTS PASSED WITH 100% SUCCESS AND 0 ERRORS!');
} finally {
  client.ws.close();
  chromeProc.kill();
  server.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}
