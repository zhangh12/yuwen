// View layer: builds the markup for the current state and writes it into #app.
// Rendering stays a pure innerHTML pass; event wiring lives in events.js and is
// attached once via delegation, so render() never re-binds listeners.

import {
  COLORS,
  state,
  colorValue,
  nowLabel,
  getActiveDeck,
  getActivePage,
  getToken,
  activeContext,
  visibleExamples,
  clampTokenIndex,
  imageContext,
  lookupZdictMeanings
} from "./core.js";

export const app = document.querySelector("#app");

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderHighlightedText(value, highlightChar) {
  return [...String(value || "")].map((char) => {
    const escaped = escapeHtml(char);
    if (highlightChar && char === highlightChar) {
      return `<span class="inline-highlight">${escaped}</span>`;
    }
    return escaped;
  }).join("");
}

export function render() {
  const deck = getActiveDeck();
  const page = getActivePage();
  if (!deck || !page) return;

  const longText = [...page.mainText].length > 18 || page.mainText.includes("\n");

  app.innerHTML = `
    <div class="app-shell ${state.ui.chromeCollapsed ? "is-collapsed" : ""}" style="--annotation-color:${colorValue(state.ui.annotationColor || "red")}">
      ${state.ui.chromeCollapsed ? renderCollapsed(page) : renderFullShell(deck, page, { longText })}
      ${renderDeckPicker()}
      ${renderContextMenu()}
      ${renderDeckContextMenu()}
      ${renderPageContextMenu()}
      ${renderPinyinMenu()}
    </div>
  `;

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
  return `
    <button class="floating-restore" data-action="toggle-chrome">显示控制栏</button>
    <main class="stage">
      <div class="workspace">${renderLesson(page, { longText })}</div>
    </main>
  `;
}

function renderFullShell(deck, page, flags) {
  return `
    <header class="topbar">
      <div class="brand"><strong>语文</strong><span>yǔwén</span></div>
      <div class="toolbar-group">
        <button data-action="toggle-deck-picker">讲义</button>
        <span class="active-deck-title" title="${escapeHtml(deck.title)}">${escapeHtml(deck.title)}</span>
      </div>
      <div class="toolbar-group">
        <label class="toggle"><input type="checkbox" data-action="toggle-pinyin" ${deck.settings.showPinyin ? "checked" : ""}> 拼音</label>
        <label class="toggle"><input type="checkbox" data-action="toggle-zdict-examples" ${deck.settings.showZdictExamples ? "checked" : ""}> 字库例句</label>
        <button data-action="scale-down">A-</button>
        <button data-action="scale-reset">A0</button>
        <button data-action="scale-up">A+</button>
        <label class="toggle"><input type="checkbox" data-action="toggle-text-only" ${page.textOnly ? "checked" : ""}> 全文页</label>
        <button data-action="speak" disabled title="朗读暂不可用">朗读</button>
        <button data-action="toggle-chrome">最大化</button>
      </div>
      <div class="toolbar-spacer"></div>
      ${state.ui.annotating && state.ui.annotationColor ? `<span class="annotation-pill">Option/Alt 点击上色：${COLORS.find((color) => color.key === state.ui.annotationColor)?.label}</span>` : ""}
    </header>
    <aside class="pages-panel">
      <div class="panel-head">
        <h2>页面</h2>
        <div class="compact-actions">
          <button title="添加页面" data-action="new-page">+</button>
        </div>
      </div>
      <div class="page-list">
        ${deck.pages.map((item, index) => renderPageItem(item, index)).join("")}
      </div>
    </aside>
    <main class="stage">
      <div class="workspace">${renderLesson(page, flags)}</div>
    </main>
  `;
}

function renderDeckItem(deck) {
  return `
    <button class="deck-item ${deck.id === state.activeDeckId ? "is-active" : ""}" data-deck-id="${deck.id}">
      <span class="deck-title">${escapeHtml(deck.title)}</span>
      <span class="deck-meta">${deck.pages.length} 页 · ${nowLabel(deck.updatedAt)}</span>
    </button>
  `;
}

function renderPageItem(page, index) {
  return `
    <div class="page-item ${page.id === state.activePageId ? "is-active" : ""}" data-page-id="${page.id}" role="button" tabindex="0" draggable="true">
      <span class="page-number">${index + 1}</span>
      <span class="page-preview">${escapeHtml(page.mainText || "空白页面")}</span>
    </div>
  `;
}

function renderDeckPicker() {
  if (!state.ui.deckPickerOpen || state.ui.chromeCollapsed) return "";
  return `
    <div class="deck-popover">
      <div class="deck-popover-head">
        <span>讲义</span>
        <span class="deck-popover-actions">
          <button title="从 JSON 文件导入讲义" data-action="import-deck">导入</button>
          <button title="新建讲义" data-action="new-deck">新增</button>
        </span>
      </div>
      <div class="deck-list">
        ${state.decks.map(renderDeckItem).join("")}
      </div>
    </div>
  `;
}

function renderLesson(page, { longText }) {
  if (page.textOnly) {
    return `
      <section class="lesson-page text-only-page">
        <div class="lesson-grid text-only-grid" style="--main-color:${colorValue(page.styles.mainTextColor)};--main-scale:${page.mainTextScale}">
          ${renderMainZone(page, true)}
        </div>
      </section>
    `;
  }

  return `
    <section class="lesson-page">
      <div class="lesson-grid" style="--main-color:${colorValue(page.styles.mainTextColor)};--example-color:${colorValue("ink")};--caption-color:${colorValue("ink")};--main-scale:${page.mainTextScale}">
        ${renderMainZone(page, longText)}
        ${renderExampleZone(page)}
        ${renderImageZone(page)}
      </div>
    </section>
  `;
}

function renderMainZone(page, longText) {
  if (state.ui.editingMain) {
    return `
      <section class="main-zone" data-blank="main">
        <textarea class="main-editor" data-draft="main-text" autofocus>${escapeHtml(page.mainText)}</textarea>
      </section>
    `;
  }

  return `
    <section class="main-zone ${longText ? "is-long-text" : ""}" data-blank="main">
      <div class="main-text">${renderMainText(page)}</div>
    </section>
  `;
}

function renderMainText(page) {
  if (!page.mainText.trim()) {
    return `<span class="zone-empty-hint">点击“编辑正文”输入文字</span>`;
  }

  const tokensByIndex = new Map(page.tokens.map((token) => [token.index, token]));
  return [...page.mainText].map((char, index) => {
    const token = tokensByIndex.get(index);
    if (!token) return `<span class="plain-char">${escapeHtml(char)}</span>`;
    const pinyinVisible = getActiveDeck().settings.showPinyin;
    const color = token.color ? `--token-color:${colorValue(token.color)}` : "";
    const active = token.id === state.ui.activeTokenId ? "is-active" : "";
    const optionReady = state.ui.annotating && state.ui.annotationColor ? "option-ready" : "";
    return `
      <span class="token ${active} ${optionReady}" data-token-id="${token.id}" style="${color}">
        ${pinyinVisible ? `<span class="pinyin ${token.pinyinCandidates.length > 1 ? "is-polyphonic" : ""}" data-pinyin-token-id="${token.id}" title="${token.pinyinCandidates.length > 1 ? "点击切换读音" : ""}">${escapeHtml(token.pinyin)}</span>` : ""}
        <span class="hanzi-char">${escapeHtml(char)}</span>
      </span>
    `;
  }).join("");
}

function renderExampleZone(page) {
  const { deck, token, entry } = activeContext();
  if (!token) {
    return `
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
      return `
        <section class="example-zone">
          <div class="zone-controls">
            <button data-action="add-example">+</button>
            ${meanings.length > 1 ? `
              <button data-action="prev-zdict">‹</button>
              <button data-action="next-zdict">›</button>
            ` : ""}
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

  return `
    <section class="example-zone">
      <div class="zone-controls">
        <button data-action="add-example">+</button>
        ${examples.length ? `
          <button data-action="prev-example" ${examples.length < 2 ? "disabled" : ""}>‹</button>
          <button data-action="next-example" ${examples.length < 2 ? "disabled" : ""}>›</button>
          <button data-action="hide-example" title="只在当前位置隐藏">藏</button>
          <button data-action="delete-example" title="从本讲义共享素材中删除">删</button>
        ` : ""}
      </div>
      <div class="example-content">
        ${editingExample ? `<textarea data-draft="example" data-example-id="${current.id || ""}" autofocus>${escapeHtml(current.text || "")}</textarea>` : ""}
        ${!editingExample && current.text ? `<button class="text-display example-display" data-action="edit-example">${renderHighlightedText(current.text, token.text)}</button>` : ""}
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
    return `
      <section class="image-zone">
        <div class="zone-controls">
          <button data-action="add-image" title="添加${context.label}">+</button>
        </div>
        <div class="image-empty"></div>
      </section>
    `;
  }

  return `
    <section class="image-zone">
      <div class="zone-controls">
        <button data-action="prev-image" ${images.length < 2 ? "disabled" : ""}>‹</button>
        <button data-action="next-image" ${images.length < 2 ? "disabled" : ""}>›</button>
        <button data-action="add-image">+</button>
        ${context.canHide ? `<button data-action="hide-image" title="只在当前位置隐藏">藏</button>` : ""}
        <button data-action="delete-image" title="${context.scope === "token" ? "从本讲义共享素材中删除" : "删除当前页面配图"}">删</button>
      </div>
      <div class="image-frame">
        <div class="image-box" data-image-box-id="${current.id}" style="width:${current.widthPercent || 86}%">
          <img src="${escapeHtml(current.src)}" alt="${escapeHtml(current.caption || "讲义图片")}" draggable="false">
          <button class="image-resize-handle" data-resize-image-id="${current.id}" title="拖拽调整图片大小" aria-label="拖拽调整图片大小"></button>
        </div>
      </div>
      <div class="caption">
        ${editingCaption ? `<textarea data-draft="caption" data-image-id="${current.id}" autofocus>${escapeHtml(current.caption || "")}</textarea>` : ""}
        ${!editingCaption ? `<button class="text-display caption-display" data-action="edit-caption" data-image-id="${current.id}" aria-label="编辑图片说明">${renderHighlightedText(current.caption, token?.text)}</button>` : ""}
      </div>
    </section>
  `;
}

function renderContextMenu() {
  if (!state.ui.menu) return "";
  const { token } = activeContext();
  const isTextOnly = getActivePage().textOnly;
  const hasHidden = Boolean(token && ((token.hiddenExamples?.length || 0) + (token.hiddenImages?.length || 0)));
  return `
    <div class="context-menu" style="left:${state.ui.menu.x}px;top:${state.ui.menu.y}px">
      <div class="swatches">
        ${COLORS.map((color) => `
          <button class="swatch" title="${color.label}" data-action="token-color" data-color="${color.key}" style="background:${color.value}"></button>
        `).join("")}
      </div>
      <button class="menu-item" data-action="speak-token">朗读</button>
      ${!isTextOnly ? `<button class="menu-item" data-action="add-example">添加例词/例句</button>` : ""}
      ${!isTextOnly ? `<button class="menu-item" data-action="add-image">添加图片</button>` : ""}
      ${!isTextOnly && hasHidden ? `<button class="menu-item" data-action="restore-hidden">恢复隐藏内容</button>` : ""}
      <button class="menu-item" data-action="clear-token-color">清除该字颜色</button>
    </div>
  `;
}

function renderDeckContextMenu() {
  if (!state.ui.deckContext) return "";
  return `
    <div class="context-menu" style="left:${state.ui.deckContext.x}px;top:${state.ui.deckContext.y}px">
      <button class="menu-item" data-action="rename-deck">重命名</button>
      <button class="menu-item" data-action="copy-deck">复制</button>
      <button class="menu-item" data-action="export-deck">导出</button>
      <button class="menu-item" data-action="delete-deck">删除</button>
    </div>
  `;
}

function renderPageContextMenu() {
  if (!state.ui.pageContext) return "";
  return `
    <div class="context-menu" style="left:${state.ui.pageContext.x}px;top:${state.ui.pageContext.y}px">
      <button class="menu-item" data-action="copy-page" data-page-id="${state.ui.pageContext.pageId}">复制页面</button>
      <button class="menu-item" data-action="delete-page" data-page-id="${state.ui.pageContext.pageId}">删除页面</button>
    </div>
  `;
}

function renderPinyinMenu() {
  if (!state.ui.pinyinMenu) return "";
  const { page } = activeContext();
  const token = getToken(page, state.ui.pinyinMenu.tokenId);
  if (!token) return "";
  return `
    <div class="pinyin-popover" style="left:${state.ui.pinyinMenu.x}px;top:${state.ui.pinyinMenu.y}px">
      ${token.pinyinCandidates.map((item) => `
        <button class="pinyin-option" data-action="choose-pinyin" data-token-id="${token.id}" data-pinyin="${escapeHtml(item)}">${escapeHtml(item)}</button>
      `).join("")}
    </div>
  `;
}
