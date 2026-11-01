// 安全的轻量 Markdown 渲染器：先转义所有文本，再生成受控标签集合，输出不含任何用户可控的未转义 HTML。
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

const PH = '\uE000'; // 私有区字符作占位符

function styleText(s) {
  return s
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])__([^_\n]+?)__(?![_\w])/g, '$1<strong>$2</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+?)~~/g, '<del>$1</del>');
}

function inline(text) {
  const tokens = [];
  const hold = (html) => { tokens.push(html); return `${PH}${tokens.length - 1}${PH}`; };

  // 1. 保护行内代码（支持单/多反引号，并移除源码中可能出现的私有区字符）
  let s = String(text).replaceAll(PH, '').replace(/(`+)(?!`)(.*?[^`\n])\1(?!`)/g, (_, ticks, c) => {
    const code = c.length >= 2 && c.startsWith(' ') && c.endsWith(' ') && c.trim() ? c.slice(1, -1) : c;
    return hold(`<code>${esc(code)}</code>`);
  });
  // 2. 转义其余所有文本
  s = esc(s);
  // 3. 图片与显式链接（仅允许 http/https，支持 URL 中一层配对括号，放入占位符避免被裸链接二次匹配）
  s = s.replace(/!\[([^\]]*)\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)\)/g,
    (_, alt, u) => hold(`<img src="${u}" alt="${alt}" loading="lazy">`));
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)\)/g,
    (_, t, u) => hold(`<a href="${u}" target="_blank" rel="noopener noreferrer">${styleText(t)}</a>`));
  // 4. 裸 URL 自动转链接
  s = s.replace(/(^|[\s(（])(https?:\/\/[^\s<>()（）\uE000]+[^\s<>()（）\uE000.,;:!?。，；：！？])/g,
    (_, pre, u) => `${pre}${hold(`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`)}`);
  // 5. 强调与删除线
  s = styleText(s);
  // 6. 还原占位符（用循环还原以支持链接文本中嵌套行内代码占位符）
  for (let pass = 0; pass < 2 && s.includes(PH); pass++) {
    s = s.replace(new RegExp(`${PH}(\\d+)${PH}`, 'g'), (_, i) => tokens[Number(i)]);
  }
  return s;
}

function codeBlock(code, lang) {
  return `<div class="code-block"><div class="code-head"><span>${esc(lang || 'text')}</span>` +
    `<button class="copy-code" type="button">复制</button></div><pre><code>${esc(code)}</code></pre></div>`;
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})\s*([^\s`~]*)/;
const HR_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const HEAD_RE = /^(#{1,6})\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  let ticks = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (ch === '`') {
      let run = 1;
      while (s[i + run] === '`') run++;
      if (ticks === 0) {
        // 仅当同一行后续存在同长度反引号闭合时才进入保护态
        const closeRe = new RegExp(`(?<!\`)\`{${run}}(?!\`)`);
        if (closeRe.test(s.slice(i + run))) ticks = run;
      } else if (run === ticks) ticks = 0;
      cur += s.slice(i, i + run);
      i += run - 1;
      continue;
    }
    if (ch === '|' && ticks === 0) { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function isTableStart(lines, i) {
  return lines[i].includes('|') && i + 1 < lines.length && lines[i + 1].includes('-') && TABLE_SEP_RE.test(lines[i + 1]);
}

function parseList(lines, i, baseIndent) {
  const first = lines[i].match(LIST_RE);
  const ordered = /\d/.test(first[2]);
  const start = ordered ? parseInt(first[2], 10) : 1;
  let html = ordered ? `<ol${start !== 1 ? ` start="${start}"` : ''}>` : '<ul>';
  while (i < lines.length) {
    const m = lines[i].match(LIST_RE);
    if (!m) break;
    const indent = m[1].length;
    if (indent !== baseIndent || /\d/.test(m[2]) !== ordered) break;
    let content = m[3];
    i++;
    while (i < lines.length && lines[i].trim() && !LIST_RE.test(lines[i]) && /^\s+/.test(lines[i])) {
      content += '\n' + lines[i].trim();
      i++;
    }
    let task = '';
    const tm = content.match(/^\[([ xX])\]\s+/);
    if (tm) { task = `<input type="checkbox" disabled${tm[1] !== ' ' ? ' checked' : ''}> `; content = content.slice(tm[0].length); }
    let inner = task + content.split('\n').map(inline).join('<br>');
    let j = i;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j < lines.length && LIST_RE.test(lines[j])) i = j;
    const nm = i < lines.length && lines[i].match(LIST_RE);
    if (nm && nm[1].length > baseIndent) {
      const r = parseList(lines, i, nm[1].length);
      inner += r.html;
      i = r.i;
    }
    html += `<li>${inner}</li>`;
  }
  return { html: html + (ordered ? '</ol>' : '</ul>'), i };
}

function isBlockStart(lines, i) {
  const l = lines[i];
  return FENCE_RE.test(l) || HEAD_RE.test(l) || HR_RE.test(l) || /^\s*>/.test(l) || LIST_RE.test(l) || isTableStart(lines, i);
}

export function renderMarkdown(src) {
  if (!src) return '';
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if ((m = line.match(FENCE_RE))) {
      const fence = m[1];
      const closeRe = new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`);
      const buf = [];
      i++;
      while (i < lines.length && !closeRe.test(lines[i])) buf.push(lines[i++]);
      i++;
      html += codeBlock(buf.join('\n'), m[2]);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    if ((m = line.match(HEAD_RE))) {
      const n = m[1].length;
      html += `<h${n}>${inline(m[2])}</h${n}>`;
      i++;
      continue;
    }
    if (HR_RE.test(line)) { html += '<hr>'; i++; continue; }
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      html += `<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`;
      continue;
    }
    if (isTableStart(lines, i)) {
      const head = splitRow(lines[i]);
      const aligns = splitRow(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'ta-center' : c.endsWith(':') ? 'ta-right' : ''));
      i += 2;
      let t = '<div class="table-wrap"><table><thead><tr>' +
        head.map((h, k) => `<th${aligns[k] ? ` class="${aligns[k]}"` : ''}>${inline(h)}</th>`).join('') + '</tr></thead><tbody>';
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        const cells = splitRow(lines[i++]);
        t += '<tr>' + head.map((_, k) => `<td${aligns[k] ? ` class="${aligns[k]}"` : ''}>${inline(cells[k] ?? '')}</td>`).join('') + '</tr>';
      }
      html += t + '</tbody></table></div>';
      continue;
    }
    if ((m = line.match(LIST_RE))) {
      const r = parseList(lines, i, m[1].length);
      html += r.html;
      i = r.i;
      continue;
    }
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines, i)) buf.push(lines[i++]);
    html += `<p>${buf.map(inline).join('<br>')}</p>`;
  }
  return html;
}
