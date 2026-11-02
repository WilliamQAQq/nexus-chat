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
  compress: '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>',
  sparkle: '<path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/>',
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

function showModal(dlg) {
  if (!dlg.open) dlg.showModal();
  try {
    if (els.toast.matches(':popover-open')) { els.toast.hidePopover(); els.toast.showPopover(); }
  } catch {}
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
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制');
    return;
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    toast(ok ? '已复制' : '复制失败，请手动选择复制');
  } catch { toast('复制失败，请手动选择复制'); }
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
const sGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const sSet = (k, v) => {
  try { localStorage.setItem(k, v); }
  catch (e) { if (e?.name === 'QuotaExceededError') toast('本地存储空间已满'); }
};
const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch {} };
const ssDel = (k) => { try { sessionStorage.removeItem(k); } catch {} };
const DEFAULT_PARAMS = {
  temperature: 0.7, top_p: 1, max_tokens: 4096, presence_penalty: 0, frequency_penalty: 0,
  enabled: { temperature: true, top_p: false, max_tokens: true, presence_penalty: false, frequency_penalty: false },
  stream: true, contextWindow: 128000, maxHistory: 0, autoTrim: true, autoCompact: false,
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
  try { s = JSON.parse(sGet(SKEY) || '{}'); } catch {}
  const out = {
    providers: [], lastTarget: null, defaultSystemPrompt: '', modelMeta: {},
    theme: 'system', sendKey: 'enter', fontSize: 15, ephemeralKeys: false,
    ...s,
    prompts: s.prompts ?? DEFAULT_PROMPTS,
    defaultParams: mergeParams(s.defaultParams),
  };
  if (out.ephemeralKeys) {
    try {
      const kmap = JSON.parse(ssGet(KKEY) || '{}');
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
  compacting: null,     // { controller, kind: 'compact'|'summary' }
  summaryStyle: 'structured',
  summaryEditing: false,
  attachments: [],      // { kind:'image'|'text', name, data }
  editingProviderId: null,
  editingPromptId: null,
  editingMsgId: null,
  stick: true,
};

function saveSettings() {
  if (state.settings.ephemeralKeys) {
    const kmap = {};
    for (const p of state.settings.providers) if (p.apiKey) kmap[p.id] = p.apiKey;
    ssSet(KKEY, JSON.stringify(kmap));
    const stripped = clone(state.settings);
    for (const p of stripped.providers) p.apiKey = '';
    sSet(SKEY, JSON.stringify(stripped));
  } else {
    ssDel(KKEY);
    sSet(SKEY, JSON.stringify(state.settings));
  }
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
  const lp = lt && getProvider(lt.providerId);
  if (lp) {
    const model = (lt.model && (!lp.models?.length || lp.models.includes(lt.model))) ? lt.model : (lp.models?.[0] ?? lt.model ?? '');
    if (model || !ps.some((x) => x.models?.length)) return { providerId: lp.id, model };
  }
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
  const p = conv.providerId && getProvider(conv.providerId);
  if (p) {
    if (p.models?.length && (!conv.model || (!conv.messages.length && !p.models.includes(conv.model)))) {
      conv.model = p.models[0];
      conv.params.contextWindow = contextFor(conv.model);
    }
    return;
  }
  const t = defaultTarget();
  conv.providerId = t.providerId;
  conv.model = t.model;
  if (t.model) conv.params.contextWindow = contextFor(t.model);
}

function newChat() {
  if (state.generating) stopGeneration();
  if (state.compacting) stopCompaction();
  state.draft = makeConv();
  state.currentId = state.draft.id;
  state.editingMsgId = null;
  state.stick = true;
  state.attachments = [];
  els.input.value = '';
  autosize();
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
  if (state.compacting?.convId === id) stopCompaction();
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

// ======================= 上下文计算与压缩切分 =======================
const COMPACT_PREFIX = '【前文对话压缩摘要】\n';
const COMPACT_ACK = '我已了解上述前文背景与关键结论，请继续。';

function getCompactionSplit(conv) {
  const comp = conv?.compaction?.summary?.trim() ? conv.compaction : null;
  if (!comp) return { comp: null, upToIdx: -1, archived: [], active: conv?.messages ?? [] };
  const upToIdx = comp.upToMsgId ? conv.messages.findIndex((m) => m.id === comp.upToMsgId) : -1;
  const archived = upToIdx >= 0 ? conv.messages.slice(0, upToIdx + 1) : [];
  const active = upToIdx >= 0 ? conv.messages.slice(upToIdx + 1) : conv.messages;
  return { comp, upToIdx, archived, active };
}

function computeContext(conv, draftText = '', draftImages = 0) {
  const p = conv.params;
  const limit = Math.max(512, Number(p.contextWindow) || 128000);
  const resolvedSys = expandPrompt(conv.systemPrompt, conv.model);
  const sys = resolvedSys.trim() ? estimateTokens(resolvedSys) + 4 : 0;
  const reserve = p.enabled.max_tokens ? p.max_tokens : 0;
  const input = draftText || draftImages ? estimateTokens(draftText) + 4 + draftImages * IMAGE_TOKENS : 0;

  const { comp, archived, active } = getCompactionSplit(conv);
  const compMsgs = comp ? [
    { id: '__compact_u', role: 'user', content: COMPACT_PREFIX + comp.summary.trim() },
    { id: '__compact_a', role: 'assistant', content: COMPACT_ACK },
  ] : [];
  const compTokens = comp ? messageTokens(compMsgs[0]) + messageTokens(compMsgs[1]) : 0;
  const archivedValid = archived.filter((m) => !m.error && !m.pending && (m.content || m.images?.length));
  const archivedRaw = archivedValid.reduce((s, m) => s + messageTokens(m), 0);
  const savedTokens = comp ? Math.max(0, (archivedRaw || comp.originalTokens || 0) - compTokens) : 0;

  const budget = limit - reserve - sys - input - compTokens;
  const allNonErr = active.filter((m) => !m.error && !m.pending && (m.content || m.images?.length));
  const manualExcluded = allNonErr.filter((m) => m.excluded).length;
  const valid = allNonErr.filter((m) => !m.excluded);
  let includedActive;
  if (p.maxHistory > 0) {
    if (!draftText && !draftImages && valid.at(-1)?.role === 'user') {
      includedActive = [...valid.slice(0, -1).slice(-p.maxHistory), valid.at(-1)];
    } else {
      includedActive = valid.slice(-p.maxHistory);
    }
  } else includedActive = valid.slice();
  let history = includedActive.reduce((s, m) => s + messageTokens(m), 0);
  const limitedByCount = valid.length - includedActive.length;
  let trimmedByWindow = 0;
  if (p.autoTrim) {
    while (includedActive.length > 1 && history > budget) {
      history -= messageTokens(includedActive.shift());
      trimmedByWindow++;
    }
  }
  const included = [...compMsgs, ...includedActive];
  const used = sys + compTokens + history + input;
  return {
    sys, comp: compTokens, history, input, reserve, used, total: used + reserve, limit,
    includedIds: new Set(includedActive.map((m) => m.id)), included,
    includedActiveCount: includedActive.length,
    limitedByCount, trimmedByWindow, manualExcluded, totalMsgs: allNonErr.length,
    hasCompaction: !!comp, archivedCount: archivedValid.length || comp?.compressedCount || 0, savedTokens,
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
    .filter((c) => !q
      || c.title.toLowerCase().includes(q)
      || c.compaction?.summary?.toLowerCase().includes(q)
      || c.summary?.content?.toLowerCase().includes(q)
      || c.messages.some((m) => m.content?.toLowerCase().includes(q)));
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
    item.querySelector('.conv-sub').textContent = `${c.messages.length} 条消息${c.compaction?.summary ? ' · 📦' : ''} · ${relTime(c.updatedAt)}`;
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
  const trimmed = content.trimStart();
  if (!reasoning && trimmed.startsWith('<think>')) {
    const end = trimmed.indexOf('</think>');
    if (end < 0) { reasoning = trimmed.slice(7).trimStart(); content = ''; }
    else { reasoning = trimmed.slice(7, end).trim(); content = trimmed.slice(end + 8).trimStart(); }
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
  const { comp, archived, active } = getCompactionSplit(conv);
  if (!conv || (!conv.messages.length && !comp)) { box.replaceChildren(welcomeEl()); return; }
  const prevSysOpen = box.querySelector('details.sys-banner')?.open ?? false;
  const prevArcOpen = box.querySelector('details.compact-archive')?.open ?? false;
  const prevCmpEl = box.querySelector('details.compact-banner');
  const prevCmpOpen = prevCmpEl ? prevCmpEl.open : !conv.messages.length;

  const ctx = computeContext(conv);
  const inner = document.createElement('div');
  inner.className = 'messages-inner';
  if (conv.systemPrompt?.trim()) {
    const d = document.createElement('details');
    d.className = 'sys-banner';
    d.open = prevSysOpen;
    d.innerHTML = `<summary><span class="sys-sum"></span><button class="btn sm" type="button" data-act="edit-sys">编辑</button></summary><div class="sys-text"></div>`;
    d.querySelector('.sys-sum').textContent = `⚙ 系统提示词 · 约 ${formatTokens(ctx.sys)} tokens`;
    d.querySelector('.sys-text').textContent = conv.systemPrompt;
    inner.append(d);
  }
  if (archived.length) {
    const arc = document.createElement('details');
    arc.className = 'compact-archive';
    arc.open = prevArcOpen;
    const sum = document.createElement('summary');
    sum.textContent = `📦 已压缩归档早期对话（${archived.length} 条原始消息 · 已由下方摘要替代发送，点击展开查看）`;
    const list = document.createElement('div');
    list.className = 'compact-archive-list';
    archived.forEach((m) => list.append(messageEl(m, conv, ctx, true)));
    arc.append(sum, list);
    inner.append(arc);
  }
  if (comp) {
    const cb = document.createElement('details');
    cb.className = 'compact-banner';
    cb.open = prevCmpOpen;
    cb.innerHTML = `<summary>
      <span class="compact-title"><span class="cmp-label"></span></span>
      <span class="row-btns" style="margin:0">
        <button class="btn sm" type="button" data-act="compact-open">编辑</button>
        <button class="btn sm" type="button" data-act="compact-copy">复制</button>
        <button class="btn sm danger" type="button" data-act="compact-revoke">撤销</button>
      </span>
    </summary><div class="compact-body md"></div>`;
    cb.querySelector('.cmp-label').textContent = `✨ 上下文压缩摘要 · 约 ${formatTokens(ctx.comp)} tokens`;
    if (ctx.savedTokens > 0) {
      const badge = document.createElement('span');
      badge.className = 'tag ok';
      badge.textContent = `已省 ≈ ${formatTokens(ctx.savedTokens)} tokens`;
      cb.querySelector('.compact-title').append(badge);
    }
    cb.querySelector('.compact-body').innerHTML = renderMarkdown(comp.summary);
    inner.append(cb);
  }
  active.forEach((m) => inner.append(messageEl(m, conv, ctx, false)));
  const prevTop = box.scrollTop;
  box.replaceChildren(inner);
  if (forceBottom || state.stick) box.scrollTop = box.scrollHeight;
  else box.scrollTop = prevTop;
}

function messageEl(m, conv, ctx, isArchived = false) {
  const el = document.createElement('article');
  el.className = `msg ${m.role}`;
  el.dataset.id = m.id;
  if (m.error) el.classList.add('error');
  else if (!isArchived && !m.pending && !ctx.includedIds.has(m.id)) el.classList.add('excluded');
  el.innerHTML = `<div class="avatar">${m.role === 'user' ? '你' : 'AI'}</div>
    <div class="msg-body"><div class="msg-meta"></div><div class="msg-content"></div><div class="msg-actions"></div></div>`;
  fillMeta(el, m, ctx, isArchived);
  if (state.editingMsgId === m.id) fillEditor(el, m);
  else fillContent(el, m);
  fillActions(el, m, isArchived);
  return el;
}

function fillMeta(el, m, ctx, isArchived = false) {
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
  if (isArchived && !m.error) {
    add('已归档压缩', 'tag info');
  } else if (ctx && !m.pending && !m.error && !ctx.includedIds.has(m.id)) {
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
    if (m.content) {
      const t = document.createElement('div');
      t.className = 'user-text';
      t.textContent = m.content;
      c.append(t);
    }
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
    if (m.pending && !content && !reasoning) {
      if (m.compactingHint) {
        const hint = document.createElement('div');
        hint.className = 'note';
        hint.textContent = m.compactingHint;
        md.append(hint);
      } else {
        md.innerHTML = '<div class="typing"><i></i><i></i><i></i></div>';
      }
    } else md.innerHTML = renderMarkdown(content) + (m.pending ? '<span class="cursor"></span>' : '');
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

function fillActions(el, m, isArchived = false) {
  const a = el.querySelector('.msg-actions');
  if (m.pending || state.editingMsgId === m.id) { a.replaceChildren(); return; }
  const busy = !!(state.generating || state.compacting);
  const btn = (act, ic, title, disabled = false) =>
    `<button class="icon-btn sm" type="button" data-act="${act}" title="${title}" aria-label="${title}"${disabled ? ' disabled' : ''}>${icon(ic)}</button>`;
  let html = btn('copy', 'copy', '复制');
  if (!m.error && !isArchived) {
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
  els.autoCompact.checked = !!p.autoCompact;
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
    const [s, c, h, i, r] = bar.querySelectorAll('.seg');
    s.style.width = pct(ctx.sys);
    c.style.width = pct(ctx.comp);
    h.style.width = pct(ctx.history);
    i.style.width = pct(ctx.input);
    r.style.width = pct(ctx.reserve);
  };
  setBar(els.meterBar);
  els.meter.className = `meter ${level}`;
  const trimmed = ctx.trimmedByWindow + ctx.limitedByCount + ctx.manualExcluded;
  els.meterText.textContent = `上下文 ${formatTokens(ctx.used)} / ${formatTokens(ctx.limit)}` +
    (ctx.hasCompaction ? ` · 📦已压缩${ctx.savedTokens ? '(省' + formatTokens(ctx.savedTokens) + ')' : ''}` : '') +
    (ctx.reserve ? ` · 预留 ${formatTokens(ctx.reserve)}` : '') + (trimmed ? ` · 已排除 ${trimmed} 条` : '');
  els.inputTokens.textContent = ctx.input ? `本条 ≈ ${formatTokens(ctx.input)}` : '';

  // 顶栏上下文胶囊
  const totalPct = Math.round(ratio * 100);
  els.topCtxBtn.textContent = `${ctx.hasCompaction ? '📦' : '📊'} ${formatTokens(ctx.used)}/${formatTokens(ctx.limit)} (${totalPct}%)`;
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
    <div class="meter-bar"><i class="seg sys"></i><i class="seg cmp"></i><i class="seg hist"></i><i class="seg inp"></i><i class="seg res"></i></div>
    <div class="ctx-rows">
      <i class="dot" style="background:var(--seg-sys)"></i><span>系统提示词</span><span class="num">${formatTokens(ctx.sys)}</span>
      ${ctx.hasCompaction ? `<i class="dot" style="background:var(--seg-cmp)"></i><span>压缩摘要（替代 ${ctx.archivedCount} 条${ctx.savedTokens ? '，省 ' + formatTokens(ctx.savedTokens) : ''}）</span><span class="num">${formatTokens(ctx.comp)}</span>` : ''}
      <i class="dot" style="background:var(--seg-hist)"></i><span>携带历史（${ctx.includedActiveCount}/${ctx.totalMsgs} 条）</span><span class="num">${formatTokens(ctx.history)}</span>
      <i class="dot" style="background:var(--seg-inp)"></i><span>正在输入</span><span class="num">${formatTokens(ctx.input)}</span>
      <i class="dot seg res"></i><span>预留输出 (max_tokens)</span><span class="num">${formatTokens(ctx.reserve)}</span>
      <i></i><span><b>剩余可用额度</b></span><span class="num"><b>${free >= 0 ? formatTokens(free) : '-' + formatTokens(-free)}</b></span>
    </div>
    ${ctx.manualExcluded ? `<div class="ctx-alert warn">👁 已手动移出 ${ctx.manualExcluded} 条消息（可点击消息下方眼睛图标恢复）</div>` : ''}
    ${ctx.trimmedByWindow ? `<div class="ctx-alert warn">⚠ 已自动截断最早的 ${ctx.trimmedByWindow} 条消息以适应窗口（建议改用“压缩上下文”保留早期记忆）</div>` : ''}
    ${ctx.limitedByCount ? `<div class="ctx-alert warn">ℹ 受“携带历史条数”限制，排除了 ${ctx.limitedByCount} 条较早消息</div>` : ''}
    ${ratio > 1 ? `<div class="ctx-alert danger">⛔ 预计超出上下文窗口 ${formatTokens(ctx.total - ctx.limit)} tokens，请求可能报错。建议点击上方“压缩上下文”浓缩早期历史，或调小 max_tokens。</div>`
      : ratio > 0.8 ? '<div class="ctx-alert warn">⚠ 上下文额度占用已超 80%，可使用“压缩上下文”大幅节省 Token 且不丢关键背景。</div>' : ''}
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
  const ctx2d = cv.getContext('2d');
  ctx2d.fillStyle = '#ffffff';
  ctx2d.fillRect(0, 0, cv.width, cv.height);
  ctx2d.drawImage(img, 0, 0, cv.width, cv.height);
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
  if (state.generating || state.compacting) return;
  const conv = currentConv();
  const content = composeText();
  const images = state.attachments.filter((a) => a.kind === 'image').map((a) => a.data);
  if (!content && !images.length) return;
  ensureTarget(conv);
  if (!conv.providerId || !getProvider(conv.providerId)) { openSettings('providers'); toast('请先添加 API 提供商'); return; }
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
    if (conv.params.autoCompact) {
      const preCtx = computeContext(conv);
      if (preCtx.total / preCtx.limit >= 0.8) {
        const didCompact = await maybeAutoCompactBeforeSend(conv, provider, assistant, controller.signal);
        if (didCompact && currentConv() === conv) {
          renderMessages(true);
          updateMeter();
        }
      }
    }
    const ctx = computeContext(conv);
    const history = ctx.included;
    const systemText = expandPrompt(conv.systemPrompt, conv.model);
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
    delete assistant.compactingHint;
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

function stopCompaction() {
  state.compacting?.controller.abort();
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
      if (conv.compaction?.upToMsgId === m.id) {
        conv.compaction.upToMsgId = idx > 0 ? conv.messages[idx - 1].id : null;
      }
      conv.messages.splice(idx, 1);
      saveConvSoon(conv, 0); renderMessages(); updateMeter(); renderConvList();
      break;
    case 'regen': {
      if (state.generating || state.compacting) return;
      conv.messages.splice(idx);
      if (conv.compaction?.upToMsgId) {
        const upIdx = conv.messages.findIndex((x) => x.id === conv.compaction.upToMsgId);
        if (upIdx < 0) conv.compaction = null;
      }
      const { active } = getCompactionSplit(conv);
      if (!active.some((x) => x.role === 'user' && !x.excluded)) {
        saveConvSoon(conv, 0);
        renderMessages();
        updateMeter();
        renderConvList();
        return;
      }
      await saveConvNow(conv);
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
      const val = msgEl.querySelector('.edit-box textarea').value;
      if (!val.trim() && !m.images?.length) { toast('消息内容不能为空'); return; }
      m.content = val;
      delete m.error;
      delete m.stopped;
      state.editingMsgId = null;
      if (act === 'edit-send') {
        if (state.generating || state.compacting) return;
        m.excluded = false;
        conv.messages.splice(idx + 1);
        if (conv.compaction?.upToMsgId) {
          const upIdx = conv.messages.findIndex((x) => x.id === conv.compaction.upToMsgId);
          if (upIdx < 0) conv.compaction = null;
        }
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
  if (!conv?.messages.length && !conv?.summary?.content && !conv?.compaction?.summary) {
    toast('当前对话为空');
    return;
  }
  let md = `# ${conv.title}\n\n> 模型：${conv.model} · 导出于 ${new Date().toLocaleString()}\n\n`;
  if (conv.systemPrompt?.trim()) md += `## 系统提示词\n\n${conv.systemPrompt}\n\n---\n\n`;
  if (conv.summary?.content?.trim()) md += `## 📝 对话总结\n\n${conv.summary.content.trim()}\n\n---\n\n`;
  if (conv.compaction?.summary?.trim()) md += `## 📦 上下文压缩摘要\n\n${conv.compaction.summary.trim()}\n\n---\n\n`;
  for (const m of conv.messages) {
    if (m.error) continue;
    const { content, reasoning } = splitThink(m);
    let body = [m.images?.length ? `*[包含 ${m.images.length} 张图片]*` : '', content].filter(Boolean).join('\n\n');
    if (m.role === 'assistant' && reasoning) {
      const quoted = reasoning.split('\n').map((l) => `> ${l}`).join('\n');
      body = `> 💭 **思考过程**：\n${quoted}\n\n` + body;
    }
    md += `### ${m.role === 'user' ? '🧑 用户' : `🤖 ${m.model || 'AI'}`}\n\n${body}\n\n`;
  }
  const safeName = conv.title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'chat';
  download(`${safeName}.md`, md, 'text/markdown');
}

// ======================= 设置对话框 =======================
function maskKeyInput() {
  els.pf_apiKey.type = 'password';
  els.pf_toggleKey.textContent = '显示';
}

function openSettings(tab = 'providers') {
  switchTab(tab);
  if (!state.editingProviderId || !getProvider(state.editingProviderId)) state.editingProviderId = state.settings.providers[0]?.id ?? null;
  maskKeyInput();
  renderProviders();
  els.set_theme.value = state.settings.theme;
  els.set_sendKey.value = state.settings.sendKey;
  els.set_fontSize.value = state.settings.fontSize;
  els.fontSizeVal.textContent = `${state.settings.fontSize}px`;
  showModal(els.dlgSettings);
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
  maskKeyInput();
  saveSettings();
  renderProviders();
  onProvidersChanged();
  (p.baseUrl ? els.pf_apiKey : els.pf_baseUrl).focus();
}

function onProvidersChanged() {
  const conv = currentConv();
  if (conv) {
    const beforeProv = conv.providerId;
    const beforeModel = conv.model;
    ensureTarget(conv);
    if (beforeProv !== conv.providerId || beforeModel !== conv.model) saveConvSoon(conv);
  }
  renderHeader();
  renderPanel();
  updateMeter();
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
  const model = p.models?.[0];
  if (model) {
    try {
      let got = '';
      await sendChat({
        provider: p, model, system: '', messages: [{ role: 'user', content: 'Hi' }],
        params: { ...mergeParams(), max_tokens: 32, stream: false, enabled: { max_tokens: true } },
        onDelta: ({ content, reasoning }) => { got += content || reasoning || ''; },
      });
      setStatus(`✓ 对话测试成功（${model}）${got ? '：' + got.trim().slice(0, 30) : ''}`, 'ok');
      return;
    } catch (e) {
      setStatus('✗ ' + e.message, 'err');
      return;
    }
  }
  try {
    const models = await listModels(p);
    setStatus(`✓ 接口可达（发现 ${models.length} 个模型，请先拉取或填写模型名称）`, 'ok');
  } catch (e) { setStatus('✗ ' + e.message, 'err'); }
}

// ======================= 提示词库 =======================
function openPrompts() {
  const ps = state.settings.prompts;
  if (!getPrompt(state.editingPromptId)) state.editingPromptId = ps[0]?.id ?? null;
  renderPrompts();
  showModal(els.dlgPrompts);
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
      if (typeof s.defaultSystemPrompt === 'string') state.settings.defaultSystemPrompt = s.defaultSystemPrompt;
      if (s.defaultParams) state.settings.defaultParams = mergeParams(s.defaultParams);
      if (s.theme) state.settings.theme = s.theme;
      if (s.sendKey) state.settings.sendKey = s.sendKey;
      if (s.fontSize) state.settings.fontSize = Number(s.fontSize) || 15;
      els.set_theme.value = state.settings.theme;
      els.set_sendKey.value = state.settings.sendKey;
      els.set_fontSize.value = state.settings.fontSize;
      els.fontSizeVal.textContent = `${state.settings.fontSize}px`;
      applyTheme();
      updatePlaceholder();
      saveSettings();
    }
    if (currentConv() === state.draft && !state.draft.messages.length && !state.draft.compaction && state.convs.length) {
      state.currentId = [...state.convs].sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
    } else if (currentConv()) ensureTarget(currentConv());
    toast(`已导入 ${added} 个对话`);
    renderAll();
    renderProviders();
  } catch (e) { toast('导入失败：' + e.message); }
}

// ======================= 上下文压缩与对话总结 =======================
const SUMMARY_PROMPTS = {
  structured: {
    name: '结构化纪要',
    prompt: '请将整段对话整理为一份结构清晰的 Markdown 对话纪要，包含：\n1. **主题与背景**：核心诉求或探讨议题；\n2. **讨论脉络与关键分析**：重要推理步骤、方案对比或思路演进；\n3. **核心结论与最终方案**：明确达成的结论、关键参数/配置或交付成果；\n4. **后续建议**：可继续深入的方向或注意事项。',
  },
  bullets: {
    name: '核心要点',
    prompt: '请以极高信息密度提炼整段对话的核心要点（Markdown 格式）：\n- 先用 1~2 句话给出 **TL;DR 一句话总结**；\n- 再用精炼的分点列表列出全部关键事实、结论与重要细节（去除过程性寒暄与重复内容）。',
  },
  tech: {
    name: '技术与代码复盘',
    prompt: '请从工程与技术复盘视角总结本段对话（Markdown 格式），包含：\n1. **问题定义 / 需求目标**；\n2. **根因分析或技术选型**；\n3. **关键实现与变更点**（保留核心文件路径、函数签名、命令、配置项或关键代码片段）；\n4. **注意事项 / 边界条件与后续待优化项**。',
  },
  todos: {
    name: '待办行动项',
    prompt: '请从行动导向提炼本段对话（Markdown 格式），包含：\n1. **已确认决议**：已经敲定的方案与前提；\n2. **待办行动清单**：使用 `- [ ]` 任务列表列出具体可执行的下一步动作（可标注优先级或前置条件）；\n3. **待确认问题 / 潜在风险**。',
  },
};

function validMessagesOf(conv) {
  return (conv?.messages || []).filter((m) => !m.error && !m.pending && (m.content || m.images?.length));
}

function formatTranscript(msgs) {
  return msgs
    .filter((m) => !m.excluded)
    .map((m, idx) => {
      const role = m.role === 'user' ? '用户' : `助手(${m.model || 'AI'})`;
      const clean = (m.role === 'assistant' ? splitThink(m).content : m.content) || '';
      const clipped = clean.length > 12000 ? clean.slice(0, 12000) + '\n…[单条过长已截断]' : clean;
      const imgNote = m.images?.length ? `[附带 ${m.images.length} 张图片]\n` : '';
      return `### #${idx + 1} ${role}\n${imgNote}${clipped}`;
    })
    .join('\n\n');
}

function populateModelPicker(sel, conv) {
  const prev = sel.value;
  sel.replaceChildren();
  const ps = state.settings.providers;
  if (!ps.length) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = '— 尚未配置 API —';
    sel.append(o);
    return;
  }
  for (const p of ps) {
    const g = document.createElement('optgroup');
    g.label = p.name;
    const models = [...(p.models || [])];
    if (conv?.providerId === p.id && conv.model && !models.includes(conv.model)) models.unshift(conv.model);
    for (const m of models) {
      const o = document.createElement('option');
      o.value = `${p.id}${SEP}${m}`;
      o.textContent = conv?.providerId === p.id && conv.model === m ? `${m}（当前对话）` : m;
      g.append(o);
    }
    if (g.children.length) sel.append(g);
  }
  const curVal = conv?.providerId && conv.model ? `${conv.providerId}${SEP}${conv.model}` : '';
  if (curVal && [...sel.options].some((o) => o.value === curVal)) sel.value = curVal;
  else if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

function getSelectedTarget(sel, conv) {
  const v = sel?.value || '';
  if (v.includes(SEP)) {
    const [providerId, model] = v.split(SEP);
    const provider = getProvider(providerId);
    if (provider && model) return { provider, model };
  }
  if (conv) ensureTarget(conv);
  const provider = getProvider(conv?.providerId);
  return provider && conv?.model ? { provider, model: conv.model } : null;
}

function planCompaction(conv, keepCount) {
  const validAll = validMessagesOf(conv);
  const keep = Math.max(0, Math.round(Number(keepCount) || 0));
  const compressCount = Math.max(0, validAll.length - keep);
  const slice = validAll.slice(0, compressCount);
  const kept = validAll.slice(compressCount);
  const upToMsgId = slice.at(-1)?.id ?? null;
  const toSummarize = slice.filter((m) => !m.excluded);
  const sliceTokens = toSummarize.reduce((s, m) => s + messageTokens(m), 0);

  const prev = conv?.compaction?.summary?.trim() ? conv.compaction : null;
  const prevIdx = prev?.upToMsgId ? validAll.findIndex((m) => m.id === prev.upToMsgId) : -1;
  let incremental = false;
  let baseSummary = '';
  let deltaMsgs = toSummarize;
  let originalTokens = sliceTokens;

  if (prev && compressCount > 0) {
    if (!prev.upToMsgId) {
      incremental = true;
      baseSummary = prev.summary.trim();
      deltaMsgs = toSummarize;
      originalTokens = (prev.originalTokens || estimateTokens(baseSummary)) + sliceTokens;
    } else if (prevIdx >= 0 && prevIdx < compressCount - 1) {
      incremental = true;
      baseSummary = prev.summary.trim();
      deltaMsgs = validAll.slice(prevIdx + 1, compressCount).filter((m) => !m.excluded);
      const deltaTok = deltaMsgs.reduce((s, m) => s + messageTokens(m), 0);
      originalTokens = Math.max(sliceTokens, (prev.originalTokens || 0) + deltaTok);
    }
    if (incremental && !deltaMsgs.length) {
      incremental = false;
      deltaMsgs = toSummarize;
    }
  }
  return {
    validAll, keep, compressCount, slice, kept, upToMsgId,
    toSummarize, incremental, baseSummary, deltaMsgs, originalTokens,
  };
}

async function requestCompactionSummary({ provider, model, plan, focus = '', stream = true, signal, onProgress }) {
  const sys = '你是一名专业的 AI 对话上下文压缩引擎。请将给定的早期对话高密度浓缩为供后续对话继续使用的「上下文记忆摘要」。\n' +
    '核心要求：\n' +
    '1. 完整保留用户的核心目标、偏好设定、约束条件、已确认的结论与决策；\n' +
    '2. 精确保留关键技术细节：文件路径、函数/类名、接口协议、配置参数、关键代码片段、报错信息及已排除的错误方案；\n' +
    '3. 明确列出当前进展与尚未解决的问题/下一步待办；\n' +
    '4. 语言精炼、条理清晰（使用紧凑的 Markdown 分点），剔除寒暄、重复尝试与冗余铺垫，不编造对话中未出现的信息，直接输出摘要正文。';
  const focusLine = focus.trim() ? `\n\n【用户特别指定需重点保留的内容】：${focus.trim()}` : '';
  const userPrompt = plan.incremental
    ? `以下是此前已归档的前序上下文摘要，以及后续新增的对话记录。请将二者合并更新为一份完整、连贯、去重后的最新上下文压缩摘要：${focusLine}\n\n<existing_summary>\n${plan.baseSummary}\n</existing_summary>\n\n<new_messages>\n${formatTranscript(plan.deltaMsgs)}\n</new_messages>`
    : `请将以下早期对话记录浓缩为上下文压缩摘要：${focusLine}\n\n<conversation>\n${formatTranscript(plan.toSummarize)}\n</conversation>`;

  const isReasoning = /^(o[134](-|$)|gpt-5|deepseek-reasoner)/i.test(model);
  let raw = '';
  await sendChat({
    provider,
    model,
    system: sys,
    messages: [{ role: 'user', content: userPrompt }],
    params: {
      ...mergeParams(),
      temperature: 0.2,
      max_tokens: 2048,
      stream: stream !== false,
      enabled: { temperature: !isReasoning, top_p: false, max_tokens: true, presence_penalty: false, frequency_penalty: false },
    },
    signal,
    onDelta: ({ content, reasoning }) => {
      if (content) raw += content;
      onProgress?.({ ...splitThink({ content: raw }), apiReasoning: reasoning });
    },
  });
  return (splitThink({ content: raw }).content || raw).trim();
}

async function maybeAutoCompactBeforeSend(conv, provider, assistant, signal) {
  const { active } = getCompactionSplit(conv);
  const activeValid = active.filter((m) => !m.error && !m.pending && (m.content || m.images?.length));
  if (activeValid.length < 3) return false;
  const keep = activeValid.length >= 5 ? 3 : 1;
  let cutIdx = activeValid.length - keep - 1;
  if (cutIdx > 0 && activeValid[cutIdx + 1]?.role === 'assistant') cutIdx -= 1;
  if (cutIdx < 0) return false;
  const boundaryMsg = activeValid[cutIdx];
  const validAll = validMessagesOf(conv);
  const bIdx = validAll.findIndex((m) => m.id === boundaryMsg.id);
  if (bIdx < 0) return false;
  const plan = planCompaction(conv, validAll.length - 1 - bIdx);
  if (!plan.toSummarize.length && !plan.incremental) return false;

  assistant.compactingHint = '📦 上下文占用已达 80%+，正在自动压缩早期历史…';
  scheduleStreamRender(conv, assistant);
  try {
    const summary = await requestCompactionSummary({
      provider, model: conv.model, plan, focus: '', stream: conv.params.stream, signal,
    });
    delete assistant.compactingHint;
    if (!summary) return false;
    conv.compaction = {
      id: uid(), upToMsgId: plan.upToMsgId, summary,
      compressedCount: plan.compressCount, originalTokens: plan.originalTokens,
      model: conv.model, updatedAt: Date.now(),
    };
    await saveConvNow(conv);
    toast('📦 已自动压缩早期上下文并释放窗口额度');
    return true;
  } catch (err) {
    delete assistant.compactingHint;
    if (err.name === 'AbortError') throw err;
    toast('自动压缩未生效（' + (err.message || err) + '），已继续常规发送');
    return false;
  }
}

function openCompact(tab = 'compact', preserveBoundary = false) {
  const conv = currentConv();
  if (!conv) return;
  populateModelPicker(els.cp_model, conv);
  populateModelPicker(els.sm_model, conv);

  const validAll = validMessagesOf(conv);
  if (conv.compaction?.summary) {
    const activeValid = getCompactionSplit(conv).active.filter((m) => !m.error && !m.pending && (m.content || m.images?.length));
    els.cp_keep.value = (!preserveBoundary && activeValid.length > 4) ? 4 : activeValid.length;
    els.cp_summary.value = conv.compaction.summary;
  } else {
    const n = validAll.length;
    els.cp_keep.value = n >= 6 ? 4 : n >= 4 ? 2 : n === 3 ? 1 : 0;
    els.cp_summary.value = '';
  }
  els.cp_status.textContent = '';
  els.cp_status.className = 'status';
  els.sm_status.textContent = '';
  els.sm_status.className = 'status';

  if (conv.summary?.style && SUMMARY_PROMPTS[conv.summary.style]) state.summaryStyle = conv.summary.style;
  state.summaryEditing = false;
  updateCompactPreview();
  renderSummaryTab();
  syncCompactBusyUI();
  switchCompactTab(tab);
  showModal(els.dlgCompact);
}

function switchCompactTab(tab) {
  els.dlgCompact.querySelectorAll('[data-ctab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ctab === tab)));
  els.dlgCompact.querySelectorAll('[data-cpanel]').forEach((p) => { p.hidden = p.dataset.cpanel !== tab; });
}

function syncCompactBusyUI() {
  const kind = state.compacting?.kind || null;
  els.cp_generate.innerHTML = kind === 'compact' ? `${icon('stop')}停止生成` : `${icon('sparkle')}AI 生成压缩摘要`;
  els.cp_generate.disabled = kind === 'summary';
  els.sm_generate.innerHTML = kind === 'summary' ? `${icon('stop')}停止生成` : `${icon('sparkle')}AI 生成对话总结`;
  els.sm_generate.disabled = kind === 'compact';
  updateCompactPreview();
  updateSummaryButtons();
}

function updateCompactPreview() {
  const conv = currentConv();
  if (!conv) return;
  const plan = planCompaction(conv, els.cp_keep.value);
  els.cp_keepChips.querySelectorAll('[data-keep]').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.keep) === plan.keep);
  });
  const draftSummary = els.cp_summary.value.trim();
  const sumTok = draftSummary
    ? messageTokens({ role: 'user', content: COMPACT_PREFIX + draftSummary }) + messageTokens({ role: 'assistant', content: COMPACT_ACK })
    : 0;
  const saved = draftSummary ? Math.max(0, plan.originalTokens - sumTok) : 0;
  els.cp_tokens.textContent = draftSummary
    ? `（携带约 ${formatTokens(sumTok)} tokens${saved > 0 ? ` · 预计净省 ≈ ${formatTokens(saved)} tokens` : ''}）`
    : '（支持 AI 自动提炼或手动输入背景摘要）';

  const modeHint = plan.incremental
    ? `增量合并模式：将在既有摘要基础上并入新增的 <b>${plan.deltaMsgs.length}</b> 条消息`
    : `全量提炼模式：将压缩最早的 <b>${plan.compressCount}</b> 条消息（原约 <b>${formatTokens(plan.originalTokens)}</b> tokens）`;
  els.cp_stats.innerHTML = plan.validAll.length
    ? `当前对话共 <b>${plan.validAll.length}</b> 条有效消息 · 待压缩归档 <b>${plan.compressCount}</b> 条 · 保留近期原文 <b>${plan.kept.length}</b> 条<br><span class="dim">${modeHint}；原始消息仅折叠归档，随时可展开查阅或一键撤销恢复。</span>`
    : (conv.compaction?.summary
      ? `当前为携带前序摘要的对话（摘要约 <b>${formatTokens(sumTok)}</b> tokens）· 尚未发送新消息，可直接编辑下方背景摘要。`
      : `当前对话暂无消息 · 你也可以直接在下方预先输入长背景摘要作为前置上下文。`);

  els.cp_revoke.hidden = !conv.compaction?.summary;
  els.cp_apply.disabled = !!state.compacting || !draftSummary;
}

async function runCompactAI() {
  if (state.compacting?.kind === 'compact') { stopCompaction(); return; }
  if (state.generating || state.compacting) { toast('请等待当前生成任务完成'); return; }
  const conv = currentConv();
  const target = getSelectedTarget(els.cp_model, conv);
  if (!target) { openSettings('providers'); toast('请先配置 API 提供商与模型'); return; }
  const plan = planCompaction(conv, els.cp_keep.value);
  if (!plan.toSummarize.length && !plan.incremental) {
    toast(plan.validAll.length ? '待压缩消息数为 0，请调小“保留最近几条消息”' : '当前对话暂无可压缩的消息');
    return;
  }

  const controller = new AbortController();
  state.compacting = { kind: 'compact', convId: conv.id, controller };
  syncCompactBusyUI();
  els.cp_status.textContent = '正在提炼压缩摘要…';
  els.cp_status.className = 'status';
  const prevVal = els.cp_summary.value;
  els.cp_summary.value = '';

  try {
    const summary = await requestCompactionSummary({
      provider: target.provider,
      model: target.model,
      plan,
      focus: els.cp_focus.value,
      stream: conv.params.stream,
      signal: controller.signal,
      onProgress: ({ content, reasoning, apiReasoning }) => {
        if (content) {
          els.cp_summary.value = content;
          els.cp_status.textContent = '正在流式生成摘要…';
          updateCompactPreview();
        } else if (reasoning || apiReasoning) {
          els.cp_status.textContent = '💭 模型正在思考提炼中…';
        }
      },
    });
    if (!summary) throw new Error('模型返回了空摘要');
    els.cp_summary.value = summary;
    els.cp_status.textContent = '✓ 已生成压缩摘要，确认无误后点击下方「应用压缩」即可生效';
    els.cp_status.className = 'status ok';
  } catch (e) {
    if (e.name === 'AbortError') {
      if (!els.cp_summary.value.trim()) els.cp_summary.value = prevVal;
      els.cp_status.textContent = '⏹ 已停止生成';
      els.cp_status.className = 'status';
    } else {
      if (!els.cp_summary.value.trim()) els.cp_summary.value = prevVal;
      els.cp_status.textContent = '✗ ' + (e.message || e);
      els.cp_status.className = 'status err';
    }
  } finally {
    state.compacting = null;
    syncCompactBusyUI();
    if (currentConv() === conv) renderMessages();
  }
}

async function applyCompaction() {
  const conv = currentConv();
  if (!conv) return;
  const summary = els.cp_summary.value.trim();
  if (!summary) { toast('压缩摘要内容不能为空'); return; }
  const plan = planCompaction(conv, els.cp_keep.value);
  const selectedModel = getSelectedTarget(els.cp_model, conv)?.model || conv.model || '';
  conv.compaction = {
    id: conv.compaction?.id || uid(),
    upToMsgId: plan.upToMsgId,
    summary,
    compressedCount: plan.upToMsgId ? plan.compressCount : (conv.compaction?.compressedCount || 0),
    originalTokens: plan.upToMsgId ? plan.originalTokens : (conv.compaction?.originalTokens || 0),
    model: selectedModel,
    updatedAt: Date.now(),
  };
  conv.updatedAt = Date.now();
  if (conv === state.draft) { state.convs.push(conv); state.draft = null; }
  els.dlgCompact.close();
  renderAll();
  const ctx = computeContext(conv);
  toast(ctx.savedTokens > 0 ? `📦 已应用上下文压缩，净省约 ${formatTokens(ctx.savedTokens)} tokens` : '📦 已应用上下文压缩摘要');
  await saveConvNow(conv);
}

async function revokeCompaction() {
  const conv = currentConv();
  if (!conv?.compaction) return;
  conv.compaction = null;
  conv.updatedAt = Date.now();
  if (els.dlgCompact.open) els.dlgCompact.close();
  renderMessages();
  updateMeter();
  renderConvList();
  toast('已撤销压缩，原始消息已完整恢复至上下文');
  await saveConvNow(conv);
}

function extractSummaryParts(raw, allowTitle) {
  if (!allowTitle) return { title: '', body: raw, waitingHeader: false };
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('<!--') && !trimmed.includes('-->')) {
    return { title: '', body: '', waitingHeader: true };
  }
  const m = /^\s*<!--\s*title:\s*([\s\S]*?)\s*-->\s*\n?/i.exec(raw);
  if (m) {
    const title = m[1].replace(/[\r\n]+/g, ' ').trim().replace(/^["'「『《]+|["'」』》]+$/g, '').slice(0, 36);
    return { title, body: raw.slice(m[0].length).trimStart(), waitingHeader: false };
  }
  return { title: '', body: raw, waitingHeader: false };
}

function updateSummaryButtons() {
  const conv = currentConv();
  const hasText = !!(conv?.summary?.content?.trim());
  const busy = !!state.compacting;
  for (const id of ['sm_copy', 'sm_export', 'sm_toCompact', 'sm_fork']) els[id].disabled = !hasText || busy;
  els.sm_toggleEdit.disabled = busy;
  els.sm_toggleEdit.innerHTML = state.summaryEditing ? `${icon('eye')}预览渲染` : `${icon('edit')}编辑 Markdown`;
}

function renderSummaryTab() {
  const conv = currentConv();
  els.sm_styles.querySelectorAll('[data-style]').forEach((b) => {
    b.classList.toggle('active', b.dataset.style === state.summaryStyle);
  });
  const text = conv?.summary?.content || '';
  if (document.activeElement !== els.sm_raw) els.sm_raw.value = text;
  if (text.trim()) {
    els.sm_view.innerHTML = renderMarkdown(text);
    els.sm_view.classList.remove('empty');
  } else {
    els.sm_view.textContent = '尚未生成对话总结。选择上方模板风格后，点击「AI 生成对话总结」即可提炼完整纪要，也可直接点击「编辑 Markdown」手写总结。';
    els.sm_view.classList.add('empty');
  }
  els.sm_view.hidden = state.summaryEditing;
  els.sm_raw.hidden = !state.summaryEditing;
  updateSummaryButtons();
}

async function runSummaryAI() {
  if (state.compacting?.kind === 'summary') { stopCompaction(); return; }
  if (state.generating || state.compacting) { toast('请等待当前生成任务完成'); return; }
  const conv = currentConv();
  const target = getSelectedTarget(els.sm_model, conv);
  if (!target) { openSettings('providers'); toast('请先配置 API 提供商与模型'); return; }
  const msgs = validMessagesOf(conv).filter((m) => !m.excluded);
  const carrySummary = (!conv.compaction?.upToMsgId && conv.compaction?.summary?.trim()) ? conv.compaction.summary.trim() : '';
  if (!msgs.length && !carrySummary) { toast('当前对话暂无可总结的消息'); return; }

  const styleCfg = SUMMARY_PROMPTS[state.summaryStyle] || SUMMARY_PROMPTS.structured;
  const wantTitle = els.sm_autoTitle.checked;
  const sys = '你是一名专业的对话分析与知识整理助手。请严格忠于对话事实进行总结，切勿编造未提及的内容。\n' +
    styleCfg.prompt +
    (wantTitle ? '\n\n额外要求：请在回复的第一行严格按此格式输出一个精炼准确的对话标题（18 字以内，不要加引号或书名号）：\n<!-- title: 这里填写标题 -->\n从第二行起直接输出 Markdown 总结正文。' : '');

  const parts = [];
  if (carrySummary) parts.push(`<prior_summary>\n${carrySummary}\n</prior_summary>`);
  if (msgs.length) parts.push(`<conversation>\n${formatTranscript(msgs)}\n</conversation>`);

  const controller = new AbortController();
  state.compacting = { kind: 'summary', convId: conv.id, controller };
  state.summaryEditing = false;
  syncCompactBusyUI();
  els.sm_status.textContent = `正在生成「${styleCfg.name}」…`;
  els.sm_status.className = 'status';

  const prevSummary = conv.summary ? clone(conv.summary) : null;
  const isReasoning = /^(o[134](-|$)|gpt-5|deepseek-reasoner)/i.test(target.model);
  let raw = '';
  let appliedTitle = '';

  try {
    await sendChat({
      provider: target.provider,
      model: target.model,
      system: sys,
      messages: [{ role: 'user', content: `请总结以下对话内容：\n\n${parts.join('\n\n')}` }],
      params: {
        ...mergeParams(),
        temperature: 0.2,
        max_tokens: 2048,
        stream: conv.params.stream !== false,
        enabled: { temperature: !isReasoning, top_p: false, max_tokens: true, presence_penalty: false, frequency_penalty: false },
      },
      signal: controller.signal,
      onDelta: ({ content, reasoning }) => {
        if (content) raw += content;
        const thought = splitThink({ content: raw });
        if (!thought.content && (thought.reasoning || reasoning)) {
          els.sm_status.textContent = '💭 模型正在思考整理中…';
          return;
        }
        const parsed = extractSummaryParts(thought.content, wantTitle);
        if (parsed.title && parsed.title !== appliedTitle) {
          appliedTitle = parsed.title;
          conv.title = appliedTitle;
          renderHeader();
          renderConvList();
        }
        if (!parsed.waitingHeader && parsed.body) {
          conv.summary = { content: parsed.body, style: state.summaryStyle, model: target.model, updatedAt: Date.now() };
          renderSummaryTab();
          els.sm_status.textContent = '正在流式生成总结…';
        }
      },
    });
    const finalClean = splitThink({ content: raw }).content || raw;
    const finalParsed = extractSummaryParts(finalClean, wantTitle);
    if (finalParsed.title && wantTitle) {
      appliedTitle = finalParsed.title;
      conv.title = appliedTitle;
      renderHeader();
      renderConvList();
    }
    const finalBody = finalParsed.body.trim();
    if (!finalBody) throw new Error('模型返回了空总结');
    conv.summary = { content: finalBody, style: state.summaryStyle, model: target.model, updatedAt: Date.now() };
    conv.updatedAt = Date.now();
    if (conv === state.draft) { state.convs.push(conv); state.draft = null; }
    await saveConvNow(conv);
    renderSummaryTab();
    els.sm_status.textContent = `✓ 总结完成${appliedTitle ? ` · 标题已更新为「${appliedTitle}」` : ''}`;
    els.sm_status.className = 'status ok';
  } catch (e) {
    if (e.name === 'AbortError') {
      if (!conv.summary?.content?.trim() && prevSummary) conv.summary = prevSummary;
      els.sm_status.textContent = '⏹ 已停止生成';
      els.sm_status.className = 'status';
    } else {
      if (!conv.summary?.content?.trim() && prevSummary) conv.summary = prevSummary;
      els.sm_status.textContent = '✗ ' + (e.message || e);
      els.sm_status.className = 'status err';
    }
    renderSummaryTab();
  } finally {
    state.compacting = null;
    syncCompactBusyUI();
    if (currentConv() === conv) renderMessages();
  }
}

async function applySummaryAsCompaction() {
  const conv = currentConv();
  const summary = conv?.summary?.content?.trim();
  if (!summary) { toast('请先生成或输入对话总结'); return; }
  const validAll = validMessagesOf(conv);
  const upToMsgId = validAll.at(-1)?.id ?? null;
  const origTokens = validAll.filter((m) => !m.excluded).reduce((s, m) => s + messageTokens(m), 0);
  conv.compaction = {
    id: conv.compaction?.id || uid(),
    upToMsgId,
    summary,
    compressedCount: validAll.length || conv.compaction?.compressedCount || 0,
    originalTokens: origTokens || conv.compaction?.originalTokens || 0,
    model: conv.summary?.model || conv.model || '',
    updatedAt: Date.now(),
  };
  conv.updatedAt = Date.now();
  if (conv === state.draft) { state.convs.push(conv); state.draft = null; }
  els.dlgCompact.close();
  renderAll();
  toast('📦 已将对话总结应用为上下文压缩摘要');
  await saveConvNow(conv);
}

async function forkWithSummary() {
  const conv = currentConv();
  const summary = conv?.summary?.content?.trim();
  if (!summary) { toast('请先生成或输入对话总结'); return; }
  const validAll = validMessagesOf(conv);
  const origTokens = validAll.filter((m) => !m.excluded).reduce((s, m) => s + messageTokens(m), 0);
  const nc = makeConv();
  nc.providerId = conv.providerId;
  nc.model = conv.model;
  nc.systemPrompt = conv.systemPrompt;
  nc.params = clone(conv.params);
  nc.title = (conv.title && conv.title !== '新对话' ? `${conv.title.replace(/（续）$/, '')}（续）` : '续接对话').slice(0, 36);
  nc.compaction = {
    id: uid(),
    upToMsgId: null,
    summary,
    compressedCount: validAll.length || conv.compaction?.compressedCount || 0,
    originalTokens: origTokens || conv.compaction?.originalTokens || 0,
    model: conv.summary?.model || conv.model || '',
    updatedAt: Date.now(),
  };
  state.convs.push(nc);
  state.currentId = nc.id;
  state.editingMsgId = null;
  state.stick = true;
  els.dlgCompact.close();
  renderAll();
  els.input.focus();
  toast('✨ 已携带对话总结开启新对话');
  await saveConvNow(nc);
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
    sSet('nexus.panelHidden', els.app.classList.contains('panel-hidden') ? '1' : '');
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
  els.btnCompact.addEventListener('click', () => openCompact('compact'));
  els.btnOpenCompact.addEventListener('click', () => openCompact('compact'));
  els.btnOpenSummary.addEventListener('click', () => openCompact('summary'));
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
    if (img) { els.dlgImageTag.src = img.src; showModal(els.dlgImage); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'open-settings') { openSettings('providers'); return; }
    if (act === 'persona') { applySystemPrompt(a.dataset.prompt || ''); return; }
    if (act === 'edit-sys') { e.preventDefault(); openPanelTo('cardPrompt', els.sysPrompt); return; }
    if (act === 'compact-open') { e.preventDefault(); openCompact('compact', true); return; }
    if (act === 'compact-copy') { e.preventDefault(); copyText(currentConv()?.compaction?.summary || ''); return; }
    if (act === 'compact-revoke') { e.preventDefault(); revokeCompaction(); return; }
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
  els.autoCompact.addEventListener('change', convParam((c, p) => { p.autoCompact = els.autoCompact.checked; }));
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
    maskKeyInput();
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
  els.pf_baseUrl.addEventListener('input', pf('baseUrl', () => els.pf_baseUrl.value.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()));
  els.pf_apiKey.addEventListener('input', pf('apiKey', () => els.pf_apiKey.value.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()));
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
    ssDel(KKEY);
    saveSettings();
    renderProviders();
    toast('已清除本机所有 API Key');
  });
  els.btnClearAll.addEventListener('click', async () => {
    if (!confirm('确定清空所有对话？此操作不可撤销（建议先导出备份）。')) return;
    stopGeneration();
    stopCompaction();
    await db.clear();
    state.convs = [];
    state.draft = null;
    newChat();
    toast('已清空所有对话');
  });

  // 上下文压缩与对话总结对话框
  els.dlgCompact.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-ctab]');
    if (tab) switchCompactTab(tab.dataset.ctab);
  });
  els.dlgCompact.addEventListener('close', () => {
    if (state.compacting) stopCompaction();
    els.dlgCompact.returnValue = '';
  });
  els.cp_keep.addEventListener('input', () => {
    const n = Math.max(0, Math.round(Number(els.cp_keep.value) || 0));
    if (String(n) !== els.cp_keep.value && els.cp_keep.value !== '') els.cp_keep.value = n;
    updateCompactPreview();
  });
  els.cp_keepChips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-keep]');
    if (!b) return;
    els.cp_keep.value = b.dataset.keep;
    updateCompactPreview();
  });
  els.cp_focus.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); runCompactAI(); }
  });
  els.cp_summary.addEventListener('input', updateCompactPreview);
  els.cp_summary.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); applyCompaction(); }
  });
  els.cp_generate.addEventListener('click', runCompactAI);
  els.cp_apply.addEventListener('click', applyCompaction);
  els.cp_revoke.addEventListener('click', revokeCompaction);

  els.sm_styles.addEventListener('click', (e) => {
    const b = e.target.closest('[data-style]');
    if (!b) return;
    state.summaryStyle = b.dataset.style;
    renderSummaryTab();
  });
  els.sm_generate.addEventListener('click', runSummaryAI);
  els.sm_toggleEdit.addEventListener('click', () => {
    state.summaryEditing = !state.summaryEditing;
    renderSummaryTab();
    if (state.summaryEditing) els.sm_raw.focus();
  });
  els.sm_raw.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      state.summaryEditing = false;
      renderSummaryTab();
    }
  });
  els.sm_raw.addEventListener('input', () => {
    const conv = currentConv();
    if (!conv) return;
    conv.summary = {
      content: els.sm_raw.value,
      style: state.summaryStyle,
      model: conv.summary?.model || conv.model || '',
      updatedAt: Date.now(),
    };
    if (conv === state.draft && els.sm_raw.value.trim()) { state.convs.push(conv); state.draft = null; renderConvList(); }
    saveConvSoon(conv, 500);
    updateSummaryButtons();
  });
  els.sm_copy.addEventListener('click', () => {
    const text = currentConv()?.summary?.content?.trim();
    if (text) copyText(text);
  });
  els.sm_export.addEventListener('click', () => {
    const conv = currentConv();
    const text = conv?.summary?.content?.trim();
    if (!text) return;
    const md = `# ${conv.title} — 对话总结\n\n> 生成于 ${new Date().toLocaleString()}\n\n${text}\n`;
    const safeName = (conv.title || 'summary').replace(/[\\/:*?"<>|]/g, '_').trim() || 'summary';
    download(`${safeName}-总结.md`, md, 'text/markdown');
  });
  els.sm_toCompact.addEventListener('click', applySummaryAsCompaction);
  els.sm_fork.addEventListener('click', forkWithSummary);

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
  addEventListener('storage', (e) => {
    if (e.key === SKEY) {
      state.settings = loadSettings();
      applyTheme();
      renderHeader();
      renderPanel();
      if (!currentConv()?.messages.length) renderMessages();
    }
  });
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
  if (sGet('nexus.panelHidden')) els.app.classList.add('panel-hidden');
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
