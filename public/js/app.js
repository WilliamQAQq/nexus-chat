import { renderMarkdown } from './markdown.js';
import { estimateTokens, messageTokens, formatTokens, guessContextWindow, IMAGE_TOKENS } from './tokens.js';
import { sendChat, listModels, PRESETS, PROVIDER_TYPES, resolveEndpointPreview, detectLocalProxy, hasLocalProxy } from './api.js';
import * as db from './db.js';

// ======================= 基础工具 =======================
const els = new Proxy({}, { get: (_, id) => document.getElementById(id) });
const uid = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
const clone = (o) => JSON.parse(JSON.stringify(o));
const isMobile = () => matchMedia('(max-width: 1020px)').matches;

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  clip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  refresh: '<path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  pin: '<path d="M12 17v5"/><path d="M5 17h14l-2-5V4H7v8z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/><path d="M6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
}

let toastTimer;
function toast(msg, ms = 2200) {
  const t = els.toast;
  t.textContent = msg;
  try { t.hidePopover(); t.showPopover(); } catch {}
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    try { t.hidePopover(); } catch {}
    if (!('popover' in HTMLElement.prototype)) t.textContent = '';
  }, ms);
}

function relTime(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return '刚刚';
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)} 天前`;
  return new Date(ts).toLocaleDateString();
}
const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
function expandPrompt(raw, model = '') {
  if (!raw) return '';
  const now = new Date();
  return raw
    .replaceAll('{{date}}', now.toLocaleDateString('zh-CN'))
    .replaceAll('{{time}}', now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
    .replaceAll('{{weekday}}', WEEKDAYS[now.getDay()])
    .replaceAll('{{model}}', model || '');
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('已复制'); }
  catch { toast('复制失败，请手动选择复制'); }
}

function download(name, content, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ======================= 状态与持久化 =======================
const SKEY = 'nexus.settings';
const KKEY = 'nexus.sessionKeys';
const DEFAULT_PARAMS = {
  temperature: 0.7, top_p: 1, max_tokens: 4096, presence_penalty: 0, frequency_penalty: 0,
  enabled: { temperature: true, top_p: false, max_tokens: true, presence_penalty: false, frequency_penalty: false },
  stream: true, contextWindow: 128000, maxHistory: 0, autoTrim: true,
};
const DEFAULT_PROMPTS = [
  { name: '通用助手', content: '你是一个乐于助人、知识渊博的 AI 助手（当前日期：{{date}}）。回答要准确、清晰、有条理，必要时使用 Markdown 格式（标题、列表、表格、代码块）。' },
  { name: '代码专家', content: '你是一名资深软件工程师。给出可直接运行、结构清晰、带关键注释的代码，并简要说明核心思路、边界条件与潜在坑点。' },
  { name: '中英互译', content: '你是一位精通中英文的专业译者。若用户输入中文，请译为地道自然的英文；若输入其他语言，请译为流畅优美的中文。保留原有格式与语气，直接输出译文。' },
  { name: '写作润色', content: '你是一名资深文字编辑。在不改变原意的前提下润色用户的文本，提升逻辑连贯性与表达质感，最后用简短列表说明主要优化点。' },
  { name: '苏格拉底导师', content: '你是一位善于启发思考的导师。不要直接给出最终答案，而是通过循序渐进的提问、类比和线索，引导我自己推导出结论。' },
].map((p) => ({ id: uid(), ...p }));

const PARAM_DEFS = [
  { key: 'temperature', label: '温度 Temperature', min: 0, max: 2, step: 0.01, hint: '越高越随机、发散有创意；越低越稳定、严谨确定' },
  { key: 'top_p', label: '核采样 Top P', min: 0, max: 1, step: 0.01, hint: '候选词概率累积阈值，通常与温度二选一开启' },
  { key: 'max_tokens', label: '最大输出 Max Tokens', min: 256, max: 65536, step: 256, nmax: 2000000, hint: '单次回复上限，同时计入上下文窗口预留额度' },
  { key: 'presence_penalty', label: '存在惩罚 Presence', min: -2, max: 2, step: 0.1, hint: '正值鼓励模型拓展新话题' },
  { key: 'frequency_penalty', label: '频率惩罚 Frequency', min: -2, max: 2, step: 0.1, hint: '正值减少重复车轱辘话' },
];

function mergeParams(p = {}) {
  const d = clone(DEFAULT_PARAMS);
  return { ...d, ...p, enabled: { ...d.enabled, ...(p.enabled || {}) } };
}

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SKEY) || '{}'); } catch {}
  const out = {
    providers: [], lastTarget: null, defaultSystemPrompt: '', modelMeta: {},
    theme: 'system', sendKey: 'enter', fontSize: 15, ephemeralKeys: false,
    ...s,
    prompts: s.prompts ?? DEFAULT_PROMPTS,
    defaultParams: mergeParams(s.defaultParams),
  };
  if (out.ephemeralKeys) {
    try {
      const kmap = JSON.parse(sessionStorage.getItem(KKEY) || '{}');
      for (const p of out.providers) if (kmap[p.id]) p.apiKey = kmap[p.id];
    } catch {}
  }
  return out;
}

const state = {
  settings: loadSettings(),
  convs: [],
  currentId: null,
  draft: null,          // 尚未发送消息的新对话
  generating: null,     // { convId, msgId, controller }
  attachments: [],      // { kind:'image'|'text', name, data }
  editingProviderId: null,
  editingPromptId: null,
  editingMsgId: null,
  stick: true,
};

function saveSettings() {
  try {
    if (state.settings.ephemeralKeys) {
      const kmap = {};
      for (const p of state.settings.providers) if (p.apiKey) kmap[p.id] = p.apiKey;
      sessionStorage.setItem(KKEY, JSON.stringify(kmap));
      const stripped = clone(state.settings);
      for (const p of stripped.providers) p.apiKey = '';
      localStorage.setItem(SKEY, JSON.stringify(stripped));
    } else {
      sessionStorage.removeItem(KKEY);
      localStorage.setItem(SKEY, JSON.stringify(state.settings));
    }
  } catch (e) { toast('设置保存失败: ' + e.message); }
}

const saveTimers = new Map();
function saveConvSoon(conv, delay = 400) {
  if (!state.convs.includes(conv)) return;
  clearTimeout(saveTimers.get(conv.id));
  saveTimers.set(conv.id, setTimeout(() => saveConvNow(conv), delay));
}
async function saveConvNow(conv) {
  if (!state.convs.includes(conv)) return;
  clearTimeout(saveTimers.get(conv.id));
  try { await db.put(JSON.parse(JSON.stringify(conv))); }
  catch (e) { toast('保存对话失败: ' + e.message); }
}

// ======================= 对话 / 模型 =======================
const getProvider = (id) => state.settings.providers.find((p) => p.id === id);
const currentConv = () => state.convs.find((c) => c.id === state.currentId) ?? state.draft;

function contextFor(model) {
  return state.settings.modelMeta[model]?.contextWindow ?? guessContextWindow(model);
}

function defaultTarget() {
  const ps = state.settings.providers;
  const lt = state.settings.lastTarget;
  if (lt && getProvider(lt.providerId)) return lt;
  const p = ps.find((x) => x.models?.length) ?? ps[0];
  return p ? { providerId: p.id, model: p.models?.[0] ?? '' } : { providerId: null, model: '' };
}

function makeConv() {
  const t = defaultTarget();
  const params = clone(state.settings.defaultParams);
  if (t.model) params.contextWindow = contextFor(t.model);
  return {
    id: uid(), title: '新对话', createdAt: Date.now(), updatedAt: Date.now(), pinned: false,
    providerId: t.providerId, model: t.model, systemPrompt: state.settings.defaultSystemPrompt, params, messages: [],
  };
}

function ensureTarget(conv) {
  if (conv.providerId && getProvider(conv.providerId)) return;
  const t = defaultTarget();
  conv.providerId = t.providerId;
  conv.model = t.model;
  if (t.model) conv.params.contextWindow = contextFor(t.model);
}

function newChat() {
  if (state.generating) stopGeneration();
  const cur = currentConv();
  if (!(cur === state.draft && cur && !cur.messages.length)) state.draft = makeConv();
  state.currentId = state.draft.id;
  state.attachments = [];
  renderAll();
  els.input.focus();
  if (isMobile()) closeMobile();
}

function selectConv(id) {
  state.currentId = id;
  state.editingMsgId = null;
  state.stick = true;
  renderAll();
  if (isMobile()) closeMobile();
}

async function deleteConv(id) {
  const c = state.convs.find((x) => x.id === id);
  if (!c || !confirm(`确定删除对话「${c.title}」？`)) return;
  if (state.generating?.convId === id) stopGeneration();
  state.convs = state.convs.filter((x) => x.id !== id);
  await db.del(id);
  if (state.currentId === id) {
    const next = [...state.convs].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (next) state.currentId = next.id; else newChat();
  }
  renderAll();
}

function renameConv(conv) {
  const t = prompt('重命名对话', conv.title);
  if (t == null || !t.trim()) return;
  conv.title = t.trim();
  saveConvSoon(conv, 0);
  renderConvList();
  renderHeader();
}

function openPanelTo(cardId, focusEl) {
  if (isMobile()) { els.app.classList.remove('m-sidebar'); els.app.classList.add('m-panel'); }
  else if (els.app.classList.contains('panel-hidden')) togglePanel();
  if (cardId) els[cardId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (focusEl) setTimeout(() => focusEl.focus(), 120);
}

// ======================= 上下文计算 =======================
function computeContext(conv, draftText = '', draftImages = 0) {
  const p = conv.params;
  const resolvedSys = expandPrompt(conv.systemPrompt, conv.model);
  const sys = resolvedSys.trim() ? estimateTokens(resolvedSys) + 4 : 0;
  const reserve = p.enabled.max_tokens ? p.max_tokens : 0;
  const input = draftText || draftImages ? estimateTokens(draftText) + 4 + draftImages * IMAGE_TOKENS : 0;
  const budget = p.contextWindow - reserve - sys - input;
  const allNonErr = conv.messages.filter((m) => !m.error && !m.pending && (m.content || m.images?.length));
  const manualExcluded = allNonErr.filter((m) => m.excluded).length;
  const valid = allNonErr.filter((m) => !m.excluded);
  let included = p.maxHistory > 0 ? valid.slice(-p.maxHistory) : valid.slice();
  let history = included.reduce((s, m) => s + messageTokens(m), 0);
  const limitedByCount = valid.length - included.length;
  let trimmedByWindow = 0;
  if (p.autoTrim) {
    while (included.length > 1 && history > budget) {
      history -= messageTokens(included.shift());
      trimmedByWindow++;
    }
  }
  const used = sys + history + input;
  return {
    sys, history, input, reserve, used, total: used + reserve, limit: p.contextWindow,
    includedIds: new Set(included.map((m) => m.id)), included,
    limitedByCount, trimmedByWindow, manualExcluded, totalMsgs: allNonErr.length,
  };
}

// ======================= 渲染 =======================
function renderAll() {
  renderConvList();
  renderHeader();
  renderMessages(true);
  renderPanel();
  renderAttachments();
  updateMeter();
  updateSendBtn();
}

function renderConvList() {
  const q = els.searchConv.value.trim().toLowerCase();
  const list = [...state.convs]
    .sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt))
    .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content?.toLowerCase().includes(q)));
  if (!list.length) {
    els.convList.innerHTML = `<div class="empty-hint">${q ? '没有匹配的对话' : '还没有对话<br>发送第一条消息开始吧'}</div>`;
    return;
  }
  els.convList.replaceChildren(...list.map((c) => {
    const item = document.createElement('div');
    item.className = 'conv-item' + (c.id === state.currentId ? ' active' : '');
    item.dataset.id = c.id;
    item.innerHTML = `<button class="conv-main" type="button" data-op="open"><span class="conv-title"></span><span class="conv-sub"></span></button>
      <div class="conv-ops">
        <button class="icon-btn sm" type="button" data-op="pin" title="${c.pinned ? '取消置顶' : '置顶'}">${icon('pin')}</button>
        <button class="icon-btn sm" type="button" data-op="rename" title="重命名">${icon('edit')}</button>
        <button class="icon-btn sm" type="button" data-op="delete" title="删除">${icon('trash')}</button>
      </div>`;
    item.querySelector('.conv-title').textContent = (c.pinned ? '📌 ' : '') + c.title;
    item.querySelector('.conv-sub').textContent = `${c.messages.length} 条消息 · ${relTime(c.updatedAt)}`;
    return item;
  }));
}

function renderHeader() {
  const conv = currentConv();
  els.chatTitle.textContent = conv?.title ?? '新对话';
  document.title = `${conv?.title ?? '新对话'} · Nexus Chat`;
  renderModelSelect();
  updateTopTempPill();
}

function updateTopTempPill() {
  const conv = currentConv();
  if (!conv) return;
  const p = conv.params;
  els.topTempBtn.textContent = p.enabled.temperature ? `🌡 ${p.temperature}` : '🌡 默认';
}

const SEP = '\u0001';
function renderModelSelect() {
  const conv = currentConv();
  const sel = els.selModel;
  sel.replaceChildren();
  const opt = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; };
  const ps = state.settings.providers;
  if (!ps.length) {
    sel.append(opt('', '— 尚未配置 API —'), opt('__settings', '⚙ 添加 API 提供商…'));
    sel.value = '';
    return;
  }
  for (const p of ps) {
    const g = document.createElement('optgroup');
    g.label = p.name;
    const models = [...(p.models || [])];
    if (conv?.providerId === p.id && conv.model && !models.includes(conv.model)) models.unshift(conv.model);
    if (!models.length) g.append(opt(`__custom${SEP}${p.id}`, '（无模型，点此手动输入）'));
    models.forEach((m) => g.append(opt(`${p.id}${SEP}${m}`, m)));
    sel.append(g);
  }
  const tools = document.createElement('optgroup');
  tools.label = '──────────';
  tools.append(opt(`__custom${SEP}${conv?.providerId ?? ps[0].id}`, '✎ 输入自定义模型名…'), opt('__settings', '⚙ 管理 API 提供商…'));
  sel.append(tools);
  sel.value = conv?.providerId && conv.model ? `${conv.providerId}${SEP}${conv.model}` : '';
}

function onModelChange() {
  const conv = currentConv();
  const v = els.selModel.value;
  if (v === '__settings') { renderModelSelect(); openSettings('providers'); return; }
  let providerId;
  let model;
  if (v.startsWith('__custom')) {
    providerId = v.split(SEP)[1];
    const p = getProvider(providerId);
    model = prompt(`为「${p?.name}」输入模型名称`, '')?.trim();
    if (!model) { renderModelSelect(); return; }
    if (p && !p.models.includes(model)) { p.models.push(model); saveSettings(); }
  } else [providerId, model] = v.split(SEP);
  conv.providerId = providerId;
  conv.model = model;
  conv.params.contextWindow = contextFor(model);
  state.settings.lastTarget = { providerId, model };
  saveSettings();
  saveConvSoon(conv);
  renderModelSelect();
  renderPanel();
  renderMessages();
  updateMeter();
}

function splitThink(m) {
  let content = m.content || '';
  let reasoning = m.reasoning || '';
  if (!reasoning && content.startsWith('<think>')) {
    const end = content.indexOf('</think>');
    if (end < 0) { reasoning = content.slice(7); content = ''; }
    else { reasoning = content.slice(7, end); content = content.slice(end + 8).trimStart(); }
  }
  return { content, reasoning };
}

function welcomeEl() {
  const box = document.createElement('div');
  box.className = 'welcome';
  if (!state.settings.providers.length) {
    box.innerHTML = `<h2>欢迎使用 Nexus Chat</h2>
      <p>一个可自由接入任意 AI API 的增强型聊天工作台。<br>支持 OpenAI 兼容协议、Anthropic Claude、Google Gemini，自带本地跨域代理、上下文窗口额度监控、提示词库与多维生成参数控制。</p>
      <div class="row-btns" style="justify-content:center;margin-top:20px"><button class="btn primary" type="button" data-act="open-settings">${icon('plus')}添加第一个 API 提供商</button></div>`;
  } else {
    const conv = currentConv();
    box.innerHTML = `<h2>有什么可以帮你？</h2><p>当前模型：<b></b></p><div class="persona-bar"><span class="label">角色提示词：</span></div><div class="suggestions"></div>`;
    box.querySelector('b').textContent = conv?.model || '未选择';

    const pbar = box.querySelector('.persona-bar');
    const noneBtn = document.createElement('button');
    noneBtn.type = 'button';
    noneBtn.className = 'persona-chip' + (!conv?.systemPrompt?.trim() ? ' active' : '');
    noneBtn.dataset.act = 'persona';
    noneBtn.dataset.prompt = '';
    noneBtn.textContent = '无预设';
    pbar.append(noneBtn);
    state.settings.prompts.slice(0, 6).forEach((pr) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'persona-chip' + (conv?.systemPrompt === pr.content ? ' active' : '');
      b.dataset.act = 'persona';
      b.dataset.prompt = pr.content;
      b.textContent = pr.name;
      pbar.append(b);
    });
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'persona-chip';
    editBtn.dataset.act = 'edit-sys';
    editBtn.textContent = '✎ 编辑提示词…';
    pbar.append(editBtn);

    const s = box.querySelector('.suggestions');
    ['用通俗的类比解释 Transformer 注意力机制', '写一个带并发控制的 TypeScript 异步队列', '帮我审查并优化一段 SQL 查询性能', '为新产品构思 5 句打动人心的 Slogan'].forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.act = 'suggest'; b.textContent = t;
      s.append(b);
    });
  }
  return box;
}

function renderMessages(forceBottom = false) {
  const conv = currentConv();
  const box = els.messages;
  if (!conv || !conv.messages.length) { box.replaceChildren(welcomeEl()); return; }
  const ctx = computeContext(conv);
  const inner = document.createElement('div');
  inner.className = 'messages-inner';
  if (conv.systemPrompt?.trim()) {
    const d = document.createElement('details');
    d.className = 'sys-banner';
    d.innerHTML = `<summary><span class="sys-sum"></span><button class="btn sm" type="button" data-act="edit-sys">编辑</button></summary><div class="sys-text"></div>`;
    d.querySelector('.sys-sum').textContent = `⚙ 系统提示词 · 约 ${formatTokens(ctx.sys)} tokens`;
    d.querySelector('.sys-text').textContent = conv.systemPrompt;
    inner.append(d);
  }
  conv.messages.forEach((m) => inner.append(messageEl(m, conv, ctx)));
  const prevTop = box.scrollTop;
  box.replaceChildren(inner);
  if (forceBottom || state.stick) box.scrollTop = box.scrollHeight;
  else box.scrollTop = prevTop;
}

function messageEl(m, conv, ctx) {
  const el = document.createElement('article');
  el.className = `msg ${m.role}`;
  el.dataset.id = m.id;
  if (m.error) el.classList.add('error');
  else if (!m.pending && !ctx.includedIds.has(m.id)) el.classList.add('excluded');
  el.innerHTML = `<div class="avatar">${m.role === 'user' ? '你' : 'AI'}</div>
    <div class="msg-body"><div class="msg-meta"></div><div class="msg-content"></div><div class="msg-actions"></div></div>`;
  fillMeta(el, m, ctx);
  if (state.editingMsgId === m.id) fillEditor(el, m);
  else fillContent(el, m);
  fillActions(el, m, ctx);
  return el;
}

function fillMeta(el, m, ctx) {
  const meta = el.querySelector('.msg-meta');
  meta.innerHTML = '';
  const b = document.createElement('b');
  b.textContent = m.role === 'user' ? '你' : (m.model || 'AI');
  meta.append(b);
  const add = (text, cls = '') => { const s = document.createElement('span'); s.textContent = text; if (cls) s.className = cls; meta.append(s); };
  add(clock(m.time));
  if (m.usage && (m.usage.prompt || m.usage.completion)) {
    add(`输入 ${formatTokens(m.usage.prompt)} · 输出 ${formatTokens(m.usage.completion)} tokens`);
  } else if (!m.pending && !m.error) add(`≈ ${formatTokens(messageTokens(m))} tokens`);
  if (m.duration && !m.pending) {
    const sec = m.duration / 1000;
    let s = `${sec.toFixed(1)}s`;
    if (m.usage?.completion) s += ` · ${(m.usage.completion / sec).toFixed(1)} tok/s`;
    add(s);
  }
  if (ctx && !m.pending && !m.error && !ctx.includedIds.has(m.id)) {
    add(m.excluded ? '已手动移出上下文' : '超出窗口未携带', 'tag warn');
  }
  if (m.finish === 'length' || m.finish === 'max_tokens' || m.finish === 'MAX_TOKENS') add('因达到最大输出长度而截断', 'tag warn');
}

function fillContent(el, m) {
  const c = el.querySelector('.msg-content');
  const prevDetails = c.querySelector('details.reasoning');
  c.replaceChildren();
  if (m.images?.length) {
    const g = document.createElement('div');
    g.className = 'images';
    m.images.forEach((src) => { const img = new Image(); img.src = src; img.alt = '附图'; img.loading = 'lazy'; g.append(img); });
    c.append(g);
  }
  if (m.role === 'user') {
    const t = document.createElement('div');
    t.className = 'user-text';
    t.textContent = m.content;
    c.append(t);
    return;
  }
  const { content, reasoning } = splitThink(m);
  if (reasoning) {
    const d = document.createElement('details');
    d.className = 'reasoning';
    d.open = prevDetails ? prevDetails.open : (m.pending && !content);
    const sum = document.createElement('summary');
    sum.textContent = m.pending && !content ? '💭 思考中…' : `💭 思考过程（约 ${formatTokens(estimateTokens(reasoning))} tokens）`;
    const body = document.createElement('div');
    body.className = 'md';
    body.innerHTML = renderMarkdown(reasoning);
    d.append(sum, body);
    c.append(d);
  }
  if (content || !m.pending || !reasoning) {
    const md = document.createElement('div');
    md.className = 'md';
    if (m.pending && !content && !reasoning) md.innerHTML = '<div class="typing"><i></i><i></i><i></i></div>';
    else md.innerHTML = renderMarkdown(content) + (m.pending ? '<span class="cursor"></span>' : '');
    if (content || m.pending) c.append(md);
  }
  if (m.error) {
    const e = document.createElement('div');
    e.className = 'err-box';
    e.textContent = '⚠ ' + m.error;
    c.append(e);
  }
  if (m.stopped) {
    const n = document.createElement('div');
    n.className = 'note';
    n.textContent = '⏹ 已手动停止生成';
    c.append(n);
  }
}

function fillEditor(el, m) {
  const c = el.querySelector('.msg-content');
  c.innerHTML = `<div class="edit-box"><textarea class="input"></textarea>
    <div class="row-btns">${m.role === 'user' ? '<button class="btn sm primary" type="button" data-act="edit-send">保存并重新发送</button>' : ''}
    <button class="btn sm ${m.role === 'user' ? '' : 'primary'}" type="button" data-act="edit-save">保存</button>
    <button class="btn sm" type="button" data-act="edit-cancel">取消</button></div></div>`;
  const ta = c.querySelector('textarea');
  ta.value = m.content;
  requestAnimationFrame(() => { ta.focus(); ta.style.height = Math.min(ta.scrollHeight + 4, innerHeight * 0.5) + 'px'; });
}

function fillActions(el, m) {
  const a = el.querySelector('.msg-actions');
  if (m.pending || state.editingMsgId === m.id) { a.replaceChildren(); return; }
  const busy = !!state.generating;
  const btn = (act, ic, title, disabled = false) =>
    `<button class="icon-btn sm" type="button" data-act="${act}" title="${title}" aria-label="${title}"${disabled ? ' disabled' : ''}>${icon(ic)}</button>`;
  let html = btn('copy', 'copy', '复制');
  if (!m.error) {
    html += btn('toggle-ctx', m.excluded ? 'eye' : 'eyeOff', m.excluded ? '重新纳入上下文' : '从上下文中移出（节省额度）', busy);
  }
  if (m.role === 'assistant') html += btn('regen', 'refresh', m.error ? '重试' : '重新生成', busy);
  html += btn('edit', 'edit', '编辑', busy) + btn('delete', 'trash', '删除', busy);
  a.innerHTML = html;
}

let streamRaf = 0;
function scheduleStreamRender(conv, m) {
  if (streamRaf) return;
  streamRaf = requestAnimationFrame(() => {
    streamRaf = 0;
    if (currentConv() !== conv) return;
    const el = els.messages.querySelector(`.msg[data-id="${m.id}"]`);
    if (!el) return;
    fillContent(el, m);
    if (state.stick) els.messages.scrollTop = els.messages.scrollHeight;
  });
}

// ---------- 右侧面板 ----------
function buildParamList() {
  els.paramList.innerHTML = PARAM_DEFS.map((d) => `
    <div class="param" data-key="${d.key}">
      <div class="param-head">
        <label><input type="checkbox" data-role="enabled"> ${d.label}</label>
        <input class="input" type="number" data-role="num" min="${d.min}" max="${d.nmax ?? d.max}" step="${d.step}">
      </div>
      <input type="range" data-role="range" min="${d.min}" max="${d.max}" step="${d.step}" aria-label="${d.label}">
      <p class="hint">${d.hint}</p>
    </div>`).join('');
}

function syncTempChips(p) {
  els.tempChips.querySelectorAll('button').forEach((b) => {
    const v = b.dataset.temp;
    const active = v === 'off' ? !p.enabled.temperature : (p.enabled.temperature && Number(v) === p.temperature);
    b.classList.toggle('active', active);
  });
  updateTopTempPill();
}

function renderPanel() {
  const conv = currentConv();
  if (!conv) return;
  const p = conv.params;
  els.ctxWindow.value = p.contextWindow;
  els.maxHistory.value = p.maxHistory;
  els.autoTrim.checked = p.autoTrim;
  els.streamToggle.checked = p.stream;
  if (document.activeElement !== els.sysPrompt) els.sysPrompt.value = conv.systemPrompt || '';
  els.sysTokens.textContent = `≈ ${formatTokens(estimateTokens(expandPrompt(conv.systemPrompt, conv.model)))} tokens`;
  for (const row of els.paramList.querySelectorAll('.param')) {
    const k = row.dataset.key;
    row.querySelector('[data-role=enabled]').checked = p.enabled[k];
    row.querySelector('[data-role=num]').value = p[k];
    row.querySelector('[data-role=range]').value = p[k];
    row.classList.toggle('off', !p.enabled[k]);
  }
  els.ctxChips.querySelectorAll('button').forEach((b) => b.classList.toggle('active', Number(b.dataset.ctx) === p.contextWindow));
  syncTempChips(p);
}

let meterRaf = 0;
function scheduleMeter() { if (!meterRaf) meterRaf = requestAnimationFrame(() => { meterRaf = 0; updateMeter(); }); }

function updateMeter() {
  const conv = currentConv();
  if (!conv) return;
  const imgs = state.attachments.filter((a) => a.kind === 'image').length;
  const ctx = computeContext(conv, composeText(), imgs);
  const pct = (x) => `${Math.max(0, Math.min(100, (x / ctx.limit) * 100))}%`;
  const ratio = ctx.total / ctx.limit;
  const level = ratio > 1 ? 'danger' : ratio > 0.8 ? 'warn' : '';

  const setBar = (bar) => {
    const [s, h, i, r] = bar.querySelectorAll('.seg');
    s.style.width = pct(ctx.sys); h.style.width = pct(ctx.history); i.style.width = pct(ctx.input); r.style.width = pct(ctx.reserve);
  };
  setBar(els.meterBar);
  els.meter.className = `meter ${level}`;
  const trimmed = ctx.trimmedByWindow + ctx.limitedByCount + ctx.manualExcluded;
  els.meterText.textContent = `上下文 ${formatTokens(ctx.used)} / ${formatTokens(ctx.limit)}` +
    (ctx.reserve ? ` · 预留 ${formatTokens(ctx.reserve)}` : '') + (trimmed ? ` · 已排除 ${trimmed} 条` : '');
  els.inputTokens.textContent = ctx.input ? `本条 ≈ ${formatTokens(ctx.input)}` : '';

  // 顶栏上下文胶囊
  const totalPct = Math.round(ratio * 100);
  els.topCtxBtn.textContent = `📊 ${formatTokens(ctx.used)}/${formatTokens(ctx.limit)} (${totalPct}%)`;
  els.topCtxBtn.className = `pill-btn ${level}`;

  const free = ctx.limit - ctx.total;
  const lastUsage = [...conv.messages].reverse().find((m) => m.usage?.prompt)?.usage;
  let sumPrompt = 0;
  let sumComp = 0;
  for (const m of conv.messages) {
    if (m.usage) { sumPrompt += m.usage.prompt || 0; sumComp += m.usage.completion || 0; }
  }

  els.ctxDetail.innerHTML = `
    <div class="ctx-big">${formatTokens(ctx.used)} <small>/ ${formatTokens(ctx.limit)} tokens（含预留占 ${(ratio * 100).toFixed(1)}%）</small></div>
    <div class="meter-bar"><i class="seg sys"></i><i class="seg hist"></i><i class="seg inp"></i><i class="seg res"></i></div>
    <div class="ctx-rows">
      <i class="dot" style="background:var(--seg-sys)"></i><span>系统提示词</span><span class="num">${formatTokens(ctx.sys)}</span>
      <i class="dot" style="background:var(--seg-hist)"></i><span>携带历史（${ctx.included.length}/${ctx.totalMsgs} 条）</span><span class="num">${formatTokens(ctx.history)}</span>
      <i class="dot" style="background:var(--seg-inp)"></i><span>正在输入</span><span class="num">${formatTokens(ctx.input)}</span>
      <i class="dot seg res"></i><span>预留输出 (max_tokens)</span><span class="num">${formatTokens(ctx.reserve)}</span>
      <i></i><span><b>剩余可用额度</b></span><span class="num"><b>${free >= 0 ? formatTokens(free) : '-' + formatTokens(-free)}</b></span>
    </div>
    ${ctx.manualExcluded ? `<div class="ctx-alert warn">👁 已手动移出 ${ctx.manualExcluded} 条消息（可点击消息下方眼睛图标恢复）</div>` : ''}
    ${ctx.trimmedByWindow ? `<div class="ctx-alert warn">⚠ 已自动截断最早的 ${ctx.trimmedByWindow} 条消息以适应窗口（半透明显示）</div>` : ''}
    ${ctx.limitedByCount ? `<div class="ctx-alert warn">ℹ 受“携带历史条数”限制，排除了 ${ctx.limitedByCount} 条较早消息</div>` : ''}
    ${ratio > 1 ? `<div class="ctx-alert danger">⛔ 预计超出上下文窗口 ${formatTokens(ctx.total - ctx.limit)} tokens，请求可能报错。可开启自动截断、移出长消息、调小 max_tokens 或新建对话。</div>`
      : ratio > 0.8 ? '<div class="ctx-alert warn">⚠ 上下文额度占用已超 80%，建议精简历史或开启新对话。</div>' : ''}
    ${(lastUsage || sumPrompt || sumComp) ? `<div class="ctx-actual">
      ${lastUsage ? `<div>上次实际用量：输入 ${formatTokens(lastUsage.prompt)} · 输出 ${formatTokens(lastUsage.completion)} tokens</div>` : ''}
      ${(sumPrompt || sumComp) ? `<div>本对话累计真实消耗：输入 ${formatTokens(sumPrompt)} · 输出 ${formatTokens(sumComp)} · 共 ${formatTokens(sumPrompt + sumComp)} tokens</div>` : ''}
    </div>` : ''}
    <p class="hint">实时条为本地估算（中文≈1 token/字，英文≈3.8 字符/token，图片≈${IMAGE_TOKENS}），发送后显示 API 真实账单用量。</p>`;
  setBar(els.ctxDetail.querySelector('.meter-bar'));
}

function updateSendBtn() {
  const gen = state.generating && state.generating.convId === currentConv()?.id;
  els.btnSend.classList.toggle('stop', !!gen);
  els.btnSend.innerHTML = icon(gen ? 'stop' : 'send');
  els.btnSend.setAttribute('aria-label', gen ? '停止生成' : '发送');
  els.btnSend.title = gen ? '停止生成' : '发送';
}

// ======================= 附件 =======================
function readAs(file, method) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r[method](file);
  });
}

async function downscale(dataUrl, max = 2048) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.naturalWidth * scale);
  cv.height = Math.round(img.naturalHeight * scale);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.9);
}

async function addFiles(files) {
  for (const f of files) {
    try {
      if (f.type.startsWith('image/')) {
        let data = await readAs(f, 'readAsDataURL');
        if (f.size > 1.5e6 && f.type !== 'image/gif') data = await downscale(data);
        state.attachments.push({ kind: 'image', name: f.name || '粘贴的图片', data });
      } else if (f.size <= 2e6) {
        const text = await readAs(f, 'readAsText');
        if (text.includes('\u0000')) { toast(`不支持的二进制文件：${f.name}`); continue; }
        state.attachments.push({ kind: 'text', name: f.name, data: text });
      } else toast(`文件过大（>2MB）：${f.name}`);
    } catch { toast(`读取失败：${f.name}`); }
  }
  renderAttachments();
  updateMeter();
}

function renderAttachments() {
  els.attachList.replaceChildren(...state.attachments.map((a, i) => {
    const d = document.createElement('div');
    d.className = 'attach';
    d.title = a.name;
    if (a.kind === 'image') { const img = new Image(); img.src = a.data; img.alt = a.name; d.append(img); }
    else { const s = document.createElement('span'); s.className = 'fname'; s.textContent = `📄 ${a.name} (${formatTokens(estimateTokens(a.data))} tok)`; d.append(s); }
    const x = document.createElement('button');
    x.type = 'button'; x.textContent = '×'; x.dataset.idx = i; x.setAttribute('aria-label', `移除 ${a.name}`);
    d.append(x);
    return d;
  }));
}

function composeText() {
  const files = state.attachments.filter((a) => a.kind === 'text')
    .map((a) => `📎 文件：${a.name}\n\`\`\`\n${a.data}\n\`\`\``).join('\n\n');
  const text = els.input.value.trim();
  return [files, text].filter(Boolean).join('\n\n');
}

// ======================= 发送与生成 =======================
async function send() {
  if (state.generating) return;
  const conv = currentConv();
  const content = composeText();
  const images = state.attachments.filter((a) => a.kind === 'image').map((a) => a.data);
  if (!content && !images.length) return;
  ensureTarget(conv);
  if (!conv.providerId || !getProvider(conv.providerId)) { toast('请先添加 API 提供商'); openSettings('providers'); return; }
  if (!conv.model) { toast('请先选择或输入模型名称'); els.selModel.focus(); return; }

  conv.messages.push({ id: uid(), role: 'user', content, images, time: Date.now() });
  if (conv.title === '新对话') {
    conv.title = (els.input.value.trim() || state.attachments[0]?.name || '新对话').replace(/\s+/g, ' ').slice(0, 30);
    renderHeader();
  }
  if (conv === state.draft) { state.convs.push(conv); state.draft = null; }
  els.input.value = '';
  autosize();
  state.attachments = [];
  state.stick = true;
  renderAttachments();
  await generate(conv);
}

async function generate(conv) {
  const provider = getProvider(conv.providerId);
  if (!provider) { toast('该对话的 API 提供商已被删除，请重新选择模型'); return; }
  const ctx = computeContext(conv);
  const history = ctx.included;
  const systemText = expandPrompt(conv.systemPrompt, conv.model);
  const assistant = { id: uid(), role: 'assistant', content: '', reasoning: '', time: Date.now(), model: conv.model, pending: true };
  conv.messages.push(assistant);
  const controller = new AbortController();
  state.generating = { convId: conv.id, msgId: assistant.id, controller };
  conv.updatedAt = Date.now();
  renderConvList();
  renderMessages(true);
  updateMeter();
  updateSendBtn();

  try {
    const res = await sendChat({
      provider, model: conv.model, system: systemText, messages: history, params: conv.params, signal: controller.signal,
      onDelta: ({ content, reasoning }) => {
        if (content) assistant.content += content;
        if (reasoning) assistant.reasoning += reasoning;
        scheduleStreamRender(conv, assistant);
      },
    });
    if (res?.usage) assistant.usage = res.usage;
    if (res?.finish) assistant.finish = res.finish;
    if (!assistant.content && !assistant.reasoning) assistant.error = 'API 返回了空内容';
  } catch (e) {
    if (e.name === 'AbortError') assistant.stopped = true;
    else {
      let msg = e.message || String(e);
      if (e instanceof TypeError && /fetch/i.test(msg)) {
        if (hasLocalProxy()) {
          msg += provider.useProxy ? '\n（网络错误：请确认本地服务器正在运行，且 API 地址可访问）'
            : '\n（可能是浏览器跨域 CORS 限制，可在设置中勾选“通过本地服务器代理请求”）';
        } else {
          msg += '\n（可能是网络不通或该接口未开放浏览器跨域 CORS；如遇 CORS 限制，可在该提供商“高级选项”填入自定义代理）';
        }
      }
      assistant.error = msg;
    }
  } finally {
    assistant.pending = false;
    assistant.duration = Date.now() - assistant.time;
    if (!assistant.reasoning) delete assistant.reasoning;
    state.generating = null;
    conv.updatedAt = Date.now();
    await saveConvNow(conv);
    if (currentConv() === conv) { renderMessages(); updateMeter(); }
    renderConvList();
    updateSendBtn();
  }
}

function stopGeneration() {
  state.generating?.controller.abort();
}

// ======================= 消息操作 =======================
async function onMessageAction(act, msgEl) {
  const conv = currentConv();
  const idx = conv.messages.findIndex((m) => m.id === msgEl.dataset.id);
  const m = conv.messages[idx];
  if (!m) return;
  switch (act) {
    case 'copy': copyText(splitThink(m).content || m.content || m.error || ''); break;
    case 'toggle-ctx':
      m.excluded = !m.excluded;
      saveConvSoon(conv, 0);
      renderMessages();
      updateMeter();
      toast(m.excluded ? '已将该消息移出上下文' : '已重新纳入上下文');
      break;
    case 'delete':
      conv.messages.splice(idx, 1);
      saveConvSoon(conv, 0); renderMessages(); updateMeter(); renderConvList();
      break;
    case 'regen': {
      if (state.generating) return;
      conv.messages.splice(idx);
      if (!conv.messages.some((x) => x.role === 'user' && !x.excluded)) { renderMessages(); return; }
      await generate(conv);
      break;
    }
    case 'edit':
      state.editingMsgId = m.id;
      renderMessages();
      break;
    case 'edit-cancel':
      state.editingMsgId = null;
      renderMessages();
      break;
    case 'edit-save':
    case 'edit-send': {
      m.content = msgEl.querySelector('.edit-box textarea').value;
      state.editingMsgId = null;
      if (act === 'edit-send') {
        m.excluded = false;
        conv.messages.splice(idx + 1);
        state.stick = true;
        await saveConvNow(conv);
        await generate(conv);
      } else {
        saveConvSoon(conv, 0);
        renderMessages();
        updateMeter();
      }
      break;
    }
  }
}

function exportChatMarkdown() {
  const conv = currentConv();
  if (!conv?.messages.length) { toast('当前对话为空'); return; }
  let md = `# ${conv.title}\n\n> 模型：${conv.model} · 导出于 ${new Date().toLocaleString()}\n\n`;
  if (conv.systemPrompt?.trim()) md += `## 系统提示词\n\n${conv.systemPrompt}\n\n---\n\n`;
  for (const m of conv.messages) {
    if (m.error) continue;
    md += `### ${m.role === 'user' ? '🧑 用户' : `🤖 ${m.model || 'AI'}`}\n\n${m.content}\n\n`;
  }
  download(`${conv.title.replace(/[\\/:*?"<>|]/g, '_')}.md`, md, 'text/markdown');
}

// ======================= 设置对话框 =======================
function openSettings(tab = 'providers') {
  switchTab(tab);
  if (!state.editingProviderId || !getProvider(state.editingProviderId)) state.editingProviderId = state.settings.providers[0]?.id ?? null;
  renderProviders();
  els.set_theme.value = state.settings.theme;
  els.set_sendKey.value = state.settings.sendKey;
  els.set_fontSize.value = state.settings.fontSize;
  els.fontSizeVal.textContent = `${state.settings.fontSize}px`;
  if (!els.dlgSettings.open) els.dlgSettings.showModal();
}

function switchTab(tab) {
  els.dlgSettings.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  els.dlgSettings.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
}

function updateEndpointHint(p) {
  els.pf_endpoint.textContent = p ? `实际对话端点：${resolveEndpointPreview(p, p.models?.[0])}` : '';
}

function renderProviders() {
  const ps = state.settings.providers;
  els.providerList.replaceChildren(...ps.map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'prov-item' + (p.id === state.editingProviderId ? ' active' : '');
    b.dataset.id = p.id;
    const nm = document.createElement('span');
    nm.className = 'name';
    nm.textContent = p.name || '(未命名)';
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = `${PROVIDER_TYPES[p.type]} · ${p.models?.length ?? 0} 个模型`;
    b.append(nm, sub);
    return b;
  }));
  const p = getProvider(state.editingProviderId);
  els.providerEmpty.hidden = !!p;
  els.providerFields.hidden = !p;
  if (!p) return;
  els.pf_name.value = p.name;
  els.pf_type.value = p.type;
  els.pf_baseUrl.value = p.baseUrl;
  els.pf_apiKey.value = p.apiKey;
  els.ephemeralKeys.checked = !!state.settings.ephemeralKeys;
  els.pf_models.value = (p.models || []).join('\n');
  els.pf_proxyUrl.value = p.proxyUrl || '';
  els.pf_customHeaders.value = p.customHeaders || '';
  els.pf_useProxy.checked = !!p.useProxy;
  els.pf_useProxyWrap.hidden = !hasLocalProxy();
  els.pf_staticHint.hidden = hasLocalProxy();
  els.pf_streamUsage.checked = p.streamUsage !== false;
  els.pf_streamUsageWrap.hidden = p.type !== 'openai';
  els.pf_status.textContent = '';
  els.pf_status.className = 'status';
  updateEndpointHint(p);
}

function addProviderFromPreset(idx) {
  const pr = PRESETS[idx];
  const p = {
    id: uid(), name: pr.name, type: pr.type, baseUrl: pr.baseUrl, apiKey: pr.apiKey ?? '',
    models: [...pr.models], proxyUrl: '', customHeaders: '', useProxy: hasLocalProxy(), streamUsage: true,
  };
  state.settings.providers.push(p);
  state.editingProviderId = p.id;
  saveSettings();
  renderProviders();
  onProvidersChanged();
  (p.baseUrl ? els.pf_apiKey : els.pf_baseUrl).focus();
}

function onProvidersChanged() {
  const conv = currentConv();
  if (conv) {
    const before = conv.providerId;
    ensureTarget(conv);
    if (before !== conv.providerId) saveConvSoon(conv);
  }
  renderModelSelect();
  if (!conv?.messages.length) renderMessages();
}

function setStatus(text, cls = '') {
  els.pf_status.textContent = text;
  els.pf_status.className = `status ${cls}`;
}

async function fetchModels() {
  const p = getProvider(state.editingProviderId);
  if (!p) return;
  setStatus('正在拉取…');
  try {
    const models = await listModels(p);
    if (!models.length) { setStatus('未获取到模型', 'err'); return; }
    p.models = models;
    saveSettings();
    renderProviders();
    setStatus(`✓ 获取到 ${models.length} 个模型`, 'ok');
    onProvidersChanged();
  } catch (e) { setStatus('✗ ' + e.message, 'err'); }
}

async function testProvider() {
  const p = getProvider(state.editingProviderId);
  if (!p) return;
  setStatus('正在测试…');
  try {
    const models = await listModels(p);
    setStatus(`✓ 连接成功（${models.length} 个可用模型）`, 'ok');
    return;
  } catch (e1) {
    const model = p.models?.[0];
    if (!model) { setStatus('✗ ' + e1.message, 'err'); return; }
    try {
      let got = '';
      await sendChat({
        provider: p, model, system: '', messages: [{ role: 'user', content: 'Hi' }],
        params: { ...mergeParams(), max_tokens: 16, stream: false, enabled: { max_tokens: true } },
        onDelta: ({ content }) => { got += content || ''; },
      });
      setStatus(`✓ 对话测试成功（${model}）${got ? '：' + got.slice(0, 30) : ''}`, 'ok');
    } catch (e2) { setStatus('✗ ' + e2.message, 'err'); }
  }
}

// ======================= 提示词库 =======================
function openPrompts() {
  const ps = state.settings.prompts;
  if (!getPrompt(state.editingPromptId)) state.editingPromptId = ps[0]?.id ?? null;
  renderPrompts();
  if (!els.dlgPrompts.open) els.dlgPrompts.showModal();
}
const getPrompt = (id) => state.settings.prompts.find((p) => p.id === id);

function renderPrompts() {
  els.promptList.replaceChildren(...state.settings.prompts.map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'prov-item' + (p.id === state.editingPromptId ? ' active' : '');
    b.dataset.id = p.id;
    const nm = document.createElement('span');
    nm.className = 'name';
    nm.textContent = p.name || '(未命名)';
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = (p.content || '').slice(0, 28) || '空';
    b.append(nm, sub);
    return b;
  }));
  const p = getPrompt(state.editingPromptId);
  for (const id of ['pr_name', 'pr_content', 'pr_apply', 'pr_default', 'pr_delete']) els[id].disabled = !p;
  els.pr_clearDefault.disabled = !state.settings.defaultSystemPrompt;
  els.pr_name.value = p?.name ?? '';
  els.pr_content.value = p?.content ?? '';
  els.pr_tokens.textContent = p ? `≈ ${formatTokens(estimateTokens(p.content))} tokens` : '';
  const def = state.settings.defaultSystemPrompt;
  els.pr_defaultHint.textContent = def ? `当前新对话默认提示词：${def.slice(0, 60)}${def.length > 60 ? '…' : ''}` : '当前新对话默认不使用系统提示词。';
}

function applySystemPrompt(text) {
  const conv = currentConv();
  conv.systemPrompt = text;
  saveConvSoon(conv, 0);
  renderPanel();
  renderMessages();
  updateMeter();
}

// ======================= 数据导入导出 =======================
async function exportAll() {
  const settings = clone(state.settings);
  if (!els.exportKeys.checked) settings.providers.forEach((p) => { p.apiKey = ''; });
  const data = { app: 'nexus-chat', version: 1, exportedAt: new Date().toISOString(), settings, conversations: state.convs };
  download(`nexus-chat-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
}

async function importAll(file) {
  try {
    const data = JSON.parse(await file.text());
    const convs = Array.isArray(data) ? data : data.conversations || [];
    let added = 0;
    for (const c of convs) {
      if (!c?.id || !Array.isArray(c.messages)) continue;
      c.params = mergeParams(c.params);
      const i = state.convs.findIndex((x) => x.id === c.id);
      if (i >= 0) state.convs[i] = c; else state.convs.push(c);
      await db.put(c);
      added++;
    }
    if (data.settings && confirm('备份中包含设置（API 提供商、提示词等），是否一并导入？\n（同 ID 的提供商将被覆盖，其余保留）')) {
      const s = data.settings;
      for (const p of s.providers || []) {
        const i = state.settings.providers.findIndex((x) => x.id === p.id);
        if (i >= 0) { if (!p.apiKey) p.apiKey = state.settings.providers[i].apiKey; state.settings.providers[i] = p; }
        else state.settings.providers.push(p);
      }
      for (const p of s.prompts || []) if (!getPrompt(p.id)) state.settings.prompts.push(p);
      Object.assign(state.settings.modelMeta, s.modelMeta || {});
      saveSettings();
    }
    toast(`已导入 ${added} 个对话`);
    renderAll();
    renderProviders();
  } catch (e) { toast('导入失败：' + e.message); }
}

// ======================= 主题 / 布局 =======================
function applyTheme() {
  const t = state.settings.theme;
  document.querySelector('meta[name="color-scheme"]').content = t === 'light' || t === 'dark' ? t : 'light dark';
  document.documentElement.style.setProperty('--font-size', `${state.settings.fontSize}px`);
}

function closeMobile() { els.app.classList.remove('m-sidebar', 'm-panel'); }
function toggleSidebar() {
  if (isMobile()) { els.app.classList.remove('m-panel'); els.app.classList.toggle('m-sidebar'); }
  else els.app.classList.toggle('sidebar-hidden');
}
function togglePanel() {
  if (isMobile()) { els.app.classList.remove('m-sidebar'); els.app.classList.toggle('m-panel'); }
  else {
    els.app.classList.toggle('panel-hidden');
    localStorage.setItem('nexus.panelHidden', els.app.classList.contains('panel-hidden') ? '1' : '');
  }
}

function autosize() {
  const ta = els.input;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, innerHeight * 0.4) + 'px';
}

// ======================= 事件绑定 =======================
function bindEvents() {
  els.btnNewChat.addEventListener('click', newChat);
  els.btnSettings.addEventListener('click', () => openSettings());
  els.btnPrompts.addEventListener('click', openPrompts);
  els.btnOpenPrompts.addEventListener('click', openPrompts);
  els.btnToggleSidebar.addEventListener('click', toggleSidebar);
  els.btnTogglePanel.addEventListener('click', togglePanel);
  els.btnClosePanel.addEventListener('click', togglePanel);
  els.scrim.addEventListener('click', closeMobile);
  els.btnExportChat.addEventListener('click', exportChatMarkdown);
  els.searchConv.addEventListener('input', renderConvList);
  els.selModel.addEventListener('change', onModelChange);
  els.chatTitle.addEventListener('click', () => { const c = currentConv(); if (c) renameConv(c); });
  els.meter.addEventListener('click', () => openPanelTo('cardCtx'));
  els.topCtxBtn.addEventListener('click', () => openPanelTo('cardCtx'));
  els.topTempBtn.addEventListener('click', () => openPanelTo('cardParams'));

  // 对话列表
  els.convList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-op]');
    const item = e.target.closest('.conv-item');
    if (!btn || !item) return;
    const conv = state.convs.find((c) => c.id === item.dataset.id);
    if (!conv) return;
    const op = btn.dataset.op;
    if (op === 'open') selectConv(conv.id);
    else if (op === 'delete') deleteConv(conv.id);
    else if (op === 'rename') renameConv(conv);
    else if (op === 'pin') { conv.pinned = !conv.pinned; saveConvSoon(conv, 0); renderConvList(); }
  });

  // 消息区
  els.messages.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.copy-code');
    if (copyBtn) {
      copyText(copyBtn.closest('.code-block').querySelector('code').textContent);
      copyBtn.textContent = '已复制';
      setTimeout(() => { copyBtn.textContent = '复制'; }, 1500);
      return;
    }
    const img = e.target.closest('.images img');
    if (img) { els.dlgImageTag.src = img.src; els.dlgImage.showModal(); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'open-settings') { openSettings('providers'); return; }
    if (act === 'persona') { applySystemPrompt(a.dataset.prompt || ''); return; }
    if (act === 'edit-sys') { e.preventDefault(); openPanelTo('cardPrompt', els.sysPrompt); return; }
    if (act === 'suggest') { els.input.value = a.textContent; autosize(); els.input.focus(); scheduleMeter(); return; }
    const msgEl = a.closest('.msg');
    if (msgEl) onMessageAction(act, msgEl);
  });
  els.messages.addEventListener('scroll', () => {
    const b = els.messages;
    state.stick = b.scrollHeight - b.scrollTop - b.clientHeight < 80;
  }, { passive: true });

  // 输入框
  els.input.addEventListener('input', () => { autosize(); scheduleMeter(); });
  els.input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const shouldSend = state.settings.sendKey === 'ctrlEnter' ? ctrl : !e.shiftKey && !ctrl;
    if (shouldSend) { e.preventDefault(); send(); }
  });
  els.input.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  els.btnSend.addEventListener('click', () => {
    if (state.generating && state.generating.convId === currentConv()?.id) stopGeneration();
    else if (state.generating) toast('另一个对话正在生成中，请稍候');
    else send();
  });
  els.btnAttach.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => { addFiles([...els.fileInput.files]); els.fileInput.value = ''; });
  els.attachList.addEventListener('click', (e) => {
    const x = e.target.closest('button[data-idx]');
    if (!x) return;
    state.attachments.splice(Number(x.dataset.idx), 1);
    renderAttachments();
    updateMeter();
  });
  const comp = els.composer;
  comp.addEventListener('dragover', (e) => { e.preventDefault(); comp.classList.add('drag'); });
  comp.addEventListener('dragleave', () => comp.classList.remove('drag'));
  comp.addEventListener('drop', (e) => { e.preventDefault(); comp.classList.remove('drag'); addFiles([...e.dataTransfer.files]); });

  // 面板：上下文
  const convParam = (fn) => () => { const c = currentConv(); fn(c, c.params); saveConvSoon(c); renderPanel(); renderMessages(); updateMeter(); };
  els.ctxWindow.addEventListener('change', convParam((c, p) => {
    const n = Math.max(512, Math.round(Number(els.ctxWindow.value) || 0));
    p.contextWindow = n;
    if (c.model) { state.settings.modelMeta[c.model] = { contextWindow: n }; saveSettings(); }
  }));
  els.ctxChips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ctx]');
    if (!b) return;
    els.ctxWindow.value = b.dataset.ctx;
    els.ctxWindow.dispatchEvent(new Event('change'));
  });
  els.maxHistory.addEventListener('change', convParam((c, p) => { p.maxHistory = Math.max(0, Math.round(Number(els.maxHistory.value) || 0)); }));
  els.autoTrim.addEventListener('change', convParam((c, p) => { p.autoTrim = els.autoTrim.checked; }));
  els.streamToggle.addEventListener('change', convParam((c, p) => { p.stream = els.streamToggle.checked; }));

  // 面板：系统提示词
  els.sysPrompt.addEventListener('input', () => {
    const c = currentConv();
    c.systemPrompt = els.sysPrompt.value;
    els.sysTokens.textContent = `≈ ${formatTokens(estimateTokens(expandPrompt(c.systemPrompt, c.model)))} tokens`;
    saveConvSoon(c, 800);
    if (!c.messages.length) renderMessages();
    scheduleMeter();
  });
  els.sysPrompt.addEventListener('change', () => renderMessages());
  els.btnSavePrompt.addEventListener('click', () => {
    const content = els.sysPrompt.value.trim();
    if (!content) { toast('系统提示词为空'); return; }
    const name = prompt('模板名称', content.slice(0, 12));
    if (!name) return;
    const p = { id: uid(), name: name.trim(), content };
    state.settings.prompts.unshift(p);
    saveSettings();
    if (!currentConv().messages.length) renderMessages();
    toast('已保存到提示词库');
  });
  els.btnClearPrompt.addEventListener('click', () => {
    if (!els.sysPrompt.value) return;
    applySystemPrompt('');
    toast('已清空当前对话的系统提示词');
  });

  // 面板：生成参数
  els.paramList.addEventListener('input', (e) => {
    const row = e.target.closest('.param');
    if (!row) return;
    const c = currentConv();
    const k = row.dataset.key;
    const role = e.target.dataset.role;
    if (role === 'enabled') c.params.enabled[k] = e.target.checked;
    else {
      const v = Number(e.target.value);
      if (Number.isNaN(v) || e.target.value === '') return;
      c.params[k] = v;
      c.params.enabled[k] = true;
      if (role === 'range') row.querySelector('[data-role=num]').value = v;
      else row.querySelector('[data-role=range]').value = v;
    }
    row.querySelector('[data-role=enabled]').checked = c.params.enabled[k];
    row.classList.toggle('off', !c.params.enabled[k]);
    syncTempChips(c.params);
    saveConvSoon(c);
    scheduleMeter();
  });
  els.tempChips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-temp]');
    if (!b) return;
    const c = currentConv();
    if (b.dataset.temp === 'off') c.params.enabled.temperature = false;
    else {
      c.params.temperature = Number(b.dataset.temp);
      c.params.enabled.temperature = true;
    }
    saveConvSoon(c);
    renderPanel();
  });
  els.btnSaveDefault.addEventListener('click', () => {
    state.settings.defaultParams = clone(currentConv().params);
    saveSettings();
    toast('已设为新对话默认参数');
  });
  els.btnResetParams.addEventListener('click', () => {
    const c = currentConv();
    const ctxW = c.params.contextWindow;
    c.params = { ...clone(state.settings.defaultParams), contextWindow: ctxW };
    saveConvSoon(c);
    renderPanel();
    updateMeter();
    toast('已恢复为默认参数');
  });

  // 设置对话框
  els.dlgSettings.addEventListener('click', (e) => {
    const tab = e.target.closest('[role=tab]');
    if (tab) switchTab(tab.dataset.tab);
  });
  els.providerList.addEventListener('click', (e) => {
    const b = e.target.closest('.prov-item');
    if (!b) return;
    state.editingProviderId = b.dataset.id;
    renderProviders();
  });
  els.presetSelect.append(...PRESETS.map((p, i) => { const o = document.createElement('option'); o.value = i; o.textContent = p.name; return o; }));
  els.presetSelect.addEventListener('change', () => {
    if (els.presetSelect.value !== '') addProviderFromPreset(Number(els.presetSelect.value));
    els.presetSelect.value = '';
  });
  els.pf_type.append(...Object.entries(PROVIDER_TYPES).map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
  const pf = (field, getter, rerender = false) => () => {
    const p = getProvider(state.editingProviderId);
    if (!p) return;
    p[field] = getter();
    saveSettings();
    if (rerender) renderProviders();
    else {
      const item = els.providerList.querySelector(`.prov-item[data-id="${p.id}"]`);
      if (item) {
        item.querySelector('.name').textContent = p.name || '(未命名)';
        item.querySelector('.sub').textContent = `${PROVIDER_TYPES[p.type]} · ${p.models?.length ?? 0} 个模型`;
      }
      updateEndpointHint(p);
    }
    onProvidersChanged();
  };
  els.pf_name.addEventListener('input', pf('name', () => els.pf_name.value));
  els.pf_type.addEventListener('change', pf('type', () => els.pf_type.value, true));
  els.pf_baseUrl.addEventListener('input', pf('baseUrl', () => els.pf_baseUrl.value.trim()));
  els.pf_apiKey.addEventListener('input', pf('apiKey', () => els.pf_apiKey.value.trim()));
  els.ephemeralKeys.addEventListener('change', () => {
    state.settings.ephemeralKeys = els.ephemeralKeys.checked;
    saveSettings();
    toast(state.settings.ephemeralKeys ? '已开启公共电脑保护：关闭页面将自动清除密钥' : '已切换为长期记住 API Key');
  });
  els.pf_models.addEventListener('input', pf('models', () => [...new Set(els.pf_models.value.split('\n').map((s) => s.trim()).filter(Boolean))]));
  els.pf_proxyUrl.addEventListener('input', pf('proxyUrl', () => els.pf_proxyUrl.value.trim()));
  els.pf_customHeaders.addEventListener('input', pf('customHeaders', () => els.pf_customHeaders.value));
  els.pf_useProxy.addEventListener('change', pf('useProxy', () => els.pf_useProxy.checked));
  els.pf_streamUsage.addEventListener('change', pf('streamUsage', () => els.pf_streamUsage.checked));
  els.pf_toggleKey.addEventListener('click', () => {
    const show = els.pf_apiKey.type === 'password';
    els.pf_apiKey.type = show ? 'text' : 'password';
    els.pf_toggleKey.textContent = show ? '隐藏' : '显示';
  });
  els.pf_fetchModels.addEventListener('click', fetchModels);
  els.pf_test.addEventListener('click', testProvider);
  els.pf_delete.addEventListener('click', () => {
    const p = getProvider(state.editingProviderId);
    if (!p || !confirm(`确定删除提供商「${p.name}」？`)) return;
    state.settings.providers = state.settings.providers.filter((x) => x.id !== p.id);
    if (state.settings.lastTarget?.providerId === p.id) state.settings.lastTarget = null;
    state.editingProviderId = state.settings.providers[0]?.id ?? null;
    saveSettings();
    renderProviders();
    onProvidersChanged();
  });
  els.set_theme.addEventListener('change', () => { state.settings.theme = els.set_theme.value; saveSettings(); applyTheme(); });
  els.set_sendKey.addEventListener('change', () => {
    state.settings.sendKey = els.set_sendKey.value;
    saveSettings();
    updatePlaceholder();
  });
  els.set_fontSize.addEventListener('input', () => {
    state.settings.fontSize = Number(els.set_fontSize.value);
    els.fontSizeVal.textContent = `${state.settings.fontSize}px`;
    saveSettings();
    applyTheme();
  });
  els.btnExportAll.addEventListener('click', exportAll);
  els.btnImport.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', () => { const f = els.importFile.files[0]; if (f) importAll(f); els.importFile.value = ''; });
  els.btnWipeKeys.addEventListener('click', () => {
    if (!confirm('确定清除本机保存的所有 API Key？（提供商配置与聊天记录会保留）')) return;
    state.settings.providers.forEach((p) => { p.apiKey = ''; });
    sessionStorage.removeItem(KKEY);
    saveSettings();
    renderProviders();
    toast('已清除本机所有 API Key');
  });
  els.btnClearAll.addEventListener('click', async () => {
    if (!confirm('确定清空所有对话？此操作不可撤销（建议先导出备份）。')) return;
    stopGeneration();
    await db.clear();
    state.convs = [];
    state.draft = null;
    newChat();
    toast('已清空所有对话');
  });

  // 提示词库
  els.promptList.addEventListener('click', (e) => {
    const b = e.target.closest('.prov-item');
    if (!b) return;
    state.editingPromptId = b.dataset.id;
    renderPrompts();
  });
  els.pr_new.addEventListener('click', () => {
    const p = { id: uid(), name: '新提示词', content: '' };
    state.settings.prompts.unshift(p);
    state.editingPromptId = p.id;
    saveSettings();
    renderPrompts();
    els.pr_name.select();
  });
  els.pr_name.addEventListener('input', () => {
    const p = getPrompt(state.editingPromptId);
    if (!p) return;
    p.name = els.pr_name.value;
    saveSettings();
    const item = els.promptList.querySelector(`.prov-item[data-id="${p.id}"]`);
    if (item) item.querySelector('.name').textContent = p.name || '(未命名)';
  });
  els.pr_content.addEventListener('input', () => {
    const p = getPrompt(state.editingPromptId);
    if (!p) return;
    p.content = els.pr_content.value;
    els.pr_tokens.textContent = `≈ ${formatTokens(estimateTokens(p.content))} tokens`;
    saveSettings();
    const item = els.promptList.querySelector(`.prov-item[data-id="${p.id}"]`);
    if (item) item.querySelector('.sub').textContent = (p.content || '').slice(0, 28) || '空';
  });
  els.pr_apply.addEventListener('click', () => {
    const p = getPrompt(state.editingPromptId);
    if (!p) return;
    applySystemPrompt(p.content);
    els.dlgPrompts.close();
    toast(`已应用「${p.name}」`);
  });
  els.pr_default.addEventListener('click', () => {
    const p = getPrompt(state.editingPromptId);
    if (!p) return;
    state.settings.defaultSystemPrompt = p.content;
    saveSettings();
    renderPrompts();
    toast('已设为新对话默认系统提示词');
  });
  els.pr_clearDefault.addEventListener('click', () => {
    state.settings.defaultSystemPrompt = '';
    saveSettings();
    renderPrompts();
    toast('已取消默认系统提示词');
  });
  els.pr_delete.addEventListener('click', () => {
    const p = getPrompt(state.editingPromptId);
    if (!p || !confirm(`删除提示词「${p.name}」？`)) return;
    state.settings.prompts = state.settings.prompts.filter((x) => x.id !== p.id);
    state.editingPromptId = state.settings.prompts[0]?.id ?? null;
    saveSettings();
    renderPrompts();
    if (!currentConv().messages.length) renderMessages();
  });

  // 其他
  addEventListener('storage', (e) => { if (e.key === SKEY) { state.settings = loadSettings(); applyTheme(); renderHeader(); } });
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); newChat(); }
    if (e.key === 'Escape' && state.generating && !document.querySelector('dialog[open]')) stopGeneration();
  });
  // closedby="any" 的渐进增强：不支持的浏览器点击遮罩关闭
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = (e, d) => { const r = d.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
    for (const d of document.querySelectorAll('dialog[closedby="any"]')) {
      let down = false;
      d.addEventListener('pointerdown', (e) => { down = outside(e, d); });
      d.addEventListener('pointerup', (e) => { if (down && outside(e, d)) d.close(); });
    }
  }
}

function updatePlaceholder() {
  els.input.placeholder = state.settings.sendKey === 'ctrlEnter'
    ? '输入消息，Ctrl+Enter 发送，Enter 换行（可粘贴/拖入图片或文件）'
    : '输入消息，Enter 发送，Shift+Enter 换行（可粘贴/拖入图片或文件）';
}

// ======================= 启动 =======================
async function init() {
  hydrateIcons();
  applyTheme();
  await detectLocalProxy();
  buildParamList();
  bindEvents();
  updatePlaceholder();
  if (localStorage.getItem('nexus.panelHidden')) els.app.classList.add('panel-hidden');
  try {
    state.convs = (await db.getAll()).map((c) => ({ ...c, params: mergeParams(c.params) }));
    // 修复异常中断时残留的 pending 状态
    for (const c of state.convs) for (const m of c.messages) if (m.pending) { m.pending = false; m.stopped = true; }
  } catch (e) { toast('读取本地对话失败：' + e.message, 4000); }
  const latest = [...state.convs].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (latest) state.currentId = latest.id;
  else { state.draft = makeConv(); state.currentId = state.draft.id; }
  renderAll();
  if (!state.settings.providers.length) setTimeout(() => openSettings('providers'), 300);
  els.input.focus();
}

init();
