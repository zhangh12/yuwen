import test from "node:test";
import assert from "node:assert/strict";
import { installBrowserStubs, fakeFile, makeText, makePage } from "./helpers.mjs";

const { local, stores } = installBrowserStubs();
const { state } = await import("../src/core.js");
const storage = await import("../src/storage.js");
const { loadState, parseBackupFile, addBackupAsNewBook, addBackupToBook, importPages, buildBookEnvelope, imageUrl } = storage;

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo="; // 极小 PNG 头即可

function legacyDeck(id, title, text, lexicon = {}) {
  return { ...makeText(id, title, text), lexicon };
}

test("迁移：旧 decks[] 无损包成一本默认书，lexicon 折叠、内联图片收进 Blob 仓", async () => {
  const deckWithImage = legacyDeck("d1", "课文一", "春天", {
    "春|chūn": { examples: [{ id: "e1", text: "春天来了" }], images: [{ id: "li", src: PNG_DATA_URL }] }
  });
  deckWithImage.pages[0].images = [{ id: "pi", src: PNG_DATA_URL, caption: "", widthPercent: 86 }];
  local.set("yuwen.decks.v1", JSON.stringify({
    decks: [deckWithImage, legacyDeck("d2", "课文二", "春夏", {})],
    activeDeckId: "d1",
    activePageId: "p_d1"
  }));
  await loadState();

  assert.equal(state.books.length, 1);
  const book = state.books[0];
  assert.equal(book.texts.length, 2);
  assert.equal(state.activeDeckId, "d1");
  assert.equal(state.activePageId, "p_d1");
  assert.equal(book.lexicon["春|chūn"].examples[0].text, "春天来了");
  assert.ok(book.texts.every((t) => !("lexicon" in t)), "课文上的旧 lexicon 已删除");
  assert.equal(book.texts[0].pages[0].tokens.length, 2);

  // 图片迁移：src → blobId，Blob 落进 images 仓，imageUrl 可解析
  const pageImage = book.texts[0].pages[0].images[0];
  const lexImage = book.lexicon["春|chūn"].images[0];
  for (const image of [pageImage, lexImage]) {
    assert.ok(image.blobId, "分配了 blobId");
    assert.ok(!("src" in image), "内联 src 已移除");
    assert.ok(stores.get("images").has(image.blobId), "Blob 已入仓");
    assert.match(imageUrl(image), /^blob:/);
  }
});

test("备份导出：blobId 内联回 data: URL，文件自包含且不带 blobId", async () => {
  const book = state.books[0];
  const env = await buildBookEnvelope(book, book.texts);
  assert.equal(env.format, "yuwen-backup");
  const exported = env.book.texts[0].pages[0].images[0];
  assert.ok(exported.src.startsWith("data:image/png"), "导出内联为 data: URL");
  assert.ok(!("blobId" in exported), "blobId 不出仓");
  const lexExported = env.book.lexicon["春|chūn"].images[0];
  assert.ok(lexExported.src.startsWith("data:image/png"));

  // 完整往返：导出的封套再导入 → 重新收进 Blob 仓
  const round = await parseBackupFile(fakeFile(env, "round.json"));
  const newBook = await addBackupAsNewBook(round);
  const roundImage = newBook.texts[0].pages[0].images[0];
  assert.ok(roundImage.blobId && !("src" in roundImage), "往返后图片重新入仓");
});

test("Blob 回收：加载时清除未被引用的孤儿 Blob，被引用的保留", async () => {
  const images = stores.get("images");
  images.set("blob_orphan", new Blob(["x"], { type: "image/png" }));
  const referenced = state.books[0].texts[0].pages[0].images[0].blobId;
  await loadState(); // 重新加载触发 preload + sweep
  assert.ok(!images.has("blob_orphan"), "孤儿 Blob 被回收");
  assert.ok(images.has(referenced), "被引用的 Blob 保留");
});

test("parseBackupFile：校验、净化外链图片、标题截断", async () => {
  await assert.rejects(() => parseBackupFile(fakeFile({ nope: 1 }, "bad.json")), /不是有效的 yuwen 备份/);
  await assert.rejects(() => parseBackupFile({ name: "x.json", text: async () => "{oops" }), /不是有效的 JSON/);

  const env = await parseBackupFile(fakeFile({
    format: "yuwen-backup", version: 2,
    book: {
      title: "超".repeat(100),
      lexicon: { "月|yuè": { examples: [], images: [{ id: "ok", src: "data:image/png;base64,AA" }, { id: "bad", src: "http://evil" }] } },
      texts: [{
        ...makeText("t1", "课文", "月光"),
        pages: [{ ...makePage("p1", "月光"), images: [{ id: "g", src: "data:image/png;base64,BB" }, { id: "b", src: "javascript:x" }] }]
      }]
    }
  }));
  assert.equal(env.title.length, 60);
  assert.deepEqual(env.lexicon["月|yuè"].images.map((i) => i.id), ["ok"]);
  assert.deepEqual(env.texts[0].pages[0].images.map((i) => i.id), ["g"]);
});

test("parseBackupFile：兼容旧 {decks:[…]} 备份，lexicon 汇入书级", async () => {
  const env = await parseBackupFile(fakeFile({
    decks: [legacyDeck("old", "旧讲义", "云", { "云|yún": { examples: [{ id: "e", text: "白云" }], images: [] } })],
    activeDeckId: "old", activePageId: "p_old"
  }));
  assert.equal(env.texts.length, 1);
  assert.equal(env.lexicon["云|yún"].examples[0].text, "白云");
});

test("addBackupAsNewBook / addBackupToBook：新 id、lexicon 合并、激活切换", async () => {
  const before = state.books.length;
  const env = await parseBackupFile(fakeFile({
    format: "yuwen-backup", version: 2,
    book: { title: "新书", lexicon: { "风|fēng": { examples: [{ id: "f", text: "风声" }], images: [] } }, texts: [makeText("tx", "新课文", "风")] }
  }));
  const book = await addBackupAsNewBook(env);
  assert.equal(state.books.length, before + 1);
  assert.notEqual(book.texts[0].id, "tx", "导入分配全新 id");
  assert.equal(state.activeBookId, book.id);

  const target = state.books[0];
  const n0 = target.texts.length;
  await addBackupToBook(env, target.id);
  assert.equal(target.texts.length, n0 + 1);
  assert.ok(target.lexicon["风|fēng"], "插入时合并 lexicon");
});

test("收件箱：checkInbox 校验格式、按 id 去重；importParsedPagesAsNewDeck 建课文", async () => {
  const { checkInbox, markInboxSeen, importParsedPagesAsNewDeck } = storage;
  const inbox = { format: "yuwen-pages", version: 1, id: "ip-test-1", title: "青蛙写诗",
    pages: [{ title: "一", text: "下雨了" }, { title: "二", text: "青蛙说" }] };
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => inbox });
    const found = await checkInbox();
    assert.equal(found?.id, "ip-test-1", "新 id 返回内容");

    markInboxSeen("ip-test-1");
    assert.equal(await checkInbox(), null, "同 id 第二次不再提示");

    globalThis.fetch = async () => ({ ok: true, json: async () => ({ nope: 1 }) });
    assert.equal(await checkInbox(), null, "非 yuwen-pages 忽略");
    globalThis.fetch = async () => ({ ok: false });
    assert.equal(await checkInbox(), null, "404 忽略");
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ...inbox, id: "" }) });
    assert.equal(await checkInbox(), null, "缺 id 忽略");
  } finally {
    globalThis.fetch = realFetch;
  }

  // 一键建课文：标题取自 inbox.title，页数正确，激活切换
  const book = state.books.find((b) => b.id === state.activeBookId);
  const n0 = book.texts.length;
  const deck = importParsedPagesAsNewDeck(inbox);
  assert.equal(book.texts.length, n0 + 1);
  assert.equal(deck.title, "青蛙写诗");
  assert.equal(deck.pages.length, 2);
  assert.equal(state.activeDeckId, deck.id);
  assert.equal(state.activePageId, deck.pages[0].id);
});

test("importPages：追加进当前课文并自动排版（短文普通页 / 长文全文页）", async () => {
  // 显式定位当前课文（前面的导入测试会切换 active 指针）
  const book = state.books[0];
  const deck = book.texts[0];
  state.activeBookId = book.id;
  state.activeDeckId = deck.id;
  const n0 = deck.pages.length;
  const long = "很长的一段".repeat(40);
  const count = await importPages(fakeFile({
    format: "yuwen-pages", version: 1,
    pages: [{ title: "短", text: "山高水长" }, { title: "长", text: long }]
  }));
  assert.equal(count, 2);
  assert.equal(deck.pages.length, n0 + 2);
  const [short, longPage] = deck.pages.slice(-2);
  assert.equal(short.textOnly, false);
  assert.equal(longPage.textOnly, true);
  await assert.rejects(() => importPages(fakeFile({ format: "nope", pages: [] })), /yuwen-pages/);
});
