// Token 估算（无需分词器）：CJK 字符约 1 token/字，其余约 3.8 字符/token。仅用于额度提示，实际以 API 返回为准。
export const IMAGE_TOKENS = 800;
const MSG_OVERHEAD = 4;

export function estimateTokens(text) {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if ((c >= 0x2e80 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff) ||
        (c >= 0xff00 && c <= 0xffef) || (c >= 0x3040 && c <= 0x30ff) || c >= 0x20000) cjk++;
    else other++;
  }
  return Math.ceil(cjk + other / 3.8);
}

const cache = new WeakMap();
export function messageTokens(m) {
  const hit = cache.get(m);
  const imgs = m.images?.length ?? 0;
  if (hit && hit.content === m.content && hit.imgs === imgs) return hit.tok;
  const tok = estimateTokens(m.content) + MSG_OVERHEAD + imgs * IMAGE_TOKENS;
  cache.set(m, { content: m.content, imgs, tok });
  return tok;
}

export function formatTokens(n) {
  if (n == null || Number.isNaN(n)) return '-';
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

const RULES = [
  [/gemini/i, 1048576],
  [/claude/i, 200000],
  [/gpt-4\.1/i, 1047576],
  [/gpt-5/i, 400000],
  [/gpt-4o|gpt-4-turbo|chatgpt|\bo[134]\b|o[134]-/i, 128000],
  [/gpt-4/i, 8192],
  [/gpt-3\.5/i, 16385],
  [/deepseek/i, 128000],
  [/qwen.*(long|turbo|plus)/i, 1000000],
  [/qwen|qwq/i, 131072],
  [/moonshot-v1-8k/i, 8192],
  [/moonshot-v1-32k/i, 32768],
  [/moonshot|kimi/i, 131072],
  [/glm/i, 128000],
  [/grok/i, 131072],
  [/llama/i, 131072],
  [/mistral|mixtral/i, 32768],
];

export function guessContextWindow(model = '') {
  for (const [re, n] of RULES) if (re.test(model)) return n;
  return 32768;
}
