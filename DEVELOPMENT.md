# yuwen 设计与开发

面向后续开发与代码审阅：先讲清设计取舍与不可破坏的约束，再给架构、关键决策理由、数据格式与开发约定。使用说明见 [README.md](README.md)。

> **命名提示**：代码内部**一篇课文仍称 `deck`**（历史名，早期「讲义」＝现在的「课文」）；`book`（课本）是在其上新加的分组层。`state.activeDeckId` 即「当前课文 id」。UI 文案统一用「课本 / 课文」。保留旧名是刻意的：持久化字段兼容与最小 churn 优先于表面整洁。

## 给代码审阅者

- **跑起来**：`npm start` → `http://localhost:5173`。
- **测试**：`npm test`（语法检查 + node:test，零依赖）；浏览器自检页 `test/browser.html` 覆盖 Node 测不到的部分（真实 IndexedDB 的 Blob 仓、注入面、DOM 测量排版）——**它会清空本机 yuwen 数据**，只在测试环境打开。
- **读代码的顺序**：`core.js`（数据模型，无 DOM）→ `storage.js`（持久化/迁移/备份/收件箱）→ `render.js`（全量 innerHTML 渲染）→ `events.js`（一次性委托的全部交互）。`charquery.js`/`zitie.js` 是独立的导出功能。
- **重点核对的不变式**：
  1. 所有模板经自动转义的 `html` 标签模板拼装，插值默认转义（XSS 面：搜索 `rawHtml` 的少数放行点）；
  2. 导入路径只接受 `data:image/` 内联图片且剥离外来 `blobId`（`storage.js` `sanitizeEnvelope`）；
  3. 旧版 `decks[]` 存档的迁移不丢数据（`normalizeToBooks`/`ensureBookModel`）；
  4. `mainText` 是唯一真源，`tokens` 一律重新派生；
  5. 备份「一个 JSON = 一本课本」。
- **已知取舍**（非缺陷）：全量重画不做 diff；`deck`＝课文的历史命名；字帖笔画数据来自 CDN。详见「关键设计决策与理由」。

## 设计重点

这些取舍驱动一切实现，改动前请先对齐：

1. **三级层次、一次只开一篇课文**：课本 → 课文 → 页面；编辑/展示始终针对单一「当前课文」（`activeBookId + activeDeckId`）。正因如此，编辑与渲染面几乎不随层次化而变，复杂度集中在导航、查字选择、备份/导入。
2. **编辑即展示**：同一套页面既是编辑器也是投屏材料，任何编辑态都能一键进入干净展示态（最大化 / 全文页），布局不跳动。
3. **零构建、纯静态、本地优先**：原生 ES module，无打包、无框架、无后端，数据留在本机。新增能力必须守住「克隆即用、`http.server` 就能跑」。
4. **正文是唯一真源**：页面只存 `mainText`，token/拼音/分词实时派生，绝不把派生结果当真源存。
5. **素材按课本共享**：例句与配图挂在课本级词库上按「汉字+读音」共享；每个汉字位置只存局部指针（停留索引、隐藏名单、颜色、所选读音）。多音字天然分组。
6. **布局稳定、字号可控**：普通页三区尺寸固定；`A-/A0/A+` 是与内容无关的纯字号控制（单一基准 `38px × 字号`）；左右 `7fr:3fr` 分栏。
7. **内容来源多元、但不引入后端**：手输、照片经技能转入收件箱、查字汇编、字帖、备份/导入——全部在「静态前端 + 本地工具」内完成。

## 架构

### 模块依赖（单向、无环）

```
core  ← storage
core / storage  ← render
core / render / storage ← events
        全部          ← main
```

| 模块 | 职责 |
|------|------|
| `src/main.js` | 启动装配：加载状态 → 绑定事件 → 首次渲染。 |
| `src/core.js` | **数据层，无 DOM**。常量与版本号、拼音/字库查询、按词定音、LCS token 对齐、全局 `state`、课本/课文/页面模型与上下文助手。 |
| `src/storage.js` | 持久化（IndexedDB 主存 + localStorage 兜底/迁移）、**图片 Blob 仓**、备份导出/导入、`yuwen-pages` 导入、**收件箱**（inbox.json 检查与去重）。 |
| `src/render.js` | 界面渲染：自动转义 `html` 模板、`render()` 全量重画、离屏**测量排版** `measureAutoLayout`。 |
| `src/events.js` | 一次性委托的全部交互与数据操作。 |
| `src/charquery.js` | 按部首/单页查询与导出（`.docx` / 打印）的纯逻辑。 |
| `src/zitie.js` | 米字格练字帖渲染（笔画数据按需取自 CDN）。 |
| `scripts/build-phrase-pinyin.mjs` | 生成 `vendor/data-phrases.js`（词组拼音词典）。 |
| `test/` | node:test 单测（`npm test`）+ 浏览器自检页 `browser.html`。 |

### 核心机制

- **渲染**：`render()` 一次性重建 `#app.innerHTML`，不做局部 diff——简单优先。所有模板用**自动转义的 `html` 标签模板**：插值默认转义，只有 `html` 自身产出的 SafeHtml（及其数组）原样拼接，「忘了转义」在结构上不可能；`rawHtml()` 是显式放行点。
- **事件**：监听器只在启动时一次性委托绑定到持久的 `#app`（及 `document`）；`render()` 只换子树，委托恒有效。点击分发顺序：`action → 拼音 → 汉字 → 课文 → 课本 → 页面 → 空白/画布`。与原生手势的两处协调：正文有文字选区时点击/右键**不接管**（保划选复制）；「双击进编辑」在 **pointerdown** 层检测（原生 dblclick 会被全量重画打断，且第二次按下的原生选词会触发选区守卫）。
- **数据流**：交互 → 改 `state` → `saveState()` → `render()`，即改即存。
- **token 管线**：`tokenizePage` 重分词时用 **LCS 保序对齐**把旧 token 的用户数据带给「同一个字」（贪心匹配在重复字前插入时会串位）；随后 `applyPhrasePinyin` 按词定音（见决策）。只有 `pinyinSource:"user"` 的读音随 token 延续，其余每次重新推导。

### 状态结构

```
state.books[]                 课本
  ├ title / updatedAt
  ├ lexicon{字|拼音}          课本级共享素材 { examples, images }
  └ texts[]                   课文（代码内部仍称 deck）
      ├ settings{…}           按课文的开关（拼音、字库例句…）
      └ pages[]               页面
          ├ mainText          正文（唯一真源）
          ├ tokens[]          派生 token（index、拼音、颜色、局部索引、隐藏名单…）
          ├ mainTextScale     字号（0.7–1.9）
          ├ textOnly          是否全文页
          └ images[]          配图（只存 blobId 引用，字节在 Blob 仓）
state.activeBookId / activeDeckId / activePageId
state.ui{…}                   纯瞬时界面状态（不持久化）
```

### 持久化

`saveState()` 写 payload `{ version:2, books, activeBookId, activeDeckId, activePageId }`：

- **主存 IndexedDB**：库 `yuwen`（v2）/ 仓 `kv` / 键 `state`，即改即存（fire-and-forget，last-write-wins）。
- **图片 Blob 仓**：`images` 对象仓存原生 Blob，state 只有 `blobId` 引用；启动时预载被引用的 Blob 为 objectURL（渲染同步取用 `imageUrl()`），并按引用集回收孤儿。payload 不含图片字节：保存小几个量级、无 base64 膨胀。旧数据的内联 `data:` 图片在加载时自动入仓；无 IndexedDB 环境保留内联回退。
- **localStorage 兜底**：防抖镜像（400ms 合并，`pagehide` 冲刷），超 ~4.5MB 跳过、超配额忽略。
- **迁移（无损）**：旧扁平 payload `{decks,…}` 自动包成一本「我的课本」，按课文 lexicon 折叠进课本级；新旧形状都能读。

## 关键设计决策与理由

新功能容易无意破坏这些取舍，特此记录「为什么」：

- **`core.js` 不碰 DOM**：数据层可在 Node 里直接测（`test/helpers.mjs` 起浏览器桩）。新数据逻辑优先放这里。
- **多音字按词定音（`applyPhrasePinyin`）**：对非手选多音字，先试「前字+它」再试「它+后字」是否在二字词典里；命中即「认领」——即使读音与默认一致也不再试另一侧（「为了」认领「了」读 le，「了解」抢不走）。默认读音顺序以手工表 `FALLBACK_PINYIN`（常用在前）优先，zdict 只补充候选。词典由 `scripts/build-phrase-pinyin.mjs` 从 mozillazg/phrase-pinyin-data 过滤生成（只留含多音字的二字词）。
- **LCS token 对齐**：编辑（尤其重复字前插入）后颜色/读音/隐藏名单不串位；极长文本（n·m>1e6）退回逐位对齐。
- **自动转义模板取代人工 `escapeHtml` 约定**：防 XSS 从「靠自觉」变成「结构保证」。
- **图片进 Blob 仓而非内联 base64**：课本照片是真实主载荷，内联会让每次保存/渲染背着全部图片字节。备份文件仍自包含（导出内联回 `data:`、导入重新入仓、剥离外来 blobId），格式不变。
- **导入排版＝真实 DOM 测量**（`render.measureAutoLayout`）：用真实版式结构离屏渲染（含拼音行高），1.2→0.7 逐档试、取放得下的最大字号，放不下判全文页；`storage.autoLayout` 启发式仅作无 DOM 兜底（排版判定通过 `importPages(file, layoutFn)` 注入）。
- **收件箱（inbox.json）**：yuwen 由仓库目录的静态服务器提供，技能把识别结果写到仓库根后 yuwen 直接 `fetch` 即可——零后端、零文件选择器。启动与窗口获焦时检查（**不轮询**）；按 `id` 与 localStorage 去重；×/「稍后再说」下次仍提醒，「忽略」记 id 永久不提。
- **素材按课本共享**：`长|cháng` 与 `长|zhǎng` 是两组；同课本不同课文的 `春|chūn` 共享素材；位置级只存指针，删素材与「某处隐藏」互不影响。
- **备份不变式：一个 JSON = 恰好一本课本**：整本带全量 lexicon，部分课文只带引用切片；跨 N 本＝N 个文件（根因：素材按课本走）。导入多文件全建新书；单文件可选新建/插入（`mergeLexicon` 按键合并）；兼容旧 `{decks}` 格式。
- **查字/打印页面复用同一套逻辑**：`charsInDecks`/`collectMatches` 支持可选 `pageIds`（页面 id 数组，单页或多选的若干页）与 `radicals=null`；「打印页面」＝`scope:"page"` 直接进选字步，多选页面右键批量打印也走这条路。
- **Word 用 `.docx` 而非 RTF**：RTF 触发 macOS Gatekeeper 警告；`.docx` 由内置极小 ZIP+OOXML 生成器拼装，零依赖，Pages 直接打开。
- **PDF 一律走浏览器打印**：新窗口在点击手势内同步 `window.open`（防拦截），排版完成后延时 `print()`（立即打印个别浏览器出空白页）；田字格虚线用 CSS 像素画（SVG 缩放后亚像素消失）；跨页 `box-decoration-break:clone` 补边。
- **字帖笔画走 CDN**：`hanzi-writer-data`（jsdelivr / unpkg 兜底），20MB+ 不入仓库。
- **导出文件名用本地日期**（`dateStamp`）：`toISOString` 是 UTC，美洲时区晚间会写成「明天」。
- **照片识别不做后端**：浏览器沙箱无法读磁盘/调 agent，识别放在 Claude Code 技能 `textbook-photos`，yuwen 只负责收件箱导入。

## 数据格式

**`yuwen-pages`**（页面/课文导入；手工或技能产出）：

```json
{
  "format": "yuwen-pages",
  "version": 1,
  "id": "ip-20260702-153000",
  "title": "青蛙写诗",
  "pages": [{ "title": "春天", "text": "春天来了，\n万物复苏。" }]
}
```

- `pages[].text` 为正文，段落用 `\n`；`pages[].title` 可选（省略取正文开头）。
- `id`/`title` 顶层字段：写进仓库根 `inbox.json`（收件箱，.gitignore 内）时 `id` **必填**（按它去重），`title` 用作一键「新建为课文」的课文名。页面栏手动导入则都可省略。
- 参考 `示例-导入页面.json`。

**`yuwen-backup`**（备份；一个文件恰好一本课本）：

```json
{
  "format": "yuwen-backup",
  "version": 2,
  "book": {
    "title": "一年级上册",
    "lexicon": { "春|chūn": { "examples": [], "images": [] } },
    "texts": [ { "title": "课文一", "settings": {}, "pages": [] } ]
  }
}
```

`texts` 为课文数组；`lexicon` 为该本引用到的素材切片（整本备份即全量）；图片在文件里是内联 `data:` URL。导入兼容旧版 `{ decks:[…] }` 单册导出。

## 数据来源

- `vendor/data-chars-local.js`：本地字库（`window.zDictChars`，来自 zdict.js）——拼音候选与字库例句；加载失败回退 `core.js` 内置 `FALLBACK_PINYIN`。
- `vendor/data-chars.js`：原始字库存档，运行时不加载。
- `vendor/data-radicals.js`：字→部首（make-me-a-hanzi），离线。
- `vendor/data-phrases.js`：二字词→拼音（mozillazg/phrase-pinyin-data，MIT），约 393KB；重新生成：
  ```bash
  curl -sL https://cdn.jsdelivr.net/gh/mozillazg/phrase-pinyin-data@master/pinyin.txt -o /tmp/phrase-pinyin.txt
  node scripts/build-phrase-pinyin.mjs /tmp/phrase-pinyin.txt
  ```
- 笔画：`hanzi-writer-data`（CDN，按需），字帖用。
- `.claude/skills/textbook-photos/`：课本照片 → `yuwen-pages`/收件箱 的 Claude Code 技能。

## 测试与开发约定

```bash
npm test           # 语法检查（node --check 全部模块）+ node:test 单测
```

浏览器侧另有 `test/browser.html` 自检页（真 IndexedDB / 注入面 / 测量排版；**会清空本机数据**）。

- **守零构建**：能不加依赖就不加；必须加时保证浏览器可直接 `import`。
- **模板一律用 `html` 标签模板**（插值默认转义）；确认安全的原始片段才用 `rawHtml`。
- **新数据逻辑进 `core.js`（无 DOM）**；渲染进 `render.js`；交互走 `events.js` 委托分发（新增 `data-action`）。
- **改完走 `save → render`**，不要手动改 DOM 绕过重画。
- **改样式要 bump `styles.css?v=N`**（`index.html` 与 `test/browser.html`）绕开缓存。
- **用户可感知的改动要递增 `core.APP_VERSION`**（顶栏可见，用户以此确认加载了最新代码）。
- 字帖/查字导出统一走浏览器打印，不落盘文件（备份 JSON 除外）。
- 改动后跑 `npm test`；动到渲染/存储再开 `test/browser.html` 自检。

## 当前限制与后续方向

**限制**

- 数据在单一浏览器的 IndexedDB 中，无账号/云同步（备份 JSON 是唯一的跨机通道）。
- 不支持跨课本移动课文（仅导入时可选目标课本）。
- 多音字朗读受浏览器 TTS 限制（无法可靠指定读音）；音质取决于系统安装的语音。
- 按词定音基于二字词，助词组合（如「背着」）不在词典内时可能用默认读音。
- 导入排版按导入时的窗口实测；换更小屏幕展示时个别页可能需手动调小字号。
- AI 配图仅生成「提示词」，未接入自动生成。

**可能的后续**

- 跨课本移动/整理课文。
- 更好的语音（可选接入云端 TTS，需权衡「纯静态/本地优先」）。
- AI 配图/例句的实际接入（同上权衡）。
