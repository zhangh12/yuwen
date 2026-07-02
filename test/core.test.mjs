import test from "node:test";
import assert from "node:assert/strict";
import { installBrowserStubs } from "./helpers.mjs";

installBrowserStubs();
const core = await import("../src/core.js");
const { isHanzi, tokenizePage, mergeLexicon, entryKey, cycleIndex, dateStamp, createPage, createDeck, createBook } = core;

test("isHanzi：常用字/扩展区为真，标点、々〆、拉丁为假", () => {
  assert.ok(isHanzi("春"));
  assert.ok(isHanzi("𠮷"));            // 扩展 B（代理对）
  assert.ok(!isHanzi("，"));
  assert.ok(!isHanzi("々"));
  assert.ok(!isHanzi("A"));
});

test("tokenizePage：只为汉字建 token，index 按码点", () => {
  const page = { mainText: "春a，𠮷天", tokens: [] };
  tokenizePage(page);
  assert.deepEqual(page.tokens.map((t) => [t.text, t.index]), [["春", 0], ["𠮷", 3], ["天", 4]]);
});

test("tokenizePage：重分词后保留同字位置的用户数据（颜色/读音）", () => {
  const page = { mainText: "春天", tokens: [] };
  tokenizePage(page);
  page.tokens[0].color = "red";
  page.tokens[0].pinyin = "chūn";
  tokenizePage(page); // 无编辑重分词
  assert.equal(page.tokens[0].color, "red");
  assert.equal(page.tokens[0].pinyin, "chūn");
});

test("mergeLexicon：按 字|拼音 合并，id 去重、目标已有的不重复", () => {
  const target = { "春|chūn": { examples: [{ id: "a", text: "1" }], images: [] } };
  mergeLexicon(target, {
    "春|chūn": { examples: [{ id: "a", text: "dup" }, { id: "b", text: "2" }], images: [] },
    "花|huā": { examples: [{ id: "c", text: "3" }], images: [] }
  });
  assert.deepEqual(target["春|chūn"].examples.map((e) => e.id), ["a", "b"]);
  assert.equal(target["春|chūn"].examples[0].text, "1"); // 保留目标原内容
  assert.equal(target["花|huā"].examples[0].id, "c");
});

test("entryKey / cycleIndex / dateStamp 基本行为", () => {
  assert.equal(entryKey({ text: "长", pinyin: " cháng " }), "长|cháng");
  assert.equal(cycleIndex(-1, 3), 2);
  assert.equal(cycleIndex(3, 3), 0);
  assert.match(dateStamp(), /^\d{4}-\d{2}-\d{2}$/);
});

test("createBook/createDeck/createPage 结构约定", () => {
  const book = createBook("B");
  assert.equal(book.texts.length, 1);
  assert.ok(book.lexicon && typeof book.lexicon === "object");
  const deck = createDeck("T", "");
  assert.ok(!("lexicon" in deck)); // lexicon 只在书级
  const page = createPage("t", "春");
  assert.equal(page.tokens.length, 1);
  assert.ok(!("exampleTextColor" in page.styles)); // 死字段不再生成
});
