// 世界书 (World Info / Lorebook) 触发匹配引擎与规范导入导出 (SillyTavern 兼容)

import { estimateTokens } from './tokens.js';
import { expandCharacterMacros } from './character.js';

const uid = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

// ======================= 条目标准化 =======================
export function normalizeLorebookEntry(e = {}) {
  const parseKeys = (k) => {
    if (Array.isArray(k)) return k.map((x) => String(x).trim()).filter(Boolean);
    if (typeof k === 'string') return k.split(/[,，\n]/).map((x) => x.trim()).filter(Boolean);
    return [];
  };

  return {
    id: e.id || e.uid || uid(),
    name: (e.comment || e.name || e.key || '未命名条目').trim(),
    keys: parseKeys(e.keys || e.key),
    secondary_keys: parseKeys(e.secondary_keys || e.secondarykeys || e.keysecondary),
    selective: !!(e.selective || (e.secondary_keys?.length && e.selective !== false)),
    constant: !!(e.constant || e.always_active),
    enabled: e.enabled !== false && e.disable !== true,
    position: e.position || 'after_sys', // 'before_sys' | 'after_sys' | 'before_char' | 'after_char'
    order: Number.isFinite(Number(e.order ?? e.insertion_order)) ? Number(e.order ?? e.insertion_order) : 100,
    content: (e.content || '').trim(),
  };
}

export function parseLorebookJson(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const rawEntries = data.entries || data.items || data;
  let entriesList = [];

  if (Array.isArray(rawEntries)) {
    entriesList = rawEntries;
  } else if (rawEntries && typeof rawEntries === 'object') {
    entriesList = Object.values(rawEntries);
  }

  const normalized = {
    id: data.id || uid(),
    name: (data.name || data.title || '未命名世界书').trim(),
    description: (data.description || '').trim(),
    scan_depth: Math.max(0, Math.round(Number(data.scan_depth ?? data.scanDepth ?? 5))),
    entries: entriesList.map(normalizeLorebookEntry),
    createdAt: data.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  return normalized;
}

export function exportLorebookJson(book) {
  // 按照 SillyTavern 标准 World Info 字典导出
  const entriesMap = {};
  book.entries.forEach((e, idx) => {
    entriesMap[String(idx)] = {
      uid: idx,
      key: e.keys,
      keysecondary: e.secondary_keys,
      comment: e.name,
      content: e.content,
      constant: e.constant,
      selective: e.selective,
      order: e.order,
      position: e.position,
      disable: !e.enabled,
    };
  });

  return {
    name: book.name,
    description: book.description,
    scan_depth: book.scan_depth,
    entries: entriesMap,
  };
}

// ======================= 关键词匹配引擎 =======================
function testKey(key, text) {
  if (!key || !text) return false;
  // 支持 /pattern/flags 正则格式
  if (key.startsWith('/') && key.lastIndexOf('/') > 0) {
    try {
      const lastSlash = key.lastIndexOf('/');
      const pattern = key.slice(1, lastSlash);
      const flags = key.slice(lastSlash + 1) || 'i';
      const reg = new RegExp(pattern, flags);
      return reg.test(text);
    } catch {}
  }

  // 纯文本模糊大小写匹配
  return text.toLowerCase().includes(key.toLowerCase());
}

export function isLoreEntryTriggered(entry, scanText) {
  if (!entry.enabled || !entry.content) return false;
  if (entry.constant) return true;
  if (!entry.keys?.length) return false;

  // 主关键词：任一命中即满足主条件
  const primaryMatch = entry.keys.some((k) => testKey(k, scanText));
  if (!primaryMatch) return false;

  // 次关键词：若开启 selective 且有次关键词，需至少命中一个次关键词
  if (entry.selective && entry.secondary_keys?.length) {
    return entry.secondary_keys.some((k) => testKey(k, scanText));
  }

  return true;
}

// ======================= 上下文扫描与注入 =======================
export function scanLorebooks(lorebooks, { messages = [], draftText = '', scanDepth = 5, charName = '', userName = '' } = {}) {
  const books = Array.isArray(lorebooks) ? lorebooks.filter(Boolean) : [lorebooks].filter(Boolean);
  if (!books.length) {
    return { activeEntries: [], activeTokens: 0, injectedText: '', byPosition: { before_sys: '', after_sys: '', before_char: '', after_char: '' } };
  }

  // 构建扫描文本窗口：包含输入草稿 + 最近 scanDepth 条消息内容
  const scanParts = [draftText];
  const depth = scanDepth > 0 ? scanDepth : messages.length;
  const recent = messages.filter((m) => !m.error && !m.pending && m.content).slice(-depth);
  recent.forEach((m) => scanParts.push(m.content));
  const scanText = scanParts.join('\n\n');

  const triggered = [];
  const seenContent = new Set();

  for (const book of books) {
    for (const entry of book.entries || []) {
      if (isLoreEntryTriggered(entry, scanText)) {
        const expanded = expandCharacterMacros(entry.content, { charName, userName });
        if (!seenContent.has(expanded)) {
          seenContent.add(expanded);
          triggered.push({
            bookId: book.id,
            bookName: book.name,
            entryId: entry.id,
            name: entry.name,
            position: entry.position || 'after_sys',
            order: entry.order ?? 100,
            content: expanded,
            tokens: estimateTokens(expanded),
          });
        }
      }
    }
  }

  // 按 order 升序排序
  triggered.sort((a, b) => a.order - b.order);

  const byPos = { before_sys: [], after_sys: [], before_char: [], after_char: [] };
  let totalTokens = 0;
  triggered.forEach((item) => {
    totalTokens += item.tokens;
    (byPos[item.position] || byPos.after_sys).push(`【${item.name}】：\n${item.content}`);
  });

  const byPosition = {
    before_sys: byPos.before_sys.join('\n\n'),
    after_sys: byPos.after_sys.join('\n\n'),
    before_char: byPos.before_char.join('\n\n'),
    after_char: byPos.after_char.join('\n\n'),
  };

  const allBlocks = [...byPos.before_sys, ...byPos.after_sys, ...byPos.before_char, ...byPos.after_char];
  const injectedText = allBlocks.length ? `[World Info / 世界书背景信息]:\n\n${allBlocks.join('\n\n')}` : '';

  return {
    activeEntries: triggered,
    activeTokens: totalTokens,
    injectedText,
    byPosition,
  };
}
