// 角色卡 (Character Card) 规范解析与导出 (SillyTavern / Tavern V1, V2, V3 兼容)

const uid = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

// ======================= Base64 与 UTF-8 编解码 =======================
export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, len)));
  }
  return btoa(bin);
}

export function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

// ======================= PNG tEXt Chunk 解析与注入 =======================
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c;
}

function calcCrc32(buf, offset, len) {
  let c = 0xffffffff;
  for (let i = 0; i < len; i++) {
    c = CRC_TABLE[(c ^ buf[offset + i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function extractPngTextChunks(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  // 检查 PNG 签名：89 50 4E 47 0D 0A 1A 0A
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 8) return {};
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== sig[i]) return {};
  }

  const chunks = {};
  let offset = 8;
  const len = bytes.length;
  const decoder = new TextDecoder('latin1');

  while (offset + 12 <= len) {
    const dataLen = ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const dataStart = offset + 8;
    const dataEnd = dataStart + dataLen;
    if (dataEnd > len) break;

    if (type === 'tEXt') {
      const chunkData = bytes.subarray(dataStart, dataEnd);
      let nullIdx = -1;
      for (let j = 0; j < chunkData.length; j++) {
        if (chunkData[j] === 0x00) { nullIdx = j; break; }
      }
      if (nullIdx !== -1) {
        const keyword = decoder.decode(chunkData.subarray(0, nullIdx));
        const text = decoder.decode(chunkData.subarray(nullIdx + 1));
        chunks[keyword] = text;
      }
    } else if (type === 'IEND') break;

    offset += 12 + dataLen;
  }
  return chunks;
}

export function embedCharaInPng(pngArrayBuffer, charaJson) {
  const bytes = new Uint8Array(pngArrayBuffer);
  const jsonStr = typeof charaJson === 'string' ? charaJson : JSON.stringify(charaJson);
  const b64Data = utf8ToBase64(jsonStr);

  const keyword = new TextEncoder().encode('chara');
  const textBytes = new TextEncoder().encode(b64Data);
  const dataLen = keyword.length + 1 + textBytes.length; // keyword + null + text

  // 构造 tEXt chunk: Length(4) + Type(4) + Data(dataLen) + CRC(4)
  const chunk = new Uint8Array(12 + dataLen);
  chunk[0] = (dataLen >>> 24) & 0xff;
  chunk[1] = (dataLen >>> 16) & 0xff;
  chunk[2] = (dataLen >>> 8) & 0xff;
  chunk[3] = dataLen & 0xff;
  chunk[4] = 0x74; chunk[5] = 0x45; chunk[6] = 0x58; chunk[7] = 0x74; // 'tEXt'
  chunk.set(keyword, 8);
  chunk[8 + keyword.length] = 0x00; // null separator
  chunk.set(textBytes, 9 + keyword.length);

  // 计算 CRC: Type(4) + Data(dataLen)
  const crc = calcCrc32(chunk, 4, 4 + dataLen);
  const crcOffset = 8 + dataLen;
  chunk[crcOffset] = (crc >>> 24) & 0xff;
  chunk[crcOffset + 1] = (crc >>> 16) & 0xff;
  chunk[crcOffset + 2] = (crc >>> 8) & 0xff;
  chunk[crcOffset + 3] = crc & 0xff;

  // 插入到 IHDR chunk 之后 (IHDR 长度 13，Chunk 总长 25 字节，从 8 + 25 = 33 插入)
  const ihdrLen = ((bytes[8] << 24) | (bytes[9] << 16) | (bytes[10] << 8) | bytes[11]) >>> 0;
  const insertPos = 8 + 12 + ihdrLen;

  const result = new Uint8Array(bytes.length + chunk.length);
  result.set(bytes.subarray(0, insertPos), 0);
  result.set(chunk, insertPos);
  result.set(bytes.subarray(insertPos), insertPos + chunk.length);
  return result.buffer;
}

// ======================= 角色卡规范解析与标准化 =======================
export function parseCharacterCardJson(raw) {
  let parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;

  // 处理包裹在 data 中的 V2 规范 (spec: chara_card_v2) 或 V3
  const isV2OrV3 = (parsed.spec === 'chara_card_v2' || parsed.spec === 'chara_card_v3') && parsed.data;
  const d = isV2OrV3 ? parsed.data : parsed;

  const chara = {
    id: d.id || uid(),
    name: (d.name || '未命名角色').trim(),
    avatar: d.avatar || '',
    description: d.description || '',
    personality: d.personality || '',
    scenario: d.scenario || '',
    first_mes: d.first_mes || '',
    alternate_greetings: Array.isArray(d.alternate_greetings) ? d.alternate_greetings.filter(Boolean) : [],
    mes_example: d.mes_example || '',
    system_prompt: d.system_prompt || '',
    post_history_instructions: d.post_history_instructions || '',
    creator_notes: d.creator_notes || d.creatorcomment || '',
    tags: Array.isArray(d.tags) ? d.tags : [],
    character_book: d.character_book || null,
    creator: d.creator || '',
    character_version: d.character_version || '1.0',
    createdAt: d.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  return chara;
}

export async function parseCharacterCardFile(file) {
  if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
    const buf = await file.arrayBuffer();
    const chunks = extractPngTextChunks(buf);
    let jsonStr = '';
    if (chunks.chara) {
      try { jsonStr = base64ToUtf8(chunks.chara); }
      catch { jsonStr = chunks.chara; }
    } else if (chunks.ccv3) {
      try { jsonStr = base64ToUtf8(chunks.ccv3); }
      catch { jsonStr = chunks.ccv3; }
    } else if (chunks.Description) {
      jsonStr = chunks.Description;
    }

    if (!jsonStr) throw new Error('该 PNG 图片未包含酒馆角色卡 (chara/ccv3) 元数据');
    const chara = parseCharacterCardJson(jsonStr);

    // 将上传的 PNG 图片转为 avatar data URL
    const blob = new Blob([buf], { type: 'image/png' });
    chara.avatar = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
    return chara;
  }

  // JSON 文件
  const text = await file.text();
  return parseCharacterCardJson(text);
}

export function exportCharacterCardV2(chara) {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: chara.name,
      description: chara.description,
      personality: chara.personality,
      scenario: chara.scenario,
      first_mes: chara.first_mes,
      alternate_greetings: chara.alternate_greetings || [],
      mes_example: chara.mes_example,
      system_prompt: chara.system_prompt,
      post_history_instructions: chara.post_history_instructions,
      creator_notes: chara.creator_notes,
      tags: chara.tags || [],
      character_book: chara.character_book || null,
      creator: chara.creator || '',
      character_version: chara.character_version || '1.0',
      extensions: {},
    },
  };
}

// ======================= 宏替换与提示词拼接 =======================
export function expandCharacterMacros(text, { charName = 'AI', userName = '你', model = '' } = {}) {
  if (!text) return '';
  const now = new Date();
  return text
    .replaceAll(/\{\{char\}\}/gi, charName)
    .replaceAll(/\{\{user\}\}/gi, userName)
    .replaceAll(/<char>/gi, charName)
    .replaceAll(/<user>/gi, userName)
    .replaceAll('{{date}}', now.toLocaleDateString())
    .replaceAll('{{time}}', now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    .replaceAll('{{model}}', model || '');
}

export function buildCharacterPrompt(chara, opts = {}) {
  if (!chara) return '';
  const charName = chara.name || 'AI';
  const userName = opts.userName || '你';
  const model = opts.model || '';

  const parts = [];
  if (chara.system_prompt?.trim()) {
    parts.push(expandCharacterMacros(chara.system_prompt.trim(), { charName, userName, model }));
  }

  const identity = [];
  if (chara.description?.trim()) {
    identity.push(`[Character Profile / 角色设定]:\n${expandCharacterMacros(chara.description.trim(), { charName, userName, model })}`);
  }
  if (chara.personality?.trim()) {
    identity.push(`[Personality & Quirks / 性格特征]:\n${expandCharacterMacros(chara.personality.trim(), { charName, userName, model })}`);
  }
  if (chara.scenario?.trim()) {
    identity.push(`[Current Scenario / 当前场景]:\n${expandCharacterMacros(chara.scenario.trim(), { charName, userName, model })}`);
  }
  if (chara.mes_example?.trim()) {
    identity.push(`[Dialogue Style & Examples / 对话范例]:\n${expandCharacterMacros(chara.mes_example.trim(), { charName, userName, model })}`);
  }
  if (identity.length) parts.push(identity.join('\n\n'));

  return parts.join('\n\n---\n\n');
}
