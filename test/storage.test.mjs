import test from "node:test";
import assert from "node:assert/strict";
import { installBrowserStubs, fakeFile, makeText, makePage } from "./helpers.mjs";

const { local } = installBrowserStubs();
const { state } = await import("../src/core.js");
const storage = await import("../src/storage.js");
const { loadState, parseBackupFile, addBackupAsNewBook, addBackupToBook, importPages } = storage;

function legacyDeck(id, title, text, lexicon = {}) {
  return { ...makeText(id, title, text), lexicon };
}

test("迁移：旧 decks[] 无损包成一本默认书，按课文 lexicon 折叠进书级", async () => {
  local.set("yuwen.decks.v1", JSON.stringify({
    decks: [
      legacyDeck("d1", "课文一", "春天", { "春|chūn": { examples: [{ id: "e1", text: "春天来了" }], images: [] } }),
      legacyDeck("d2", "课文二", "春夏", {})
    ],
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
  // token 已派生
  assert.equal(book.texts[0].pages[0].tokens.length, 2);
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
  const book = addBackupAsNewBook(env);
  assert.equal(state.books.length, before + 1);
  assert.notEqual(book.texts[0].id, "tx", "导入分配全新 id");
  assert.equal(state.activeBookId, book.id);

  const target = state.books[0];
  const n0 = target.texts.length;
  addBackupToBook(env, target.id);
  assert.equal(target.texts.length, n0 + 1);
  assert.ok(target.lexicon["风|fēng"], "插入时合并 lexicon");
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
