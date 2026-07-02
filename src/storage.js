// Persistence layer.
//
// State is stored in IndexedDB as the primary store because base64 images can
// easily exceed the ~5MB localStorage ceiling. localStorage is kept only as a
// best-effort mirror and as a migration source for decks saved by older builds.
// JSON import/export lets teachers move handouts between machines.

import {
  STORAGE_KEY,
  state,
  getActiveDeck,
  getActiveBook,
  createBook,
  createPage,
  tokenizePage,
  ensureBookModel,
  mergeLexicon,
  deepClone,
  id
} from "./core.js";

const DB_NAME = "yuwen";
const DB_VERSION = 1;
const STORE = "kv";
const STATE_KEY = "state";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function idbGet(key) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

function idbSet(key, value) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

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

export function saveState() {
  const payload = buildPayload();
  // Primary store: IndexedDB. Fire-and-forget; overlapping writes are serialized
  // by IndexedDB and last-write-wins, which matches the previous behaviour.
  idbSet(STATE_KEY, payload).catch(() => {});
  // Best-effort mirror so environments without IndexedDB still persist small
  // decks. Quota errors (large base64 images) are expected and ignored here.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* IndexedDB remains the source of truth */
  }
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

// --- Import / export -------------------------------------------------------

// Normalize a parsed backup file into a { title, lexicon, texts } envelope.
// Accepts the current yuwen-backup shape and the legacy { decks:[…] } backup
// (whose per-课文 lexicons are merged into a single book lexicon). Returns null
// when the shape is unrecognized.
function toEnvelope(parsed) {
  if (parsed && parsed.format === "yuwen-backup" && parsed.book && Array.isArray(parsed.book.texts)) {
    return {
      title: typeof parsed.book.title === "string" && parsed.book.title.trim() ? parsed.book.title : "导入的课本",
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
// images) so an imported file cannot smuggle in remote or script URLs.
function sanitizeEnvelope(env) {
  const safe = (images) => Array.isArray(images)
    ? images.filter((image) => image && typeof image.src === "string" && image.src.startsWith("data:image/"))
    : [];
  env.texts.forEach((text) => text.pages?.forEach((page) => { page.images = safe(page.images); }));
  Object.values(env.lexicon || {}).forEach((entry) => {
    if (entry && typeof entry === "object") entry.images = safe(entry.images);
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

// Export a single deck to its own JSON file (same payload shape as a full
// backup, but containing just this deck).
export function exportDeck(deck) {
  if (!deck) return;
  const payload = {
    decks: [deck],
    activeDeckId: deck.id,
    activePageId: deck.pages?.[0]?.id || ""
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeTitle = String(deck.title || "讲义").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 40);
  link.href = url;
  link.download = `yuwen-${safeTitle}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// --- 备份（Backup export）--------------------------------------------------
//
// One backup file = exactly one book. A whole-book backup carries the book's
// full lexicon; a partial (subset of 课文) backup carries only the lexicon
// entries those 课文 actually reference. Selecting 课文 across N books produces
// N separate downloads (there is no cross-book lexicon, so they can't share one
// file).

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
  return `yuwen-${safe}-${new Date().toISOString().slice(0, 10)}.json`;
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

function buildBookEnvelope(book, texts) {
  const wholeBook = texts.length === book.texts.length;
  const lexicon = wholeBook ? (book.lexicon || {}) : referencedLexicon(book, texts);
  return deepClone({
    format: "yuwen-backup",
    version: 2,
    book: { title: book.title, lexicon, texts }
  });
}

// Back up the books that own any of the selected 课文, one JSON file each.
// Returns the number of files produced.
export function exportBackup(deckIds) {
  const wanted = new Set(deckIds);
  let files = 0;
  state.books.forEach((book) => {
    const texts = book.texts.filter((deck) => wanted.has(deck.id));
    if (!texts.length) return;
    downloadJson(buildBookEnvelope(book, texts), backupFilename(book.title));
    files += 1;
  });
  return files;
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

// Import an envelope as a brand-new book (fresh ids). Switches to it.
export function addBackupAsNewBook(env) {
  const book = {
    id: id("book"),
    title: env.title,
    updatedAt: Date.now(),
    lexicon: deepClone(env.lexicon || {}),
    texts: cloneTextsFresh(env.texts)
  };
  book.texts.forEach((deck) => deck.pages.forEach(tokenizePage));
  ensureBookModel(book);
  state.books.push(book);
  activateBook(book);
  saveState();
  return book;
}

// Insert an envelope's 课文 into an existing book, merging its lexicon by 字|拼音.
export function addBackupToBook(env, bookId) {
  const book = state.books.find((item) => item.id === bookId);
  if (!book) return null;
  const texts = cloneTextsFresh(env.texts);
  texts.forEach((deck) => deck.pages.forEach(tokenizePage));
  book.texts.push(...texts);
  book.lexicon ||= {};
  mergeLexicon(book.lexicon, env.lexicon || {});
  ensureBookModel(book);
  book.updatedAt = Date.now();
  state.activeBookId = book.id;
  state.activeDeckId = texts[0].id;
  state.activePageId = texts[0].pages[0].id;
  saveState();
  return book;
}

// Import several backup files at once — each becomes a new book. Returns count.
export async function importBackups(files) {
  const envelopes = [];
  for (const file of files) envelopes.push(await parseBackupFile(file));
  const first = envelopes.map((env) => addBackupAsNewBook(env))[0];
  if (first) { activateBook(first); saveState(); }
  return envelopes.length;
}

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

// 导入时定字号与是否全文页。字号只用两种：0.7（最小）与 0.9。
// 全页判定：最小字号(0.7)下普通页主文区放不下 → 全文页。
// 字号：全页一律最小字号 0.7；留在普通页的诗词用 0.9，其余用 0.7。
function autoLayout(text) {
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

export async function importPages(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON。");
  }
  if (!parsed || parsed.format !== "yuwen-pages" || !Array.isArray(parsed.pages)
    || !parsed.pages.every((page) => page && typeof page.text === "string")) {
    throw new Error("文件格式不是 yuwen-pages。");
  }
  const deck = getActiveDeck();
  const created = parsed.pages.map((page) => {
    const body = String(page.text);
    const title = (typeof page.title === "string" && page.title.trim())
      || body.trim().replace(/\s+/g, " ").slice(0, 12)
      || "新页面";
    const made = createPage(title, body);
    const layout = autoLayout(body);
    made.mainTextScale = layout.mainTextScale;
    made.textOnly = layout.textOnly;
    return made;
  });
  if (!created.length) throw new Error("文件中没有页面。");
  deck.pages.push(...created);
  state.activePageId = created[0].id;
  saveState();
  return created.length;
}

