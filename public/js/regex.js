// 正则脚本引擎 (SillyTavern 兼容): 支持用户输入、AI输出、显示渲染、请求Prompt等多阶段替换与实时测试

const uid = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

export const PLACEMENT = {
  USER_INPUT: 0,       // 用户输入：发送/保存前处理用户输入
  AI_OUTPUT: 1,        // AI 输出：模型生成完成/流式内容处理
  DISPLAY_MARKDOWN: 2, // 仅显示渲染：用于界面渲染，不修改原始对话数据
  DISPLAY_ONLY: 2,     // 仅显示渲染别名 (Display Only)
  REQUEST_PROMPT: 3,   // 仅请求发送：发给 API 的 Prompt 处理，不修改原始对话
  WORLD_INFO: 4,       // 世界书：注入世界书条目内容时的替换
};

export const PLACEMENT_LABELS = {
  'zh-CN': {
    0: '用户输入 (User Input)',
    1: 'AI 回复 (AI Output)',
    2: '仅显示渲染 (Display Only)',
    3: '仅发送请求 (Prompt Only)',
    4: '世界书注入 (World Info)',
  },
  en: {
    0: 'User Input',
    1: 'AI Output',
    2: 'Display Only',
    3: 'Prompt Only',
    4: 'World Info',
  },
};

// ======================= 预设正则规则 =======================
export const DEFAULT_REGEX_SCRIPTS = [
  {
    id: 'rx_strip_think',
    scriptName: '过滤 <think> 思考链标签',
    findRegex: '/<think>[\\s\\S]*?<\\/think>/gi',
    replaceString: '',
    placement: [PLACEMENT.DISPLAY_MARKDOWN, PLACEMENT.REQUEST_PROMPT],
    disabled: false,
    runOnEdit: true,
  },
  {
    id: 'rx_action_italics',
    scriptName: '将 *动作描写* 转为标准斜体',
    findRegex: '/\\*([^*\\n]+)\\*/g',
    replaceString: '*$1*',
    placement: [PLACEMENT.DISPLAY_MARKDOWN],
    disabled: false,
    runOnEdit: true,
  },
  {
    id: 'rx_clean_newlines',
    scriptName: '压缩连续多余空行 (>=3换行压缩为2)',
    findRegex: '/\\n{3,}/g',
    replaceString: '\n\n',
    placement: [PLACEMENT.AI_OUTPUT, PLACEMENT.USER_INPUT],
    disabled: false,
    runOnEdit: true,
  },
];

// ======================= 正则编译与执行 =======================
export function compileRegex(findRegex) {
  if (!findRegex || typeof findRegex !== 'string') {
    return { regex: null, error: '正则表达式不能为空' };
  }
  const s = findRegex.trim();
  try {
    if (s.startsWith('/') && s.lastIndexOf('/') > 0) {
      const lastSlash = s.lastIndexOf('/');
      const pattern = s.slice(1, lastSlash);
      const flags = s.slice(lastSlash + 1);
      return { regex: new RegExp(pattern, flags), error: null };
    }
    // 未加斜杠时默认加上全局匹配 g
    return { regex: new RegExp(s, 'g'), error: null };
  } catch (err) {
    return { regex: null, error: err.message };
  }
}

export function applyRegexScripts(text, scripts = [], placementCode = PLACEMENT.DISPLAY_MARKDOWN) {
  if (!text || !Array.isArray(scripts) || !scripts.length) return text;

  let result = text;
  for (const item of scripts) {
    if (item.disabled) continue;
    const placements = Array.isArray(item.placement) ? item.placement : [item.placement];
    if (!placements.includes(placementCode)) continue;

    const { regex, error } = compileRegex(item.findRegex);
    if (error || !regex) continue;

    try {
      const rep = item.replaceString ?? '';
      result = result.replace(regex, rep);
    } catch {
      // 容错：单个正则执行异常不中断主流程
    }
  }
  return result;
}

export function testRegexScript(script, sampleText = '') {
  if (!sampleText) return { output: '', matchCount: 0, error: null };
  const { regex, error } = compileRegex(script?.findRegex);
  if (error) return { output: sampleText, matchCount: 0, error };
  if (!regex) return { output: sampleText, matchCount: 0, error: '正则编译失败' };

  try {
    const matches = sampleText.match(regex);
    const matchCount = matches ? matches.length : 0;
    const output = sampleText.replace(regex, script.replaceString ?? '');
    return { output, matchCount, error: null };
  } catch (err) {
    return { output: sampleText, matchCount: 0, error: err.message };
  }
}

// ======================= 导入与导出 =======================
export function normalizeRegexScript(raw = {}) {
  const p = Array.isArray(raw.placement) ? raw.placement : (raw.placement != null ? [raw.placement] : [0, 1]);
  return {
    id: raw.id || uid(),
    scriptName: (raw.scriptName || raw.name || '未命名正则').trim(),
    findRegex: raw.findRegex || raw.find || '',
    replaceString: raw.replaceString ?? raw.replace ?? '',
    placement: p.map(Number),
    disabled: !!raw.disabled,
    runOnEdit: raw.runOnEdit !== false,
  };
}

export function parseRegexScriptsJson(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const list = Array.isArray(data) ? data : (data.scripts || [data]);
  return list.map(normalizeRegexScript);
}

export function exportRegexScriptsJson(scripts) {
  return scripts.map((s) => ({
    id: s.id,
    scriptName: s.scriptName,
    findRegex: s.findRegex,
    replaceString: s.replaceString,
    placement: s.placement,
    disabled: s.disabled,
    runOnEdit: s.runOnEdit,
  }));
}
