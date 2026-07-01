// Data layer: constants, pinyin lookup, state, model and context helpers.
// No DOM access lives here so this module is easy to reason about and test.

export const STORAGE_KEY = "yuwen.decks.v1";

export const COLORS = [
  { key: "ink", label: "黑", value: "#211d1a" },
  { key: "red", label: "红", value: "#9b2f26" },
  { key: "blue", label: "蓝", value: "#0057d9" },
  { key: "green", label: "绿", value: "#00823b" },
  { key: "orange", label: "橙", value: "#d94b00" },
  { key: "purple", label: "紫", value: "#7a2bd6" }
];

export const FALLBACK_PINYIN = {
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
  就: ["jiù"], 又: ["yòu"], 从: ["cóng"], 把: ["bǎ", "bà"], 给: ["gěi", "jǐ"], 对: ["duì"], 过: ["guò"], 用: ["yòng"], 自: ["zì"], 己: ["jǐ"]
};

export const state = {
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
    selectedPageIds: [],
    pageAnchorId: "",
    pendingExample: false,
    pendingImage: false,
    editingExampleId: "",
    editingCaptionId: "",
    annotationColor: "",
    annotating: false,
    annotationOriginalColors: {},
    zdictIndex: 0,
    query: null
  }
};

export function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function nowLabel() {
  return new Date().toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function colorValue(key) {
  return COLORS.find((color) => color.key === key)?.value || COLORS[0].value;
}

export function isHanzi(char) {
  return /[㐀-鿿]/u.test(char);
}

export function cycleIndex(value, length) {
  if (!length) return 0;
  return (value + length) % length;
}

export function lookupZdict(char) {
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

export function normalizePinyin(value) {
  return String(value).trim();
}

// Radical (部首) for a character from the bundled make-me-a-hanzi data.
export function lookupRadical(char) {
  return (window.zRadicals && window.zRadicals[char]) || "";
}

// Built-in dictionary meanings for a character at a given reading, used as a
// fallback "example" when the user has not entered their own. Returns [] when
// the character (or reading) is not in the bundled zdict data.
export function lookupZdictMeanings(char, pinyin) {
  if (!char) return [];
  const roots = [window.zDictChars, window.zdict, window.ZDICT, window.ZDict, window.zDict, window.zdictData].filter(Boolean);
  const wanted = normalizePinyin(pinyin || "");
  for (const root of roots) {
    const direct = root[char] || root.dict?.[char] || root.chars?.[char];
    if (!direct || typeof direct !== "object") continue;
    let meanings = Array.isArray(direct[wanted]) ? direct[wanted] : null;
    if (!meanings) {
      const key = Object.keys(direct).find((k) => normalizePinyin(k) === wanted);
      if (key && Array.isArray(direct[key])) meanings = direct[key];
    }
    if (!meanings) meanings = Object.values(direct).find((value) => Array.isArray(value));
    if (Array.isArray(meanings) && meanings.length) return meanings.map(String);
  }
  return [];
}

export function lookupPinyin(char) {
  const fromZdict = lookupZdict(char);
  const fallback = FALLBACK_PINYIN[char] || [];
  const candidates = [...new Set([...fromZdict, ...fallback].map(normalizePinyin).filter(Boolean))];
  return candidates.length ? candidates : [""];
}

export function createToken(char, index, previous) {
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

export function tokenizePage(page) {
  const previous = deepClone(page.tokens || []);
  const tokens = [];
  [...page.mainText].forEach((char, index) => {
    if (!isHanzi(char)) return;
    tokens.push(createToken(char, index, previous));
  });
  page.tokens = tokens;
}

export function createPage(title = "新页面", text = "") {
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

export function createDeck(title = "我的语文讲义") {
  const deck = {
    id: id("deck"),
    title,
    updatedAt: Date.now(),
    settings: {
      showPinyin: true,
      showZdictExamples: false,
      mainFont: "kai"
    },
    lexicon: {},
    pages: [
      createPage("第 1 页", "春天来了")
    ]
  };
  return deck;
}

export function getActiveDeck() {
  return state.decks.find((deck) => deck.id === state.activeDeckId) || state.decks[0];
}

export function getActivePage() {
  const deck = getActiveDeck();
  return deck?.pages.find((page) => page.id === state.activePageId) || deck?.pages[0];
}

export function getToken(page, tokenId = state.ui.activeTokenId) {
  return page?.tokens.find((token) => token.id === tokenId);
}

export function entryKey(token) {
  if (!token) return "";
  return `${token.text}|${normalizePinyin(token.pinyin || "")}`;
}

export function ensureTokenState(token) {
  token.exampleIndex = token.exampleIndex || 0;
  token.imageIndex = token.imageIndex || 0;
  token.hiddenExamples ||= [];
  token.hiddenImages ||= [];
}

export function ensureDeckModel(deck) {
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

export function mergeSharedItems(target, source = [], prefix) {
  source.forEach((item) => {
    const copy = deepClone(item);
    copy.id ||= id(prefix);
    if (!target.some((existing) => existing.id === copy.id)) {
      target.push(copy);
    }
  });
}

export function getEntry(deck, token) {
  if (!token) return null;
  ensureTokenState(token);
  deck.lexicon ||= {};
  const key = entryKey(token);
  deck.lexicon[key] ||= { examples: [], images: [] };
  return deck.lexicon[key];
}

export function visibleExamples(entry, token) {
  if (!entry || !token) return [];
  ensureTokenState(token);
  return entry.examples.filter((item) => !token.hiddenExamples.includes(item.id));
}

export function visibleImages(entry, token) {
  if (!entry || !token) return [];
  ensureTokenState(token);
  return entry.images.filter((item) => !token.hiddenImages.includes(item.id));
}

export function clampTokenIndex(token, field, length) {
  if (!token) return 0;
  ensureTokenState(token);
  if (!length) {
    token[field] = 0;
    return 0;
  }
  token[field] = Math.min(Math.max(token[field] || 0, 0), length - 1);
  return token[field];
}

export function activeContext() {
  const deck = getActiveDeck();
  const page = getActivePage();
  const token = getToken(page);
  const entry = getEntry(deck, token);
  return { deck, page, token, entry };
}

export function clampPageImageIndex(page, length) {
  page.images ||= [];
  page.imageIndex ||= 0;
  if (!length) {
    page.imageIndex = 0;
    return 0;
  }
  page.imageIndex = Math.min(Math.max(page.imageIndex || 0, 0), length - 1);
  return page.imageIndex;
}

export function imageContext() {
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

export function setImageContextIndex(context, index) {
  if (context.scope === "token" && context.token) {
    context.token.imageIndex = index;
  } else if (context.page) {
    context.page.imageIndex = index;
  }
}

export function findImageById(imageId) {
  return imageContext().allImages.find((item) => item.id === imageId);
}

export function closeFloaters() {
  state.ui.menu = null;
  state.ui.pinyinMenu = null;
  state.ui.deckContext = null;
  state.ui.pageContext = null;
}

export function clearTransient() {
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
  state.ui.selectedPageIds = [];
  state.ui.pageAnchorId = "";
}
