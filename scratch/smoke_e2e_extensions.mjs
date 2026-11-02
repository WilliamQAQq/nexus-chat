import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 8767;
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

// 2. Launch Headless Chrome
const debugPort = 9335;
const userDataDir = path.resolve('scratch/chrome_profile_ext');
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

console.log('[Page] Loading Nexus Chat for Extensions E2E Test...');
await new Promise((r) => setTimeout(r, 1200));

try {
  // Test 1: Verify extensions buttons exist in sidebar
  const hasCharBtn = await client.eval('!!document.getElementById("btnCharacters")');
  const hasLoreBtn = await client.eval('!!document.getElementById("btnLorebooks")');
  const hasRegexBtn = await client.eval('!!document.getElementById("btnRegex")');
  console.log('[Check 1] Sidebar buttons exist:', { hasCharBtn, hasLoreBtn, hasRegexBtn });
  if (!hasCharBtn || !hasLoreBtn || !hasRegexBtn) throw new Error('Missing extension sidebar buttons');

  // Test 2: Character Card Library Modal
  console.log('[Check 2] Opening Character Library Modal...');
  await client.eval('document.getElementById("btnCharacters").click()');
  await new Promise((r) => setTimeout(r, 300));
  const isCharOpen = await client.eval('document.getElementById("dlgCharacters").open');
  if (!isCharOpen) throw new Error('Character dialog did not open');

  console.log('[Check 2.1] Creating a new Character...');
  await client.eval('document.getElementById("btnNewChar").click()');
  await new Promise((r) => setTimeout(r, 200));

  await client.eval(`
    document.getElementById("ch_name").value = "艾尔菲 (Elphi)";
    document.getElementById("ch_tags").value = "精灵, 法师, 冒险者";
    document.getElementById("ch_description").value = "一位博学而优雅的高等精灵学者。";
    document.getElementById("ch_first_mes").value = "你好旅行者，我是艾尔菲。今天你想探讨什么奥秘？";
    document.getElementById("ch_alternate_greetings").value = "星辰指引你来到这里。\\n---\\n愿微风抚平你的旅途劳顿。";
    document.getElementById("btnCharSave").click();
  `);
  await new Promise((r) => setTimeout(r, 300));

  const charCount = await client.eval('document.querySelectorAll("#charList .prov-item").length');
  console.log('[Check 2.2] Character list item count:', charCount);
  if (charCount < 1) throw new Error('Character was not added to library list');

  console.log('[Check 2.3] Starting chat with character...');
  await client.eval('document.getElementById("btnCharNewChat").click()');
  await new Promise((r) => setTimeout(r, 400));

  const isCharClosed = await client.eval('!document.getElementById("dlgCharacters").open');
  const curTitle = await client.eval('document.getElementById("chatTitle").textContent');
  const msgCount = await client.eval('document.querySelectorAll(".msg").length');
  const firstMsgContent = await client.eval('document.querySelector(".msg.assistant .md")?.textContent');
  console.log('[Check 2.4] Chat started with character -> title:', curTitle, '| msgs:', msgCount, '| firstMsg:', firstMsgContent);
  if (!isCharClosed) throw new Error('Character dialog should close after starting chat');
  if (!curTitle.includes('艾尔菲')) throw new Error('Chat title should match character name');
  if (msgCount !== 1) throw new Error('First greeting message should be inserted');
  if (!firstMsgContent.includes('艾尔菲')) throw new Error('First greeting text mismatch');

  // Test 3: Right Panel Character Card & Greeting Switch
  console.log('[Check 3] Inspecting Right Panel Character Banner...');
  const charBannerHidden = await client.eval('document.getElementById("charBanner").hidden');
  const charNameText = await client.eval('document.getElementById("charNameText").textContent');
  console.log('Right panel char banner -> hidden:', charBannerHidden, '| name:', charNameText);
  if (charBannerHidden) throw new Error('Character banner should be visible in right panel');
  if (!charNameText.includes('艾尔菲')) throw new Error('Character banner name mismatch');

  console.log('[Check 3.1] Switching greeting via dropdown...');
  await client.eval(`
    const sel = document.getElementById("charGreetingSelect");
    sel.value = "1";
    sel.dispatchEvent(new Event("change"));
  `);
  await new Promise((r) => setTimeout(r, 300));
  const switchedMsgContent = await client.eval('document.querySelector(".msg.assistant .md")?.textContent');
  console.log('Switched greeting content:', switchedMsgContent);
  if (!switchedMsgContent.includes('星辰指引你来到这里')) throw new Error('Greeting was not replaced correctly');

  // Test 4: World Info / Lorebook Modal
  console.log('[Check 4] Opening Lorebook Modal...');
  await client.eval('document.getElementById("btnLorebooks").click()');
  await new Promise((r) => setTimeout(r, 300));
  const isLoreOpen = await client.eval('document.getElementById("dlgLorebooks").open');
  if (!isLoreOpen) throw new Error('Lorebook dialog did not open');

  console.log('[Check 4.1] Adding an entry to World Info...');
  await client.eval('document.getElementById("btnNewLoreEntry").click()');
  await new Promise((r) => setTimeout(r, 200));

  await client.eval(`
    document.getElementById("le_name").value = "星空之塔";
    document.getElementById("le_keys").value = "星空之塔, 观星塔, Starlight";
    document.getElementById("le_content").value = "星空之塔建于第三纪元，是大陆上最宏伟的魔导研究中心。";
    document.getElementById("btnSaveLoreEntry").click();
  `);
  await new Promise((r) => setTimeout(r, 300));

  console.log('[Check 4.2] Testing Lorebook trigger tester...');
  await client.eval(`
    const inp = document.getElementById("loreTestInput");
    inp.value = "我们前往星空之塔调查魔力涌动。";
    inp.dispatchEvent(new Event("input"));
  `);
  await new Promise((r) => setTimeout(r, 300));
  const loreTestResult = await client.eval('document.getElementById("loreTestResults")?.textContent');
  console.log('Lore tester output:', loreTestResult);
  if (!loreTestResult.includes('星空之塔')) throw new Error('Lore tester did not trigger entry for "星空之塔"');

  await client.eval('document.getElementById("dlgLorebooks").close()');

  // Test 5: Regex Scripts Modal & Presets
  console.log('[Check 5] Opening Regex Scripts Modal...');
  await client.eval('document.getElementById("btnRegex").click()');
  await new Promise((r) => setTimeout(r, 300));
  const isRegexOpen = await client.eval('document.getElementById("dlgRegex").open');
  if (!isRegexOpen) throw new Error('Regex dialog did not open');

  console.log('[Check 5.1] Loading Regex Presets...');
  await client.eval('document.getElementById("btnRegexPresets").click()');
  await new Promise((r) => setTimeout(r, 300));

  const regexCount = await client.eval('document.querySelectorAll("#regexList .regex-rule-item").length');
  console.log('Loaded regex rules count:', regexCount);
  if (regexCount < 2) throw new Error('Failed to load regex presets');

  console.log('[Check 5.2] Testing Regex Live Tester with Think Tag rule...');
  await client.eval(`
    // Select the first rule (Strip <think> tags)
    document.getElementById("rx_testInput").value = "<think>思考中...私密思维</think>你好世界！";
    document.getElementById("rx_testInput").dispatchEvent(new Event("input"));
  `);
  await new Promise((r) => setTimeout(r, 300));

  const rxOut = await client.eval('document.getElementById("rx_testOutput").textContent');
  const rxCount = await client.eval('document.getElementById("rx_testCount").textContent');
  console.log('Regex live test result:', { rxOut, rxCount });
  if (rxOut.includes('<think>')) throw new Error('Regex rule should have stripped the <think> tag');
  if (!rxOut.includes('你好世界！')) throw new Error('Regex test output missing target text');

  await client.eval('document.getElementById("dlgRegex").close()');

  // Test 6: Verify English Switching updates Extension Modals & Right Panel
  console.log('[Check 6] Switching language to English and checking extensions...');
  await client.eval('document.getElementById("btnLang").click()');
  await new Promise((r) => setTimeout(r, 300));

  const cardCharTitle = await client.eval('document.querySelector("#cardCharacter h3").textContent');
  const cardLoreTitle = await client.eval('document.querySelector("#cardLore h3").textContent');
  const cardRegexTitle = await client.eval('document.querySelector("#cardRegex h3").textContent');
  console.log('English Extension Card Titles:', { cardCharTitle, cardLoreTitle, cardRegexTitle });
  if (!cardCharTitle.includes('Character')) throw new Error('Card character title not translated to English');
  if (!cardLoreTitle.includes('World Info')) throw new Error('Card lore title not translated to English');
  if (!cardRegexTitle.includes('Regex')) throw new Error('Card regex title not translated to English');

  // Verify 0 Console Errors
  if (client.errors.length > 0) {
    throw new Error(`Encountered ${client.errors.length} browser errors: ` + client.errors.join('; '));
  }

  console.log('✓ ALL EXTENSIONS E2E BROWSER TESTS PASSED (100% SUCCESS WITH 0 CONSOLE ERRORS)!');
} finally {
  client.ws.close();
  chromeProc.kill();
  server.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}
