// 世界书 (World Info / Lorebook) 触发匹配引擎与规范导入导出 (SillyTavern 兼容)

import { estimateTokens } from './tokens.js';
import { expandCharacterMacros } from './character.js';

const uid = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

const SECTION_LABELS = {
  demographics: { label: '人口统计与身份背景', defaultKeys: ['身份', '背景', '籍贯', '年龄', '来历', '国民警卫队'] },
  physical_traits: { label: '体貌与生理特征', defaultKeys: ['体貌', '外貌', '长相', '面容', '身体', '手', '身高', '体质'] },
  linguistic_skills: { label: '语言能力与沟通口音', defaultKeys: ['语言', '拉丁文', '俄语', '英语', '普通话', '口音', '说话', '母语'] },
  tactical_and_practical_skills: { label: '战术技能与实用知识', defaultKeys: ['战术', '技能', '军事', '黑火药', '急救', '医药', '化学', '清创', '包扎'] },
  dimensional_storage: { label: '随身空间与物品储备', defaultKeys: ['随身空间', '空间', '背包', '储物', '物品', '物资', '装备'] },
  vulnerabilities_and_constraints: { label: '生存红线与弱点约束', defaultKeys: ['弱点', '约束', '破绽', '危险', '秘密', '穿帮', '审判', '拷问', '禁忌'], isConstant: true },
  personality: { label: '性格与心理特征', defaultKeys: ['性格', '脾气', '心理', '作风'] },
  background: { label: '过往经历与历史背景', defaultKeys: ['经历', '过去', '历史', '回忆'] },
  factions: { label: '阵营势力与社会关系', defaultKeys: ['势力', '阵营', '组织', '关系'] },
  magic_system: { label: '异能与超自然法则', defaultKeys: ['异能', '能力', '魔法', '法术', '法则'] },
  inventory: { label: '随身物品与道具装备', defaultKeys: ['道具', '装备', '随身物品'] },
};

function extractKeywords(str) {
  if (!str || typeof str !== 'string') return [];
  const set = new Set();
  const rawClean = str.replace(/[《》【】""''`]/g, '').trim();
  if (rawClean.length >= 2 && rawClean.length <= 25) set.add(rawClean);

  const parts = rawClean.split(/[/(),（）|·\n\s:：\-—]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  for (const p of parts) {
    set.add(p);
    const withoutNum = p.replace(/^[\d.,]+(克|公斤|kg|g|发|把|套|座|本|条)?/i, '').trim();
    if (withoutNum.length >= 2) set.add(withoutNum);
  }

  const full = str.toLowerCase();
  if (full.includes('金')) { set.add('黄金'); set.add('纯金'); set.add('金块'); set.add('金砖'); set.add('卢布'); }
  if (full.includes('svd')) { set.add('SVD'); set.add('狙击步枪'); set.add('狙击枪'); set.add('步枪'); }
  if (full.includes('赤脚医生')) { set.add('赤脚医生手册'); set.add('医生手册'); set.add('手册'); }
  if (full.includes('民兵训练')) { set.add('民兵训练手册'); set.add('训练手册'); }
  if (full.includes('燕尾服') || full.includes('大衣')) { set.add('燕尾服'); set.add('大衣'); set.add('绅士着装'); }
  if (full.includes('狙击弹') || full.includes('子弹') || full.includes('弹药')) { set.add('狙击弹'); set.add('子弹'); set.add('弹药'); }

  return [...set].filter((s) => s.length >= 2 && !/^\d+$/.test(s));
}

function formatValue(val, indent = 0) {
  const pad = '  '.repeat(indent);
  if (val == null) return '';
  if (typeof val !== 'object') return String(val);
  if (Array.isArray(val)) {
    return val.map((item) => {
      if (typeof item === 'object' && item !== null) {
        if (item.item && item.details) {
          const qty = item.quantity ? ` (${item.quantity})` : '';
          return `${pad}- **${item.item}**${qty}：${item.details}`;
        }
        if (item.name && item.description) {
          return `${pad}- **${item.name}**：${item.description}`;
        }
        return `${pad}- ` + Object.entries(item).map(([k, v]) => `${k}: ${v}`).join(', ');
      }
      return `${pad}- ${item}`;
    }).join('\n');
  }
  return Object.entries(val).map(([k, v]) => {
    if (typeof v === 'object' && v !== null) {
      return `${pad}### ${k}\n` + formatValue(v, indent + 1);
    }
    return `${pad}- **${k}**：${v}`;
  }).join('\n');
}

export function convertArbitraryJsonToLoreEntries(data) {
  if (Array.isArray(data)) {
    return data.map((item, idx) => {
      if (typeof item === 'object' && item !== null) {
        const content = item.content || item.text || item.desc || item.description || formatValue(item);
        const name = item.name || item.title || item.comment || `词条 #${idx + 1}`;
        const keys = (Array.isArray(item.keys) ? item.keys : (item.key ? [item.key] : []))
          .concat(extractKeywords(name))
          .filter(Boolean);
        return {
          id: item.id || uid(),
          name,
          keys: keys.length ? [...new Set(keys)] : [name],
          secondary_keys: item.secondary_keys || [],
          selective: !!item.selective,
          constant: !!item.constant,
          enabled: item.enabled !== false,
          position: item.position || 'after_sys',
          order: item.order ?? (idx + 1) * 10,
          content,
        };
      }
      return {
        id: uid(),
        name: `词条 #${idx + 1}`,
        keys: [`词条${idx + 1}`],
        secondary_keys: [],
        selective: false,
        constant: false,
        enabled: true,
        position: 'after_sys',
        order: (idx + 1) * 10,
        content: String(item),
      };
    });
  }

  // 对象结构转换
  const entries = [];
  const nameKeys = extractKeywords(data.name || data.title);

  // 1. 如果有基础名称、版本、archetype，生成一个核心常驻词条
  if (data.name || data.archetype || data.character_version || data.demographics) {
    const lines = [];
    if (data.name) lines.push(`姓名/名称：${data.name}`);
    if (data.character_version) lines.push(`版本：${data.character_version}`);
    if (data.archetype) lines.push(`身份定位：${data.archetype}`);
    if (data.demographics && typeof data.demographics === 'object') {
      for (const [k, v] of Object.entries(data.demographics)) {
        lines.push(`- ${k}：${v}`);
      }
    }
    entries.push({
      id: uid(),
      name: `【核心档案】${data.name || '概览'}`,
      keys: [...new Set([...nameKeys, ...(data.archetype ? extractKeywords(data.archetype) : []), '档案', '概览'])],
      secondary_keys: [],
      content: lines.join('\n'),
      position: 'before_sys',
      constant: false,
      enabled: true,
      order: 10,
    });
  }

  // 2. 遍历其它字段
  for (const [key, val] of Object.entries(data)) {
    if (['id', 'spec', 'version', 'character_version', 'name', 'title', 'archetype', 'demographics'].includes(key)) {
      continue;
    }
    if (val == null || (typeof val === 'string' && !val.trim())) continue;

    // 简单键值对字典：如 { "圣彼得堡": "沙皇首都" }
    if (typeof val === 'string' && !data.demographics && !data.archetype) {
      entries.push({
        id: uid(),
        name: key,
        keys: [...new Set([key, ...extractKeywords(key)])],
        secondary_keys: [],
        content: val,
        position: 'after_sys',
        constant: false,
        enabled: true,
        order: 100,
      });
      continue;
    }

    const meta = SECTION_LABELS[key] || {
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      defaultKeys: [key.replace(/_/g, ' ')],
      isConstant: false,
    };

    const keysSet = new Set([...meta.defaultKeys]);
    if (Array.isArray(val)) {
      val.forEach((item) => {
        if (typeof item === 'object' && item) {
          if (item.item) extractKeywords(item.item).forEach((k) => keysSet.add(k));
          if (item.name) extractKeywords(item.name).forEach((k) => keysSet.add(k));
        } else if (typeof item === 'string') {
          extractKeywords(item).forEach((k) => keysSet.add(k));
        }
      });
    } else if (typeof val === 'object' && val !== null) {
      if (val.inventory && Array.isArray(val.inventory)) {
        val.inventory.forEach((item) => {
          if (item.item) extractKeywords(item.item).forEach((k) => keysSet.add(k));
        });
      }
      Object.keys(val).forEach((subk) => {
        extractKeywords(subk).forEach((k) => keysSet.add(k));
      });
    }

    const contentText = `【${meta.label}】\n` + formatValue(val);

    entries.push({
      id: uid(),
      name: meta.label,
      keys: [...keysSet],
      secondary_keys: [],
      content: contentText,
      position: meta.isConstant ? 'before_sys' : 'after_sys',
      constant: !!meta.isConstant,
      enabled: true,
      order: meta.isConstant ? 20 : 100,
    });
  }

  return entries;
}

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

export function parseLorebookJson(raw, defaultName = '未命名世界书') {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const rawEntries = data.entries || data.items;
  let entriesList = [];

  // 判断是否为标准 SillyTavern 格式（必须含有含有效 content 或 key 的条目）
  if (rawEntries) {
    const list = Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries);
    const hasStandardEntries = list.length > 0 && list.some((e) => e && typeof e === 'object' && (e.content != null || e.key != null || e.keys != null));
    if (hasStandardEntries) {
      entriesList = list.map(normalizeLorebookEntry);
    }
  }

  // 若不是标准 SillyTavern 条目集合，调用通用智能转换器
  if (!entriesList.length) {
    entriesList = convertArbitraryJsonToLoreEntries(data).map(normalizeLorebookEntry);
  }

  const normalized = {
    id: data.id || uid(),
    name: (data.name || data.title || defaultName).trim(),
    description: (data.description || data.archetype || '').trim(),
    scan_depth: Math.max(0, Math.round(Number(data.scan_depth ?? data.scanDepth ?? 5))),
    entries: entriesList,
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
