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

test("词组注音：按前后字组词为多音字定音", () => {
  // 行: [xíng, háng]（FALLBACK）；长: [cháng, zhǎng]；了: [le, liǎo]；色: [sè, shǎi]
  globalThis.window.zPhrasePinyin = {
    银行: "yín háng", 行动: "xíng dòng", 长大: "zhǎng dà",
    了解: "liǎo jiě", 为了: "wèi le", 色子: "shǎi zǐ"
  };
  const py = (text) => {
    const page = { mainText: text, tokens: [] };
    tokenizePage(page);
    return Object.fromEntries(page.tokens.map((t) => [t.text + "@" + t.index, t.pinyin]));
  };

  assert.equal(py("银行")["行@1"], "háng", "银行 → háng");
  assert.equal(py("行动")["行@0"], "xíng", "行动 → xíng");
  assert.equal(py("长大")["长@0"], "zhǎng", "长大 → zhǎng");
  assert.equal(py("了解")["了@0"], "liǎo", "了解 → liǎo");
  assert.equal(py("掷色子")["色@1"], "shǎi", "色子 → shǎi（色 的口语读音在候选内）");
  // 认领规则：「为了」先认领「了」读 le，「了解」抢不走
  assert.equal(py("为了解决")["了@1"], "le", "为了解决 → 了 读 le");
  // 词典命中的读音标记为 phrase 来源
  const page = { mainText: "银行", tokens: [] };
  tokenizePage(page);
  assert.equal(page.tokens[1].pinyinSource, "phrase");
  delete globalThis.window.zPhrasePinyin;
});

test("词组注音：三/四字词按最长优先匹配", () => {
  // 为: [wéi, wèi]（默认 wéi）；给: [gěi, jǐ]（默认 gěi）
  globalThis.window.zPhrasePinyin = {
    为了: "wèi le", 什么: "shén me",
    为什么: "wèi shén me", 自给自足: "zì jǐ zì zú"
  };
  const py = (text) => {
    const page = { mainText: text, tokens: [] };
    tokenizePage(page);
    return Object.fromEntries(page.tokens.map((t) => [t.text + "@" + t.index, t.pinyin]));
  };

  // 旧二字逻辑的落空场景：「为什」不是词，为 会退回默认 wéi；三字词修正为 wèi
  assert.equal(py("为什么不去")["为@0"], "wèi", "为什么 → 为 读 wèi");
  // 词中间/末尾位置也能命中同一个长词
  assert.equal(py("这是为什么")["为@2"], "wèi", "句中的 为什么 同样命中");
  // 四字成语：给 → jǐ（非默认读音）
  assert.equal(py("他们自给自足地生活")["给@3"], "jǐ", "自给自足 → 给 读 jǐ");
  // 长词优先于二字词：为什么 里的 为 不被「为了」之类的二字规则影响，
  // 且二字词在长词不命中时照常工作
  assert.equal(py("为了你好")["为@0"], "wèi", "二字词仍正常");
  delete globalThis.window.zPhrasePinyin;
});

test("词组注音：用户手选读音优先于词组，且重分词后保留", () => {
  globalThis.window.zPhrasePinyin = { 银行: "yín háng" };
  const page = { mainText: "银行", tokens: [] };
  tokenizePage(page);
  page.tokens[1].pinyin = "xíng";
  page.tokens[1].pinyinSource = "user";
  page.mainText = "大银行";
  tokenizePage(page);
  const hang = page.tokens.find((t) => t.text === "行");
  assert.equal(hang.pinyin, "xíng", "用户手选不被词组覆盖");
  assert.equal(hang.pinyinSource, "user");
  delete globalThis.window.zPhrasePinyin;
});

test("词组注音：不相邻（隔标点）不组词", () => {
  globalThis.window.zPhrasePinyin = { 银行: "yín háng" };
  const page = { mainText: "银，行", tokens: [] };
  tokenizePage(page);
  const hang = page.tokens.find((t) => t.text === "行");
  assert.notEqual(hang.pinyinSource, "phrase", "隔着标点不算词");
  delete globalThis.window.zPhrasePinyin;
});

test("token 对齐：重复字前插入字符，标注不串位（旧贪心算法的失败用例）", () => {
  // "春春"，第二个春标红。旧算法在前面插入"早"后，精确下标匹配会把红色抢给第一个春。
  const page = { mainText: "春春", tokens: [] };
  tokenizePage(page);
  page.tokens[1].color = "red";
  const keepId = page.tokens[1].id;
  page.mainText = "早春春";
  tokenizePage(page);
  assert.equal(page.tokens.length, 3);
  assert.equal(page.tokens[1].color, "", "第一个春不应带色");
  assert.equal(page.tokens[2].color, "red", "红色跟着第二个春");
  assert.equal(page.tokens[2].id, keepId, "token id 保持稳定");
});

test("token 对齐：删除中间字，其余字的读音选择保留", () => {
  const page = { mainText: "春天花", tokens: [] };
  tokenizePage(page);
  page.tokens[2].pinyin = "huā";
  page.tokens[2].pinyinSource = "user";
  page.tokens[2].hiddenExamples = ["ex1"];
  page.mainText = "春花";
  tokenizePage(page);
  assert.equal(page.tokens.length, 2);
  assert.equal(page.tokens[1].text, "花");
  assert.equal(page.tokens[1].pinyinSource, "user");
  assert.deepEqual(page.tokens[1].hiddenExamples, ["ex1"]);
});

test("token 对齐：整段重写后互不相干的字不继承旧数据", () => {
  const page = { mainText: "春天", tokens: [] };
  tokenizePage(page);
  page.tokens[0].color = "red";
  page.mainText = "山水";
  tokenizePage(page);
  assert.ok(page.tokens.every((t) => !t.color), "全新文字不带旧颜色");
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
