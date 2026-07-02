// View layer: builds the markup for the current state and writes it into #app.
// Rendering stays a pure innerHTML pass; event wiring lives in events.js and is
// attached once via delegation, so render() never re-binds listeners.
//
// 所有模板都用 html`` 标签模板拼装：插值**默认经 HTML 转义**，只有 html`` 自身
// 产出的 SafeHtml（及其数组）原样拼接。这把"必须记得调 escapeHtml"的约定变成
// 结构保证——忘了也不会引入 XSS。需要人工放行原始字符串时用 rawHtml()（当前无人用）。

import {
  APP_VERSION,
  COLORS,
  state,
  colorValue,
  nowLabel,
  getActiveBook,
  getActiveDeck,
  getActivePage,
  getToken,
  activeContext,
  visibleExamples,
  clampTokenIndex,
  imageContext,
  lookupZdictMeanings,
  allTexts,
  isHanzi
} from "./core.js";
import { radicalsInDecks, charsInDecks, collectMatches, groupByRadical, mergeBySentence, headerLine } from "./charquery.js";
import { imageUrl } from "./storage.js";

export const app = document.querySelector("#app");

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const RAW = Symbol("safeHtml");

export function rawHtml(value) {
  return { [RAW]: true, s: String(value) };
}

function isSafe(value) {
  return typeof value === "object" && value !== null && RAW in value;
}

// 插值规则：null/undefined/false → 空；SafeHtml → 原样；数组 → 逐项递归拼接；
// 其余（字符串/数字/布尔 true）→ 转义。escapeHtml 会转义引号，双引号属性值安全。
function toHtml(value) {
  if (value == null || value === false) return "";
  if (isSafe(value)) return value.s;
  if (Array.isArray(value)) return value.map(toHtml).join("");
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += toHtml(values[i]) + strings[i + 1];
  return rawHtml(out);
}

function renderHighlightedText(value, highlightChar) {
  return [...String(value || "")].map((char) =>
    (highlightChar && char === highlightChar)
      ? html`<span class="inline-highlight">${char}</span>`
      : html`${char}`);
}

function renderHighlightedSet(value, charSet) {
  return [...String(value || "")].map((char) =>
    charSet.has(char)
      ? html`<span class="inline-highlight">${char}</span>`
      : html`${char}`);
}

export function render() {
  const deck = getActiveDeck();
  const page = getActivePage();
  if (!deck || !page) return;

  const longText = [...page.mainText].length > 18 || page.mainText.includes("\n");

  // The full innerHTML rebuild destroys the scrollable panels, so capture the
  // page-list scroll position and restore it afterwards. Otherwise any
  // re-render (e.g. opening a page's context menu) jumps the list to the top.
  const prevPanelScroll = app.querySelector(".pages-panel")?.scrollTop ?? 0;
  const prevListScroll = app.querySelector(".page-list")?.scrollLeft ?? 0;

  app.innerHTML = html`
    <div class="app-shell ${state.ui.chromeCollapsed ? "is-collapsed" : ""}" style="--annotation-color:${colorValue(state.ui.annotationColor || "red")}">
      ${state.ui.chromeCollapsed ? renderCollapsed(page) : renderFullShell(deck, page, { longText })}
      ${renderNavigator()}
      ${renderToc()}
      ${renderContextMenu()}
      ${renderBookContextMenu()}
      ${renderDeckContextMenu()}
      ${renderPageContextMenu()}
      ${renderPinyinMenu()}
      ${renderCharQuery()}
      ${renderPageTransfer()}
      ${renderBackup()}
      ${renderImportChoice()}
      ${renderInbox()}
    </div>
  `.s;

  const panel = app.querySelector(".pages-panel");
  if (panel) panel.scrollTop = prevPanelScroll;
  const list = app.querySelector(".page-list");
  if (list) list.scrollLeft = prevListScroll;

  focusAutofocusField();
}

function focusAutofocusField() {
  const autofocusField = app.querySelector("[autofocus]");
  if (!autofocusField) return;
  requestAnimationFrame(() => {
    autofocusField.focus();
    if ("selectionStart" in autofocusField) {
      autofocusField.selectionStart = autofocusField.value.length;
      autofocusField.selectionEnd = autofocusField.value.length;
    }
  });
}

function renderCollapsed(page) {
  const longText = [...page.mainText].length > 18 || page.mainText.includes("\n");
  return html`
    <button class="floating-restore" data-action="toggle-chrome">显示控制栏</button>
    <main class="stage">
      <div class="workspace">${renderLesson(page, { longText })}</div>
    </main>
  `;
}

function renderFullShell(deck, page, flags) {
  const book = getActiveBook();
  const deckIndex = book.texts.findIndex((item) => item.id === deck.id);
  return html`
    <header class="topbar">
      <div class="brand"><strong>语文</strong><span>yǔwén · v${APP_VERSION}</span></div>
      <div class="toolbar-group">
        <button data-action="toggle-deck-picker">课本</button>
        <span class="active-deck-title" title="${book.title} › ${deck.title}">${book.title}<span class="crumb-sep">›</span>${deck.title}</span>
        <button title="当前课本的课文目录" data-action="toggle-toc">目录</button>
        <button title="上一课文" data-action="prev-deck" ${deckIndex > 0 ? "" : rawHtml("disabled")}>‹ 上一课</button>
        <button title="下一课文" data-action="next-deck" ${deckIndex >= 0 && deckIndex < book.texts.length - 1 ? "" : rawHtml("disabled")}>下一课 ›</button>
        <button title="按部首查字并导出" data-action="open-charquery">查字</button>
      </div>
      <div class="toolbar-group">
        <label class="toggle"><input type="checkbox" data-action="toggle-pinyin" ${deck.settings.showPinyin ? rawHtml("checked") : ""}> 拼音</label>
        <label class="toggle"><input type="checkbox" data-action="toggle-zdict-examples" ${deck.settings.showZdictExamples ? rawHtml("checked") : ""}> 字库例句</label>
        <button data-action="scale-down">A-</button>
        <button data-action="scale-reset">A0</button>
        <button data-action="scale-up">A+</button>
        <label class="toggle"><input type="checkbox" data-action="toggle-text-only" ${page.textOnly ? rawHtml("checked") : ""}> 全文页</label>
        <button data-action="speak" title="朗读正文；先用鼠标划选一段文字则只读选中部分">朗读</button>
        <button data-action="clear-page-colors" title="清除本页正文的全部颜色">清色</button>
        <button data-action="toggle-chrome">最大化</button>
      </div>
      <div class="toolbar-spacer"></div>
      ${state.ui.annotating && state.ui.annotationColor ? html`<span class="annotation-pill">Option/Alt 点击上色：${COLORS.find((color) => color.key === state.ui.annotationColor)?.label}</span>` : ""}
    </header>
    <aside class="pages-panel">
      <div class="panel-head">
        <h2>页面</h2>
        <div class="compact-actions">
          <button title="从 yuwen-pages 文件导入页面" data-action="import-pages">导入</button>
          <button title="添加页面" data-action="new-page">+</button>
        </div>
      </div>
      <div class="page-list">
        ${deck.pages.map((item, index) => renderPageItem(item, index))}
      </div>
    </aside>
    <main class="stage">
      <div class="workspace">${renderLesson(page, flags)}</div>
    </main>
  `;
}

// 当前课本的课文目录：只列本书的课文（带序号），点击即跳转。与「课本」导航器
// 互斥打开；条目复用 data-deck-id 委托，无需新事件路径。
function renderToc() {
  if (!state.ui.tocOpen || state.ui.chromeCollapsed) return "";
  const book = getActiveBook();
  if (!book) return "";
  return html`
    <div class="deck-popover toc-popover">
      <div class="deck-popover-head">
        <span title="${book.title}">课文目录 · ${book.title}</span>
      </div>
      <div class="toc-list">
        ${book.texts.map((deck, index) => html`
          <button class="deck-item toc-item ${deck.id === state.activeDeckId ? "is-active" : ""}" data-deck-id="${deck.id}" data-book-id="${book.id}">
            <span class="toc-num">${index + 1}</span>
            <span class="deck-title">${deck.title}</span>
            <span class="deck-meta">${deck.pages.length} 页</span>
          </button>
        `)}
      </div>
    </div>
  `;
}

// Two-level 课本 → 课文 navigator. The active book is always expanded; other
// books can be toggled open. Opening a 课文 switches the single active deck.
function renderNavigator() {
  if (!state.ui.deckPickerOpen || state.ui.chromeCollapsed) return "";
  return html`
    <div class="deck-popover nav-popover">
      <div class="deck-popover-head">
        <span>课本</span>
        <span class="deck-popover-actions">
          <button title="备份课本为 JSON" data-action="open-backup">备份</button>
          <button title="导入课本 / 课文 (JSON)" data-action="import-deck">导入</button>
          <button title="新建课本" data-action="new-book">新建书</button>
        </span>
      </div>
      <div class="nav-list">
        ${state.books.map(renderBookGroup)}
      </div>
    </div>
  `;
}

function renderBookGroup(book) {
  // Expansion is driven purely by expandedBookIds so every book — including the
  // active one — can be collapsed. The active book is seeded into that list when
  // it becomes active (see expandBook), so it still opens by default.
  const expanded = (state.ui.expandedBookIds || []).includes(book.id);
  return html`
    <div class="nav-book ${book.id === state.activeBookId ? "is-active-book" : ""}">
      <div class="nav-book-head" data-action="toggle-book" data-book-id="${book.id}" role="button" tabindex="0">
        <span class="nav-twisty">${expanded ? "▾" : "▸"}</span>
        <span class="nav-book-title" title="${book.title}">${book.title}</span>
        <span class="deck-meta">${book.texts.length} 课</span>
        <button class="nav-add" title="在本书新建课文" data-action="new-deck" data-book-id="${book.id}">＋</button>
      </div>
      ${expanded ? html`<div class="nav-texts">${book.texts.map((deck) => renderNavText(book, deck))}</div>` : ""}
    </div>
  `;
}

function renderNavText(book, deck) {
  const active = deck.id === state.activeDeckId && book.id === state.activeBookId;
  return html`
    <button class="deck-item nav-text ${active ? "is-active" : ""}" data-deck-id="${deck.id}" data-book-id="${book.id}">
      <span class="deck-title">${deck.title}</span>
      <span class="deck-meta">${deck.pages.length} 页${deck.updatedAt ? ` · ${nowLabel(deck.updatedAt)}` : ""}</span>
    </button>
  `;
}

function renderPageItem(page, index) {
  const selectedIds = state.ui.selectedPageIds || [];
  // Only show the multi-select ring when 2+ pages are selected, so a normal
  // single selection still reads as just the active page.
  const selected = selectedIds.length > 0 && selectedIds.includes(page.id) ? "is-selected" : "";
  const active = page.id === state.activePageId ? "is-active" : "";
  return html`
    <div class="page-item ${active} ${selected}" data-page-id="${page.id}" role="button" tabindex="0" draggable="true">
      <span class="page-number">${index + 1}</span>
      <span class="page-preview">${page.mainText || "空白页面"}</span>
    </div>
  `;
}

function renderLesson(page, { longText }) {
  if (page.textOnly) {
    return html`
      <section class="lesson-page text-only-page">
        <div class="lesson-grid text-only-grid" style="--main-color:${colorValue(page.styles.mainTextColor)};--main-scale:${page.mainTextScale}">
          ${renderMainZone(page, longText)}
        </div>
      </section>
    `;
  }

  return html`
    <section class="lesson-page">
      <div class="lesson-grid" style="--main-color:${colorValue(page.styles.mainTextColor)};--main-scale:${page.mainTextScale}">
        ${renderMainZone(page, longText)}
        ${renderExampleZone(page)}
        ${renderImageZone(page)}
      </div>
    </section>
  `;
}

function renderMainZone(page, longText) {
  if (state.ui.editingMain) {
    return html`
      <section class="main-zone" data-blank="main">
        <textarea class="main-editor" data-draft="main-text" autofocus>${page.mainText}</textarea>
      </section>
    `;
  }

  return html`
    <section class="main-zone ${longText ? "is-long-text" : ""}" data-blank="main">
      <div class="main-text">${renderMainText(page)}</div>
    </section>
  `;
}

function renderMainText(page) {
  if (!page.mainText.trim()) {
    return html`<span class="zone-empty-hint">双击此处输入正文</span>`;
  }

  const tokensByIndex = new Map(page.tokens.map((token) => [token.index, token]));
  const pinyinVisible = getActiveDeck().settings.showPinyin;
  return [...page.mainText].map((char, index) => {
    const token = tokensByIndex.get(index);
    if (!token) return html`<span class="plain-char">${char}</span>`;
    const color = token.color ? `--token-color:${colorValue(token.color)}` : "";
    const active = token.id === state.ui.activeTokenId ? "is-active" : "";
    const optionReady = state.ui.annotating && state.ui.annotationColor ? "option-ready" : "";
    return html`
      <span class="token ${active} ${optionReady}" data-token-id="${token.id}" style="${color}">
        ${pinyinVisible ? html`<span class="pinyin ${token.pinyinCandidates.length > 1 ? "is-polyphonic" : ""}" data-pinyin-token-id="${token.id}" title="${token.pinyinCandidates.length > 1 ? "点击切换读音" : ""}">${token.pinyin}</span>` : ""}
        <span class="hanzi-char">${char}</span>
      </span>
    `;
  });
}

function renderExampleZone(page) {
  const { deck, token, entry } = activeContext();
  if (!token) {
    return html`
      <section class="example-zone">
        <div class="example-content"></div>
      </section>
    `;
  }

  // Dictionary fallback: only when the user has entered no examples of their own
  // and is not currently adding one. As soon as a user example exists it wins.
  if (entry.examples.length === 0 && !state.ui.pendingExample && deck.settings.showZdictExamples) {
    const meanings = lookupZdictMeanings(token.text, token.pinyin);
    if (meanings.length) {
      const idx = Math.min(Math.max(state.ui.zdictIndex || 0, 0), meanings.length - 1);
      return html`
        <section class="example-zone">
          <div class="zone-controls">
            <button data-action="add-example">+</button>
            ${meanings.length > 1 ? html`
              <button data-action="prev-zdict">‹</button>
              <button data-action="next-zdict">›</button>
            ` : ""}
            <button data-action="speak-example" data-text="${meanings[idx]}" title="朗读这条释义">读</button>
            <button data-action="copy-prompt" title="生成并复制图片提示词">提示词</button>
          </div>
          <div class="example-content">
            <div class="text-display example-display zdict-example"><span class="zdict-tag">字库</span>${renderHighlightedText(meanings[idx], token.text)}</div>
          </div>
        </section>
      `;
    }
  }

  const examples = visibleExamples(entry, token);
  const currentIndex = state.ui.pendingExample ? examples.length : clampTokenIndex(token, "exampleIndex", examples.length);
  const current = state.ui.pendingExample ? { text: "" } : examples[currentIndex] || { text: "" };
  const editingExample = state.ui.pendingExample || (current.id && state.ui.editingExampleId === current.id);

  return html`
    <section class="example-zone">
      <div class="zone-controls">
        <button data-action="add-example">+</button>
        ${examples.length ? html`
          <button data-action="prev-example" ${examples.length < 2 ? rawHtml("disabled") : ""}>‹</button>
          <button data-action="next-example" ${examples.length < 2 ? rawHtml("disabled") : ""}>›</button>
          <button data-action="speak-example" data-text="${current.text || ""}" title="朗读这条例句">读</button>
          <button data-action="hide-example" title="只在当前位置隐藏">藏</button>
          <button data-action="delete-example" title="从本课本共享素材中删除">删</button>
          <button data-action="copy-prompt" title="生成并复制图片提示词">提示词</button>
        ` : ""}
      </div>
      <div class="example-content">
        ${editingExample ? html`<textarea data-draft="example" data-example-id="${current.id || ""}" autofocus>${current.text || ""}</textarea>` : ""}
        ${!editingExample && current.text ? html`<button class="text-display example-display" data-action="edit-example">${renderHighlightedText(current.text, token.text)}</button>` : ""}
      </div>
    </section>
  `;
}

function renderImageZone(page) {
  const context = imageContext();
  const images = context.images;
  const current = images[context.index] || { src: "", caption: "" };
  const { token } = activeContext();
  const editingCaption = current.id && state.ui.editingCaptionId === current.id;

  if (!images.length) {
    return html`
      <section class="image-zone">
        <div class="zone-controls">
          <button data-action="add-image" title="添加${context.label}">+</button>
        </div>
        <div class="image-empty"></div>
      </section>
    `;
  }

  return html`
    <section class="image-zone">
      <div class="zone-controls">
        <button data-action="prev-image" ${images.length < 2 ? rawHtml("disabled") : ""}>‹</button>
        <button data-action="next-image" ${images.length < 2 ? rawHtml("disabled") : ""}>›</button>
        <button data-action="add-image">+</button>
        ${context.canHide ? html`<button data-action="hide-image" title="只在当前位置隐藏">藏</button>` : ""}
        <button data-action="delete-image" title="${context.scope === "token" ? "从本课本共享素材中删除" : "删除当前页面配图"}">删</button>
      </div>
      <div class="image-frame">
        <div class="image-box" data-image-box-id="${current.id}" style="width:${current.widthPercent || 86}%">
          <img src="${imageUrl(current)}" alt="${current.caption || "讲义图片"}" draggable="false">
          <button class="image-resize-handle" data-resize-image-id="${current.id}" title="拖拽调整图片大小" aria-label="拖拽调整图片大小"></button>
        </div>
      </div>
      <div class="caption">
        ${editingCaption ? html`<textarea data-draft="caption" data-image-id="${current.id}" autofocus>${current.caption || ""}</textarea>` : ""}
        ${!editingCaption ? html`<button class="text-display caption-display" data-action="edit-caption" data-image-id="${current.id}" aria-label="编辑图片说明">${renderHighlightedText(current.caption, token?.text)}</button>` : ""}
      </div>
    </section>
  `;
}

function renderContextMenu() {
  if (!state.ui.menu) return "";
  const { token } = activeContext();
  const isTextOnly = getActivePage().textOnly;
  const hasHidden = Boolean(token && ((token.hiddenExamples?.length || 0) + (token.hiddenImages?.length || 0)));
  return html`
    <div class="context-menu" style="left:${state.ui.menu.x}px;top:${state.ui.menu.y}px">
      <div class="swatches">
        ${COLORS.map((color) => html`
          <button class="swatch" title="${color.label}" data-action="token-color" data-color="${color.key}" style="background:${color.value}"></button>
        `)}
      </div>
      <button class="menu-item" data-action="speak-token">朗读</button>
      ${!isTextOnly ? html`<button class="menu-item" data-action="add-example">添加例词/例句</button>` : ""}
      ${!isTextOnly ? html`<button class="menu-item" data-action="add-image">添加图片</button>` : ""}
      ${!isTextOnly && hasHidden ? html`<button class="menu-item" data-action="restore-hidden">恢复隐藏内容</button>` : ""}
      <button class="menu-item" data-action="clear-token-color">清除该字颜色</button>
    </div>
  `;
}

function renderBookContextMenu() {
  if (!state.ui.bookContext) return "";
  return html`
    <div class="context-menu" style="left:${state.ui.bookContext.x}px;top:${state.ui.bookContext.y}px">
      <button class="menu-item" data-action="new-deck">新建课文</button>
      <button class="menu-item" data-action="rename-book">重命名课本</button>
      <button class="menu-item" data-action="delete-book">删除课本</button>
    </div>
  `;
}

function renderDeckContextMenu() {
  if (!state.ui.deckContext) return "";
  return html`
    <div class="context-menu" style="left:${state.ui.deckContext.x}px;top:${state.ui.deckContext.y}px">
      <button class="menu-item" data-action="rename-deck">重命名课文</button>
      <button class="menu-item" data-action="copy-deck">复制课文</button>
      <button class="menu-item" data-action="delete-deck">删除课文</button>
    </div>
  `;
}

function renderPageContextMenu() {
  if (!state.ui.pageContext) return "";
  const selectedIds = state.ui.selectedPageIds || [];
  // When 2+ pages are selected and the right-click landed on one of them, the
  // menu offers batch actions over the whole selection instead of the per-page
  // menu.
  if (selectedIds.length > 1 && selectedIds.includes(state.ui.pageContext.pageId)) {
    return html`
      <div class="context-menu" style="left:${state.ui.pageContext.x}px;top:${state.ui.pageContext.y}px">
        <button class="menu-item" data-action="print-pages">打印选中的 ${selectedIds.length} 个页面</button>
        <button class="menu-item" data-action="pages-copy-to">复制 ${selectedIds.length} 个页面到课文…</button>
        <button class="menu-item" data-action="pages-move-to">移动 ${selectedIds.length} 个页面到课文…</button>
        <button class="menu-item" data-action="delete-pages">删除选中的 ${selectedIds.length} 个页面</button>
      </div>
    `;
  }
  return html`
    <div class="context-menu" style="left:${state.ui.pageContext.x}px;top:${state.ui.pageContext.y}px">
      <button class="menu-item" data-action="print-page" data-page-id="${state.ui.pageContext.pageId}">打印页面</button>
      <button class="menu-item" data-action="copy-page" data-page-id="${state.ui.pageContext.pageId}">复制页面</button>
      <button class="menu-item" data-action="pages-copy-to">复制到课文…</button>
      <button class="menu-item" data-action="pages-move-to">移动到课文…</button>
      <button class="menu-item" data-action="delete-page" data-page-id="${state.ui.pageContext.pageId}">删除页面</button>
    </div>
  `;
}

// 「复制到课文 / 移动到课文」弹框：课本手风琴（当前课本默认展开），点一篇课文
// 即把选中的页面送到它尾部；每本课本末尾有「＋ 新建课文…」（名字走 prompt）。
function renderPageTransfer() {
  const transfer = state.ui.pageTransfer;
  if (!transfer?.open) return "";
  const verb = transfer.mode === "move" ? "移动" : "复制";
  return html`
    <div class="cq-overlay">
      <div class="cq-dialog cq-dialog-narrow">
        <div class="cq-head">
          <span>${verb} ${transfer.pageIds.length} 个页面到课文</span>
          <button class="cq-x" data-action="transfer-close" aria-label="关闭">×</button>
        </div>
        <div class="cq-body">
          <div class="cq-toolbar">
            <span class="cq-dim">点选目标课文（页面追加到其尾部），或在课本内新建课文${transfer.mode === "move" ? "；移动后页面从本课文消失" : ""}。</span>
          </div>
          <div class="cq-list">
            ${state.books.map((book) => renderTransferBook(book, transfer))}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTransferBook(book, transfer) {
  const isOpen = (transfer.expandedBooks || []).includes(book.id);
  return html`
    <div class="cq-book">
      <div class="cq-row cq-book-row">
        <button class="cq-book-open" data-action="transfer-book-expand" data-book-id="${book.id}">
          <span class="cq-twisty">${isOpen ? "▾" : "▸"}</span>
          <span class="cq-row-title">${book.title}</span>
          <span class="cq-dim">${book.texts.length} 课</span>
        </button>
      </div>
      ${isOpen ? html`<div class="cq-texts">
        ${book.texts.map((deck) => {
          const isSource = deck.id === state.activeDeckId && book.id === state.activeBookId;
          return html`
            <button class="cq-row cq-text-row" data-action="transfer-to-deck" data-book-id="${book.id}" data-deck-id="${deck.id}">
              <span class="cq-row-title">${deck.title}${isSource ? html`<span class="cq-dim">（当前课文）</span>` : ""}</span>
              <span class="cq-dim">${deck.pages.length} 页</span>
            </button>
          `;
        })}
        <button class="cq-row cq-text-row cq-new-row" data-action="transfer-new-deck" data-book-id="${book.id}">
          <span class="cq-row-title">＋ 新建课文…</span>
        </button>
      </div>` : ""}
    </div>
  `;
}

function renderCharQuery() {
  const query = state.ui.query;
  if (!query?.open) return "";

  const isPage = query.scope === "page";
  const pageCount = (query.pageIds || []).length;
  const title = isPage ? (pageCount > 1 ? `打印页面（${pageCount} 页）` : "打印页面") : "查字导出";
  const stepLabel = isPage
    ? { 3: "选择单字", 4: "预览导出" }[query.step]
    : { 1: "①选择课文", 2: "②选择部首", 3: "③选择单字", 4: "④预览导出" }[query.step];
  return html`
    <div class="cq-overlay">
      <div class="cq-dialog">
        <div class="cq-head">
          <span>${title} · ${stepLabel}</span>
          <button class="cq-x" data-action="charquery-close" aria-label="关闭">×</button>
        </div>
        <div class="cq-body">${renderCharQueryStep(query)}</div>
      </div>
    </div>
  `;
}

function renderCharQueryStep(query) {
  if (query.step === 1) {
    const total = allTexts().length;
    const selected = new Set(query.deckIds || []);
    const expanded = new Set(query.expandedBooks || []);
    const allSelected = total > 0 && query.deckIds.length === total;
    return html`
      <div class="cq-toolbar">
        <button data-action="charquery-decks-all">${allSelected ? "全不选" : "全选"}</button>
        <span class="cq-dim">已选 ${query.deckIds.length} / ${total} 篇课文（勾课本＝选整本）</span>
      </div>
      <div class="cq-list cq-tree">
        ${state.books.map((book) => renderSelectionBook(book, selected, expanded, {
          checkAction: "charquery-book-sel",
          expandAction: "charquery-book-expand",
          deckAction: "charquery-deck"
        }))}
      </div>
      <div class="cq-foot">
        <span></span>
        <button class="cq-primary" data-action="charquery-next" ${query.deckIds.length ? "" : rawHtml("disabled")}>下一步 →</button>
      </div>
    `;
  }

  if (query.step === 2) {
    const radicals = radicalsInDecks(query.deckIds);
    const present = radicals.map((item) => item.radical);
    const allSelected = present.length > 0 && present.every((radical) => query.radicals.includes(radical));
    const chosen = query.radicals.filter((radical) => present.includes(radical));
    return html`
      <div class="cq-toolbar">
        <button data-action="charquery-radicals-all">${allSelected ? "全不选" : "全选"}</button>
        <span class="cq-dim">基于 ${query.deckIds.length} 册 · 已选 ${chosen.length} / ${present.length} 个部首</span>
      </div>
      <div class="cq-chips">
        ${radicals.length ? radicals.map((item) => html`
          <button class="cq-chip ${query.radicals.includes(item.radical) ? "is-sel" : ""}" data-action="charquery-radical" data-radical="${item.radical}">${item.radical} <span class="cq-dim">${item.count}</span></button>
        `) : html`<span class="cq-dim">所选课文中没有可识别部首的字。</span>`}
      </div>
      <div class="cq-foot">
        <button data-action="charquery-back">← 上一步</button>
        <button class="cq-primary" data-action="charquery-to-chars" ${chosen.length ? "" : rawHtml("disabled")}>下一步 →</button>
      </div>
    `;
  }

  if (query.step === 3) {
    const candidates = query.scope === "page"
      ? charsInDecks(query.deckIds, null, query.charSort, query.pageIds)
      : charsInDecks(query.deckIds, query.radicals, query.charSort);
    const selected = new Set(query.chars || []);
    const allSelected = candidates.length > 0 && candidates.every((item) => selected.has(item.char));
    const chosen = candidates.filter((item) => selected.has(item.char)).length;
    return html`
      <div class="cq-toolbar">
        <button data-action="charquery-chars-all">${allSelected ? "全不选" : "全选"}</button>
        <span class="cq-sort">排序：
          <button class="cq-sortbtn ${query.charSort === "appear" ? "is-on" : ""}" data-action="charquery-sort" data-sort="appear">首次</button>
          <button class="cq-sortbtn ${query.charSort === "freq" ? "is-on" : ""}" data-action="charquery-sort" data-sort="freq">词频</button>
          <button class="cq-sortbtn ${query.charSort === "radical" ? "is-on" : ""}" data-action="charquery-sort" data-sort="radical">部首</button>
        </span>
        <span class="cq-dim">默认全选，点字可移除/恢复 · 已选 ${chosen} / ${candidates.length} 字</span>
      </div>
      <div class="cq-chips">
        ${candidates.length ? candidates.map((item) => html`
          <button class="cq-chip ${selected.has(item.char) ? "is-sel" : ""}" data-action="charquery-char" data-char="${item.char}">${item.char} <span class="cq-dim">${item.count}</span></button>
        `) : html`<span class="cq-dim">${query.scope === "page" && (query.pageIds || []).length > 1 ? "所选页面没有可导出的字。" : "这一页没有可导出的字。"}</span>`}
      </div>
      <div class="cq-foot">
        ${query.scope === "page" ? html`<span></span>` : html`<button data-action="charquery-back">← 上一步</button>`}
        <button class="cq-primary" data-action="charquery-to-preview" ${chosen ? "" : rawHtml("disabled")}>预览导出 →</button>
      </div>
    `;
  }

  const groups = groupByRadical(collectMatches(query.deckIds, new Set(query.chars || []), query.pageIds || null));
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const uniqueCount = (query.chars || []).length;
  return html`
    <div class="cq-toolbar">
      <label class="toggle"><input type="checkbox" data-action="charquery-include-pinyin" ${query.includePinyin ? rawHtml("checked") : ""}> 包括拼音</label>
      <span class="cq-dim">${uniqueCount} 字 · ${total} 处</span>
    </div>
    <div class="cq-preview">
      ${groups.length ? groups.map((group) => html`
        <div class="cq-group">
          <div class="cq-radical">${group.radical}</div>
          ${mergeBySentence(group.items).map((block) => html`
            <div class="cq-entry">
              <div class="cq-entry-meta">${headerLine(block, query.includePinyin)}</div>
              <div class="cq-entry-sent">${renderHighlightedSet(block.sentence, new Set(block.chars.map((item) => item.char)))}</div>
            </div>
          `)}
        </div>
      `) : html`<span class="cq-dim">没有匹配的字。</span>`}
    </div>
    <div class="cq-foot">
      <button data-action="charquery-back">← 上一步</button>
      <span class="cq-foot-actions">
        <button data-action="charquery-print" ${total ? "" : rawHtml("disabled")}>打印 Word</button>
        <button data-action="charquery-export-word" ${total ? "" : rawHtml("disabled")}>导出 Word</button>
        <button class="cq-primary" data-action="charquery-export-zitie" ${uniqueCount ? "" : rawHtml("disabled")}>导出字帖</button>
      </span>
    </div>
  `;
}

// 查字第 1 步与备份共用的「课本 → 课文」勾选树（动作名由调用方注入）。
function renderSelectionBook(book, selected, expanded, actions) {
  const selCount = book.texts.filter((deck) => selected.has(deck.id)).length;
  const mark = selCount === 0 ? "☐" : (selCount === book.texts.length ? "☑" : "▣");
  const isOpen = expanded.has(book.id);
  return html`
    <div class="cq-book">
      <div class="cq-row cq-book-row">
        <button class="cq-check-btn" data-action="${actions.checkAction}" data-book-id="${book.id}" aria-label="选择整本课本">${mark}</button>
        <button class="cq-book-open" data-action="${actions.expandAction}" data-book-id="${book.id}">
          <span class="cq-twisty">${isOpen ? "▾" : "▸"}</span>
          <span class="cq-row-title">${book.title}</span>
          <span class="cq-dim">${selCount}/${book.texts.length} 课</span>
        </button>
      </div>
      ${isOpen ? html`<div class="cq-texts">${book.texts.map((deck) => html`
        <button class="cq-row cq-text-row ${selected.has(deck.id) ? "is-sel" : ""}" data-action="${actions.deckAction}" data-deck-id="${deck.id}">
          <span class="cq-check">${selected.has(deck.id) ? "☑" : "☐"}</span>
          <span class="cq-row-title">${deck.title}</span>
          <span class="cq-dim">${deck.pages.length} 页</span>
        </button>
      `)}</div>` : ""}
    </div>
  `;
}

function renderBackup() {
  const backup = state.ui.backup;
  if (!backup?.open) return "";
  const total = allTexts().length;
  const selected = new Set(backup.deckIds || []);
  const expanded = new Set(backup.expandedBooks || []);
  const bookCount = state.books.filter((book) => book.texts.some((deck) => selected.has(deck.id))).length;
  const allSelected = total > 0 && backup.deckIds.length === total;
  return html`
    <div class="cq-overlay">
      <div class="cq-dialog">
        <div class="cq-head">
          <span>备份 · 导出 JSON</span>
          <button class="cq-x" data-action="backup-close" aria-label="关闭">×</button>
        </div>
        <div class="cq-body">
          <div class="cq-toolbar">
            <button data-action="backup-all">${allSelected ? "全不选" : "全选"}</button>
            <span class="cq-dim">勾要备份的课本 / 课文（勾课本＝整本）· 已选 ${backup.deckIds.length}/${total} 篇 · ${bookCount} 本各存一个文件</span>
          </div>
          <div class="cq-list cq-tree">
            ${state.books.map((book) => renderSelectionBook(book, selected, expanded, {
              checkAction: "backup-book-sel",
              expandAction: "backup-book-expand",
              deckAction: "backup-deck"
            }))}
          </div>
          <div class="cq-foot">
            <span class="cq-dim">多本课本＝多个文件（浏览器会提示允许多文件下载）</span>
            <button class="cq-primary" data-action="backup-run" ${backup.deckIds.length ? "" : rawHtml("disabled")}>备份${bookCount ? `（${bookCount} 个文件）` : ""}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Single-file backup import: choose to restore as a new book or fold the 课文
// into an existing one.
function renderImportChoice() {
  const choice = state.ui.importChoice;
  if (!choice?.open) return "";
  const count = choice.env.texts.length;
  return html`
    <div class="cq-overlay">
      <div class="cq-dialog cq-dialog-narrow">
        <div class="cq-head">
          <span>导入备份 · 《${choice.env.title}》（${count} 篇课文）</span>
          <button class="cq-x" data-action="import-choice-close" aria-label="关闭">×</button>
        </div>
        <div class="cq-body">
          <div class="cq-toolbar">
            <button class="cq-primary" data-action="import-as-newbook">作为新课本导入</button>
            <span class="cq-dim">或把这些课文插入现有课本 ↓</span>
          </div>
          <div class="cq-list">
            ${state.books.map((book) => html`
              <button class="cq-row" data-action="import-into-book" data-book-id="${book.id}">
                <span class="cq-row-title">${book.title}</span>
                <span class="cq-dim">${book.texts.length} 课 · 插入这里</span>
              </button>
            `)}
          </div>
        </div>
      </div>
    </div>
  `;
}

// --- 导入排版：真实 DOM 测量 ---------------------------------------------------
//
// 把正文用真实的 lesson-page/main-zone 结构渲染到离屏节点，从大到小试字号，
// 取普通页能放下的**最大**档；0.7 仍放不下则判全文页。取代 storage.autoLayout
// 的"430px/90px"启发式估算——所见即所得，不依赖对 CSS 的手工建模。
// 拼音统一用较宽的占位（zhōng），结果偏保守（宁可字号小一档，不会溢出）。
// 任何异常返回 null，importPages 落回启发式。
const MEASURE_SCALES = [1.2, 1.1, 1.0, 0.9, 0.8, 0.7];

export function measureAutoLayout(text) {
  try {
    const body = String(text);
    const longText = [...body].length > 18 || body.includes("\n");
    const workspace = document.querySelector(".workspace");
    const width = Math.max(320, (workspace ? workspace.clientWidth : window.innerWidth - 164) - 48);

    const host = document.createElement("div");
    host.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;visibility:hidden;pointer-events:none`;
    host.innerHTML = html`
      <section class="lesson-page">
        <div class="lesson-grid" style="--main-scale:1">
          <section class="main-zone ${longText ? "is-long-text" : ""}">
            <div class="main-text">${[...body].map((char) => isHanzi(char)
              ? html`<span class="token"><span class="pinyin">zhōng</span><span class="hanzi-char">${char}</span></span>`
              : html`<span class="plain-char">${char}</span>`)}</div>
          </section>
          <section class="example-zone"></section>
          <section class="image-zone"></section>
        </div>
      </section>
    `.s;
    document.body.appendChild(host);
    try {
      const grid = host.querySelector(".lesson-grid");
      const zone = host.querySelector(".main-zone");
      for (const scale of MEASURE_SCALES) {
        grid.style.setProperty("--main-scale", String(scale));
        if (zone.scrollHeight <= zone.clientHeight + 1 && zone.scrollWidth <= zone.clientWidth + 1) {
          return { mainTextScale: scale, textOnly: false };
        }
      }
      return { mainTextScale: 0.7, textOnly: true };
    } finally {
      host.remove();
    }
  } catch {
    return null;
  }
}

// 收件箱提示：textbook-photos 技能写入 inbox.json 后，一键选择去处。
function renderInbox() {
  const inbox = state.ui.inbox;
  if (!inbox?.open) return "";
  const parsed = inbox.parsed;
  const title = (typeof parsed.title === "string" && parsed.title.trim()) || parsed.pages[0]?.title || "新课文";
  const deck = getActiveDeck();
  const book = getActiveBook();
  return html`
    <div class="cq-overlay">
      <div class="cq-dialog cq-dialog-narrow">
        <div class="cq-head">
          <span>收件箱 · 发现新课文</span>
          <button class="cq-x" data-action="inbox-close" aria-label="稍后再说">×</button>
        </div>
        <div class="cq-body">
          <div class="cq-toolbar">
            <span>《${title}》 · ${parsed.pages.length} 页<span class="cq-dim">（来自 textbook-photos 识别）</span></span>
          </div>
          <div class="cq-list">
            <button class="cq-row cq-primary" data-action="inbox-new-deck">
              <span class="cq-row-title">新建为课文，放进《${book.title}》</span>
            </button>
            <button class="cq-row" data-action="inbox-append">
              <span class="cq-row-title">把这些页追加到当前课文《${deck.title}》</span>
            </button>
            <button class="cq-row" data-action="inbox-close">
              <span class="cq-row-title">稍后再说<span class="cq-dim">（下次回到 yuwen 时再提醒）</span></span>
            </button>
            <button class="cq-row" data-action="inbox-dismiss">
              <span class="cq-row-title">忽略此文件<span class="cq-dim">（不再提示，除非有新内容）</span></span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPinyinMenu() {
  if (!state.ui.pinyinMenu) return "";
  const { page } = activeContext();
  const token = getToken(page, state.ui.pinyinMenu.tokenId);
  if (!token) return "";
  return html`
    <div class="pinyin-popover" style="left:${state.ui.pinyinMenu.x}px;top:${state.ui.pinyinMenu.y}px">
      ${token.pinyinCandidates.map((item) => html`
        <button class="pinyin-option" data-action="choose-pinyin" data-token-id="${token.id}" data-pinyin="${item}">${item}</button>
      `)}
    </div>
  `;
}
