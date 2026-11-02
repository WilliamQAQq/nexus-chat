import assert from 'node:assert/strict';
import {
  utf8ToBase64, base64ToUtf8, embedCharaInPng, extractPngTextChunks,
  parseCharacterCardJson, expandCharacterMacros, buildCharacterPrompt
} from '../public/js/character.js';
import {
  parseLorebookJson, exportLorebookJson, isLoreEntryTriggered, scanLorebooks
} from '../public/js/lorebook.js';
import {
  PLACEMENT, compileRegex, applyRegexScripts, testRegexScript,
  parseRegexScriptsJson, exportRegexScriptsJson
} from '../public/js/regex.js';

console.log('--- Testing Character, Lorebook, and Regex Modules ---');

// 1. Character module test
console.log('1. Character Card UTF8/Base64 & PNG Metadata');
const sampleText = '你好，世界！Character Card Test: 123 🔥';
const b64 = utf8ToBase64(sampleText);
assert.equal(base64ToUtf8(b64), sampleText);

// Create minimal valid PNG header (13-byte IHDR)
// 8-byte signature + 4-byte len(13) + 4-byte IHDR + 13-byte data + 4-byte CRC + 4-byte len(0) + 4-byte IEND + 4-byte CRC
const minPng = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // Sig
  0x00, 0x00, 0x00, 0x0d, // IHDR len = 13
  0x49, 0x48, 0x44, 0x52, // 'IHDR'
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, // 1x1 RGBA
  0x1f, 0x15, 0xc4, 0x89, // CRC
  0x00, 0x00, 0x00, 0x00, // IEND len = 0
  0x49, 0x45, 0x4e, 0x44, // 'IEND'
  0xae, 0x42, 0x60, 0x82  // CRC
]);

const cardV2Data = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: {
    name: '爱丽丝 (Alice)',
    description: '一名聪明且好奇心旺盛的探险家。',
    personality: '活泼、敏锐、热爱解谜。',
    scenario: '你在古老的图书馆与爱丽丝偶遇。',
    first_mes: '嗨！{{user}}，你也对这本尘封的古代日记感兴趣吗？',
    alternate_greetings: ['你好呀！', '嘘…小声点，这里是禁书区。'],
    mes_example: '<START>\n{{user}}: 你发现了什么？\n{{char}}: 一个关于失落遗迹的线索！',
    character_book: {
      name: '爱丽丝的世界书',
      entries: [
        { keys: ['古代日记', '遗迹'], content: '这是一本记载了失落天空城坐标的魔法羊皮日记。' }
      ]
    }
  }
};

const embeddedPngBuf = embedCharaInPng(minPng.buffer, cardV2Data);
const extractedChunks = extractPngTextChunks(embeddedPngBuf);
assert.ok(extractedChunks.chara, 'PNG chara chunk should exist');
const parsedFromPng = parseCharacterCardJson(base64ToUtf8(extractedChunks.chara));
assert.equal(parsedFromPng.name, '爱丽丝 (Alice)');
assert.equal(parsedFromPng.alternate_greetings.length, 2);
assert.ok(parsedFromPng.character_book);

// Test macros
const expanded = expandCharacterMacros(parsedFromPng.first_mes, { charName: parsedFromPng.name, userName: '旅行者' });
assert.equal(expanded, '嗨！旅行者，你也对这本尘封的古代日记感兴趣吗？');

const prompt = buildCharacterPrompt(parsedFromPng, { userName: '旅行者' });
assert.ok(prompt.includes('爱丽丝 (Alice)'));
assert.ok(prompt.includes('古老的图书馆'));
console.log('✓ Character module passed!');

// 2. Lorebook module test
console.log('2. World Info / Lorebook matching');
const lorebookJson = {
  name: '奇幻大陆世界书',
  scan_depth: 3,
  entries: {
    "0": {
      comment: '黄金律法',
      key: ['黄金树', '黄金律法'],
      content: '黄金律法是这片交界地的最高法则，维系着生死的秩序。',
      constant: false,
      selective: false,
      order: 10
    },
    "1": {
      comment: '玛莉卡女王',
      key: ['玛莉卡', '女王'],
      keysecondary: ['神坛', '赐福'],
      content: '玛莉卡女王是无上意志的代行者。',
      constant: false,
      selective: true,
      order: 20
    },
    "2": {
      comment: '世界常识',
      key: [],
      content: '交界地所有人死后灵魂都将归于黄金树根。',
      constant: true,
      order: 5
    }
  }
};

const lb = parseLorebookJson(lorebookJson);
assert.equal(lb.entries.length, 3);
assert.equal(lb.entries.find(e => e.constant).content, '交界地所有人死后灵魂都将归于黄金树根。');

// Test matching: constant entry triggers unconditionally
assert.ok(isLoreEntryTriggered(lb.entries[2], '完全无关的内容'));

// Test primary match: "黄金树" matches
assert.ok(isLoreEntryTriggered(lb.entries[0], '你仰望着远处高耸的黄金树。'));
assert.equal(isLoreEntryTriggered(lb.entries[0], '这里的风景真好。'), false);

// Test selective match: "玛莉卡" alone should NOT trigger because selective requires secondary key
assert.equal(isLoreEntryTriggered(lb.entries[1], '传说中的玛莉卡女王究竟在哪里？'), false);
// Both primary "玛莉卡" and secondary "赐福" match -> triggers!
assert.ok(isLoreEntryTriggered(lb.entries[1], '玛莉卡女王留下的赐福依然指引着我们。'));

// Test scanLorebooks
const scanRes = scanLorebooks([lb], {
  messages: [{ role: 'user', content: '我们现在来到了黄金树脚下。' }],
  draftText: '',
  scanDepth: 3
});
assert.ok(scanRes.activeEntries.length >= 2); // 常驻常识 + 黄金树
assert.ok(scanRes.injectedText.includes('黄金律法'));
assert.ok(scanRes.injectedText.includes('黄金树根'));
console.log('✓ Lorebook module passed!');

// 3. Regex module test
console.log('3. Regex Scripts execution');
const scripts = parseRegexScriptsJson([
  {
    id: 'r1',
    scriptName: '去除思考过程',
    findRegex: '/<think>[\\s\\S]*?<\\/think>/gi',
    replaceString: '',
    placement: [PLACEMENT.DISPLAY_MARKDOWN, PLACEMENT.REQUEST_PROMPT],
    disabled: false
  },
  {
    id: 'r2',
    scriptName: '动作括号美化',
    findRegex: '/\\*([^*]+)\\*/g',
    replaceString: '[$1]',
    placement: [PLACEMENT.DISPLAY_MARKDOWN],
    disabled: false
  },
  {
    id: 'r3',
    scriptName: '禁用脚本测试',
    findRegex: '/foo/g',
    replaceString: 'bar',
    placement: [PLACEMENT.DISPLAY_MARKDOWN],
    disabled: true
  }
]);

const rawText = '<think>思考一下这个难题...</think>*微笑点头* 很高兴认识你！foo';
const dispRes = applyRegexScripts(rawText, scripts, PLACEMENT.DISPLAY_MARKDOWN);
assert.equal(dispRes, '[微笑点头] 很高兴认识你！foo'); // think stripped, *actions* converted to [actions], foo NOT replaced because r3 is disabled

// Live tester test
const testResult = testRegexScript(scripts[1], '*轻轻挥手* 再见！');
assert.equal(testResult.matchCount, 1);
assert.equal(testResult.output, '[轻轻挥手] 再见！');
assert.equal(testResult.error, null);

console.log('✓ Regex module passed!');
console.log('--- ALL EXTENSION TESTS PASSED (3/3) ---');
