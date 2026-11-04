// 联网搜索与工具调用引擎 (Web Search & Tool Calling Engine)
// 支持本地服务器搜索 (Bing/DDG)、免费多源客户端检索 (维基百科 + DuckDuckGo)、
// 以及可选商业搜索 API (Tavily, Google Serper, Brave Search, Jina AI)。

export const WEB_SEARCH_TOOL_OPENAI = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the live internet for current, real-time, or factual information that you do not know or need to verify.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query or keywords, e.g. "DeepSeek V3 details", "latest weather in Tokyo"'
        }
      },
      required: ['query']
    }
  }
};

export const WEB_SEARCH_TOOL_ANTHROPIC = {
  name: 'web_search',
  description: 'Search the live internet for current, real-time, or factual information that you do not know or need to verify.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query or keywords'
      }
    },
    required: ['query']
  }
};

/**
 * 格式化搜索结果为注入大模型的文本
 */
export function formatSearchResults(query, results = []) {
  if (!results.length) {
    return `【网络搜索结果 - 关键词: "${query}"】\n未检索到相关网页内容。请基于已有知识或告知用户未找到最新事实。`;
  }
  const lines = [`【网络搜索结果 - 关键词: "${query}" (共 ${results.length} 条)】`];
  results.forEach((r, idx) => {
    lines.push(`[${idx + 1}] 标题: ${r.title || '无标题'}`);
    if (r.snippet) lines.push(`    摘要: ${r.snippet}`);
    if (r.url) lines.push(`    来源链接: ${r.url}`);
  });
  lines.push('\n指令要求：请综合上述最新搜索结果与对话历史，准确、客观地回答用户问题。若引用了搜索结果中的事实，请在回答末尾指明来源。');
  return lines.join('\n');
}

/**
 * 免费客户端 Wikipedia 检索 (支持 zh 和 en)
 */
async function searchWikipedia(query, lang = 'zh', signal) {
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*&srlimit=4`;
    const res = await fetch(url, { signal: signal || AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.query?.search || []).map((item) => ({
      title: item.title,
      snippet: (item.snippet || '').replace(/<[^>]+>/g, '').trim(),
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
      source: `Wikipedia (${lang.toUpperCase()})`
    }));
  } catch {
    return [];
  }
}

/**
 * 免费 DuckDuckGo Instant Answer API 检索 (CORS 支持)
 */
async function searchDDGInstant(query, signal) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { signal: signal || AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    const results = [];
    if (data.AbstractText) {
      results.push({
        title: data.Heading || query,
        snippet: data.AbstractText,
        url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        source: 'DuckDuckGo'
      });
    }
    for (const t of data.RelatedTopics || []) {
      if (t.Text && t.FirstURL && results.length < 5) {
        results.push({
          title: t.Text.slice(0, 50).trim(),
          snippet: t.Text,
          url: t.FirstURL,
          source: 'DuckDuckGo'
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * 免费多源客户端搜索降级 (免 API Key，支持 GitHub Pages)
 */
async function searchFreeFallback(query, limit = 5, signal) {
  const [zhWiki, enWiki, ddg] = await Promise.all([
    searchWikipedia(query, 'zh', signal),
    searchWikipedia(query, 'en', signal),
    searchDDGInstant(query, signal)
  ]);
  const combined = [...zhWiki, ...enWiki, ...ddg];
  const seen = new Set();
  const deduped = [];
  for (const item of combined) {
    if (item.url && !seen.has(item.url)) {
      seen.add(item.url);
      deduped.push(item);
    }
  }
  return deduped.slice(0, limit);
}

/**
 * 本地服务器搜索 (调用 server.js /api/search)
 */
async function searchLocalServer(query, signal) {
  const res = await fetch(`./api/search?q=${encodeURIComponent(query)}`, {
    signal: signal || AbortSignal.timeout(8000),
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`Local search failed HTTP ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((r) => ({
    title: r.title,
    snippet: r.snippet,
    url: r.url,
    source: 'Web Search'
  }));
}

/**
 * Tavily Search API
 */
async function searchTavily(query, apiKey, limit = 5, signal) {
  if (!apiKey) throw new Error('未配置 Tavily API Key');
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: limit,
      include_answer: true,
      search_depth: 'basic'
    }),
    signal
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Tavily 搜索失败 (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const out = [];
  if (data.answer) {
    out.push({
      title: 'Tavily 智能概括',
      snippet: data.answer,
      url: 'https://tavily.com',
      source: 'Tavily AI'
    });
  }
  for (const r of data.results || []) {
    out.push({
      title: r.title,
      snippet: r.content,
      url: r.url,
      source: 'Tavily'
    });
  }
  return out.slice(0, limit);
}

/**
 * Google Serper API
 */
async function searchSerper(query, apiKey, limit = 5, signal) {
  if (!apiKey) throw new Error('未配置 Serper API Key');
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ q: query, num: limit }),
    signal
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Serper 搜索失败 (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const out = [];
  for (const r of data.organic || []) {
    out.push({
      title: r.title,
      snippet: r.snippet,
      url: r.link,
      source: 'Google (Serper)'
    });
  }
  return out.slice(0, limit);
}

/**
 * Brave Search API
 */
async function searchBrave(query, apiKey, limit = 5, signal) {
  if (!apiKey) throw new Error('未配置 Brave Search API Key');
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`, {
    headers: {
      'X-Subscription-Token': apiKey,
      'Accept': 'application/json'
    },
    signal
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Brave 搜索失败 (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const out = [];
  for (const r of data.web?.results || []) {
    out.push({
      title: r.title,
      snippet: r.description,
      url: r.url,
      source: 'Brave'
    });
  }
  return out.slice(0, limit);
}

/**
 * Jina AI Search
 */
async function searchJina(query, apiKey, limit = 5, signal) {
  const headers = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, { headers, signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Jina 搜索失败 (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
  return list.slice(0, limit).map((r) => ({
    title: r.title || r.url,
    snippet: r.description || r.content?.slice(0, 280) || '',
    url: r.url,
    source: 'Jina AI'
  }));
}

/**
 * 自定义搜索接口
 */
async function searchCustom(query, customUrl, apiKey, limit = 5, signal) {
  if (!customUrl) throw new Error('未配置自定义搜索 API 地址');
  let target = customUrl;
  if (target.includes('{q}')) target = target.replace('{q}', encodeURIComponent(query));
  else if (target.includes('{query}')) target = target.replace('{query}', encodeURIComponent(query));
  else {
    const sep = target.includes('?') ? '&' : '?';
    target = `${target}${sep}q=${encodeURIComponent(query)}`;
  }
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(target, { headers, signal });
  if (!res.ok) throw new Error(`自定义搜索失败 HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : (data.results || data.data || data.organic || []);
  return list.slice(0, limit).map((r) => ({
    title: r.title || r.name || r.heading || '结果',
    snippet: r.snippet || r.content || r.description || r.abstract || '',
    url: r.url || r.link || '',
    source: 'Custom Search'
  }));
}

/**
 * 统一网络搜索入口
 * @param {string} query 搜索词
 * @param {object} options
 * @param {object} [options.searchSettings] 用户配置
 * @param {boolean} [options.hasLocalProxy] 是否可访问本地代理服务
 * @param {AbortSignal} [options.signal] 取消信号
 * @returns {Promise<{ ok: boolean, query: string, results: Array<{title: string, snippet: string, url: string, source: string}>, formattedText: string }>}
 */
export async function searchWeb(query, options = {}) {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) return { ok: false, query: '', results: [], formattedText: '搜索关键词为空。' };

  const settings = options.searchSettings || {};
  const provider = settings.provider || 'auto';
  const apiKey = (settings.apiKey || '').trim();
  const limit = Math.min(Math.max(Number(settings.maxResults) || 5, 1), 10);
  const signal = options.signal;

  let results = [];
  let lastError = null;

  try {
    if (provider === 'tavily') {
      results = await searchTavily(cleanQuery, apiKey, limit, signal);
    } else if (provider === 'serper') {
      results = await searchSerper(cleanQuery, apiKey, limit, signal);
    } else if (provider === 'brave') {
      results = await searchBrave(cleanQuery, apiKey, limit, signal);
    } else if (provider === 'jina') {
      results = await searchJina(cleanQuery, apiKey, limit, signal);
    } else if (provider === 'custom') {
      results = await searchCustom(cleanQuery, settings.customUrl, apiKey, limit, signal);
    } else if (provider === 'wiki_ddg') {
      results = await searchFreeFallback(cleanQuery, limit, signal);
    } else {
      // provider === 'auto' (智能模式)
      if (options.hasLocalProxy) {
        try {
          results = await searchLocalServer(cleanQuery, signal);
        } catch (e) {
          lastError = e;
        }
      }
      if (!results.length) {
        results = await searchFreeFallback(cleanQuery, limit, signal);
      }
    }
  } catch (err) {
    lastError = err;
    // 若商业或本地搜索失败，自动降级为免费 Wikipedia + DDG，确保永不完全瘫痪
    try {
      results = await searchFreeFallback(cleanQuery, limit, signal);
    } catch {
      // 保持 lastError
    }
  }

  if (!results.length && lastError) {
    return {
      ok: false,
      query: cleanQuery,
      error: lastError.message,
      results: [],
      formattedText: `【网络搜索失败 - 关键词: "${cleanQuery}"】\n原因: ${lastError.message}`
    };
  }

  const formattedText = formatSearchResults(cleanQuery, results);
  return {
    ok: true,
    query: cleanQuery,
    results,
    formattedText
  };
}
