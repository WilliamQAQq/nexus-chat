import fs from 'node:fs';

const uid = () => 'test_' + Math.random().toString(36).slice(2);

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
  const parts = str.split(/[/(),|·\n\s:：\-—]+/)
    .map(s => s.trim().replace(/^["'《》【】]|["'《》【】]$/g, ''))
    .filter(s => s.length >= 2 && !/^\d+$/.test(s));
  return [...new Set(parts)];
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
      constant: true,
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

// Test 1: User's gemini json file
const userFile = 'c:\\Users\\chatt\\Downloads\\gemini-code-1793652838261.json';
const userJson = JSON.parse(fs.readFileSync(userFile, 'utf8'));
const res1 = convertArbitraryJsonToLoreEntries(userJson);
console.log('Test 1 User JSON entries:', res1.length);
if (res1.length !== 6) throw new Error('Expected 6 entries for user JSON');

// Test 2: Simple Key-Value glossary
const glossaryJson = {
  "莫斯科": "俄罗斯古都，商业重镇",
  "圣彼得堡": "1780年沙皇俄国首都与主要港口",
  "冬宫": "叶卡捷琳娜二世的皇家宫殿"
};
const res2 = convertArbitraryJsonToLoreEntries(glossaryJson);
console.log('Test 2 Glossary entries:', res2.length);
if (res2.length !== 3) throw new Error('Expected 3 entries for glossary');

console.log('✓ ALL UNIVERSAL CONVERSION TESTS PASSED!');
