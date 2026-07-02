import test from "node:test";
import assert from "node:assert/strict";
import { installBrowserStubs, makeText } from "./helpers.mjs";

installBrowserStubs();
// 部首桩：查字逻辑依赖 window.zRadicals
globalThis.window.zRadicals = { 春: "日", 晒: "日", 花: "艹", 草: "艹", 山: "山" };

const { state } = await import("../src/core.js");
const { radicalsInDecks, charsInDecks, collectMatches, groupByRadical, mergeBySentence, headerLine } = await import("../src/charquery.js");

state.books = [{
  id: "bk", title: "书", lexicon: {},
  texts: [
    { ...makeText("d1", "课一", ""), pages: [{ id: "p1", mainText: "春天晒太阳。花草都绿了。", tokens: [] }] },
    { ...makeText("d2", "课二", ""), pages: [{ id: "p2", mainText: "山上有花。", tokens: [] }] }
  ]
}];
state.activeBookId = "bk";

test("radicalsInDecks：按选中课文统计部首（去重字数，降序）", () => {
  const radicals = radicalsInDecks(["d1", "d2"]);
  const byName = Object.fromEntries(radicals.map((r) => [r.radical, r.count]));
  assert.equal(byName["艹"], 2); // 花、草
  assert.equal(byName["日"], 2); // 春、晒
  assert.equal(byName["山"], 1);
});

test("charsInDecks：radicals=null 取全部字；pageIds 限定页面；appear 为首次出现序", () => {
  const all = charsInDecks(["d1", "d2"], null, "appear");
  assert.ok(all.some((c) => c.char === "天"), "无部首过滤时包含部首表外的字");
  const page2 = charsInDecks(["d1", "d2"], null, "appear", ["p2"]);
  assert.deepEqual(page2.map((c) => c.char), ["山", "上", "有", "花"]);
  const both = charsInDecks(["d1", "d2"], null, "appear", ["p1", "p2"]);
  assert.ok(both.some((c) => c.char === "春") && both.some((c) => c.char === "山"), "多页时包含每一页的字");
  const freq = charsInDecks(["d1", "d2"], ["艹"], "freq");
  assert.equal(freq[0].char, "花"); // 花出现 2 次 > 草 1 次
});

test("collectMatches + groupByRadical + mergeBySentence：例句取子句、按部首分组、同句合并", () => {
  const entries = collectMatches(["d1", "d2"], new Set(["花", "草"]));
  const groups = groupByRadical(entries);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].radical, "艹");
  const blocks = mergeBySentence(groups[0].items);
  const merged = blocks.find((b) => b.sentence === "花草都绿了。");
  assert.ok(merged, "同一句里的花/草共享同一例句块");
  assert.deepEqual(merged.chars.map((c) => c.char).sort(), ["花", "草"]);
  assert.match(headerLine(merged, false), /—— 课一 · 第1页$/);
});

test("collectMatches：pageIds 限定后不含其它页内容；多页取并集", () => {
  const entries = collectMatches(["d1", "d2"], new Set(["花"]), ["p2"]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].sentence, "山上有花。");
  const both = collectMatches(["d1", "d2"], new Set(["花"]), ["p1", "p2"]);
  assert.equal(both.length, 2);
});
