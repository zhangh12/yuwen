// Persistence layer.
//
// State is stored in IndexedDB as the primary store. Images live in a separate
// IndexedDB object store as raw Blobs ("images"), and state only carries a
// blobId reference per image:
//   - 保存不再随每次编辑重写全部图片字节（state 本身变小几个量级）；
//   - 渲染不再把几 MB 的 base64 塞进 innerHTML，而是用缓存的 objectURL；
//   - Blob 免去 base64 的 ~33% 体积膨胀。
// 备份文件仍是自包含 JSON：导出时把 Blob 内联回 data: URL，导入时再收进 Blob 仓，
// 因此 yuwen-backup 格式不变、旧文件（内联 data: 图片）也照常导入。
// localStorage is kept only as a best-effort mirror (now tiny, since images are
// not in the payload) and as a migration source for decks saved by older builds.

import {
  STORAGE_KEY,
  state,
  getActiveDeck,
  getActiveBook,
  createBook,
  createDeck,
  createPage,
  tokenizePage,
  ensureBookModel,
  mergeLexicon,
  dateStamp,
  deepClone,
  id
} from "./core.js";

const DB_NAME = "yuwen";
const DB_VERSION = 2;
const STORE = "kv";
const IMAGE_STORE = "images";
const STATE_KEY = "state";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis) || !globalThis.indexedDB) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(IMAGE_STORE)) db.createObjectStore(IMAGE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function idbRequest(storeName, mode, run) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = run(tx.objectStore(storeName));
    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }
  }));
}

const idbGet = (key) => idbRequest(STORE, "readonly", (store) => store.get(key));
const idbSet = (key, value) => idbRequest(STORE, "readwrite", (store) => { store.put(value, key); });
const idbImageGet = (key) => idbRequest(IMAGE_STORE, "readonly", (store) => store.get(key));
const idbImagePut = (key, blob) => idbRequest(IMAGE_STORE, "readwrite", (store) => { store.put(blob, key); });
const idbImageDelete = (key) => idbRequest(IMAGE_STORE, "readwrite", (store) => { store.delete(key); });
const idbImageKeys = () => idbRequest(IMAGE_STORE, "readonly", (store) => store.getAllKeys());

// --- 图片 Blob 仓 ------------------------------------------------------------

// blobId -> { blob, url }。加载时预载全部被引用的 Blob，渲染同步取 objectURL。
const blobCache = new Map();

function cacheBlob(blobId, blob) {
  if (blobCache.has(blobId)) return blobCache.get(blobId);
  const entry = { blob, url: URL.createObjectURL(blob) };
  blobCache.set(blobId, entry);
  return entry;
}

// 渲染用：图片 → 可放进 <img src> 的地址。优先 Blob 仓；老数据 / 无 IndexedDB
// 环境回落到内联 data: URL。
export function imageUrl(image) {
  if (image?.blobId && blobCache.has(image.blobId)) return blobCache.get(image.blobId).url;
  return image?.src || "";
}

// 新图片入仓（file 即 Blob）。返回 blobId。
export async function storeImageBlob(blob) {
  const blobId = id("blob");
  await idbImagePut(blobId, blob);
  cacheBlob(blobId, blob);
  return blobId;
}

async function dataUrlToBlob(dataUrl) {
  return (await fetch(dataUrl)).blob();
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

function forEachImage(bookLike, fn) {
  bookLike.texts?.forEach((text) => text.pages?.forEach((page) => (page.images || []).forEach(fn)));
  Object.values(bookLike.lexicon || {}).forEach((entry) => {
    if (entry && typeof entry === "object") (entry.images || []).forEach(fn);
  });
}

// 把 bookLike（state 里的书，或导入封套）中所有内联 data: 图片收进 Blob 仓，
// 改存 blobId。迁移旧数据与导入备份共用。
async function internImages(bookLike) {
  const pending = [];
  forEachImage(bookLike, (image) => {
    if (typeof image?.src === "string" && image.src.startsWith("data:")) pending.push(image);
  });
  for (const image of pending) {
    try {
      image.blobId = await storeImageBlob(await dataUrlToBlob(image.src));
      delete image.src;
    } catch {
      /* 保留内联 src 作为回退（例如无 IndexedDB 环境） */
    }
  }
}

// 预载 state 引用到的全部 Blob 进缓存；引用不到的仓内条目视为孤儿并清除
// （删除图片/课文/课本不即时删 Blob，统一在这里回收）。
async function preloadAndSweepBlobs() {
  const referenced = new Set();
  state.books.forEach((book) => forEachImage(book, (image) => {
    if (image?.blobId) referenced.add(image.blobId);
  }));
  for (const blobId of referenced) {
    if (blobCache.has(blobId)) continue;
    try {
      const blob = await idbImageGet(blobId);
      if (blob) cacheBlob(blobId, blob);
    } catch { /* 渲染时回落为空 src */ }
  }
  try {
    const keys = (await idbImageKeys()) || [];
    for (const key of keys) {
      if (!referenced.has(key)) await idbImageDelete(key);
    }
  } catch { /* 回收失败无碍正确性 */ }
}

// --- State load / save -------------------------------------------------------

function buildPayload() {
  return {
    version: 2,
    books: state.books,
    activeBookId: state.activeBookId,
    activeDeckId: state.activeDeckId,
    activePageId: state.activePageId
  };
}

// Accept both the new books[] payload and the legacy flat decks[] payload,
// wrapping the latter into a single default book so no existing data is lost.
function normalizeToBooks(stored) {
  if (Array.isArray(stored.books)) return stored;
  const book = {
    id: id("book"),
    title: "我的课本",
    updatedAt: Date.now(),
    lexicon: {},
    texts: stored.decks
  };
  return {
    books: [book],
    activeBookId: book.id,
    activeDeckId: stored.activeDeckId,
    activePageId: stored.activePageId
  };
}

function applyLoadedState(stored) {
  const normalized = normalizeToBooks(stored);
  state.books = normalized.books;
  state.activeBookId = normalized.activeBookId || state.books[0].id;
  state.activeDeckId = normalized.activeDeckId || getActiveBook()?.texts?.[0]?.id || "";
  state.activePageId = normalized.activePageId || getActiveDeck()?.pages?.[0]?.id || "";
  state.books.forEach((book) => {
    book.texts.forEach((deck) => deck.pages.forEach(tokenizePage));
    ensureBookModel(book);
  });
  // Start with the active book expanded in the navigator (still user-collapsible).
  state.ui.expandedBookIds = state.activeBookId ? [state.activeBookId] : [];
}

// localStorage 镜像只是无 IndexedDB 环境下小数据的兜底，不必每次保存都同步
// 全量 JSON.stringify。这里做两件事：防抖合并连续保存；超过配额必炸的大
// payload 直接跳过（IndexedDB 为主存）。
const MIRROR_DEBOUNCE_MS = 400;
const MIRROR_LIMIT = 4_500_000;
let mirrorTimer = 0;

function mirrorToLocalStorage() {
  try {
    const json = JSON.stringify(buildPayload());
    if (json.length > MIRROR_LIMIT) return;
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    /* IndexedDB remains the source of truth */
  }
}

// 关页/切走时冲刷未落盘的镜像，避免兜底数据落后于主存。
window.addEventListener("pagehide", () => {
  window.clearTimeout(mirrorTimer);
  mirrorToLocalStorage();
});

export function saveState() {
  // Primary store: IndexedDB，即改即存。Fire-and-forget; overlapping writes are
  // serialized by IndexedDB and last-write-wins, which matches the previous
  // behaviour.
  idbSet(STATE_KEY, buildPayload()).catch(() => {});
  window.clearTimeout(mirrorTimer);
  mirrorTimer = window.setTimeout(mirrorToLocalStorage, MIRROR_DEBOUNCE_MS);
}

export async function loadState() {
  let stored = null;
  try {
    stored = await idbGet(STATE_KEY);
  } catch {
    stored = null;
  }

  const hasData = (value) => value
    && ((Array.isArray(value.books) && value.books.length)
      || (Array.isArray(value.decks) && value.decks.length));

  if (!hasData(stored)) {
    // Migrate a payload saved by the older localStorage-only build (either the
    // new books shape or the legacy decks shape).
    try {
      const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (hasData(legacy)) stored = legacy;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  if (hasData(stored)) {
    applyLoadedState(stored);
    // 老数据的内联 data: 图片收进 Blob 仓；再预载引用 Blob、清孤儿。
    for (const book of state.books) await internImages(book);
    await preloadAndSweepBlobs();
    saveState();
    return;
  }

  const book = createBook();
  state.books = [book];
  state.activeBookId = book.id;
  state.activeDeckId = book.texts[0].id;
  state.activePageId = book.texts[0].pages[0].id;
  state.ui.expandedBookIds = [book.id];
  saveState();
}

export function touchDeck(deck = getActiveDeck()) {
  if (!deck) return;
  deck.updatedAt = Date.now();
  saveState();
}

// --- Import ------------------------------------------------------------------

// Normalize a parsed backup file into a { title, lexicon, texts } envelope.
// Accepts the current yuwen-backup shape and the legacy { decks:[…] } backup
// (whose per-课文 lexicons are merged into a single book lexicon). Returns null
// when the shape is unrecognized.
function toEnvelope(parsed) {
  if (parsed && parsed.format === "yuwen-backup" && parsed.book && Array.isArray(parsed.book.texts)) {
    const rawTitle = typeof parsed.book.title === "string" && parsed.book.title.trim()
      ? parsed.book.title.trim()
      : "导入的课本";
    return {
      title: rawTitle.slice(0, 60),
      lexicon: (parsed.book.lexicon && typeof parsed.book.lexicon === "object") ? parsed.book.lexicon : {},
      texts: parsed.book.texts
    };
  }
  if (parsed && Array.isArray(parsed.decks) && parsed.decks.length) {
    const lexicon = {};
    parsed.decks.forEach((deck) => { if (deck && deck.lexicon) mergeLexicon(lexicon, deck.lexicon); });
    return { title: "导入的课本", lexicon, texts: parsed.decks };
  }
  return null;
}

function isValidTexts(texts) {
  return Array.isArray(texts) && texts.length > 0 && texts.every((text) =>
    text && typeof text === "object"
    && Array.isArray(text.pages) && text.pages.length > 0
    && text.pages.every((page) => page && typeof page === "object" && typeof page.mainText === "string"));
}

// Drop image sources that are not inline data: URLs (both page配图 and lexicon
// images) so an imported file cannot smuggle in remote or script URLs; also
// strip any incoming blobId — Blob 引用只能由本机分配。
function sanitizeEnvelope(env) {
  const safe = (images) => (Array.isArray(images)
    ? images.filter((image) => image && typeof image.src === "string" && image.src.startsWith("data:image/"))
    : []).map((image) => { delete image.blobId; return image; });
  env.texts.forEach((text) => text.pages?.forEach((page) => { page.images = safe(page.images); }));
  Object.entries(env.lexicon || {}).forEach(([key, entry]) => {
    if (entry && typeof entry === "object") entry.images = safe(entry.images);
    else delete env.lexicon[key];
  });
  return env;
}

// Deep-clone imported 课文 with fresh ids so an import never collides with, or
// mutates, existing data. Any legacy per-课文 lexicon is dropped (already folded
// into the book lexicon by toEnvelope).
function cloneTextsFresh(texts) {
  return texts.map((source) => {
    const deck = deepClone(source);
    deck.id = id("deck");
    deck.updatedAt = Date.now();
    delete deck.lexicon;
    deck.pages?.forEach((page) => {
      page.id = id("page");
      page.tokens?.forEach((token) => { token.id = id("tok"); });
    });
    return deck;
  });
}

// Parse + validate + sanitize a single backup file into an envelope. Throws a
// user-facing error naming the file when it is not a valid backup.
export async function parseBackupFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error(`文件「${file.name}」不是有效的 JSON。`);
  }
  const env = toEnvelope(parsed);
  if (!env || !isValidTexts(env.texts)) {
    throw new Error(`文件「${file.name}」不是有效的 yuwen 备份。`);
  }
  return sanitizeEnvelope(env);
}

function activateBook(book) {
  state.activeBookId = book.id;
  state.activeDeckId = book.texts[0].id;
  state.activePageId = book.texts[0].pages[0].id;
}

// Import an envelope as a brand-new book (fresh ids, 图片收进 Blob 仓). Switches to it.
export async function addBackupAsNewBook(env) {
  const book = {
    id: id("book"),
    title: env.title,
    updatedAt: Date.now(),
    lexicon: deepClone(env.lexicon || {}),
    texts: cloneTextsFresh(env.texts)
  };
  book.texts.forEach((deck) => deck.pages.forEach(tokenizePage));
  ensureBookModel(book);
  await internImages(book);
  state.books.push(book);
  activateBook(book);
  saveState();
  return book;
}

// Insert an envelope's 课文 into an existing book, merging its lexicon by 字|拼音.
export async function addBackupToBook(env, bookId) {
  const book = state.books.find((item) => item.id === bookId);
  if (!book) return null;
  const incoming = {
    lexicon: deepClone(env.lexicon || {}),
    texts: cloneTextsFresh(env.texts)
  };
  incoming.texts.forEach((deck) => deck.pages.forEach(tokenizePage));
  await internImages(incoming);
  book.texts.push(...incoming.texts);
  book.lexicon ||= {};
  mergeLexicon(book.lexicon, incoming.lexicon);
  ensureBookModel(book);
  book.updatedAt = Date.now();
  state.activeBookId = book.id;
  state.activeDeckId = incoming.texts[0].id;
  state.activePageId = incoming.texts[0].pages[0].id;
  saveState();
  return book;
}

// Import several backup files at once — each becomes a new book. All files are
// parsed (and validated) before any book is added, so a bad file aborts the
// whole batch instead of leaving it half-imported. Returns the count.
export async function importBackups(files) {
  const envelopes = [];
  for (const file of files) envelopes.push(await parseBackupFile(file));
  const books = [];
  for (const env of envelopes) books.push(await addBackupAsNewBook(env));
  if (books.length) {
    activateBook(books[0]);
    saveState();
  }
  return books.length;
}

// --- 备份（Backup export）-----------------------------------------------------
//
// One backup file = exactly one book. A whole-book backup carries the book's
// full lexicon; a partial (subset of 课文) backup carries only the lexicon
// entries those 课文 actually reference. Selecting 课文 across N books produces
// N separate downloads (there is no cross-book lexicon, so they can't share one
// file). 备份文件自包含：Blob 仓中的图片导出时内联回 data: URL。

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function backupFilename(title) {
  const safe = String(title || "课本").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 40);
  return `yuwen-${safe}-${dateStamp()}.json`;
}

// The slice of a book's lexicon referenced by the given 课文 (by 字|拼音 key).
function referencedLexicon(book, texts) {
  const keys = new Set();
  texts.forEach((deck) => deck.pages?.forEach((page) => page.tokens?.forEach((token) => {
    keys.add(`${token.text}|${(token.pinyin || "").trim()}`);
  })));
  const lexicon = {};
  Object.entries(book.lexicon || {}).forEach(([key, entry]) => {
    if (keys.has(key)) lexicon[key] = entry;
  });
  return lexicon;
}

// 导出封套：结构 deepClone 后，把 blobId 引用内联回 data: URL（文件自包含）。
export async function buildBookEnvelope(book, texts) {
  const wholeBook = texts.length === book.texts.length;
  const lexicon = wholeBook ? (book.lexicon || {}) : referencedLexicon(book, texts);
  const env = deepClone({
    format: "yuwen-backup",
    version: 2,
    book: { title: book.title, lexicon, texts }
  });
  const images = [];
  forEachImage(env.book, (image) => { if (image?.blobId) images.push(image); });
  for (const image of images) {
    const entry = blobCache.get(image.blobId) || null;
    const blob = entry?.blob || await idbImageGet(image.blobId).catch(() => null);
    if (blob) image.src = await blobToDataUrl(blob);
    delete image.blobId;
  }
  return env;
}

// Back up the books that own any of the selected 课文, one JSON file each.
// Returns the number of files produced.
export async function exportBackup(deckIds) {
  const wanted = new Set(deckIds);
  let files = 0;
  for (const book of state.books) {
    const texts = book.texts.filter((deck) => wanted.has(deck.id));
    if (!texts.length) continue;
    downloadJson(await buildBookEnvelope(book, texts), backupFilename(book.title));
    files += 1;
  }
  return files;
}

// --- yuwen-pages（页面导入） ---------------------------------------------------

// Import a "yuwen-pages" file: append each page to the CURRENT deck. yuwen
// re-derives pinyin via createPage. Returns the number of pages added.
// 只把停顿/句末标点算作"标点"（不含引号、书名号等）。
const STOP_PUNCT = "，。！？；：、…";

// 诗词：至少两行，且所有行「恰好 1 标点且 ≤8 字符」（七绝），
// 或所有行「恰好 2 标点且 ≤16 字符」（两句）。
function isPoem(text) {
  const lines = String(text).split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const info = lines.map((l) => ({
    len: [...l].length,
    punct: [...l].filter((c) => STOP_PUNCT.includes(c)).length
  }));
  const allA = info.every((x) => x.punct === 1 && x.len <= 8);
  const allB = info.every((x) => x.punct === 2 && x.len <= 16);
  return allA || allB;
}

// 导入排版的启发式兜底（无 DOM 环境 / 测量失败时用）。字号只用两种：0.7 与 0.9。
// 全页判定：最小字号(0.7)下普通页主文区放不下 → 全文页。
export function autoLayout(text) {
  const paras = String(text).split("\n").map((line) => [...line].length);
  // 普通页主文区：宽约 430px（最小字号下约 16 字/行），高约 390px，行高含拼音
  const fitsNormal = (scale) => {
    const charsPerLine = Math.max(1, Math.floor(430 / (38 * scale)));
    const lineCap = Math.floor(390 / (90 * scale));
    const linesNeeded = paras.reduce((sum, n) => sum + Math.max(1, Math.ceil(n / charsPerLine)), 0);
    return linesNeeded <= lineCap;
  };
  const textOnly = !fitsNormal(0.7);
  const mainTextScale = textOnly ? 0.7 : (isPoem(text) ? 0.9 : 0.7);
  return { mainTextScale, textOnly };
}

// layoutFn 允许调用方注入更好的排版判定（如 render 层的真实 DOM 测量），
// 默认用上面的启发式。
function isYuwenPages(parsed) {
  return !!parsed && parsed.format === "yuwen-pages" && Array.isArray(parsed.pages)
    && parsed.pages.length > 0
    && parsed.pages.every((page) => page && typeof page.text === "string");
}

function buildImportedPages(parsed, layoutFn) {
  return parsed.pages.map((page) => {
    const body = String(page.text);
    const title = (typeof page.title === "string" && page.title.trim())
      || body.trim().replace(/\s+/g, " ").slice(0, 12)
      || "新页面";
    const made = createPage(title, body);
    const layout = layoutFn(body) || autoLayout(body);
    made.mainTextScale = layout.mainTextScale;
    made.textOnly = layout.textOnly;
    return made;
  });
}

// 追加进当前课文（页面栏「导入」与收件箱「追加」共用）。
export function importParsedPagesIntoDeck(parsed, layoutFn = autoLayout) {
  if (!isYuwenPages(parsed)) throw new Error("文件格式不是 yuwen-pages。");
  const deck = getActiveDeck();
  const created = buildImportedPages(parsed, layoutFn);
  deck.pages.push(...created);
  state.activePageId = created[0].id;
  saveState();
  return created.length;
}

// 作为新课文加进当前课本（收件箱的默认去处：一课 = 一篇课文）。
export function importParsedPagesAsNewDeck(parsed, layoutFn = autoLayout) {
  if (!isYuwenPages(parsed)) throw new Error("文件格式不是 yuwen-pages。");
  const book = getActiveBook();
  const title = (typeof parsed.title === "string" && parsed.title.trim())
    ? parsed.title.trim().slice(0, 30)
    : `课文 ${book.texts.length + 1}`;
  const deck = createDeck(title, "");
  deck.pages = buildImportedPages(parsed, layoutFn);
  book.texts.push(deck);
  book.updatedAt = Date.now();
  state.activeBookId = book.id;
  state.activeDeckId = deck.id;
  state.activePageId = deck.pages[0].id;
  saveState();
  return deck;
}

export async function importPages(file, layoutFn = autoLayout) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("文件不是有效的 JSON。");
  }
  return importParsedPagesIntoDeck(parsed, layoutFn);
}

// --- 收件箱（inbox.json）------------------------------------------------------
//
// yuwen 由仓库目录的静态服务器提供，所以 textbook-photos 技能把识别结果写到
// 仓库根的 inbox.json 后，yuwen 可以直接 fetch 到它——启动/窗口获焦时检查，
// 发现没处理过的内容（按 id 去重）就弹一键导入提示。零后端、零文件选择器。

const INBOX_SEEN_KEY = "yuwen.inbox.seen";

export async function checkInbox() {
  try {
    const res = await fetch("inbox.json", { cache: "no-store" });
    if (!res.ok) return null;
    const parsed = await res.json();
    if (!isYuwenPages(parsed)) return null;
    const id = typeof parsed.id === "string" && parsed.id.trim() ? parsed.id.trim() : null;
    if (!id) return null;
    if (localStorage.getItem(INBOX_SEEN_KEY) === id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function markInboxSeen(id) {
  try {
    localStorage.setItem(INBOX_SEEN_KEY, String(id));
  } catch { /* 下次仍会提示，无碍 */ }
}
