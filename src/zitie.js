// 米字格字帖（练字帖）渲染。
//
// 笔画数据按需从免费 CDN（jsdelivr / unpkg 的 hanzi-writer-data，与本地 makemeahanzi
// 同格式）取，仓库不打包、不进启动路径。渲染成田字格练字帖 HTML，交浏览器打印 /
// 「存为 PDF」。每个字一块：黑色整字 → 逐笔（已写灰、最新粉红）→ 一整行描红灰。

const STROKE_CACHE = new Map();

function cdnUrls(char) {
  const c = encodeURIComponent(char);
  return [
    `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2/${c}.json`,
    `https://unpkg.com/hanzi-writer-data@2/${c}.json`
  ];
}

// 取单字的逐笔 SVG 路径数组；取不到返回 null。结果缓存。
export async function fetchStrokes(char) {
  if (STROKE_CACHE.has(char)) return STROKE_CACHE.get(char);
  let strokes = null;
  for (const url of cdnUrls(char)) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.strokes)) { strokes = data.strokes; break; }
      }
    } catch {
      /* 试下一个源 */
    }
  }
  STROKE_CACHE.set(char, strokes);
  return strokes;
}

const COLS = 12;
const INK = "#2b2b2b";
const PRIOR = "#cfcfcf";
const NEW = "#ef8784";
const TRACE = "#d9d9d9";

function cell(paths) {
  const body = paths.map((p) => `<path d="${p.d}" fill="${p.fill}"/>`).join("");
  return `<div class="zt-cell"><svg viewBox="0 0 1024 1024"><g transform="scale(1,-1) translate(0,-900)">${body}</g></svg></div>`;
}

// 一个字占连续网格里的若干整行：首格整字黑 → 逐笔（已写灰、最新粉红）→ 整行描红灰。
// 返回该字的格子 HTML 数组（长度补足为 COLS 的整数倍，使下一个字从行首开始）。
function charCells(char, strokes) {
  const s = Array.isArray(strokes) ? strokes : [];
  const cells = [];
  if (!s.length) {
    cells.push(`<div class="zt-cell zt-text">${char}</div>`);
    while (cells.length % COLS !== 0) cells.push('<div class="zt-cell"></div>');
    return cells;
  }
  cells.push(cell(s.map((d) => ({ d, fill: INK }))));
  for (let k = 1; k <= s.length; k++) {
    cells.push(cell(s.slice(0, k).map((d, i) => ({ d, fill: i === k - 1 ? NEW : PRIOR }))));
  }
  const pad = (COLS - (cells.length % COLS)) % COLS + COLS;
  for (let i = 0; i < pad; i++) cells.push(cell(s.map((d) => ({ d, fill: TRACE }))));
  return cells;
}

// charStrokes: [{char, strokes}] —— 全部字拼成一张连续网格，外套一个贴合内容的绿色双线框。
export function buildZitieHtml(charStrokes) {
  const cells = charStrokes.flatMap((c) => charCells(c.char, c.strokes)).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>字帖</title><style>
   body{margin:0;font-family:"PingFang SC",sans-serif;}
   /* 外框：单条粗绿线，贴合内容（不满一页不拉到页底）；
      box-decoration-break:clone 让跨页时每一页片段都补齐完整四边框（含上下沿）。 */
   .zt-frame{border:3px solid #3aaa6f;padding:5px;
             -webkit-box-decoration-break:clone;box-decoration-break:clone;}
   /* 网格用实线边框：grid 提供上/左外线，cell 提供右/下线（单线、无重叠）；
      box-decoration-break:clone 使续页顶部也补出网格上边线 */
   .zt-grid{display:grid;grid-template-columns:repeat(${COLS},1fr);
            border-left:1px solid #3aaa6f;border-top:1px solid #3aaa6f;
            -webkit-box-decoration-break:clone;box-decoration-break:clone;}
   .zt-cell{position:relative;aspect-ratio:1/1;
            border-right:1px solid #3aaa6f;border-bottom:1px solid #3aaa6f;break-inside:avoid;}
   .zt-cell::before{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:1px dashed #bfe0cd;}
   .zt-cell::after{content:"";position:absolute;top:50%;left:0;right:0;border-top:1px dashed #bfe0cd;}
   .zt-cell svg{position:absolute;inset:0;width:100%;height:100%;}
   .zt-text{display:flex;align-items:center;justify-content:center;font-size:22px;color:#999;}
   @page{margin:14mm;}
  </style></head><body><div class="zt-frame"><div class="zt-grid">${cells}</div></div></body></html>`;
}
