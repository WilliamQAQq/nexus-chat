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

export function embedCharaInPng(pngInput, charaJson) {
  let rawBytes;
  if (typeof pngInput === 'string') {
    const m = /^data:[^;]+;base64,(.*)$/s.exec(pngInput.trim());
    const b64 = m ? m[1] : pngInput.trim();
    const bin = atob(b64.replace(/\s+/g, ''));
    rawBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) rawBytes[i] = bin.charCodeAt(i);
  } else if (pngInput instanceof Uint8Array) {
    rawBytes = pngInput;
  } else if (pngInput instanceof ArrayBuffer || ArrayBuffer.isView(pngInput)) {
    rawBytes = new Uint8Array(pngInput.buffer || pngInput);
  } else {
    throw new Error('无效的 PNG 数据源');
  }

  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (rawBytes.length < 33 || sig.some((b, i) => rawBytes[i] !== b)) {
    throw new Error('不是有效的 PNG 图片格式');
  }

  // 若传入的是内部角色对象（未包裹 spec: chara_card_v2），自动包装为标准 V2 结构
  let payload = charaJson;
  if (payload && typeof payload === 'object' && !payload.spec && !payload.data) {
    payload = buildCharacterCardV2Object(payload);
  }
  const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
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

  // 扫描现有 chunks，移除旧的 chara/ccv3 tEXt chunk，并在 IHDR 之后插入新 chunk
  const keptChunks = [rawBytes.subarray(0, 8)];
  let offset = 8;
  let inserted = false;
  const decoder = new TextDecoder('latin1');

  while (offset + 12 <= rawBytes.length) {
    const cLen = ((rawBytes[offset] << 24) | (rawBytes[offset + 1] << 16) | (rawBytes[offset + 2] << 8) | rawBytes[offset + 3]) >>> 0;
    const type = String.fromCharCode(rawBytes[offset + 4], rawBytes[offset + 5], rawBytes[offset + 6], rawBytes[offset + 7]);
    const totalChunkLen = 12 + cLen;
    if (offset + totalChunkLen > rawBytes.length) {
      keptChunks.push(rawBytes.subarray(offset));
      break;
    }
    let skip = false;
    if (type === 'tEXt') {
      const chunkData = rawBytes.subarray(offset + 8, offset + 8 + cLen);
      const nullIdx = chunkData.indexOf(0x00);
      if (nullIdx !== -1) {
        const kw = decoder.decode(chunkData.subarray(0, nullIdx));
        if (kw === 'chara' || kw === 'ccv3') skip = true;
      }
    }
    if (!skip) keptChunks.push(rawBytes.subarray(offset, offset + totalChunkLen));
    if (type === 'IHDR' && !inserted) {
      keptChunks.push(chunk);
      inserted = true;
    }
    offset += totalChunkLen;
    if (type === 'IEND') break;
  }
  if (!inserted) keptChunks.push(chunk);

  const totalLen = keptChunks.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const arr of keptChunks) {
    result.set(arr, pos);
    pos += arr.length;
  }
  return result.buffer;
}

// ======================= 角色卡规范解析与标准化 =======================
export function parseCharacterCardJson(raw) {
  let parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;

  // 处理包裹在 data 中的 V2 规范 (spec: chara_card_v2) 或 V3
  const isV2OrV3 = (parsed.spec === 'chara_card_v2' || parsed.spec === 'chara_card_v3') && parsed.data;
  const d = isV2OrV3 ? parsed.data : parsed;

  let description = d.description || d.char_persona || '';
  let personality = d.personality || '';
  let scenario = d.scenario || '';
  let first_mes = d.first_mes || '';
  let tags = Array.isArray(d.tags) ? [...d.tags] : [];

  // 自适应 AI 生成的角色设定档案 (如具备 demographics, archetype, physical_traits 等结构)
  if (!description && (d.demographics || d.archetype || d.physical_traits || d.tactical_and_practical_skills || d.dimensional_storage || d.vulnerabilities_and_constraints)) {
    const descParts = [];
    if (d.archetype) descParts.push(`【身份定位】${d.archetype}`);
    if (d.demographics && typeof d.demographics === 'object') {
      const demoStr = Object.entries(d.demographics).map(([k, v]) => `${k}: ${v}`).join('；');
      descParts.push(`【基本档案】${demoStr}`);
      if (d.demographics.gender && !tags.includes(d.demographics.gender)) tags.push(d.demographics.gender);
    }
    if (d.physical_traits && typeof d.physical_traits === 'object') {
      const physStr = Object.entries(d.physical_traits).map(([k, v]) => `${k}: ${v}`).join('；');
      descParts.push(`【生理与体貌】${physStr}`);
    }
    if (d.linguistic_skills && typeof d.linguistic_skills === 'object') {
      const lingStr = Object.entries(d.linguistic_skills).map(([k, v]) => `${k}: ${v}`).join('；');
      descParts.push(`【语言能力】${lingStr}`);
    }
    if (d.tactical_and_practical_skills && typeof d.tactical_and_practical_skills === 'object') {
      const tactStr = Object.entries(d.tactical_and_practical_skills).map(([k, v]) => `${k}: ${v}`).join('；');
      descParts.push(`【战术与技能】${tactStr}`);
    }
    if (d.dimensional_storage) {
      descParts.push(`【随身物资】意念随身空间，内部时间静止，严禁外人目击存取。`);
    }
    if (d.vulnerabilities_and_constraints && typeof d.vulnerabilities_and_constraints === 'object') {
      const vulStr = Object.entries(d.vulnerabilities_and_constraints).map(([k, v]) => `${k}: ${v}`).join('；');
      descParts.push(`【生存红线与弱点】${vulStr}`);
    }
    description = descParts.join('\n\n');

    if (!personality && d.archetype) {
      personality = `冷静、理智、行事果决的${d.archetype}，具备受过正规训练的战术素养与学者缜密思维。`;
    }
    if (!scenario) {
      scenario = `时空滞留者在充满未知的时代环境中求生与周旋。`;
    }
    if (!first_mes) {
      first_mes = `（警惕地环顾四周，理了理身上的衣物，用沉稳而克制的语气开口）：\n“在这片陌生的境地里，多一分谨慎，就多一分生机。告诉我……你在此处所为何事？”`;
    }
  }

  const chara = {
    id: d.id || uid(),
    name: (d.name || '未命名角色').trim(),
    avatar: d.avatar || '',
    description,
    personality,
    scenario,
    first_mes,
    alternate_greetings: Array.isArray(d.alternate_greetings) ? d.alternate_greetings.filter(Boolean) : [],
    mes_example: d.mes_example || '',
    system_prompt: d.system_prompt || '',
    post_history_instructions: d.post_history_instructions || '',
    creator_notes: d.creator_notes || d.creatorcomment || '',
    tags,
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

export function buildCharacterCardV2Object(chara) {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: chara.name || '',
      description: chara.description || '',
      personality: chara.personality || '',
      scenario: chara.scenario || '',
      first_mes: chara.first_mes || '',
      alternate_greetings: chara.alternate_greetings || [],
      mes_example: chara.mes_example || '',
      system_prompt: chara.system_prompt || '',
      post_history_instructions: chara.post_history_instructions || '',
      creator_notes: chara.creator_notes || '',
      tags: chara.tags || [],
      character_book: chara.character_book || null,
      creator: chara.creator || '',
      character_version: chara.character_version || '1.0',
      extensions: {},
    },
  };
}

export function exportCharacterCardV2(chara) {
  return JSON.stringify(buildCharacterCardV2Object(chara), null, 2);
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

export function buildPostHistoryPrompt(chara, opts = {}) {
  if (!chara?.post_history_instructions?.trim()) return '';
  const charName = chara.name || 'AI';
  const userName = opts.userName || '你';
  const model = opts.model || '';
  return expandCharacterMacros(chara.post_history_instructions.trim(), { charName, userName, model });
}
