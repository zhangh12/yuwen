// Radical query / export logic.
//
// Given a set of decks and radicals, collect every matching character together
// with the full sentence it appears in and its source (deck + page), then build
// a printable document. Export target is Word (.docx), which opens natively in
// Pages (no Office needed) and keeps its formatting when exported to PDF. No DOM
// access here — the download/print side effects live in events.js.

import { allTexts, lookupRadical, lookupPinyin, isHanzi } from "./core.js";

// 。！？ (and line breaks) end a sentence; commas / 、；：… only end a clause.
const SENTENCE_END = "。！？.!?\n";
const CLAUSE_END = SENTENCE_END + "，、；：…,;:";

// Split text (by code point, matching token.index) into clauses, recording each
// code point's clause index and whether each clause ends a full sentence.
function buildClauses(text) {
  const cps = [...String(text || "")];
  const clauses = [];
  const clauseIndexOf = new Array(cps.length);
  let buffer = "";
  cps.forEach((ch, i) => {
    buffer += ch;
    clauseIndexOf[i] = clauses.length;
    if (CLAUSE_END.includes(ch)) {
      clauses.push({ text: buffer, terminal: SENTENCE_END.includes(ch) });
      buffer = "";
    }
  });
  if (buffer.length) clauses.push({ text: buffer, terminal: true });
  return { cps, clauses, clauseIndexOf };
}

// Example sentence for the clause containing a matched char: the clause itself,
// plus the next clause when this one does not end with 。！？(or a line break).
function exampleText(clauses, ci) {
  let example = clauses[ci].text;
  if (!clauses[ci].terminal && clauses[ci + 1]) example += clauses[ci + 1].text;
  return example.replace(/\n/g, "").trim();
}

// Radicals present across the given decks, each with the count of distinct
// characters, sorted by count desc then radical.
export function radicalsInDecks(deckIds) {
  const ids = new Set(deckIds);
  const byRadical = new Map();
  allTexts().forEach((deck) => {
    if (!ids.has(deck.id)) return;
    deck.pages.forEach((page) => {
      for (const ch of String(page.mainText || "")) {
        if (!isHanzi(ch)) continue;
        const radical = lookupRadical(ch);
        if (!radical) continue;
        if (!byRadical.has(radical)) byRadical.set(radical, new Set());
        byRadical.get(radical).add(ch);
      }
    });
  });
  return [...byRadical.entries()]
    .map(([radical, chars]) => ({ radical, count: chars.size }))
    .sort((a, b) => b.count - a.count || a.radical.localeCompare(b.radical));
}

// Every matching character occurrence (one entry per distinct char per
// sentence) in deck → page → sentence order.
// Unique characters across the given decks whose radical is in `radicals`,
// each with its occurrence count, sorted by count desc then by character.
// sortBy: "freq" (出现次数降序，默认) | "radical"（按部首归类，与 Word 导出的分组顺序一致）。
export function charsInDecks(deckIds, radicals, sortBy = "freq") {
  const ids = new Set(deckIds);
  const wanted = new Set(radicals);
  const counts = new Map();
  allTexts().forEach((deck) => {
    if (!ids.has(deck.id)) return;
    deck.pages.forEach((page) => {
      for (const ch of String(page.mainText || "")) {
        if (!isHanzi(ch)) continue;
        const radical = lookupRadical(ch);
        if (!radical || !wanted.has(radical)) continue;
        counts.set(ch, (counts.get(ch) || 0) + 1);
      }
    });
  });
  const list = [...counts.entries()].map(([char, count]) => ({ char, count, radical: lookupRadical(char) }));
  if (sortBy === "radical") {
    const groupTotal = new Map();
    for (const item of list) groupTotal.set(item.radical, (groupTotal.get(item.radical) || 0) + item.count);
    return list.sort((a, b) =>
      (groupTotal.get(b.radical) - groupTotal.get(a.radical))
      || a.radical.localeCompare(b.radical)
      || (b.count - a.count)
      || a.char.localeCompare(b.char));
  }
  return list.sort((a, b) => b.count - a.count || a.char.localeCompare(b.char));
}

// `chars` is a Set of the characters to include (already chosen by the user).
export function collectMatches(deckIds, chars) {
  const ids = new Set(deckIds);
  const wanted = chars instanceof Set ? chars : new Set(chars);
  const entries = [];
  allTexts().forEach((deck, deckOrder) => {
    if (!ids.has(deck.id)) return;
    deck.pages.forEach((page, pageIndex) => {
      const { cps, clauses, clauseIndexOf } = buildClauses(page.mainText);
      const tokenByIndex = new Map((page.tokens || []).map((token) => [token.index, token]));
      const seen = new Set();
      cps.forEach((ch, index) => {
        if (!isHanzi(ch) || !wanted.has(ch)) return;
        const radical = lookupRadical(ch);
        const clauseIndex = clauseIndexOf[index];
        const key = `${clauseIndex}|${ch}`;
        if (seen.has(key)) return;
        seen.add(key);
        // Use the reading the user chose in the deck (correct for polyphonic
        // characters); fall back to the default reading only when no token.
        const token = tokenByIndex.get(index);
        entries.push({
          radical,
          char: ch,
          pinyin: (token && token.pinyin) || lookupPinyin(ch)[0] || "",
          deckOrder,
          deckTitle: deck.title,
          pageIndex,
          sentence: exampleText(clauses, clauseIndex)
        });
      });
    });
  });
  return entries;
}

// Group matches by radical (within a radical the entries keep deck → page
// order), radical sections sorted by entry count desc.
export function groupByRadical(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.radical)) groups.set(entry.radical, []);
    groups.get(entry.radical).push(entry);
  }
  return [...groups.entries()]
    .map(([radical, items]) => ({ radical, items }))
    .sort((a, b) => b.items.length - a.items.length || a.radical.localeCompare(b.radical));
}

// Within a radical, merge entries by example sentence so the sentence is shown
// once and the shared characters are listed together on the header line.
// Keyed by sentence text only: identical characters + sentence that differ
// merely in deck/page are NOT repeated — the first occurrence's source is kept.
export function mergeBySentence(items) {
  const blocks = [];
  const byKey = new Map();
  for (const entry of items) {
    const block = byKey.get(entry.sentence);
    if (!block) {
      const created = {
        chars: [{ char: entry.char, pinyin: entry.pinyin }],
        seen: new Set([entry.char]),
        deckTitle: entry.deckTitle,
        pageIndex: entry.pageIndex,
        sentence: entry.sentence
      };
      byKey.set(entry.sentence, created);
      blocks.push(created);
    } else if (!block.seen.has(entry.char)) {
      block.seen.add(entry.char);
      block.chars.push({ char: entry.char, pinyin: entry.pinyin });
    }
  }
  return blocks;
}

export function headerLine(block, includePinyin) {
  const chars = block.chars
    .map((item) => (includePinyin && item.pinyin ? `${item.char} ${item.pinyin}` : item.char))
    .join("　");
  return `${chars} —— ${block.deckTitle} · 第${block.pageIndex + 1}页`;
}

// --- Printable HTML --------------------------------------------------------

function htmlEscape(text) {
  return String(text).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
}

// --- Word (.docx) ----------------------------------------------------------
//
// A .docx is a ZIP of XML parts. We hand-build a minimal OOXML package and a
// tiny "stored" (uncompressed) ZIP so there is no third-party dependency.
// Browser-downloaded .docx does not trigger the macOS Gatekeeper "cannot verify
// it is free of malware" prompt (which some other downloaded document formats
// do), and Pages opens it (no Office required).

function xmlEscape(text) {
  return String(text).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
}

function docxRun(text, opts = {}) {
  const props = [
    '<w:rFonts w:ascii="Songti SC" w:hAnsi="Songti SC" w:eastAsia="Songti SC"/>',
    opts.bold ? "<w:b/>" : "",
    opts.color ? `<w:color w:val="${opts.color}"/>` : "",
    opts.sz ? `<w:sz w:val="${opts.sz}"/><w:szCs w:val="${opts.sz}"/>` : ""
  ].join("");
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function docxPara(runs, opts = {}) {
  const props = [
    opts.pageBreak ? "<w:pageBreakBefore/>" : "",
    opts.after != null ? `<w:spacing w:after="${opts.after}"/>` : ""
  ].join("");
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${runs}</w:p>`;
}

function docxSentence(sentence, highlight) {
  let runs = "";
  let buffer = "";
  const flush = () => { if (buffer) { runs += docxRun(buffer, { sz: 24 }); buffer = ""; } };
  for (const ch of sentence) {
    if (highlight.has(ch)) {
      flush();
      runs += docxRun(ch, { bold: true, color: "C81E1E", sz: 24 });
    } else {
      buffer += ch;
    }
  }
  flush();
  return runs;
}

function buildDocumentXml(groups, includePinyin) {
  let paragraphs = "";
  groups.forEach(({ radical, items }, groupIndex) => {
    paragraphs += docxPara(docxRun(radical, { bold: true, sz: 40 }), { pageBreak: groupIndex > 0, after: 120 });
    for (const block of mergeBySentence(items)) {
      const highlight = new Set(block.chars.map((item) => item.char));
      paragraphs += docxPara(docxRun(headerLine(block, includePinyin), { sz: 26 }));
      paragraphs += docxPara(docxSentence(block.sentence, highlight));
      paragraphs += "<w:p/>";
    }
  });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:body>${paragraphs}<w:sectPr/></w:body></w:document>`;
}

const CONTENT_TYPES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + "</Types>";

const ROOT_RELS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  + "</Relationships>";

function crc32(bytes) {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

// Build an uncompressed (stored) ZIP from [{name, data: Uint8Array}].
function zipStore(files) {
  const u16 = (n) => [n & 255, (n >>> 8) & 255];
  const u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = Uint8Array.from([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(file.data.length), ...u32(file.data.length),
      ...u16(nameBytes.length), ...u16(0)
    ]);
    parts.push(local, nameBytes, file.data);
    central.push({ nameBytes, crc, size: file.data.length, offset });
    offset += local.length + nameBytes.length + file.data.length;
  }
  const cdStart = offset;
  const cdParts = [];
  for (const entry of central) {
    const record = Uint8Array.from([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(entry.crc), ...u32(entry.size), ...u32(entry.size),
      ...u16(entry.nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(entry.offset)
    ]);
    cdParts.push(record, entry.nameBytes);
    offset += record.length + entry.nameBytes.length;
  }
  const end = Uint8Array.from([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length),
    ...u32(offset - cdStart), ...u32(cdStart), ...u16(0)
  ]);
  const all = [...parts, ...cdParts, end];
  const total = all.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let pointer = 0;
  for (const part of all) { out.set(part, pointer); pointer += part.length; }
  return out;
}

export function buildDocx(groups, includePinyin) {
  const encoder = new TextEncoder();
  return zipStore([
    { name: "[Content_Types].xml", data: encoder.encode(CONTENT_TYPES_XML) },
    { name: "_rels/.rels", data: encoder.encode(ROOT_RELS_XML) },
    { name: "word/document.xml", data: encoder.encode(buildDocumentXml(groups, includePinyin)) }
  ]);
}

export function buildPrintHtml(groups, includePinyin) {
  let body = "";
  for (const { radical, items } of groups) {
    body += `<h2>${htmlEscape(radical)}</h2>`;
    for (const block of mergeBySentence(items)) {
      const highlight = new Set(block.chars.map((item) => item.char));
      const sentence = [...block.sentence]
        .map((ch) => (highlight.has(ch) ? `<b class="hl">${htmlEscape(ch)}</b>` : htmlEscape(ch)))
        .join("");
      body += `<div class="entry"><div class="meta">${htmlEscape(headerLine(block, includePinyin))}</div><div class="sent">${sentence}</div></div>`;
    }
  }
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>查字</title><style>
    body{font-family:"Songti SC","SimSun",serif;color:#1f1d1a;padding:28px;line-height:1.5;}
    h2{font-size:26px;margin:0 0 10px;break-before:page;page-break-before:always;}
    h2:first-of-type{break-before:avoid;page-break-before:avoid;}
    .entry{margin:0 0 22px;}
    .meta{font-size:16px;}
    .sent{font-size:15px;color:#333;}
    .hl{color:#c81e1e;}
    @media print{body{padding:0;}}
  </style></head><body>${body || "<p>没有匹配的字。</p>"}</body></html>`;
}
