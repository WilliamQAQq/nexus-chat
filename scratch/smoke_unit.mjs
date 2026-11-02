import assert from 'node:assert/strict';
import {
  t, getLang, setLang, resolveLang, relTime,
  LANG_OPTIONS, PARAM_DEFS_I18N, DEFAULT_PROMPTS_I18N, SUMMARY_PROMPTS_I18N
} from '../public/js/i18n.js';
import {
  PROVIDER_TYPES, PROVIDER_TYPES_EN, getProviderTypeName,
  PRESETS, openaiBase
} from '../public/js/api.js';
import {
  estimateTokens, messageTokens, formatTokens, guessContextWindow, IMAGE_TOKENS
} from '../public/js/tokens.js';
import { renderMarkdown } from '../public/js/markdown.js';

console.log('--- Running Nexus Chat Unit Smoke Tests ---');

// Test 1: Language resolution
console.log('Test 1: Language resolution');
assert.equal(resolveLang('en'), 'en');
assert.equal(resolveLang('zh-CN'), 'zh-CN');
assert.equal(resolveLang('zh'), 'zh-CN');
assert.equal(['en', 'zh-CN'].includes(resolveLang('auto')), true);

// Test 2: Language switching & dictionary lookups
console.log('Test 2: Language switching & translations');
setLang('zh-CN');
assert.equal(getLang(), 'zh-CN');
assert.equal(t('newChat'), '新对话');
assert.equal(t('confirmDeleteConv', '测试'), '确定删除对话「测试」？');
assert.equal(t('sysBannerSummary', '128'), '⚙ 系统提示词 · 约 128 tokens');

setLang('en');
assert.equal(getLang(), 'en');
assert.equal(t('newChat'), 'New Chat');
assert.equal(t('confirmDeleteConv', 'Test'), 'Delete conversation "Test"?');
assert.equal(t('sysBannerSummary', '128'), '⚙ System Prompt · ~128 tokens');

// Test 3: relTime formatting in both languages
console.log('Test 3: relTime formatting');
const now = Date.now();
assert.equal(relTime(now, 'zh-CN'), '刚刚');
assert.equal(relTime(now, 'en'), 'Just now');
assert.equal(relTime(now - 120_000, 'zh-CN'), '2 分钟前');
assert.equal(relTime(now - 120_000, 'en'), '2m ago');
assert.equal(relTime(now - 7_200_000, 'zh-CN'), '2 小时前');
assert.equal(relTime(now - 7_200_000, 'en'), '2h ago');
assert.equal(relTime(now - 172_800_000, 'zh-CN'), '2 天前');
assert.equal(relTime(now - 172_800_000, 'en'), '2d ago');

// Test 4: Parameter definitions integrity
console.log('Test 4: Parameter definitions parity');
const zhParams = PARAM_DEFS_I18N['zh-CN'];
const enParams = PARAM_DEFS_I18N['en'];
assert.equal(zhParams.length, 5);
assert.equal(enParams.length, 5);
for (let i = 0; i < zhParams.length; i++) {
  assert.equal(zhParams[i].key, enParams[i].key);
  assert.equal(zhParams[i].min, enParams[i].min);
  assert.equal(zhParams[i].max, enParams[i].max);
  assert.equal(typeof enParams[i].label, 'string');
  assert.equal(typeof enParams[i].hint, 'string');
}

// Test 5: Summary prompts integrity
console.log('Test 5: Summary prompts integrity');
const styles = ['structured', 'bullets', 'tech', 'todos'];
for (const style of styles) {
  assert.ok(SUMMARY_PROMPTS_I18N['zh-CN'][style]);
  assert.ok(SUMMARY_PROMPTS_I18N['zh-CN'][style].name);
  assert.ok(SUMMARY_PROMPTS_I18N['zh-CN'][style].prompt);
  assert.ok(SUMMARY_PROMPTS_I18N['en'][style]);
  assert.ok(SUMMARY_PROMPTS_I18N['en'][style].name);
  assert.ok(SUMMARY_PROMPTS_I18N['en'][style].prompt);
}

// Test 6: API Provider Types & Presets
console.log('Test 6: API Provider Types & Presets');
assert.equal(getProviderTypeName('openai', 'en'), 'OpenAI Compatible API');
assert.equal(getProviderTypeName('openai', 'zh-CN'), 'OpenAI 兼容协议');
assert.equal(getProviderTypeName('anthropic', 'en'), 'Anthropic (Claude)');
assert.equal(getProviderTypeName('gemini', 'en'), 'Google Gemini');
assert.ok(PRESETS.length >= 10);
for (const p of PRESETS) {
  assert.ok(p.name);
  assert.ok(p.enName);
  assert.ok(p.type);
}

// Test 7: Token calculation and formatting
console.log('Test 7: Token calculation');
assert.equal(estimateTokens('Hello world'), 3);
assert.equal(formatTokens(1500), '1.5k');
assert.equal(formatTokens(2_000_000), '2M');
assert.equal(guessContextWindow('gemini-2.5-flash'), 1048576);
assert.equal(guessContextWindow('claude-sonnet-4-5'), 200000);
assert.equal(guessContextWindow('gpt-4o'), 128000);

// Test 8: Markdown rendering & security
console.log('Test 8: Markdown rendering');
const rendered = renderMarkdown('# Hello World\n\n**bold** and `code`\n\n<script>alert(1)</script>');
assert.ok(rendered.includes('<h1>Hello World</h1>'));
assert.ok(rendered.includes('<strong>bold</strong>'));
assert.ok(rendered.includes('<code>code</code>'));
assert.ok(!rendered.includes('<script>')); // sanitized!

console.log('✓ ALL UNIT TESTS PASSED SUCCESSFULLY (8/8)!');
