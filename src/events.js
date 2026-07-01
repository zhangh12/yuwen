// Interaction layer.
//
// Listeners are attached once to the persistent #app element (and document) via
// event delegation, instead of being re-bound on every render. #app survives
// the innerHTML swap in render(), so a single set of delegated handlers covers
// all dynamically generated nodes. The dispatch order below preserves the exact
// bubbling / stopPropagation semantics of the previous per-element binding.

import {
  state,
  getActiveBook,
  getActiveDeck,
  getActivePage,
  getToken,
  activeContext,
  visibleExamples,
  clampTokenIndex,
  imageContext,
  setImageContextIndex,
  findImageById,
  lookupZdictMeanings,
  cycleIndex,
  closeFloaters,
  clearTransient,
  createBook,
  createDeck,
  createPage,
  tokenizePage,
  allTexts,
  deepClone,
  id
} from "./core.js";
import { render, app } from "./render.js";
import { saveState, touchDeck, exportDeck, importData, importPages } from "./storage.js";
import { radicalsInDecks, charsInDecks, collectMatches, groupByRadical, buildDocx, buildPrintHtml } from "./charquery.js";
import { fetchStrokes, buildZitieHtml } from "./zitie.js";

// --- Delegated event installation -----------------------------------------

export function installEvents() {
  app.addEventListener("click", onAppClick);
  app.addEventListener("contextmenu", onAppContextMenu);
  app.addEventListener("pointerdown", onAppPointerDown);
  app.addEventListener("focusout", onAppFocusOut);
  app.addEventListener("keydown", onAppKeyDown);
  app.addEventListener("mousedown", onAppMouseDown);
  app.addEventListener("dragstart", onAppDragStart);
  app.addEventListener("dragover", onAppDragOver);
  app.addEventListener("drop", onAppDrop);
  app.addEventListener("dragend", onAppDragEnd);

  document.addEventListener("keydown", onDocumentKeyDown);
  document.addEventListener("click", onDocumentClick);
}

// Resolve the nearest Element for an event target. Drag/drop events in
// particular can fire with a text node as target, which has no .closest /
// .matches — calling them directly would throw and (for dragover) silently
// break the drop. Falling back to parentElement keeps delegation robust.
function eventEl(event) {
  const target = event.target;
  return target instanceof Element ? target : (target?.parentElement ?? null);
}

function clearSelection() {
  commitActiveField();
  state.ui.activeTokenId = "";
  state.ui.pendingExample = false;
  state.ui.pendingImage = false;
  state.ui.editingExampleId = "";
  state.ui.editingCaptionId = "";
  state.ui.annotating = false;
  state.ui.annotationOriginalColors = {};
  closeFloaters();
  render();
}

function onAppClick(event) {
  const el = eventEl(event);
  if (!el) return;

  const actionEl = el.closest("[data-action]");
  if (actionEl) {
    handleAction(actionEl, event);
    return;
  }

  const pinyinEl = el.closest("[data-pinyin-token-id]");
  if (pinyinEl) {
    handlePinyinClick(pinyinEl, event);
    return;
  }

  const tokenEl = el.closest("[data-token-id]");
  if (tokenEl) {
    handleTokenClick(tokenEl, event);
    return;
  }

  const deckEl = el.closest("[data-deck-id]");
  if (deckEl) {
    // Switch the book first so getActiveDeck() resolves within the right book.
    if (deckEl.dataset.bookId) state.activeBookId = deckEl.dataset.bookId;
    state.activeDeckId = deckEl.dataset.deckId;
    state.activePageId = getActiveDeck()?.pages[0]?.id || "";
    clearTransient();
    expandBook(state.activeBookId);
    state.ui.deckPickerOpen = false;
    saveState();
    render();
    return;
  }

  const pageEl = el.closest("[data-page-id]");
  if (pageEl) {
    const pageId = pageEl.dataset.pageId;
    const toggle = event.metaKey || event.ctrlKey;
    if (toggle || event.shiftKey) {
      // Extend/toggle the page multi-selection; keep any open floaters closed.
      closeFloaters();
      selectPage(pageId, { shift: event.shiftKey, toggle });
      saveState();
      render();
      return;
    }
    clearTransient();
    selectPage(pageId, {});
    saveState();
    render();
    return;
  }

  if (el.matches(".cq-overlay")) {
    state.ui.query = null;
    render();
    return;
  }

  const blankEl = el.closest("[data-blank]");
  if (blankEl && !el.closest(".token") && !el.closest("textarea")) {
    clearSelection();
    return;
  }

  if (el.matches(".workspace")) {
    clearSelection();
  }
}

function onAppContextMenu(event) {
  const el = eventEl(event);
  if (!el) return;

  const tokenEl = el.closest("[data-token-id]");
  if (tokenEl) {
    handleTokenContextMenu(tokenEl, event);
    return;
  }

  const deckEl = el.closest("[data-deck-id]");
  if (deckEl) {
    event.preventDefault();
    state.ui.deckContext = { x: event.clientX, y: event.clientY, deckId: deckEl.dataset.deckId, bookId: deckEl.dataset.bookId };
    state.ui.bookContext = null;
    state.ui.pageContext = null;
    state.ui.menu = null;
    state.ui.pinyinMenu = null;
    render();
    return;
  }

  const bookEl = el.closest("[data-book-id]");
  if (bookEl) {
    event.preventDefault();
    state.ui.bookContext = { x: event.clientX, y: event.clientY, bookId: bookEl.dataset.bookId };
    state.ui.deckContext = null;
    state.ui.pageContext = null;
    state.ui.menu = null;
    state.ui.pinyinMenu = null;
    render();
    return;
  }

  const pageEl = el.closest("[data-page-id]");
  if (pageEl) {
    event.preventDefault();
    const pageId = pageEl.dataset.pageId;
    // Right-clicking a page outside the current selection collapses it to just
    // that page (Finder / PowerPoint behaviour); right-clicking inside a
    // multi-selection keeps the whole selection so it can be batch-deleted.
    if (!currentPageSelection().includes(pageId)) {
      clearTransient();
      selectPage(pageId, {});
    }
    state.ui.pageContext = { x: event.clientX, y: event.clientY, pageId };
    state.ui.deckContext = null;
    state.ui.menu = null;
    state.ui.pinyinMenu = null;
    render();
  }
}

function onAppPointerDown(event) {
  const el = eventEl(event);
  const handle = el?.closest("[data-resize-image-id]");
  if (handle) startImageResize(handle, event);
}

function onAppFocusOut(event) {
  if (event.target.matches?.("[data-draft]")) commitDraft(event.target);
}

function onAppKeyDown(event) {
  if (event.key === "Escape" && event.target.matches?.("[data-draft]")) {
    event.target.blur();
  }
}

function onAppMouseDown(event) {
  if (eventEl(event)?.closest(".context-menu")) event.preventDefault();
}

// Live drop target chosen during dragover; consumed on drop.
let dropTargetId = null;
let dropAfter = false;

function clearDropIndicator() {
  app.querySelectorAll(".page-item.drop-before, .page-item.drop-after")
    .forEach((el) => el.classList.remove("drop-before", "drop-after"));
  dropTargetId = null;
}

function updateDropIndicator(item, clientY, list) {
  clearDropIndicator();
  if (item) {
    if (item.dataset.pageId === state.ui.draggedPageId) return;
    const rect = item.getBoundingClientRect();
    const after = clientY > rect.top + rect.height / 2;
    item.classList.add(after ? "drop-after" : "drop-before");
    dropTargetId = item.dataset.pageId;
    dropAfter = after;
    return;
  }
  // Hovering empty space in the list → insert at the end.
  const items = list?.querySelectorAll("[data-page-id]");
  const last = items?.[items.length - 1];
  if (last) {
    last.classList.add("drop-after");
    dropTargetId = last.dataset.pageId;
    dropAfter = true;
  }
}

function onAppDragStart(event) {
  const pageEl = eventEl(event)?.closest("[data-page-id]");
  if (!pageEl) return;
  state.ui.draggedPageId = pageEl.dataset.pageId;
  event.dataTransfer.setData("text/plain", pageEl.dataset.pageId);
  event.dataTransfer.effectAllowed = "move";
}

function onAppDragOver(event) {
  if (!state.ui.draggedPageId) return;
  const el = eventEl(event);
  if (!el) return;
  const list = el.closest(".page-list");
  const item = el.closest("[data-page-id]");
  if (!list && !item) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  updateDropIndicator(item, event.clientY, list);
}

function onAppDrop(event) {
  const el = eventEl(event);
  const list = el?.closest(".page-list");
  const item = el?.closest("[data-page-id]");
  if (!list && !item) {
    clearDropIndicator();
    return;
  }
  event.preventDefault();
  const draggedPageId = event.dataTransfer.getData("text/plain") || state.ui.draggedPageId;
  const targetId = dropTargetId;
  const after = dropAfter;
  clearDropIndicator();
  if (targetId) {
    reorderPageRelative(draggedPageId, targetId, after);
  } else if (item) {
    reorderPage(draggedPageId, item.dataset.pageId);
  } else {
    movePageToEnd(draggedPageId);
  }
}

function onAppDragEnd() {
  clearDropIndicator();
  state.ui.draggedPageId = "";
}

// --- Actions ---------------------------------------------------------------

function handleAction(target, event) {
  const action = target.dataset.action;
  const page = getActivePage();
  const deck = getActiveDeck();
  event.stopPropagation();

  if (action === "new-book") return newBook();
  if (action === "toggle-book") return toggleBook(target.dataset.bookId);
  if (action === "rename-book") return renameBook(state.ui.bookContext?.bookId);
  if (action === "delete-book") return deleteBook(state.ui.bookContext?.bookId);
  if (action === "new-deck") return newDeck(target.dataset.bookId || state.ui.bookContext?.bookId);
  if (action === "rename-deck") return renameDeck(state.ui.deckContext?.deckId);
  if (action === "copy-deck") return copyDeck(state.ui.deckContext?.deckId);
  if (action === "delete-deck") return deleteDeck(state.ui.deckContext?.deckId);
  if (action === "new-page") return newPage();
  if (action === "copy-page") return copyPage(target.dataset.pageId || state.ui.pageContext?.pageId);
  if (action === "delete-page") return deletePage(target.dataset.pageId || state.ui.pageContext?.pageId);
  if (action === "delete-pages") return deletePages();
  if (action === "export-deck") return exportSelectedDeck();
  if (action === "import-deck") return importDecksFlow();
  if (action === "import-pages") return importPagesFlow();

  if (action === "open-charquery") return openCharQuery();
  if (action === "charquery-close") { state.ui.query = null; return render(); }
  if (action === "charquery-decks-all") { toggleAllQueryDecks(); return render(); }
  if (action === "charquery-deck") { selectQueryDeck(Number(target.dataset.index), target.dataset.deckId, event.shiftKey); return render(); }
  if (action === "charquery-next") { state.ui.query.step = 2; return render(); }
  if (action === "charquery-back") { state.ui.query.step = Math.max(1, state.ui.query.step - 1); return render(); }
  if (action === "charquery-radical") { toggleQueryRadical(target.dataset.radical); return render(); }
  if (action === "charquery-radicals-all") { toggleAllQueryRadicals(); return render(); }
  if (action === "charquery-to-chars") { initQueryChars(); state.ui.query.step = 3; return render(); }
  if (action === "charquery-char") { toggleQueryChar(target.dataset.char); return render(); }
  if (action === "charquery-chars-all") { toggleAllQueryChars(); return render(); }
  if (action === "charquery-char-sort") { state.ui.query.charSort = target.checked ? "radical" : "freq"; return render(); }
  if (action === "charquery-to-preview") { state.ui.query.step = 4; return render(); }
  if (action === "charquery-include-pinyin") { state.ui.query.includePinyin = target.checked; return render(); }
  if (action === "charquery-export-word") return exportCharQueryWord();
  if (action === "charquery-print") return printCharQuery();
  if (action === "charquery-print-zitie" || action === "charquery-export-zitie") return printZitie();

  if (action === "toggle-deck-picker") {
    state.ui.deckPickerOpen = !state.ui.deckPickerOpen;
    state.ui.deckContext = null;
    state.ui.pageContext = null;
    state.ui.menu = null;
    state.ui.pinyinMenu = null;
    return render();
  }

  if (action === "toggle-pinyin") {
    deck.settings.showPinyin = target.checked;
    touchDeck(deck);
    return render();
  }

  if (action === "toggle-zdict-examples") {
    deck.settings.showZdictExamples = target.checked;
    touchDeck(deck);
    return render();
  }

  if (action === "prev-zdict" || action === "next-zdict") {
    const { token } = activeContext();
    const meanings = lookupZdictMeanings(token?.text, token?.pinyin);
    const step = action === "prev-zdict" ? -1 : 1;
    state.ui.zdictIndex = cycleIndex((state.ui.zdictIndex || 0) + step, meanings.length);
    return render();
  }

  if (action === "toggle-text-only") {
    page.textOnly = target.checked;
    if (page.textOnly) {
      state.ui.activeTokenId = "";
      state.ui.pendingExample = false;
      state.ui.pendingImage = false;
      state.ui.editingExampleId = "";
      state.ui.editingCaptionId = "";
      closeFloaters();
    }
    touchDeck(deck);
    return render();
  }

  if (action === "toggle-chrome") {
    state.ui.chromeCollapsed = !state.ui.chromeCollapsed;
    closeFloaters();
    return render();
  }

  if (action === "edit-main") {
    commitActiveField();
    state.ui.editingMain = !state.ui.editingMain;
    closeFloaters();
    return render();
  }

  if (action === "scale-down" || action === "scale-up" || action === "scale-reset") {
    if (action === "scale-reset") page.mainTextScale = 1;
    if (action === "scale-down") page.mainTextScale = Math.max(0.7, Number((page.mainTextScale - 0.1).toFixed(2)));
    if (action === "scale-up") page.mainTextScale = Math.min(1.9, Number((page.mainTextScale + 0.1).toFixed(2)));
    touchDeck();
    return render();
  }

  if (action === "speak") return speakText(page.mainText);

  if (action === "speak-token") {
    const token = getToken(page, state.ui.menu?.tokenId || state.ui.activeTokenId);
    // Speak the character itself with a Chinese voice. Forcing a specific
    // polyphonic reading is not reliably possible via the Web Speech API, so
    // polyphonic chars use the engine's default reading.
    if (token) speakText(token.text);
    state.ui.menu = null;
    return render();
  }

  if (action === "token-color") {
    applyTokenColor(target.dataset.color);
    return;
  }

  if (action === "clear-token-color") {
    const token = getToken(page);
    if (token) token.color = "";
    state.ui.menu = null;
    touchDeck();
    return render();
  }

  if (action === "restore-hidden") {
    const token = getToken(page);
    if (token) {
      token.hiddenExamples = [];
      token.hiddenImages = [];
      token.exampleIndex = 0;
      token.imageIndex = 0;
    }
    state.ui.menu = null;
    touchDeck();
    return render();
  }

  if (action === "add-example") {
    ensureActiveFromMenu();
    state.ui.pendingExample = true;
    state.ui.editingExampleId = "";
    const { token, entry } = activeContext();
    if (token) token.exampleIndex = visibleExamples(entry, token).length;
    state.ui.menu = null;
    return render();
  }

  if (action === "edit-example") {
    const { token, entry } = activeContext();
    const examples = visibleExamples(entry, token);
    const current = examples[clampTokenIndex(token, "exampleIndex", examples.length)];
    if (current) state.ui.editingExampleId = current.id;
    return render();
  }

  if (action === "copy-prompt") {
    const text = buildImagePrompt();
    if (text) copyPrompt(text, target);
    return;
  }

  if (action === "hide-example") {
    hideCurrentExample();
    return;
  }

  if (action === "delete-example") {
    deleteCurrentExample();
    return;
  }

  if (action === "prev-example" || action === "next-example") {
    const { token, entry } = activeContext();
    const step = action === "prev-example" ? -1 : 1;
    const examples = visibleExamples(entry, token);
    if (token) token.exampleIndex = cycleIndex((token.exampleIndex || 0) + step, examples.length);
    touchDeck();
    return render();
  }

  if (action === "add-image") {
    ensureActiveFromMenu();
    const context = imageContext();
    setImageContextIndex(context, context.images.length);
    state.ui.menu = null;
    openImageFilePicker(context);
    return;
  }

  if (action === "edit-caption") {
    state.ui.editingCaptionId = target.dataset.imageId || "";
    return render();
  }

  if (action === "cancel-image") {
    state.ui.pendingImage = false;
    return render();
  }

  if (action === "hide-image") {
    hideCurrentImage();
    return;
  }

  if (action === "delete-image") {
    deleteCurrentImage();
    return;
  }

  if (action === "prev-image" || action === "next-image") {
    const context = imageContext();
    const step = action === "prev-image" ? -1 : 1;
    setImageContextIndex(context, cycleIndex((context.index || 0) + step, context.images.length));
    touchDeck();
    return render();
  }

  if (action === "choose-pinyin") {
    const token = getToken(page, target.dataset.tokenId);
    if (token) {
      token.pinyin = target.dataset.pinyin;
      token.pinyinSource = "user";
      token.exampleIndex = 0;
      token.imageIndex = 0;
      state.ui.zdictIndex = 0;
      token.hiddenExamples = [];
      token.hiddenImages = [];
      state.ui.pinyinMenu = null;
      touchDeck();
      render();
    }
  }
}

function handleTokenClick(target, event) {
  const tokenId = target.dataset.tokenId;

  // Option/Alt continuous annotation works in both normal and full-text pages.
  if (event.altKey && state.ui.annotating && state.ui.annotationColor) {
    const token = getToken(getActivePage(), tokenId);
    if (token) {
      toggleAnnotationColor(token);
      touchDeck();
      render();
    }
    return;
  }

  // Plain clicks do nothing in full-text mode (no example/image linkage).
  if (getActivePage().textOnly) return;

  state.ui.activeTokenId = tokenId;
  state.ui.exampleIndex = 0;
  state.ui.imageIndex = 0;
  state.ui.zdictIndex = 0;
  state.ui.pendingExample = false;
  state.ui.pendingImage = false;
  state.ui.editingExampleId = "";
  state.ui.editingCaptionId = "";
  closeFloaters();
  render();
}

function handleTokenContextMenu(target, event) {
  event.preventDefault();
  const tokenId = target.dataset.tokenId;
  state.ui.activeTokenId = tokenId;
  state.ui.menu = { x: event.clientX, y: event.clientY, tokenId };
  state.ui.pinyinMenu = null;
  state.ui.pendingExample = false;
  state.ui.pendingImage = false;
  render();
}

function handlePinyinClick(target, event) {
  // Choosing a polyphonic reading works on any page, including full-text pages.
  event.preventDefault();
  event.stopPropagation();
  const page = getActivePage();
  const token = getToken(page, target.dataset.pinyinTokenId);
  if (!token || token.pinyinCandidates.length < 2) return;

  const rect = target.getBoundingClientRect();
  state.ui.activeTokenId = token.id;
  state.ui.pinyinMenu = {
    tokenId: token.id,
    x: rect.left,
    y: rect.bottom + 6
  };
  state.ui.menu = null;
  render();
}

function commitDraft(field) {
  const kind = field.dataset.draft;
  const value = field.value.trim();
  const deck = getActiveDeck();
  const page = getActivePage();

  if (kind === "deck-title") {
    deck.title = value || "未命名讲义";
    touchDeck(deck);
    return render();
  }

  if (kind === "main-text") {
    page.mainText = field.value;
    page.title = field.value.trim().slice(0, 12) || "空白页面";
    tokenizePage(page);
    state.ui.editingMain = false;
    clearTransient();
    touchDeck(deck);
    return render();
  }

  if (kind === "example") {
    const { token, entry } = activeContext();
    if (!value && state.ui.pendingExample) {
      state.ui.pendingExample = false;
      return render();
    }

    if (field.dataset.exampleId) {
      const example = entry.examples.find((item) => item.id === field.dataset.exampleId);
      if (example) example.text = field.value;
    } else if (value) {
      entry.examples.push({ id: id("ex"), text: field.value });
      if (token) token.exampleIndex = visibleExamples(entry, token).length - 1;
    }
    state.ui.pendingExample = false;
    state.ui.editingExampleId = "";
    touchDeck(deck);
    return render();
  }

  if (kind === "caption") {
    const image = findImageById(field.dataset.imageId);
    if (image) image.caption = field.value;
    state.ui.editingCaptionId = "";
    touchDeck(deck);
    return render();
  }
}

function openImageFilePicker(context = imageContext()) {
  closeFloaters();
  app.querySelector(".context-menu")?.remove();
  app.querySelector(".pinyin-popover")?.remove();
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    addImageFileToContext(file, context);
  }, { once: true });
  input.click();
}

function addImageFileToContext(file, context = imageContext()) {
  const reader = new FileReader();
  reader.onload = () => {
    addImageToContext(context, {
      id: id("img"),
      src: reader.result,
      caption: "",
      widthPercent: 86
    });
  };
  reader.readAsDataURL(file);
}

function addImageToContext(context, image) {
  const nextIndex = context.images.length;
  context.allImages.push(image);
  setImageContextIndex(context, nextIndex);
  state.ui.pendingImage = false;
  touchDeck();
  render();
}

function startImageResize(handle, event) {
  event.preventDefault();
  event.stopPropagation();

  const frame = handle.closest(".image-frame");
  const box = handle.closest(".image-box");
  const imageId = handle.dataset.resizeImageId;
  const image = findImageById(imageId);
  if (!frame || !box || !image) return;

  handle.setPointerCapture?.(event.pointerId);

  const updateWidth = (clientX) => {
    const rect = frame.getBoundingClientRect();
    const rawPercent = ((clientX - rect.left) / rect.width) * 100;
    const widthPercent = Math.min(100, Math.max(28, rawPercent));
    image.widthPercent = Math.round(widthPercent);
    box.style.width = `${image.widthPercent}%`;
  };

  const onMove = (moveEvent) => {
    updateWidth(moveEvent.clientX);
  };

  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    touchDeck();
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
  updateWidth(event.clientX);
}

function hideCurrentExample() {
  const { token, entry } = activeContext();
  const examples = visibleExamples(entry, token);
  const current = examples[clampTokenIndex(token, "exampleIndex", examples.length)];
  if (!token || !current) return;
  token.hiddenExamples ||= [];
  if (!token.hiddenExamples.includes(current.id)) {
    token.hiddenExamples.push(current.id);
  }
  token.exampleIndex = Math.max(0, token.exampleIndex - 1);
  touchDeck();
  render();
}

function hideCurrentImage() {
  const context = imageContext();
  if (context.scope !== "token") return;
  const token = context.token;
  const current = context.images[context.index];
  if (!token || !current) return;
  token.hiddenImages ||= [];
  if (!token.hiddenImages.includes(current.id)) {
    token.hiddenImages.push(current.id);
  }
  token.imageIndex = Math.max(0, token.imageIndex - 1);
  touchDeck();
  render();
}

function deleteCurrentExample() {
  const { token, entry } = activeContext();
  const examples = visibleExamples(entry, token);
  const current = examples[clampTokenIndex(token, "exampleIndex", examples.length)];
  if (!current) return;
  if (!window.confirm("从本讲义共享素材中删除这条例词/例句？")) return;
  entry.examples = entry.examples.filter((item) => item.id !== current.id);
  removeHiddenReference("hiddenExamples", current.id);
  if (token) token.exampleIndex = Math.max(0, token.exampleIndex - 1);
  touchDeck();
  render();
}

function deleteCurrentImage() {
  const context = imageContext();
  const current = context.images[context.index];
  if (!current) return;
  const message = context.scope === "token" ? "从本讲义共享素材中删除这张图片？" : "删除当前页面配图？";
  if (!window.confirm(message)) return;

  if (context.scope === "token") {
    context.entry.images = context.entry.images.filter((item) => item.id !== current.id);
    removeHiddenReference("hiddenImages", current.id);
    if (context.token) context.token.imageIndex = Math.max(0, context.token.imageIndex - 1);
  } else {
    context.page.images = context.page.images.filter((item) => item.id !== current.id);
    context.page.imageIndex = Math.max(0, context.page.imageIndex - 1);
  }
  touchDeck();
  render();
}

function removeHiddenReference(field, itemId) {
  getActiveDeck().pages.forEach((page) => {
    page.tokens.forEach((token) => {
      token[field] = (token[field] || []).filter((idValue) => idValue !== itemId);
    });
  });
}

function commitActiveField() {
  const active = document.activeElement;
  if (active?.matches?.("[data-draft]")) {
    active.blur();
  }
}

function applyTokenColor(color) {
  const { page } = activeContext();
  const token = getToken(page, state.ui.menu?.tokenId || state.ui.activeTokenId);
  if (!token) return;
  token.color = color;
  state.ui.annotationColor = color;
  state.ui.annotating = true;
  state.ui.annotationOriginalColors = {};
  state.ui.menu = null;
  touchDeck();
  render();
}

function toggleAnnotationColor(token) {
  if (Object.prototype.hasOwnProperty.call(state.ui.annotationOriginalColors, token.id)) {
    token.color = state.ui.annotationOriginalColors[token.id];
    delete state.ui.annotationOriginalColors[token.id];
    return;
  }

  state.ui.annotationOriginalColors[token.id] = token.color || "";
  token.color = state.ui.annotationColor;
}

function ensureActiveFromMenu() {
  if (state.ui.menu?.tokenId) state.ui.activeTokenId = state.ui.menu.tokenId;
}

function findBook(bookId) {
  return state.books.find((book) => book.id === bookId);
}

function findDeckAndBook(deckId) {
  for (const book of state.books) {
    const deck = book.texts.find((item) => item.id === deckId);
    if (deck) return { deck, book };
  }
  return { deck: null, book: null };
}

// --- 课本 (book) ------------------------------------------------------------

function newBook() {
  const name = window.prompt("课本名称", "新课本");
  if (!name) return;
  const book = createBook(name);
  state.books.push(book);
  state.activeBookId = book.id;
  state.activeDeckId = book.texts[0].id;
  state.activePageId = book.texts[0].pages[0].id;
  clearTransient();
  expandBook(book.id);
  state.ui.deckPickerOpen = true;
  saveState();
  render();
}

function toggleBook(bookId) {
  if (!bookId) return;
  state.ui.expandedBookIds ||= [];
  const at = state.ui.expandedBookIds.indexOf(bookId);
  if (at >= 0) state.ui.expandedBookIds.splice(at, 1);
  else state.ui.expandedBookIds.push(bookId);
  render();
}

// Make sure a book is expanded in the navigator (called when it becomes active).
// A book collapsed by the user stays collapsed until it becomes active again.
function expandBook(bookId) {
  if (!bookId) return;
  state.ui.expandedBookIds ||= [];
  if (!state.ui.expandedBookIds.includes(bookId)) state.ui.expandedBookIds.push(bookId);
}

function renameBook(bookId = state.activeBookId) {
  const book = findBook(bookId);
  if (!book) return;
  const name = window.prompt("课本名称", book.title);
  if (!name) return;
  book.title = name;
  book.updatedAt = Date.now();
  state.ui.bookContext = null;
  saveState();
  render();
}

function deleteBook(bookId = state.activeBookId) {
  if (state.books.length <= 1) { window.alert("至少保留一本课本。"); return; }
  const book = findBook(bookId);
  if (!book) return;
  if (!window.confirm(`删除课本“${book.title}”及其中的全部课文？`)) return;
  state.books = state.books.filter((item) => item.id !== book.id);
  if (state.activeBookId === book.id) {
    const first = state.books[0];
    state.activeBookId = first.id;
    state.activeDeckId = first.texts[0].id;
    state.activePageId = first.texts[0].pages[0].id;
  }
  clearTransient();
  expandBook(state.activeBookId);
  saveState();
  render();
}

// --- 课文 (deck) ------------------------------------------------------------

function newDeck(bookId = state.activeBookId) {
  const book = findBook(bookId) || getActiveBook();
  const name = window.prompt("课文名称", `课文 ${book.texts.length + 1}`);
  if (!name) return;
  const deck = createDeck(name, "");
  book.texts.push(deck);
  book.updatedAt = Date.now();
  state.activeBookId = book.id;
  state.activeDeckId = deck.id;
  state.activePageId = deck.pages[0].id;
  clearTransient();
  expandBook(book.id);
  state.ui.deckPickerOpen = true;
  saveState();
  render();
}

function renameDeck(deckId = state.activeDeckId) {
  const { deck } = findDeckAndBook(deckId);
  if (!deck) return;
  const name = window.prompt("课文名称", deck.title);
  if (!name) return;
  deck.title = name;
  state.ui.deckContext = null;
  touchDeck(deck);
  render();
}

function copyDeck(deckId = state.activeDeckId) {
  const { deck: source, book } = findDeckAndBook(deckId);
  if (!source || !book) return;
  const deck = deepClone(source);
  deck.id = id("deck");
  deck.title = `${source.title} 副本`;
  deck.updatedAt = Date.now();
  deck.pages.forEach((page) => {
    page.id = id("page");
    page.tokens.forEach((token) => token.id = id("tok"));
  });
  const index = book.texts.findIndex((item) => item.id === source.id);
  book.texts.splice(index + 1, 0, deck);
  state.activeBookId = book.id;
  state.activeDeckId = deck.id;
  state.activePageId = deck.pages[0].id;
  clearTransient();
  expandBook(book.id);
  state.ui.deckPickerOpen = true;
  saveState();
  render();
}

function deleteDeck(deckId = state.activeDeckId) {
  const { deck, book } = findDeckAndBook(deckId);
  if (!deck || !book) return;
  if (book.texts.length <= 1) { window.alert("每本课本至少保留一篇课文；如需清空请删除整本课本。"); return; }
  if (!window.confirm(`删除课文“${deck.title}”？`)) return;
  const index = book.texts.findIndex((item) => item.id === deck.id);
  book.texts = book.texts.filter((item) => item.id !== deck.id);
  if (state.activeDeckId === deck.id) {
    state.activeBookId = book.id;
    const next = book.texts[Math.max(0, index - 1)];
    state.activeDeckId = next.id;
    state.activePageId = next.pages[0].id;
  }
  clearTransient();
  expandBook(state.activeBookId);
  saveState();
  render();
}

function newPage() {
  const deck = getActiveDeck();
  const page = createPage(`第 ${deck.pages.length + 1} 页`, "");
  deck.pages.push(page);
  state.activePageId = page.id;
  clearTransient();
  touchDeck(deck);
  render();
}

function copyPage(pageId = state.activePageId) {
  const deck = getActiveDeck();
  const source = deck.pages.find((item) => item.id === pageId) || getActivePage();
  const page = deepClone(source);
  page.id = id("page");
  page.title = `${page.title} 副本`;
  page.tokens.forEach((token) => token.id = id("tok"));
  const index = deck.pages.findIndex((item) => item.id === source.id);
  deck.pages.splice(index + 1, 0, page);
  state.activePageId = page.id;
  state.ui.pageContext = null;
  state.ui.deckContext = null;
  state.ui.menu = null;
  state.ui.pinyinMenu = null;
  state.ui.activeTokenId = "";
  state.ui.pendingExample = false;
  state.ui.pendingImage = false;
  state.ui.editingExampleId = "";
  state.ui.editingCaptionId = "";
  state.ui.editingMain = false;
  state.ui.selectedPageIds = [];
  state.ui.pageAnchorId = "";
  touchDeck(deck);
  saveState();
  render();
}

function deletePage(pageId = state.activePageId) {
  const deck = getActiveDeck();
  if (deck.pages.length <= 1) return;
  const page = deck.pages.find((item) => item.id === pageId);
  if (!page) return;
  if (!window.confirm("删除该页面？")) return;
  const index = deck.pages.findIndex((item) => item.id === page.id);
  deck.pages.splice(index, 1);
  if (state.activePageId === page.id) {
    state.activePageId = deck.pages[Math.max(0, index - 1)].id;
  }
  clearTransient();
  state.ui.pageContext = null;
  state.ui.deckContext = null;
  state.ui.menu = null;
  touchDeck(deck);
  render();
}

// The current page multi-selection, restricted to pages that still exist. Falls
// back to the single active page when nothing is explicitly selected.
function currentPageSelection() {
  const deck = getActiveDeck();
  const existing = (state.ui.selectedPageIds || []).filter((pid) => deck.pages.some((page) => page.id === pid));
  if (existing.length) return existing;
  return state.activePageId ? [state.activePageId] : [];
}

// Update the page multi-selection from a click. `shift` selects the contiguous
// range from the anchor to the clicked page; `toggle` (Cmd/Ctrl) adds or removes
// a single page; a plain click selects just that page. The selection is always
// kept in page order, is never empty, and the clicked page becomes the shown one.
function selectPage(pageId, { shift = false, toggle = false } = {}) {
  const deck = getActiveDeck();
  const order = deck.pages.map((page) => page.id);
  let selected;
  if (shift) {
    const anchorId = state.ui.pageAnchorId && order.includes(state.ui.pageAnchorId)
      ? state.ui.pageAnchorId
      : state.activePageId;
    const a = order.indexOf(anchorId);
    const b = order.indexOf(pageId);
    selected = a >= 0 && b >= 0 ? order.slice(Math.min(a, b), Math.max(a, b) + 1) : [pageId];
  } else if (toggle) {
    const current = currentPageSelection();
    selected = current.includes(pageId) ? current.filter((pid) => pid !== pageId) : [...current, pageId];
    if (!selected.length) selected = [pageId];
    state.ui.pageAnchorId = pageId;
  } else {
    selected = [pageId];
    state.ui.pageAnchorId = pageId;
  }
  state.ui.selectedPageIds = order.filter((pid) => selected.includes(pid));
  state.activePageId = state.ui.selectedPageIds.includes(pageId)
    ? pageId
    : state.ui.selectedPageIds[state.ui.selectedPageIds.length - 1] || pageId;
}

// Delete every page in the current multi-selection at once (right-click on a
// selection of 2+). Keeps at least one page in the deck and, after deleting,
// selects the page nearest the removed block.
function deletePages() {
  const deck = getActiveDeck();
  const selected = currentPageSelection().filter((pid) => deck.pages.some((page) => page.id === pid));
  if (selected.length < 2) return deletePage(state.ui.pageContext?.pageId);
  if (selected.length >= deck.pages.length) {
    window.alert("不能删除讲义中的全部页面，至少保留一页。");
    return;
  }
  if (!window.confirm(`删除选中的 ${selected.length} 个页面？`)) return;
  const firstIndex = deck.pages.findIndex((page) => selected.includes(page.id));
  const removing = new Set(selected);
  deck.pages = deck.pages.filter((page) => !removing.has(page.id));
  state.activePageId = deck.pages[Math.min(firstIndex, deck.pages.length - 1)].id;
  clearTransient();
  state.ui.pageContext = null;
  touchDeck(deck);
  render();
}

function reorderPage(draggedPageId, targetPageId) {
  if (!draggedPageId || draggedPageId === targetPageId) return;
  const deck = getActiveDeck();
  const fromIndex = deck.pages.findIndex((page) => page.id === draggedPageId);
  const toIndex = deck.pages.findIndex((page) => page.id === targetPageId);
  if (fromIndex < 0 || toIndex < 0) return;
  const [page] = deck.pages.splice(fromIndex, 1);
  deck.pages.splice(toIndex, 0, page);
  state.ui.draggedPageId = "";
  touchDeck(deck);
  render();
}

// Insert the dragged page before or after a target page, matching the drop
// indicator shown during dragover.
function reorderPageRelative(draggedPageId, targetPageId, after) {
  if (!draggedPageId || draggedPageId === targetPageId) {
    state.ui.draggedPageId = "";
    return;
  }
  const deck = getActiveDeck();
  const fromIndex = deck.pages.findIndex((page) => page.id === draggedPageId);
  if (fromIndex < 0) return;
  const [page] = deck.pages.splice(fromIndex, 1);
  let toIndex = deck.pages.findIndex((item) => item.id === targetPageId);
  if (toIndex < 0) {
    deck.pages.push(page);
  } else {
    deck.pages.splice(after ? toIndex + 1 : toIndex, 0, page);
  }
  state.ui.draggedPageId = "";
  touchDeck(deck);
  render();
}

function movePageToEnd(pageId) {
  if (!pageId) return;
  const deck = getActiveDeck();
  const fromIndex = deck.pages.findIndex((page) => page.id === pageId);
  if (fromIndex < 0 || fromIndex === deck.pages.length - 1) return;
  const [page] = deck.pages.splice(fromIndex, 1);
  deck.pages.push(page);
  state.ui.draggedPageId = "";
  touchDeck(deck);
  render();
}

export function movePageSelection(step) {
  const deck = getActiveDeck();
  if (!deck?.pages?.length) return;
  const currentIndex = deck.pages.findIndex((page) => page.id === state.activePageId);
  const nextIndex = Math.min(Math.max((currentIndex < 0 ? 0 : currentIndex) + step, 0), deck.pages.length - 1);
  if (nextIndex === currentIndex) return;
  state.activePageId = deck.pages[nextIndex].id;
  clearTransient();
  saveState();
  render();
}

// Build an image-generation prompt for the selected character from either the
// current user example or, in dictionary-fallback mode, the current zdict
// meaning (with the "～" placeholder replaced by the character itself).
function buildImagePrompt() {
  const { deck, token, entry } = activeContext();
  if (!token) return "";

  let content = "";
  const usingZdict = entry.examples.length === 0 && !state.ui.pendingExample && deck.settings.showZdictExamples;
  if (usingZdict) {
    const meanings = lookupZdictMeanings(token.text, token.pinyin);
    if (!meanings.length) return "";
    const idx = Math.min(Math.max(state.ui.zdictIndex || 0, 0), meanings.length - 1);
    content = meanings[idx].replaceAll("～", token.text).replaceAll("~", token.text);
  } else {
    const examples = visibleExamples(entry, token);
    if (!examples.length) return "";
    const idx = Math.min(Math.max(token.exampleIndex || 0, 0), examples.length - 1);
    content = examples[idx]?.text || "";
  }

  content = content.trim().replace(/[。．.\s]+$/u, "");
  if (!content) return "";
  return `请为小学语文教材生成一张配图，帮助学生理解汉字“${token.text}”。画面内容：${content}。要求：儿童绘本插画风格，色彩明亮、构图简洁，画面中不要出现任何文字。`;
}

function flashButton(button, label) {
  if (!button) return;
  const original = button.textContent;
  button.textContent = label;
  window.setTimeout(() => { button.textContent = original; }, 1200);
}

function copyPrompt(text, button) {
  const done = () => flashButton(button, "已复制");
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
    done();
  } catch {
    window.prompt("复制以下提示词：", text);
  } finally {
    area.remove();
  }
}

function speakText(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  // Pin an actual Chinese voice when one exists; otherwise the engine may read
  // the character with the default (often English) voice and mangle it.
  const voices = window.speechSynthesis.getVoices?.() || [];
  const zhVoice = voices.find((voice) => /^zh\b/i.test(voice.lang) || /zh[-_]/i.test(voice.lang));
  if (zhVoice) utterance.voice = zhVoice;
  utterance.rate = 0.82;
  window.speechSynthesis.speak(utterance);
}

// --- Import / export -------------------------------------------------------

function exportSelectedDeck() {
  const { deck } = findDeckAndBook(state.ui.deckContext?.deckId);
  const target = deck || getActiveDeck();
  state.ui.deckContext = null;
  if (target) exportDeck(target);
  render();
}

// --- 查字（按部首查询并导出）----------------------------------------------
// Selection is over 课文 across all books (flat list from allTexts()); a proper
// two-level 课本→课文 tree lands in a later phase.

function openCharQuery() {
  state.ui.query = {
    open: true,
    step: 1,
    deckIds: allTexts().map((deck) => deck.id),
    lastDeckIndex: -1,
    radicals: [],
    chars: [],
    charSort: "freq",
    includePinyin: true
  };
  closeFloaters();
  render();
}

function toggleAllQueryDecks() {
  const query = state.ui.query;
  const texts = allTexts();
  query.deckIds = query.deckIds.length === texts.length ? [] : texts.map((deck) => deck.id);
}

function selectQueryDeck(index, deckId, shiftKey) {
  const query = state.ui.query;
  const texts = allTexts();
  const ids = new Set(query.deckIds);
  if (shiftKey && query.lastDeckIndex >= 0) {
    const [from, to] = [query.lastDeckIndex, index].sort((a, b) => a - b);
    for (let i = from; i <= to; i++) ids.add(texts[i].id);
  } else if (ids.has(deckId)) {
    ids.delete(deckId);
  } else {
    ids.add(deckId);
  }
  query.deckIds = texts.filter((deck) => ids.has(deck.id)).map((deck) => deck.id);
  query.lastDeckIndex = index;
}

function toggleQueryRadical(radical) {
  const query = state.ui.query;
  query.radicals = query.radicals.includes(radical)
    ? query.radicals.filter((item) => item !== radical)
    : [...query.radicals, radical];
}

function toggleAllQueryRadicals() {
  const query = state.ui.query;
  const present = radicalsInDecks(query.deckIds).map((item) => item.radical);
  const allSelected = present.length > 0 && present.every((radical) => query.radicals.includes(radical));
  query.radicals = allSelected ? [] : present;
}

// Entering the character step: candidate = chars matching the chosen radicals,
// default ALL selected. The user then toggles individual chars off/on.
function initQueryChars() {
  const query = state.ui.query;
  query.chars = charsInDecks(query.deckIds, query.radicals).map((item) => item.char);
}

function toggleQueryChar(char) {
  const query = state.ui.query;
  query.chars = query.chars.includes(char)
    ? query.chars.filter((item) => item !== char)
    : [...query.chars, char];
}

function toggleAllQueryChars() {
  const query = state.ui.query;
  const all = charsInDecks(query.deckIds, query.radicals).map((item) => item.char);
  const allSelected = all.length > 0 && all.every((char) => query.chars.includes(char));
  query.chars = allSelected ? [] : all;
}

function currentQueryGroups() {
  const query = state.ui.query;
  return groupByRadical(collectMatches(query.deckIds, new Set(query.chars || [])));
}

// 字帖用的唯一字顺序 = 从上到下读 Word 文档时各字首次出现的顺序：
// 把 Word 用的同一套分组（currentQueryGroups）按顺序铺平、去重取字。
// Word 的生成逻辑不变，字帖只是“跟着 Word 走”。
function orderedSelectedChars() {
  const seen = new Set();
  const ordered = [];
  for (const group of currentQueryGroups()) {
    for (const item of group.items) {
      if (!seen.has(item.char)) { seen.add(item.char); ordered.push(item.char); }
    }
  }
  return ordered;
}

// 字帖：取去重后的唯一字，按需从 CDN 取笔画，渲染练字帖，交浏览器打印 / 存 PDF。
async function printZitie() {
  const chars = orderedSelectedChars();
  if (!chars.length) return;
  // 必须在点击手势内同步打开窗口，否则取完 CDN 笔画后再 open 会被弹窗拦截器拦掉。
  const win = window.open("", "_blank");
  if (!win) {
    window.alert("浏览器拦截了新窗口，请允许本站弹出窗口后重试。");
    return;
  }
  win.document.write('<!doctype html><meta charset="utf-8"><title>字帖</title><body style="font:16px sans-serif;color:#666;padding:28px">正在生成字帖，请稍候…</body>');
  win.document.close();
  try {
    const strokesList = await Promise.all(chars.map((char) => fetchStrokes(char)));
    const charStrokes = chars.map((char, i) => ({ char, strokes: strokesList[i] }));
    const missing = charStrokes.filter((item) => !item.strokes).map((item) => item.char);
    win.document.open();
    win.document.write(buildZitieHtml(charStrokes));
    win.document.close();
    win.focus();
    if (missing.length) {
      window.alert(`有 ${missing.length} 个字未找到笔画数据（已留空白格）：${missing.join(" ")}`);
    }
    win.setTimeout(() => win.print(), 350);
  } catch (error) {
    console.error(error);
    win.document.open();
    win.document.write(`<body style="font:16px sans-serif;color:#c00;padding:28px">生成字帖失败：${error && error.message}</body>`);
    win.document.close();
  }
}

function exportCharQueryWord() {
  try {
    const docx = buildDocx(currentQueryGroups(), state.ui.query.includePinyin);
    const blob = new Blob([docx], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `查字-${new Date().toISOString().slice(0, 10)}.docx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
    window.alert(`导出 Word 失败：${error && error.message}`);
  }
}

function printCharQuery() {
  const html = buildPrintHtml(currentQueryGroups(), state.ui.query.includePinyin);
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function importPagesFlow() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const count = await importPages(file);
      clearTransient();
      render();
      window.alert(`已导入 ${count} 个页面到当前讲义。`);
    } catch (error) {
      window.alert(`导入页面失败：${error.message}`);
    }
  }, { once: true });
  input.click();
}

function importDecksFlow() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await importData(file);
      clearTransient();
      state.ui.deckPickerOpen = false;
      render();
    } catch (error) {
      window.alert(`导入失败：${error.message}`);
    }
  }, { once: true });
  input.click();
}

// --- Global (document-level) listeners -------------------------------------

function onDocumentKeyDown(event) {
  if (event.key === "Escape") {
    if (state.ui.query?.open) {
      state.ui.query = null;
      render();
      return;
    }
    closeFloaters();
    state.ui.annotating = false;
    state.ui.annotationOriginalColors = {};
    render();
    return;
  }

  if (!state.ui.chromeCollapsed) return;
  if (event.target.matches?.("textarea,input,select")) return;

  if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
    event.preventDefault();
    movePageSelection(1);
  } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
    event.preventDefault();
    movePageSelection(-1);
  }
}

function onDocumentClick(event) {
  const clickedOverlay = event.target.closest(".context-menu") || event.target.closest(".pinyin-popover") || event.target.closest(".deck-popover");
  const clickedTrigger = event.target.closest(".token") || event.target.closest('[data-action="toggle-deck-picker"]');
  if (!clickedOverlay && !clickedTrigger) {
    if (state.ui.menu || state.ui.pinyinMenu || state.ui.deckContext || state.ui.pageContext || state.ui.deckPickerOpen) {
      closeFloaters();
      state.ui.deckPickerOpen = false;
      render();
    }
  }
}
