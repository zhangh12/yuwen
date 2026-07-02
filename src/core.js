// Data layer: constants, pinyin lookup, state, model and context helpers.
// No DOM access lives here so this module is easy to reason about and test.

export const STORAGE_KEY = "yuwen.decks.v1";

// 显示在顶栏 brand 里的版本号，让用户一眼确认打开的是不是最新版。
// 每次有用户可感知的改动就手动递增。
export const APP_VERSION = "0.5.1";

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

// Two-level model: state.books[] each own an ordered texts[] (课文 = a "deck")
// and a book-level lexicon shared by "字|拼音" across that book's texts. Only one
// 课文 is ever open for editing at a time (activeBookId + activeDeckId), so the
// whole editing/render surface still works against a single active deck.
export const state = {
  books: [],
  activeBookId: "",
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
    expandedBookIds: [],
    bookContext: null,
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
    query: null,
    backup: null,
    importChoice: null,
    inbox: null
  }
};

export function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function nowLabel(ts = Date.now()) {
  return new Date(ts).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

// 本地日期戳（YYYY-MM-DD），用于导出文件名。不用 toISOString()：那是 UTC，
// 在美洲时区的晚上会得到"明天"的日期。
export function dateStamp(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function colorValue(key) {
  return COLORS.find((color) => color.key === key)?.value || COLORS[0].value;
}

export function isHanzi(char) {
  // Unified_Ideograph 覆盖基本区与扩展 A–H 的全部统一汉字（含代理对表示的
  // 生僻字），且不含 々〆 等非汉字表意符号；旧的 [㐀-鿿] 区间漏掉扩展 B 之后。
  return /\p{Unified_Ideograph}/u.test(char);
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
  // 候选顺序决定默认读音（无词组可匹配时取第一个）。FALLBACK_PINYIN 是手工
  // 整理、常用读音在前的表（了→le、都→dōu…），它的顺序优先；zdict 的顺序
  // 不可靠（常把书面/少用读音排在前面），只用来补充候选。
  const candidates = [...new Set([...fallback, ...fromZdict].map(normalizePinyin).filter(Boolean))];
  return candidates.length ? candidates : [""];
}

export function createToken(char, index, previousSame) {
  const candidates = lookupPinyin(char);
  // 只有用户手选的读音才随 token 延续；其余读音每次重分词都重新推导
  // （默认读音 + 词组匹配），这样编辑改变了前后邻字时词组判定能跟着更新。
  const userChosen = previousSame?.pinyinSource === "user";
  return {
    id: previousSame?.id || id("tok"),
    text: char,
    index,
    pinyin: (userChosen && previousSame.pinyin) || candidates[0] || "",
    pinyinCandidates: candidates,
    pinyinSource: userChosen ? "user" : "zdict",
    color: previousSame?.color || "",
    exampleIndex: previousSame?.exampleIndex || 0,
    imageIndex: previousSame?.imageIndex || 0,
    hiddenExamples: previousSame?.hiddenExamples || [],
    hiddenImages: previousSame?.hiddenImages || []
  };
}

// 多音字按词定音：对每个非用户手选的多音字，先看「前一个字+它」、再看
// 「它+后一个字」是否构成词典（vendor/data-phrases.js，二字词）里的词；
// 命中且该位置读音在候选之内，就采用词典读音。
// 前词优先充当"认领者"：如「为了解决」，「为了」先认领「了」读 le，
// 「了解」就不会再把它抢成 liǎo。
export function applyPhrasePinyin(page) {
  const dict = (typeof window !== "undefined" && window.zPhrasePinyin) || null;
  if (!dict) return;
  const tokens = page.tokens;
  const span = (token) => [...token.text].length;
  const adjacent = (a, b) => a && b && a.index + span(a) === b.index;

  for (let k = 0; k < tokens.length; k++) {
    const token = tokens[k];
    if (token.pinyinSource === "user" || token.pinyinCandidates.length < 2) continue;
    const prev = adjacent(tokens[k - 1], token) ? tokens[k - 1] : null;
    const next = adjacent(token, tokens[k + 1]) ? tokens[k + 1] : null;

    // 返回 true 表示该词"认领"了这个字（即使读音与默认一致，也不再试另一侧）。
    const claim = (a, b, position) => {
      const pinyin = dict[a.text + b.text];
      if (!pinyin) return false;
      const reading = pinyin.split(" ")[position];
      if (reading && token.pinyinCandidates.includes(reading)) {
        token.pinyin = reading;
        token.pinyinSource = "phrase";
      }
      return true;
    };

    if (prev && claim(prev, token, 1)) continue;
    if (next) claim(token, next, 0);
  }
}

// 用 LCS 把旧 token 序列与新汉字序列做保序对齐。编辑正文（插入/删除/改动）后，
// 挂在字上的用户数据（所选读音、颜色、停留索引、隐藏名单）跟着"同一个字"走。
// 旧实现是"同字贪心 + 精确下标优先"：在重复字前面插入字符时，精确下标会把
// 后一个字的标注抢给前一个字，导致颜色/读音串位；LCS 保持相对顺序，天然避免。
// 返回 Map<新下标, 旧 token>。
function alignPreviousTokens(previous, chars) {
  const n = previous.length;
  const m = chars.length;
  if (!n || !m) return new Map();
  // 极长文本（罕见）退回逐位对齐，避免 O(n·m) 表过大。
  if (n * m > 1_000_000) {
    const byIndex = new Map(previous.map((token) => [token.index, token]));
    return new Map(chars
      .filter(({ char, index }) => byIndex.get(index)?.text === char)
      .map(({ index }) => [index, byIndex.get(index)]));
  }
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = previous[i].text === chars[j].char
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matched = new Map();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (previous[i].text === chars[j].char && dp[i][j] === dp[i + 1][j + 1] + 1) {
      matched.set(chars[j].index, previous[i]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return matched;
}

export function tokenizePage(page) {
  const previous = page.tokens || [];
  const chars = [];
  [...page.mainText].forEach((char, index) => {
    if (!isHanzi(char)) return;
    chars.push({ char, index });
  });
  const matched = alignPreviousTokens(previous, chars);
  page.tokens = chars.map(({ char, index }) => createToken(char, index, matched.get(index)));
  applyPhrasePinyin(page);
}

export function createPage(title = "新页面", text = "") {
  const page = {
    id: id("page"),
    title,
    mainText: text,
    mainTextScale: 1,
    styles: {
      mainTextColor: "ink"
    },
    tokens: [],
    images: [],
    imageIndex: 0,
    textOnly: false
  };
  tokenizePage(page);
  return page;
}

// A 课文 (internally still called a "deck"): pages + per-课文 settings. The
// shared example/image lexicon now lives on the owning book, not here.
export function createDeck(title = "课文 1", text = "春天来了") {
  return {
    id: id("deck"),
    title,
    updatedAt: Date.now(),
    settings: {
      showPinyin: false,
      showZdictExamples: false,
      mainFont: "kai"
    },
    pages: [
      createPage("第 1 页", text)
    ]
  };
}

// A book owns an ordered list of 课文 and the lexicon shared across them.
export function createBook(title = "我的课本") {
  return {
    id: id("book"),
    title,
    updatedAt: Date.now(),
    lexicon: {},
    texts: [createDeck()]
  };
}

// Every 课文 across every book, flattened. Only 查字 needs this — editing always
// works against the single active deck.
export function allTexts() {
  return state.books.flatMap((book) => book.texts);
}

export function getActiveBook() {
  return state.books.find((book) => book.id === state.activeBookId) || state.books[0];
}

export function getActiveDeck() {
  const book = getActiveBook();
  return book?.texts.find((deck) => deck.id === state.activeDeckId) || book?.texts[0];
}

// The book that owns a given 课文 (needed to resolve its shared lexicon).
export function bookOfDeck(deck) {
  if (!deck) return getActiveBook();
  return state.books.find((book) => book.texts.some((text) => text.id === deck.id)) || getActiveBook();
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

export function ensureBookModel(book) {
  book.lexicon ||= {};
  book.texts ||= [];
  book.texts.forEach((deck) => ensureDeckModel(deck, book));
}

export function ensureDeckModel(deck, book = bookOfDeck(deck)) {
  book.lexicon ||= {};
  deck.settings ||= {};
  deck.settings.showPinyin ??= false;
  deck.settings.showZdictExamples ??= false;
  deck.settings.mainFont ||= "kai";
  // Pre-book saves kept the lexicon on the 课文; fold it into the book's lexicon
  // so素材 becomes book-wide, then drop the stale per-课文 copy.
  if (deck.lexicon) {
    mergeLexicon(book.lexicon, deck.lexicon);
    delete deck.lexicon;
  }
  deck.pages.forEach((page) => {
    page.images ||= [];
    page.imageIndex ||= 0;
    page.textOnly ||= false;
    page.styles ||= {};
    page.styles.mainTextColor ||= "ink";
    // 早期版本写入过例句/说明颜色字段，但渲染从未消费——顺手清掉。
    delete page.styles.exampleTextColor;
    delete page.styles.captionTextColor;
    page.tokens.forEach(ensureTokenState);
    if (!page.entries) return;

    Object.entries(page.entries).forEach(([char, entry]) => {
      const token = page.tokens.find((item) => item.text === char);
      const pinyin = token?.pinyin || lookupPinyin(char)[0] || "";
      const key = `${char}|${normalizePinyin(pinyin)}`;
      book.lexicon[key] ||= { examples: [], images: [] };
      mergeSharedItems(book.lexicon[key].examples, entry.examples, "ex");
      mergeSharedItems(book.lexicon[key].images, entry.images, "img");
    });
    delete page.entries;
  });
}

// Merge one lexicon into another by "字|拼音" key, appending items and skipping
// ones already present by id. Used for the decks→book migration and for
// importing 课文 into an existing book.
export function mergeLexicon(target, source = {}) {
  Object.entries(source).forEach(([key, entry]) => {
    if (!entry || typeof entry !== "object") return;
    target[key] ||= { examples: [], images: [] };
    mergeSharedItems(target[key].examples, entry.examples || [], "ex");
    mergeSharedItems(target[key].images, entry.images || [], "img");
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

export function getEntry(book, token) {
  if (!token) return null;
  ensureTokenState(token);
  book.lexicon ||= {};
  const key = entryKey(token);
  book.lexicon[key] ||= { examples: [], images: [] };
  return book.lexicon[key];
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
  const book = getActiveBook();
  const deck = getActiveDeck();
  const page = getActivePage();
  const token = getToken(page);
  const entry = getEntry(book, token);
  return { book, deck, page, token, entry };
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
  state.ui.bookContext = null;
  state.ui.deckContext = null;
  state.ui.pageContext = null;
}

export function clearTransient() {
  state.ui.activeTokenId = "";
  state.ui.exampleIndex = 0;
  state.ui.imageIndex = 0;
  state.ui.menu = null;
  state.ui.pinyinMenu = null;
  state.ui.bookContext = null;
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
