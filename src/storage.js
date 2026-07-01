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
  createDeck,
  createPage,
  tokenizePage,
  ensureDeckModel,
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
    decks: state.decks,
    activeDeckId: state.activeDeckId,
    activePageId: state.activePageId
  };
}

function applyLoadedState(stored) {
  state.decks = stored.decks;
  state.activeDeckId = stored.activeDeckId || stored.decks[0].id;
  state.activePageId = stored.activePageId || getActiveDeck()?.pages?.[0]?.id || "";
  state.decks.forEach((deck) => {
    deck.pages.forEach(tokenizePage);
    ensureDeckModel(deck);
  });
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

  if (!stored?.decks?.length) {
    // Migrate decks saved by the older localStorage-only build.
    try {
      const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (legacy?.decks?.length) stored = legacy;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  if (stored?.decks?.length) {
    applyLoadedState(stored);
    saveState();
    return;
  }

  const deck = createDeck();
  state.decks = [deck];
  state.activeDeckId = deck.id;
  state.activePageId = deck.pages[0].id;
  saveState();
}

export function touchDeck(deck = getActiveDeck()) {
  if (!deck) return;
  deck.updatedAt = Date.now();
  saveState();
}

// --- Import / export -------------------------------------------------------

function isValidPayload(value) {
  if (!value || typeof value !== "object") return false;
  if (!Array.isArray(value.decks) || !value.decks.length) return false;
  return value.decks.every((deck) =>
    deck && typeof deck === "object"
    && typeof deck.id === "string"
    && Array.isArray(deck.pages) && deck.pages.length > 0
    && deck.pages.every((page) =>
      page && typeof page === "object"
      && typeof page.id === "string"
      && typeof page.mainText === "string")
  );
}

// Drop image sources that are not inline data: URLs so an imported file cannot
// smuggle in remote or script URLs.
function sanitizeImages(payload) {
  const safe = (images) => Array.isArray(images)
    ? images.filter((image) => image && typeof image.src === "string" && image.src.startsWith("data:image/"))
    : [];
  payload.decks.forEach((deck) => {
    deck.pages?.forEach((page) => { page.images = safe(page.images); });
    if (deck.lexicon && typeof deck.lexicon === "object") {
      Object.values(deck.lexicon).forEach((entry) => {
        if (entry && typeof entry === "object") entry.images = safe(entry.images);
      });
    }
  });
  return payload;
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

// Append imported decks as new decks (with fresh ids) so importing never
// overwrites the existing library. Returns the first imported deck.
function appendImportedDecks(stored) {
  const imported = stored.decks.map((source) => {
    const deck = deepClone(source);
    deck.id = id("deck");
    deck.updatedAt = Date.now();
    deck.pages?.forEach((page) => {
      page.id = id("page");
      page.tokens?.forEach((token) => { token.id = id("tok"); });
    });
    return deck;
  });
  imported.forEach((deck) => {
    deck.pages.forEach(tokenizePage);
    ensureDeckModel(deck);
    state.decks.push(deck);
  });
  state.activeDeckId = imported[0].id;
  state.activePageId = imported[0].pages[0].id;
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

export async function importData(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON。");
  }
  if (!isValidPayload(parsed)) {
    throw new Error("文件结构不符合 yuwen 讲义格式。");
  }
  appendImportedDecks(sanitizeImages(parsed));
  saveState();
}
