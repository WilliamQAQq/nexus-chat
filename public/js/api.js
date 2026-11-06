// 多协议 API 适配层：OpenAI 兼容 / Anthropic / Google Gemini
import { WEB_SEARCH_TOOL_OPENAI, WEB_SEARCH_TOOL_ANTHROPIC, searchWeb } from './tools.js';
export const PROVIDER_TYPES = {
  openai: 'OpenAI 兼容协议',
  anthropic: 'Anthropic (Claude)',
  gemini: 'Google Gemini',
};

export const PROVIDER_TYPES_EN = {
  openai: 'OpenAI Compatible API',
  anthropic: 'Anthropic (Claude)',
  gemini: 'Google Gemini',
};

export const getProviderTypeName = (type, lang = 'zh-CN') =>
  (lang === 'en' ? PROVIDER_TYPES_EN[type] : PROVIDER_TYPES[type]) || type;

export const PRESETS = [
  { name: 'OpenAI', enName: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'o4-mini'] },
  { name: 'Anthropic Claude', enName: 'Anthropic Claude', type: 'anthropic', baseUrl: 'https://api.anthropic.com', models: ['claude-3-7-sonnet-20250219', 'claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'] },
  { name: 'Google Gemini', enName: 'Google Gemini', type: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', models: ['gemini-4-argon', 'gemini-2.5-flash', 'gemini-2.5-pro'] },
  { name: 'DeepSeek', enName: 'DeepSeek', type: 'openai', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { name: 'OpenRouter', enName: 'OpenRouter', type: 'openai', baseUrl: 'https://openrouter.ai/api/v1', models: [] },
  { name: '硅基流动 SiliconFlow', enName: 'SiliconFlow', type: 'openai', baseUrl: 'https://api.siliconflow.cn/v1', models: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1'] },
  { name: '阿里云百炼 (通义千问)', enName: 'Alibaba Cloud (Qwen)', type: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen-max', 'qwen-turbo'] },
  { name: '火山方舟 (豆包 / DeepSeek)', enName: 'Volcengine Ark (Doubao / DeepSeek)', type: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: [] },
  { name: 'Moonshot (Kimi)', enName: 'Moonshot (Kimi)', type: 'openai', baseUrl: 'https://api.moonshot.cn/v1', models: ['kimi-k2-0711-preview', 'moonshot-v1-128k'] },
  { name: '智谱 GLM', enName: 'Zhipu GLM', type: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-plus', 'glm-4-flash'] },
  { name: 'Groq', enName: 'Groq', type: 'openai', baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile'] },
  { name: 'Mistral AI', enName: 'Mistral AI', type: 'openai', baseUrl: 'https://api.mistral.ai/v1', models: ['mistral-large-latest', 'codestral-latest'] },
  { name: 'xAI Grok', enName: 'xAI Grok', type: 'openai', baseUrl: 'https://api.x.ai/v1', models: ['grok-3', 'grok-3-mini'] },
  { name: 'Ollama (本地)', enName: 'Ollama (Local)', type: 'openai', baseUrl: 'http://localhost:11434/v1', models: [], apiKey: 'ollama' },
  { name: '自定义 (OpenAI 兼容 / 中转站)', enName: 'Custom (OpenAI Compatible / Proxy)', type: 'openai', baseUrl: '', models: [] },
];

const trimBase = (u) => (u || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().replace(/\/+$/, '');
const cleanKey = (k) => {
  const s = (k || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (/[^\x20-\x7E]/.test(s)) throw new Error('API Key 包含非法字符（如中文或全角符号），请检查是否误粘贴了多余内容');
  return s;
};

export function openaiBase(p) {
  let raw = (p?.baseUrl || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!raw) return '';
  const noAutoV1 = raw.endsWith('#');
  if (noAutoV1) raw = raw.slice(0, -1);
  raw = trimBase(raw).replace(/\/chat\/completions$/i, '');
  if (!noAutoV1) {
    try {
      const u = new URL(raw);
      if (!u.pathname || u.pathname === '/') raw += '/v1';
    } catch {}
  }
  return raw;
}

export const anthropicBase = (p) => trimBase(p?.baseUrl || 'https://api.anthropic.com').replace(/\/v1(\/messages)?$/i, '');
export const geminiBase = (p) => trimBase(p?.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/v1(beta)?$/i, '');

export function resolveEndpointPreview(p, model = '{model}') {
  if (!p) return '';
  if (p.type === 'anthropic') return `${anthropicBase(p)}/v1/messages`;
  if (p.type === 'gemini') return `${geminiBase(p)}/v1beta/models/${(model || '{model}').replace(/^models\//, '') || '{model}'}:streamGenerateContent`;
  const b = openaiBase(p);
  return b ? `${b}/chat/completions` : '（请填写 API 地址）';
}

export function parseCustomHeaders(raw) {
  const s = (raw || '').trim();
  if (!s) return {};
  if (s.startsWith('{')) {
    const obj = JSON.parse(s);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('自定义请求头需为 JSON 对象');
    const out = {};
    for (const [k, v] of Object.entries(obj)) if (k && v != null) out[k.trim()] = String(v);
    return out;
  }
  const out = {};
  for (const line of s.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('//')) continue;
    const idx = t.indexOf(':');
    if (idx <= 0) throw new Error(`自定义请求头格式错误（应为 Header: Value）：${t}`);
    out[t.slice(0, idx).trim()] = t.slice(idx + 1).trim();
  }
  return out;
}

let localProxyAvailable = false;

export async function detectLocalProxy() {
  if (!globalThis.location?.protocol?.startsWith('http') || /\.github\.io$/i.test(location.hostname)) {
    localProxyAvailable = false;
    return false;
  }
  try {
    const r = await fetch('./api/health', { method: 'GET', cache: 'no-store' });
    if (r.ok) {
      const j = await r.json().catch(() => null);
      localProxyAvailable = !!j?.proxy;
    } else localProxyAvailable = false;
  } catch {
    localProxyAvailable = false;
  }
  return localProxyAvailable;
}

export const hasLocalProxy = () => localProxyAvailable;

async function pfetch(provider, url, init = {}) {
  const headers = new Headers(init.headers);
  if (provider.customHeaders?.trim()) {
    const extra = parseCustomHeaders(provider.customHeaders);
    for (const [k, v] of Object.entries(extra)) {
      try { headers.set(k, v); }
      catch { throw new Error(`自定义请求头包含非法字符：${k}`); }
    }
  }
  const customProxy = trimBase(provider.proxyUrl);
  if (customProxy) {
    if (customProxy.includes('{url}')) {
      return fetch(customProxy.replace('{url}', encodeURIComponent(url)), { ...init, headers });
    }
    if (customProxy.endsWith('=') || (provider.proxyUrl || '').trim().endsWith('/')) {
      return fetch(`${(provider.proxyUrl || '').trim()}${url}`, { ...init, headers });
    }
    headers.set('x-target-url', url);
    return fetch(customProxy, { ...init, headers });
  }
  if (provider.useProxy && localProxyAvailable) {
    headers.set('x-target-url', url);
    return fetch('./api/proxy', { ...init, headers });
  }
  return fetch(url, { ...init, headers });
}

async function ensureOk(res) {
  if (res.ok) return;
  const text = await res.text().catch(() => '');
  let msg = text;
  try {
    const j = JSON.parse(text);
    const e = Array.isArray(j) ? j[0]?.error : j.error;
    msg = e?.message || j.message || e || text;
    if (typeof msg !== 'string') msg = JSON.stringify(msg);
  } catch {}
  throw new Error(`HTTP ${res.status}${msg ? ': ' + msg.slice(0, 600) : ''}`);
}

async function* sse(res) {
  if (!res.body) return;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '');
        buf = buf.slice(idx + 1);
        if (line.startsWith('data:')) yield line.slice(5).trimStart();
      }
    }
    const tail = buf.trim();
    if (tail.startsWith('data:')) yield tail.slice(5).trimStart();
  } finally {
    reader.cancel().catch(() => {});
  }
}

const parseJSON = (s) => { try { return JSON.parse(s); } catch { return null; } };

function dataUrlParts(u) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(u);
  return m ? { mime: m[1], data: m[2] } : { mime: 'image/png', data: '' };
}

// 合并相邻同角色消息，并保证首条为 user（Anthropic / Gemini 要求）
function normalizeTurns(messages) {
  const out = [];
  for (const m of messages) {
    if (!out.length && m.role !== 'user') {
      if (m.role === 'assistant' && (m.content || m.images?.length)) {
        // 若对话首条为角色卡开场白/问候语，保留开场白并前置用户启动提示，避免开场背景丢失
        out.push({ role: 'user', content: '[Start of conversation]', images: [] });
      } else {
        continue;
      }
    }
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content = [last.content, m.content].filter(Boolean).join('\n\n');
      last.images = [...(last.images || []), ...(m.images || [])];
    } else out.push({ role: m.role, content: m.content || '', images: [...(m.images || [])] });
  }
  return out;
}

// ---------------- OpenAI 兼容 ----------------
function toOpenAIMessage(m) {
  if (m.role === 'tool') {
    return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content || '' };
  }
  if (m.role === 'assistant' && m.tool_calls) {
    return { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls };
  }
  if (m.role === 'user' && m.images?.length) {
    return {
      role: 'user',
      content: [
        ...(m.content ? [{ type: 'text', text: m.content }] : []),
        ...m.images.map((url) => ({ type: 'image_url', image_url: { url } })),
      ],
    };
  }
  return { role: m.role, content: m.content || '' };
}

async function chatOpenAI({ provider, model, system, messages, params, signal, onDelta, depth = 0 }) {
  const base = openaiBase(provider);
  if (!base) throw new Error('请先在设置中填写 API 地址 (Base URL)');
  const e = params.enabled;
  const isOpenAIReasoning = /^(o[134](-|$)|gpt-5)/i.test(model) && /openai\.com/i.test(base);
  const allowTools = !!params.webSearch && depth < 3;
  const body = {
    model,
    messages: [...(system?.trim() ? [{ role: 'system', content: system }] : []), ...messages.map(toOpenAIMessage)],
    stream: !!params.stream,
  };
  if (allowTools) {
    body.tools = [WEB_SEARCH_TOOL_OPENAI];
  }
  if (e.temperature && !isOpenAIReasoning) body.temperature = params.temperature;
  if (e.top_p && !isOpenAIReasoning) body.top_p = params.top_p;
  if (e.max_tokens) {
    if (isOpenAIReasoning) body.max_completion_tokens = params.max_tokens;
    else body.max_tokens = params.max_tokens;
  }
  if (e.presence_penalty && !isOpenAIReasoning) body.presence_penalty = params.presence_penalty;
  if (e.frequency_penalty && !isOpenAIReasoning) body.frequency_penalty = params.frequency_penalty;
  if (params.stream && provider.streamUsage !== false) body.stream_options = { include_usage: true };

  const headers = { 'Content-Type': 'application/json' };
  const key = cleanKey(provider.apiKey);
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await pfetch(provider, `${base}/chat/completions`, {
    method: 'POST', headers, body: JSON.stringify(body), signal,
  });
  await ensureOk(res);

  const toUsage = (u) => (u ? { prompt: u.prompt_tokens, completion: u.completion_tokens } : null);

  if (!params.stream) {
    const j = await res.json();
    const msg = j.choices?.[0]?.message ?? {};
    if (msg.tool_calls?.length && allowTools) {
      const toolCall = msg.tool_calls[0];
      if (toolCall.function?.name === 'web_search') {
        let query = '';
        try { query = JSON.parse(toolCall.function.arguments || '{}').query || ''; }
        catch { query = toolCall.function.arguments || ''; }
        if (query) {
          onDelta({ searchStatus: { status: 'searching', query } });
          const sRes = await searchWeb(query, { searchSettings: params.searchSettings, signal, hasLocalProxy: localProxyAvailable });
          onDelta({
            searchStatus: { status: 'done', query, count: sRes.results.length },
            searchSources: sRes.results,
            searchQueries: [query]
          });
          const followMessages = [
            ...messages,
            { role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls },
            { role: 'tool', tool_call_id: toolCall.id, content: sRes.formattedText }
          ];
          return chatOpenAI({ provider, model, system, messages: followMessages, params, signal, onDelta, depth: depth + 1 });
        }
      }
    }
    onDelta({ content: msg.content ?? '', reasoning: msg.reasoning_content ?? msg.reasoning ?? '' });
    return { usage: toUsage(j.usage), finish: j.choices?.[0]?.finish_reason };
  }

  let usage = null;
  let finish = null;
  const accToolCalls = [];
  let accContent = '';
  let accReasoning = '';

  for await (const data of sse(res)) {
    if (data === '[DONE]') break;
    const j = parseJSON(data);
    if (!j) continue;
    if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
    const c = j.choices?.[0];
    if (c?.delta) {
      const deltaContent = c.delta.content ?? '';
      const deltaReasoning = c.delta.reasoning_content ?? c.delta.reasoning ?? '';
      if (deltaContent) accContent += deltaContent;
      if (deltaReasoning) accReasoning += deltaReasoning;
      if (deltaContent || deltaReasoning) {
        onDelta({ content: deltaContent, reasoning: deltaReasoning });
      }
      if (c.delta.tool_calls) {
        for (const tc of c.delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!accToolCalls[idx]) {
            accToolCalls[idx] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
          }
          if (tc.id) accToolCalls[idx].id = tc.id;
          if (tc.function?.name) accToolCalls[idx].function.name += tc.function.name;
          if (tc.function?.arguments) accToolCalls[idx].function.arguments += tc.function.arguments;
        }
      }
    }
    if (c?.finish_reason) finish = c.finish_reason;
    if (j.usage) usage = toUsage(j.usage);
  }

  // 检查是否触发了 web_search 联网搜索工具
  const validTool = accToolCalls.find((tc) => tc?.function?.name === 'web_search');
  if (validTool && allowTools) {
    let query = '';
    try {
      const parsed = JSON.parse(validTool.function.arguments || '{}');
      query = parsed.query || '';
    } catch {
      query = validTool.function.arguments || '';
    }
    if (query) {
      onDelta({ searchStatus: { status: 'searching', query } });
      const sRes = await searchWeb(query, { searchSettings: params.searchSettings, signal, hasLocalProxy: localProxyAvailable });
      onDelta({
        searchStatus: { status: 'done', query, count: sRes.results.length },
        searchSources: sRes.results,
        searchQueries: [query]
      });
      const followMessages = [
        ...messages,
        {
          role: 'assistant',
          content: accContent || null,
          tool_calls: accToolCalls.map((tc, i) => ({
            id: tc.id || `call_${i}_${Date.now()}`,
            type: 'function',
            function: { name: tc.function.name, arguments: tc.function.arguments }
          }))
        },
        {
          role: 'tool',
          tool_call_id: validTool.id || `call_${Date.now()}`,
          content: sRes.formattedText
        }
      ];
      const nextRes = await chatOpenAI({
        provider, model, system, messages: followMessages, params, signal, onDelta, depth: depth + 1
      });
      if (usage && nextRes?.usage) {
        nextRes.usage = {
          prompt: (usage.prompt || 0) + (nextRes.usage.prompt || 0),
          completion: (usage.completion || 0) + (nextRes.usage.completion || 0)
        };
      }
      return nextRes;
    }
  }

  return { usage, finish };
}

// ---------------- Anthropic ----------------
function anthropicHeaders(provider) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': cleanKey(provider.apiKey),
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

function toAnthropicMessage(m) {
  if (m.role === 'tool_result' || m.role === 'tool') {
    return {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: m.tool_use_id || m.tool_call_id, content: m.content || '' }]
    };
  }
  if (m.role === 'assistant' && m.anthropicContent) {
    return { role: 'assistant', content: m.anthropicContent };
  }
  return {
    role: m.role,
    content: [
      ...(m.images || []).map((u) => { const { mime, data } = dataUrlParts(u); return { type: 'image', source: { type: 'base64', media_type: mime, data } }; }),
      ...(m.content ? [{ type: 'text', text: m.content }] : []),
    ]
  };
}

async function chatAnthropic({ provider, model, system, messages, params, signal, onDelta, depth = 0 }) {
  const e = params.enabled;
  const allowTools = !!params.webSearch && depth < 3;
  const body = {
    model,
    max_tokens: e.max_tokens ? params.max_tokens : 4096,
    stream: !!params.stream,
    messages: normalizeTurns(messages).map(toAnthropicMessage),
  };
  if (allowTools) body.tools = [WEB_SEARCH_TOOL_ANTHROPIC];
  if (system?.trim()) body.system = system;
  // Claude 4.x 不允许同时传 temperature 与 top_p
  if (e.temperature) body.temperature = Math.min(params.temperature, 1);
  else if (e.top_p) body.top_p = params.top_p;

  const res = await pfetch(provider, `${anthropicBase(provider)}/v1/messages`, {
    method: 'POST', headers: anthropicHeaders(provider), body: JSON.stringify(body), signal,
  });
  await ensureOk(res);

  if (!params.stream) {
    const j = await res.json();
    let content = '';
    let reasoning = '';
    const toolUses = [];
    for (const b of j.content || []) {
      if (b.type === 'text') content += b.text;
      else if (b.type === 'thinking') reasoning += b.thinking;
      else if (b.type === 'tool_use') toolUses.push(b);
    }
    if (toolUses.length && allowTools) {
      const tu = toolUses[0];
      let query = '';
      try { query = (typeof tu.input === 'object' ? tu.input?.query : JSON.parse(tu.input || '{}').query) || ''; } catch { query = tu.input || ''; }
      if (query) {
        onDelta({ searchStatus: { status: 'searching', query } });
        const sRes = await searchWeb(query, { searchSettings: params.searchSettings, signal, hasLocalProxy: localProxyAvailable });
        onDelta({
          searchStatus: { status: 'done', query, count: sRes.results.length },
          searchSources: sRes.results,
          searchQueries: [query]
        });
        const followMessages = [
          ...messages,
          { role: 'assistant', anthropicContent: j.content },
          { role: 'tool_result', tool_use_id: tu.id, content: sRes.formattedText }
        ];
        return chatAnthropic({ provider, model, system, messages: followMessages, params, signal, onDelta, depth: depth + 1 });
      }
    }
    onDelta({ content, reasoning });
    return { usage: j.usage ? { prompt: j.usage.input_tokens, completion: j.usage.output_tokens } : null, finish: j.stop_reason };
  }

  const usage = { prompt: 0, completion: 0 };
  let finish = null;
  let accContent = '';
  const toolUses = [];
  let currentToolUse = null;

  for await (const data of sse(res)) {
    const j = parseJSON(data);
    if (!j) continue;
    switch (j.type) {
      case 'message_start': {
        const u = j.message?.usage || {};
        usage.prompt = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        break;
      }
      case 'content_block_start':
        if (j.content_block?.type === 'tool_use') {
          currentToolUse = { id: j.content_block.id, name: j.content_block.name, input: '' };
        }
        break;
      case 'content_block_delta':
        if (j.delta?.type === 'text_delta') {
          accContent += j.delta.text;
          onDelta({ content: j.delta.text });
        } else if (j.delta?.type === 'thinking_delta') {
          onDelta({ reasoning: j.delta.thinking });
        } else if (j.delta?.type === 'input_json_delta' && currentToolUse) {
          currentToolUse.input += j.delta.partial_json;
        }
        break;
      case 'content_block_stop':
        if (currentToolUse) {
          toolUses.push(currentToolUse);
          currentToolUse = null;
        }
        break;
      case 'message_delta':
        if (j.usage?.output_tokens != null) usage.completion = j.usage.output_tokens;
        if (j.delta?.stop_reason) finish = j.delta.stop_reason;
        break;
      case 'error':
        throw new Error(j.error?.message || 'Anthropic 流式错误');
    }
  }

  if (toolUses.length && allowTools) {
    const tu = toolUses[0];
    let query = '';
    try { query = JSON.parse(tu.input || '{}').query || ''; } catch { query = tu.input || ''; }
    if (query) {
      onDelta({ searchStatus: { status: 'searching', query } });
      const sRes = await searchWeb(query, { searchSettings: params.searchSettings, signal, hasLocalProxy: localProxyAvailable });
      onDelta({
        searchStatus: { status: 'done', query, count: sRes.results.length },
        searchSources: sRes.results,
        searchQueries: [query]
      });
      const anthropicContent = [];
      if (accContent) anthropicContent.push({ type: 'text', text: accContent });
      for (const t of toolUses) {
        let parsed = {};
        try { parsed = JSON.parse(t.input || '{}'); } catch {}
        anthropicContent.push({ type: 'tool_use', id: t.id, name: t.name, input: parsed });
      }
      const followMessages = [
        ...messages,
        { role: 'assistant', anthropicContent },
        { role: 'tool_result', tool_use_id: tu.id, content: sRes.formattedText }
      ];
      const nextRes = await chatAnthropic({
        provider, model, system, messages: followMessages, params, signal, onDelta, depth: depth + 1
      });
      if (usage && nextRes?.usage) {
        nextRes.usage = {
          prompt: (usage.prompt || 0) + (nextRes.usage.prompt || 0),
          completion: (usage.completion || 0) + (nextRes.usage.completion || 0)
        };
      }
      return nextRes;
    }
  }

  return { usage, finish };
}

// ---------------- Gemini ----------------
async function chatGemini({ provider, model, system, messages, params, signal, onDelta }) {
  const e = params.enabled;
  const generationConfig = {};
  if (e.temperature) generationConfig.temperature = params.temperature;
  if (e.top_p) generationConfig.topP = params.top_p;
  if (e.max_tokens) generationConfig.maxOutputTokens = params.max_tokens;
  if (e.presence_penalty) generationConfig.presencePenalty = params.presence_penalty;
  if (e.frequency_penalty) generationConfig.frequencyPenalty = params.frequency_penalty;
  const body = {
    contents: normalizeTurns(messages).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [
        ...(m.content ? [{ text: m.content }] : []),
        ...m.images.map((u) => { const { mime, data } = dataUrlParts(u); return { inline_data: { mime_type: mime, data } }; }),
      ],
    })),
    generationConfig,
  };
  if (system?.trim()) body.systemInstruction = { parts: [{ text: system }] };
  if (params.webSearch) {
    body.tools = [{ googleSearch: {} }];
  }

  const name = (model || '').replace(/^models\//, '').trim();
  if (!name) throw new Error('请先选择或输入模型名称');
  const action = params.stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  const res = await pfetch(provider, `${geminiBase(provider)}/v1beta/models/${encodeURIComponent(name)}:${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cleanKey(provider.apiKey) },
    body: JSON.stringify(body),
    signal,
  });
  await ensureOk(res);

  let usage = null;
  let finish = null;
  const handle = (j) => {
    if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
    if (j.promptFeedback?.blockReason) throw new Error(`请求被拦截: ${j.promptFeedback.blockReason}`);
    const cand = j.candidates?.[0];
    for (const p of cand?.content?.parts || []) {
      if (!p.text) continue;
      if (p.thought) onDelta({ reasoning: p.text });
      else onDelta({ content: p.text });
    }
    const gm = cand?.groundingMetadata;
    if (gm) {
      const queries = gm.webSearchQueries || [];
      const sources = (gm.groundingChunks || []).map((ch) => ch.web ? ({
        title: ch.web.title || ch.web.uri,
        url: ch.web.uri,
        snippet: ''
      }) : null).filter(Boolean);
      if (queries.length || sources.length) {
        onDelta({
          searchStatus: { status: 'done', query: queries.join(', '), count: sources.length },
          searchSources: sources,
          searchQueries: queries
        });
      }
    }
    if (cand?.finishReason) finish = cand.finishReason;
    const u = j.usageMetadata;
    if (u) usage = { prompt: u.promptTokenCount, completion: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) };
  };
  if (!params.stream) handle(await res.json());
  else for await (const data of sse(res)) { const j = parseJSON(data); if (j) handle(j); }
  return { usage, finish };
}

export async function sendChat(opts) {
  const impl = { openai: chatOpenAI, anthropic: chatAnthropic, gemini: chatGemini }[opts.provider.type];
  if (!impl) throw new Error(`未知的协议类型: ${opts.provider.type}`);
  return impl(opts);
}

export async function listModels(provider) {
  let res;
  if (provider.type === 'anthropic') {
    res = await pfetch(provider, `${anthropicBase(provider)}/v1/models?limit=1000`, { headers: anthropicHeaders(provider) });
    await ensureOk(res);
    return ((await res.json()).data || []).map((m) => m.id);
  }
  if (provider.type === 'gemini') {
    res = await pfetch(provider, `${geminiBase(provider)}/v1beta/models?pageSize=1000`, { headers: { 'x-goog-api-key': cleanKey(provider.apiKey) } });
    await ensureOk(res);
    return ((await res.json()).models || [])
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''));
  }
  const base = openaiBase(provider);
  if (!base) throw new Error('请先填写 API 地址 (Base URL)');
  const key = cleanKey(provider.apiKey);
  const headers = key ? { Authorization: `Bearer ${key}` } : {};
  res = await pfetch(provider, `${base}/models`, { headers });
  await ensureOk(res);
  const j = await res.json();
  return (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean).sort();
}
