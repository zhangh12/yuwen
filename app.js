const STORAGE_KEY = "yuwen.decks.v1";

const COLORS = [
  { key: "ink", label: "黑", value: "#211d1a" },
  { key: "red", label: "红", value: "#9b2f26" },
  { key: "blue", label: "蓝", value: "#0057d9" },
  { key: "green", label: "绿", value: "#00823b" },
  { key: "orange", label: "橙", value: "#d94b00" },
  { key: "purple", label: "紫", value: "#7a2bd6" }
];

const FALLBACK_PINYIN = {
  一: ["yī"], 二: ["èr"], 三: ["sān"], 四: ["sì"], 五: ["wǔ"], 六: ["liù"], 七: ["qī"], 八: ["bā"], 九: ["jiǔ"], 十: ["shí"],
  春: ["chūn"], 天: ["tiān"], 来: ["lái"], 了: ["le", "liǎo"], 花: ["huā"], 开: ["kāi"], 草: ["cǎo"], 地: ["dì", "de"], 人: ["rén"],
  日: ["rì"], 月: ["yuè"], 山: ["shān"], 水: ["shuǐ"], 火: ["huǒ"], 木: ["mù"], 口: ["kǒu"], 手: ["shǒu"], 目: ["mù"], 耳: ["ěr"],
  长: ["cháng", "zhǎng"], 乐: ["lè", "yuè"], 行: ["xíng", "háng"], 重: ["zhòng", "chóng"], 好: ["hǎo", "hào"], 只: ["zhī", "zhǐ"],
  少: ["shǎo", "shào"], 都: ["dōu", "dū"], 为: ["wéi", "wèi"], 着: ["zhe", "zháo", "zhuó"], 和: ["hé", "huò", "hú"],
  的: ["de", "dí", "dì"], 得: ["de", "děi"], 还: ["hái", "huán"], 觉: ["jué", "jiào"], 片: ["piān", "piàn"],
  语: ["yǔ"], 文: ["wén"], 学: ["xué"], 习: ["xí"], 字: ["zì"], 词: ["cí"], 句: ["jù"], 读: ["dú"], 书: ["shū"],
  远: ["yuǎn"], 看: ["kàn", "kān"], 有: ["yǒu", "yòu"], 色: ["sè"], 近: ["jìn"], 听: ["tīng"], 无: ["wú"], 声: ["shēng"],
  上: ["shàng"], 下: ["xià"], 左: ["zuǒ"], 右: ["yòu"], 大: ["dà"], 小: ["xiǎo"], 多: ["duō"], 白: ["bái"], 黑: ["hēi"], 红: ["hóng"],
  早: ["zǎo"], 晚: ["wǎn"], 前: ["qián"], 后: ["hòu"], 中: ["zhōng", "zhòng"], 里: ["lǐ"], 外: ["wài"], 东: ["dōng"], 西: ["xī"], 南: ["nán"], 北: ["běi"],
  我: ["wǒ"], 你: ["nǐ"], 他: ["tā"], 她: ["tā"], 它: ["tā"], 们: ["men"], 家: ["jiā"], 爸: ["bà"], 妈: ["mā"], 哥: ["gē"], 姐: ["jiě"], 弟: ["dì"], 妹: ["mèi"],
  子: ["zǐ"], 女: ["nǚ"], 男: ["nán"], 老: ["lǎo"], 师: ["shī"], 同: ["tóng"], 友: ["yǒu"], 爱: ["ài"], 说: ["shuō"], 话: ["huà"], 笑: ["xiào"], 哭: ["kū"],
  吃: ["chī"], 喝: ["hē"], 走: ["zǒu"], 跑: ["pǎo"], 坐: ["zuò"], 立: ["lì"], 飞: ["fēi"], 见: ["jiàn", "xiàn"], 问: ["wèn"], 答: ["dá"], 写: ["xiě"], 画: ["huà"],
  云: ["yún"], 雨: ["yǔ"], 雪: ["xuě"], 风: ["fēng"], 电: ["diàn"], 光: ["guāng"], 明: ["míng"], 星: ["xīng"], 空: ["kōng", "kòng"], 海: ["hǎi"], 河: ["hé"], 湖: ["hú"],
  田: ["tián"], 土: ["tǔ"], 石: ["shí"], 竹: ["zhú"], 林: ["lín"], 森: ["sēn"], 鸟: ["niǎo"], 鱼: ["yú"], 虫: ["chóng"], 牛: ["niú"], 羊: ["yáng"], 马: ["mǎ"],
  生: ["shēng"], 年: ["nián"], 时: ["shí"], 分: ["fēn", "fèn"], 今: ["jīn"], 昨: ["zuó"], 去: ["qù"], 回: ["huí"], 出: ["chū"], 入: ["rù"], 门: ["mén"],
  这: ["zhè"], 那: ["nà"], 个: ["gè"], 也: ["yě"], 不: ["bù"], 是: ["shì"], 在: ["zài"], 到: ["dào"], 可: ["kě"], 以: ["yǐ"], 要: ["yào", "yāo"], 会: ["huì", "kuài"],
  和: ["hé", "huò", "hú"], 就: ["jiù"], 又: ["yòu"], 从: ["cóng"], 把: ["bǎ", "bà"], 给: ["gěi", "jǐ"], 对: ["duì"], 过: ["guò"], 用: ["yòng"], 自: ["zì"], 己: ["jǐ"]
};

const state = {
  decks: [],
  activeDeckId: "",
  activePageId: "",
  ui: {
    chromeCollapsed: false,
    editingMain: false,
    activeTokenId: "",
    exampleIndex: 0,
    imageIndex: 0,
    menu: null,
    pinyinMenu: null,
    deckPickerOpen: false,
    deckContext: null,
    pageContext: null,
    draggedPageId: "",
    pendingExample: false,
    pendingImage: false,
    editingExampleId: "",
    editingCaptionId: "",
    annotationColor: "",
    annotating: false,
    annotationOriginalColors: {}
  }
};

const app = document.querySelector("#app");

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowLabel() {
  return new Date().toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function colorValue(key) {
  return COLORS.find((color) => color.key === key)?.value || COLORS[0].value;
}

function isHanzi(char) {
  return /[\u3400-\u9fff]/u.test(char);
}

function escapeHtml(value) {
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

function lookupZdict(char) {
  const candidates = [];
  const roots = [window.zDictChars, window.zdict, window.ZDICT, window.ZDict, window.zDict, window.zdictData].filter(Boolean);

  for (const root of roots) {
    const direct = root[char] || root.dict?.[char] || root.chars?.[char];
    const pinyin = direct?.pinyin || direct?.py || direct?.pronunciation || direct?.[0] || root.pinyin?.[char] || root.py?.[char];
    if (Array.isArray(pinyin)) candidates.push(...pinyin);
    if (typeof pinyin === "string") candidates.push(...pinyin.split(/[,\s/;]+/));
    if (!pinyin && direct && typeof direct === "object" && !Array.isArray(direct)) {
      candidates.push(...Object.keys(direct));
    }
  }

  return [...new Set(candidates.filter(Boolean).map(normalizePinyin))];
}

function normalizePinyin(value) {
  return String(value).trim();
}

function lookupPinyin(char) {
  const fromZdict = lookupZdict(char);
  const fallback = FALLBACK_PINYIN[char] || [];
  const candidates = [...new Set([...fromZdict, ...fallback].map(normalizePinyin).filter(Boolean))];
  return candidates.length ? candidates : [""];
}

function createToken(char, index, previous) {
  const candidates = lookupPinyin(char);
  const previousSame = previous.find((token) => token.text === char && token.index === index)
    || previous.find((token) => token.text === char && !token._used);
  if (previousSame) previousSame._used = true;

  return {
    id: previousSame?.id || id("tok"),
    text: char,
    index,
    pinyin: previousSame?.pinyin || candidates[0] || "",
    pinyinCandidates: candidates,
    pinyinSource: previousSame?.pinyinSource || "zdict",
    color: previousSame?.color || "",
    exampleIndex: previousSame?.exampleIndex || 0,
    imageIndex: previousSame?.imageIndex || 0,
    hiddenExamples: previousSame?.hiddenExamples || [],
    hiddenImages: previousSame?.hiddenImages || []
  };
}

function tokenizePage(page) {
  const previous = deepClone(page.tokens || []);
  const tokens = [];
  [...page.mainText].forEach((char, index) => {
    if (!isHanzi(char)) return;
    tokens.push(createToken(char, index, previous));
  });
  page.tokens = tokens;
}

function createPage(title = "新页面", text = "") {
  const page = {
    id: id("page"),
    title,
    mainText: text,
    mainTextScale: 1,
    styles: {
      mainTextColor: "ink",
      exampleTextColor: "ink",
      captionTextColor: "ink"
    },
    tokens: [],
    images: [],
    imageIndex: 0,
    textOnly: false
  };
  tokenizePage(page);
  return page;
}

function createDeck(title = "我的语文讲义") {
  const deck = {
    id: id("deck"),
    title,
    updatedAt: Date.now(),
    settings: {
      showPinyin: true,
      mainFont: "kai"
    },
    lexicon: {},
    pages: [
      createPage("第 1 页", "春天来了")
    ]
  };
  return deck;
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (stored?.decks?.length) {
      state.decks = stored.decks;
      state.activeDeckId = stored.activeDeckId || stored.decks[0].id;
      state.activePageId = stored.activePageId || getActiveDeck()?.pages?.[0]?.id || "";
      state.decks.forEach((deck) => {
        deck.pages.forEach(tokenizePage);
        ensureDeckModel(deck);
      });
      saveState();
      return;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  const deck = createDeck();
  state.decks = [deck];
  state.activeDeckId = deck.id;
  state.activePageId = deck.pages[0].id;
  saveState();
}

function saveState() {
  const payload = {
    decks: state.decks,
    activeDeckId: state.activeDeckId,
    activePageId: state.activePageId
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function touchDeck(deck = getActiveDeck()) {
  if (!deck) return;
  deck.updatedAt = Date.now();
  saveState();
}

function getActiveDeck() {
  return state.decks.find((deck) => deck.id === state.activeDeckId) || state.decks[0];
}

function getActivePage() {
  const deck = getActiveDeck();
  return deck?.pages.find((page) => page.id === state.activePageId) || deck?.pages[0];
}

function getToken(page, tokenId = state.ui.activeTokenId) {
  return page?.tokens.find((token) => token.id === tokenId);
}

function entryKey(token) {
  if (!token) return "";
  return `${token.text}|${normalizePinyin(token.pinyin || "")}`;
}

function ensureTokenState(token) {
  token.exampleIndex = token.exampleIndex || 0;
  token.imageIndex = token.imageIndex || 0;
  token.hiddenExamples ||= [];
  token.hiddenImages ||= [];
}

function ensureDeckModel(deck) {
  deck.lexicon ||= {};
  deck.pages.forEach((page) => {
    page.images ||= [];
    page.imageIndex ||= 0;
    page.textOnly ||= false;
    page.styles ||= {};
    page.styles.mainTextColor ||= "ink";
    page.styles.exampleTextColor = "ink";
    page.styles.captionTextColor = "ink";
    page.tokens.forEach(ensureTokenState);
    if (!page.entries) return;

    Object.entries(page.entries).forEach(([char, entry]) => {
      const token = page.tokens.find((item) => item.text === char);
      const pinyin = token?.pinyin || lookupPinyin(char)[0] || "";
      const key = `${char}|${normalizePinyin(pinyin)}`;
      deck.lexicon[key] ||= { examples: [], images: [] };
      mergeSharedItems(deck.lexicon[key].examples, entry.examples, "ex");
      mergeSharedItems(deck.lexicon[key].images, entry.images, "img");
    });
    delete page.entries;
  });
}

function mergeSharedItems(target, source = [], prefix) {
  source.forEach((item) => {
    const copy = deepClone(item);
    copy.id ||= id(prefix);
    if (!target.some((existing) => existing.id === copy.id)) {
      target.push(copy);
    }
  });
}

function getEntry(deck, token) {
  if (!token) return null;
  ensureTokenState(token);
  deck.lexicon ||= {};
  const key = entryKey(token);
  deck.lexicon[key] ||= { examples: [], images: [] };
  return deck.lexicon[key];
}

function visibleExamples(entry, token) {
  if (!entry || !token) return [];
  ensureTokenState(token);
  return entry.examples.filter((item) => !token.hiddenExamples.includes(item.id));
}

function visibleImages(entry, token) {
  if (!entry || !token) return [];
  ensureTokenState(token);
  return entry.images.filter((item) => !token.hiddenImages.includes(item.id));
}

function clampTokenIndex(token, field, length) {
  if (!token) return 0;
  ensureTokenState(token);
  if (!length) {
    token[field] = 0;
    return 0;
  }
  token[field] = Math.min(Math.max(token[field] || 0, 0), length - 1);
  return token[field];
}

function activeContext() {
  const deck = getActiveDeck();
  const page = getActivePage();
  const token = getToken(page);
  const entry = getEntry(deck, token);
  return { deck, page, token, entry };
}

function clampPageImageIndex(page, length) {
  page.images ||= [];
  page.imageIndex ||= 0;
  if (!length) {
    page.imageIndex = 0;
    return 0;
  }
  page.imageIndex = Math.min(Math.max(page.imageIndex || 0, 0), length - 1);
  return page.imageIndex;
}

function imageContext() {
  const { page, token, entry } = activeContext();
  if (token) {
    const images = visibleImages(entry, token);
    return {
      scope: "token",
      label: "汉字图片",
      token,
      entry,
      images,
      allImages: entry.images,
      index: clampTokenIndex(token, "imageIndex", images.length),
      canHide: true
    };
  }

  page.images ||= [];
  return {
    scope: "page",
    label: "页面配图",
    page,
    images: page.images,
    allImages: page.images,
    index: clampPageImageIndex(page, page.images.length),
    canHide: false
  };
}

function setImageContextIndex(context, index) {
  if (context.scope === "token" && context.token) {
    context.token.imageIndex = index;
  } else if (context.page) {
    context.page.imageIndex = index;
  }
}

function findImageById(imageId) {
  return imageContext().allImages.find((item) => item.id === imageId);
}

function render() {
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

  bindEvents();
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
      <div class="brand"><strong>语文</strong><span>yuwen</span></div>
      <div class="toolbar-group">
        <button data-action="toggle-deck-picker">讲义</button>
        <span class="active-deck-title" title="${escapeHtml(deck.title)}">${escapeHtml(deck.title)}</span>
      </div>
      <div class="toolbar-group">
        <label class="toggle"><input type="checkbox" data-action="toggle-pinyin" ${deck.settings.showPinyin ? "checked" : ""}> 拼音</label>
        <button data-action="scale-down">A-</button>
        <button data-action="scale-reset">A0</button>
        <button data-action="scale-up">A+</button>
        <button data-action="edit-main">${state.ui.editingMain ? "完成正文" : "编辑正文"}</button>
        <label class="toggle"><input type="checkbox" data-action="toggle-text-only" ${page.textOnly ? "checked" : ""}> 全文页</label>
        <button data-action="speak">朗读</button>
      </div>
      <div class="toolbar-spacer"></div>
      ${state.ui.annotating && state.ui.annotationColor ? `<span class="annotation-pill">Option/Alt 点击上色：${COLORS.find((color) => color.key === state.ui.annotationColor)?.label}</span>` : ""}
      <button data-action="toggle-chrome">最大化</button>
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
        <button title="新建讲义" data-action="new-deck">+</button>
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
  const { token, entry } = activeContext();
  if (!token) {
    return `
      <section class="example-zone">
        <div class="example-content"></div>
      </section>
    `;
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

function bindEvents() {
  app.querySelectorAll("[data-deck-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeDeckId = button.dataset.deckId;
      state.activePageId = getActiveDeck().pages[0]?.id || "";
      clearTransient();
      state.ui.deckPickerOpen = false;
      saveState();
      render();
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      state.ui.deckContext = { x: event.clientX, y: event.clientY, deckId: button.dataset.deckId };
      state.ui.pageContext = null;
      state.ui.menu = null;
      state.ui.pinyinMenu = null;
      render();
    });
  });

  app.querySelectorAll("[data-page-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activePageId = button.dataset.pageId;
      clearTransient();
      saveState();
      render();
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      state.ui.pageContext = { x: event.clientX, y: event.clientY, pageId: button.dataset.pageId };
      state.ui.deckContext = null;
      state.ui.menu = null;
      state.ui.pinyinMenu = null;
      render();
    });
    button.addEventListener("dragstart", (event) => {
      state.ui.draggedPageId = button.dataset.pageId;
      event.dataTransfer.setData("text/plain", button.dataset.pageId);
      event.dataTransfer.effectAllowed = "move";
    });
    button.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    button.addEventListener("drop", (event) => {
      event.preventDefault();
      const draggedPageId = event.dataTransfer.getData("text/plain") || state.ui.draggedPageId;
      reorderPage(draggedPageId, button.dataset.pageId);
    });
    button.addEventListener("dragend", () => {
      state.ui.draggedPageId = "";
    });
  });

  app.querySelectorAll(".page-list").forEach((list) => {
    list.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    list.addEventListener("drop", (event) => {
      if (event.target.closest("[data-page-id]")) return;
      event.preventDefault();
      const draggedPageId = event.dataTransfer.getData("text/plain") || state.ui.draggedPageId;
      movePageToEnd(draggedPageId);
    });
  });

  app.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", handleAction);
  });

  app.querySelectorAll(".context-menu").forEach((menu) => {
    menu.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
  });

  app.querySelectorAll("[data-token-id]").forEach((tokenElement) => {
    tokenElement.addEventListener("click", handleTokenClick);
    tokenElement.addEventListener("contextmenu", handleTokenContextMenu);
  });

  app.querySelectorAll("[data-pinyin-token-id]").forEach((pinyinElement) => {
    pinyinElement.addEventListener("click", handlePinyinClick);
  });

  app.querySelectorAll("[data-resize-image-id]").forEach((handle) => {
    handle.addEventListener("pointerdown", startImageResize);
  });

  app.querySelectorAll("[data-draft]").forEach((field) => {
    field.addEventListener("blur", commitDraft);
    field.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        field.blur();
      }
    });
  });

  const autofocusField = app.querySelector("[autofocus]");
  if (autofocusField) {
    requestAnimationFrame(() => {
      autofocusField.focus();
      if ("selectionStart" in autofocusField) {
        autofocusField.selectionStart = autofocusField.value.length;
        autofocusField.selectionEnd = autofocusField.value.length;
      }
    });
  }

  app.querySelectorAll("[data-blank]").forEach((zone) => {
    zone.addEventListener("click", (event) => {
      if (event.target.closest(".token") || event.target.closest("textarea")) return;
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
    });
  });

  app.querySelectorAll(".workspace").forEach((workspace) => {
    workspace.addEventListener("click", (event) => {
      if (event.target !== workspace) return;
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
    });
  });
}

function handleAction(event) {
  const action = event.currentTarget.dataset.action;
  const page = getActivePage();
  const deck = getActiveDeck();
  event.stopPropagation();

  if (action === "new-deck") return newDeck();
  if (action === "rename-deck") return renameDeck(state.ui.deckContext?.deckId);
  if (action === "copy-deck") return copyDeck(state.ui.deckContext?.deckId);
  if (action === "delete-deck") return deleteDeck(state.ui.deckContext?.deckId);
  if (action === "new-page") return newPage();
  if (action === "copy-page") return copyPage(event.currentTarget.dataset.pageId || state.ui.pageContext?.pageId);
  if (action === "delete-page") return deletePage(event.currentTarget.dataset.pageId || state.ui.pageContext?.pageId);

  if (action === "toggle-deck-picker") {
    state.ui.deckPickerOpen = !state.ui.deckPickerOpen;
    state.ui.deckContext = null;
    state.ui.pageContext = null;
    state.ui.menu = null;
    state.ui.pinyinMenu = null;
    return render();
  }

  if (action === "toggle-pinyin") {
    deck.settings.showPinyin = event.currentTarget.checked;
    touchDeck(deck);
    return render();
  }

  if (action === "toggle-text-only") {
    page.textOnly = event.currentTarget.checked;
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

  if (action === "token-color") {
    applyTokenColor(event.currentTarget.dataset.color);
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
    state.ui.editingCaptionId = event.currentTarget.dataset.imageId || "";
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
    const token = getToken(page, event.currentTarget.dataset.tokenId);
    if (token) {
      token.pinyin = event.currentTarget.dataset.pinyin;
      token.pinyinSource = "user";
      token.exampleIndex = 0;
      token.imageIndex = 0;
      token.hiddenExamples = [];
      token.hiddenImages = [];
      state.ui.pinyinMenu = null;
      touchDeck();
      render();
    }
  }
}

function handleTokenClick(event) {
  if (getActivePage().textOnly) return;
  const tokenId = event.currentTarget.dataset.tokenId;

  if (event.altKey && state.ui.annotating && state.ui.annotationColor) {
    const token = getToken(getActivePage(), tokenId);
    if (token) {
      toggleAnnotationColor(token);
      touchDeck();
      render();
    }
    return;
  }

  state.ui.activeTokenId = tokenId;
  state.ui.exampleIndex = 0;
  state.ui.imageIndex = 0;
  state.ui.pendingExample = false;
  state.ui.pendingImage = false;
  state.ui.editingExampleId = "";
  state.ui.editingCaptionId = "";
  closeFloaters();
  render();
}

function handleTokenContextMenu(event) {
  event.preventDefault();
  const tokenId = event.currentTarget.dataset.tokenId;
  state.ui.activeTokenId = tokenId;
  state.ui.menu = { x: event.clientX, y: event.clientY, tokenId };
  state.ui.pinyinMenu = null;
  state.ui.pendingExample = false;
  state.ui.pendingImage = false;
  render();
}

function handlePinyinClick(event) {
  if (getActivePage().textOnly) return;
  event.preventDefault();
  event.stopPropagation();
  const page = getActivePage();
  const token = getToken(page, event.currentTarget.dataset.pinyinTokenId);
  if (!token || token.pinyinCandidates.length < 2) return;

  const rect = event.currentTarget.getBoundingClientRect();
  state.ui.activeTokenId = token.id;
  state.ui.pinyinMenu = {
    tokenId: token.id,
    x: rect.left,
    y: rect.bottom + 6
  };
  state.ui.menu = null;
  render();
}

function commitDraft(event) {
  const field = event.currentTarget;
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

function startImageResize(event) {
  event.preventDefault();
  event.stopPropagation();

  const handle = event.currentTarget;
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

function cycleIndex(value, length) {
  if (!length) return 0;
  return (value + length) % length;
}

function closeFloaters() {
  state.ui.menu = null;
  state.ui.pinyinMenu = null;
  state.ui.deckContext = null;
  state.ui.pageContext = null;
}

function clearTransient() {
  state.ui.activeTokenId = "";
  state.ui.exampleIndex = 0;
  state.ui.imageIndex = 0;
  state.ui.menu = null;
  state.ui.pinyinMenu = null;
  state.ui.deckContext = null;
  state.ui.pageContext = null;
  state.ui.pendingExample = false;
  state.ui.pendingImage = false;
  state.ui.editingExampleId = "";
  state.ui.editingCaptionId = "";
  state.ui.editingMain = false;
  state.ui.annotating = false;
  state.ui.annotationOriginalColors = {};
}

function newDeck() {
  const name = window.prompt("讲义名称", "新的语文讲义");
  if (!name) return;
  const deck = createDeck(name);
  state.decks.unshift(deck);
  state.activeDeckId = deck.id;
  state.activePageId = deck.pages[0].id;
  clearTransient();
  state.ui.deckPickerOpen = false;
  saveState();
  render();
}

function renameDeck(deckId = state.activeDeckId) {
  const deck = state.decks.find((item) => item.id === deckId);
  if (!deck) return;
  const name = window.prompt("讲义名称", deck.title);
  if (!name) return;
  deck.title = name;
  state.ui.deckContext = null;
  touchDeck(deck);
  render();
}

function copyDeck(deckId = state.activeDeckId) {
  const source = state.decks.find((item) => item.id === deckId) || getActiveDeck();
  const deck = deepClone(source);
  deck.id = id("deck");
  deck.title = `${source.title} 副本`;
  deck.updatedAt = Date.now();
  deck.pages.forEach((page) => {
    page.id = id("page");
    page.tokens.forEach((token) => token.id = id("tok"));
  });
  state.decks.unshift(deck);
  state.activeDeckId = deck.id;
  state.activePageId = deck.pages[0].id;
  state.ui.deckContext = null;
  state.ui.pageContext = null;
  state.ui.menu = null;
  state.ui.deckPickerOpen = false;
  saveState();
  render();
}

function deleteDeck(deckId = state.activeDeckId) {
  if (state.decks.length <= 1) return;
  const deck = state.decks.find((item) => item.id === deckId);
  if (!deck) return;
  if (!window.confirm(`删除讲义“${deck.title}”？`)) return;
  state.decks = state.decks.filter((item) => item.id !== deck.id);
  if (state.activeDeckId === deck.id) {
    state.activeDeckId = state.decks[0].id;
    state.activePageId = state.decks[0].pages[0].id;
  }
  clearTransient();
  state.ui.deckContext = null;
  state.ui.pageContext = null;
  state.ui.menu = null;
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

function movePageSelection(step) {
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

function speakText(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.82;
  window.speechSynthesis.speak(utterance);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
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
});

document.addEventListener("click", (event) => {
  const clickedOverlay = event.target.closest(".context-menu") || event.target.closest(".pinyin-popover") || event.target.closest(".deck-popover");
  const clickedTrigger = event.target.closest(".token") || event.target.closest('[data-action="toggle-deck-picker"]');
  if (!clickedOverlay && !clickedTrigger) {
    if (state.ui.menu || state.ui.pinyinMenu || state.ui.deckContext || state.ui.pageContext || state.ui.deckPickerOpen) {
      closeFloaters();
      state.ui.deckPickerOpen = false;
      render();
    }
  }
});

loadState();
render();
