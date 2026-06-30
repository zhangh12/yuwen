// Radical query / export logic.
//
// Given a set of decks and radicals, collect every matching character together
// with the full sentence it appears in and its source (deck + page), then build
// a printable document. Export target is RTF (opens natively in Pages and keeps
// its formatting when exported to PDF). No DOM access here — the download/print
// side effects live in events.js.

import { state, lookupRadical, lookupPinyin, isHanzi } from "./core.js";

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
  state.decks.forEach((deck) => {
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
export function collectMatches(deckIds, radicals) {
  const ids = new Set(deckIds);
  const wanted = new Set(radicals);
  const entries = [];
  state.decks.forEach((deck, deckOrder) => {
    if (!ids.has(deck.id)) return;
    deck.pages.forEach((page, pageIndex) => {
      const { cps, clauses, clauseIndexOf } = buildClauses(page.mainText);
      const tokenByIndex = new Map((page.tokens || []).map((token) => [token.index, token]));
      const seen = new Set();
      cps.forEach((ch, index) => {
        if (!isHanzi(ch)) return;
        const radical = lookupRadical(ch);
        if (!radical || !wanted.has(radical)) return;
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

// --- RTF (opens in Pages) --------------------------------------------------

function rtfEscape(text) {
  let out = "";
  const str = String(text);
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = str.charCodeAt(i);
    if (ch === "\\" || ch === "{" || ch === "}") out += "\\" + ch;
    else if (code < 128) out += ch;
    else out += "\\u" + (code > 32767 ? code - 65536 : code) + "?";
  }
  return out;
}

function rtfSentence(sentence, highlightSet) {
  let out = "";
  for (const ch of sentence) {
    const piece = rtfEscape(ch);
    out += highlightSet.has(ch) ? `{\\cf2\\b ${piece}}` : piece;
  }
  return out;
}

export function buildRtf(groups, includePinyin) {
  const header = "{\\rtf1\\ansi\\ansicpg936\\deff0"
    + "{\\fonttbl{\\f0\\froman\\fcharset134 Songti SC;}}"
    + "{\\colortbl;\\red30\\green30\\blue30;\\red200\\green30\\blue30;}"
    + "\\f0\\fs24\\cf1 ";
  let body = "";
  groups.forEach(({ radical, items }, groupIndex) => {
    // Each radical starts on a new page.
    if (groupIndex > 0) body += "\\page ";
    body += `{\\b\\fs40\\sa120 ${rtfEscape(radical)}}\\par `;
    for (const block of mergeBySentence(items)) {
      const highlight = new Set(block.chars.map((item) => item.char));
      body += `{\\fs26 ${rtfEscape(headerLine(block, includePinyin))}}\\par `;
      body += `{\\fs24 ${rtfSentence(block.sentence, highlight)}}\\par `;
      // Blank line after each example.
      body += "\\par ";
    }
  });
  return header + body + "}";
}

// --- Printable HTML --------------------------------------------------------

function htmlEscape(text) {
  return String(text).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
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
