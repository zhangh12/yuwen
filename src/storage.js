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
