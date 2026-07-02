import test from "node:test";
import assert from "node:assert/strict";
import { installBrowserStubs, makePage, makeText } from "./helpers.mjs";

installBrowserStubs();
const { transferPages } = await import("../src/core.js");

// 每个用例独立造一套课本，避免相互污染。
function fixture() {
  const src = makeText("d1", "长课文", "");
  src.pages = [makePage("p1", "一"), makePage("p2", "二"), makePage("p3", "三"), makePage("p4", "四")];
  src.pages[1].tokens = [{ id: "tk1", index: 0, text: "春", pinyin: "chūn" }];
  const dst = makeText("d2", "目标课文", "旧页");
  const bookA = {
    id: "ba", title: "课本A", texts: [src, dst],
    lexicon: {
      "春|chūn": { examples: [{ id: "ex1", text: "春天来了" }], images: [] },
      "冬|dōng": { examples: [{ id: "ex2", text: "冬天到了" }], images: [] }
    }
  };
  const other = makeText("d3", "他书课文", "他页");
  const bookB = { id: "bb", title: "课本B", texts: [other], lexicon: {} };
  return { bookA, bookB, src, dst, other };
}

test("copy：克隆到目标尾部（保持相对顺序、页与 token 换新 id），源课文不变", () => {
  const { bookA, src, dst } = fixture();
  const delivered = transferPages({
    sourceBook: bookA, sourceDeck: src, pageIds: ["p3", "p1"],
    targetBook: bookA, targetDeck: dst, mode: "copy"
  });
  assert.equal(src.pages.length, 4, "复制不动源课文");
  assert.deepEqual(dst.pages.map((p) => p.mainText), ["旧页", "一", "三"], "追加到尾部且按源内顺序");
  assert.equal(delivered.length, 2);
  assert.ok(delivered.every((p) => !["p1", "p2", "p3", "p4"].includes(p.id)), "克隆页换新 id");
});

test("copy：token 也换新 id，且不共享对象引用", () => {
  const { bookA, src, dst } = fixture();
  const [copied] = transferPages({
    sourceBook: bookA, sourceDeck: src, pageIds: ["p2"],
    targetBook: bookA, targetDeck: dst, mode: "copy"
  });
  assert.notEqual(copied.tokens[0].id, "tk1");
  copied.tokens[0].pinyin = "改";
  assert.equal(src.pages[1].tokens[0].pinyin, "chūn", "深拷贝，不影响源 token");
});

test("move：从源课文移除并送达目标尾部；移空时源自动补一张空白页", () => {
  const { bookA, src, dst } = fixture();
  transferPages({
    sourceBook: bookA, sourceDeck: src, pageIds: ["p1", "p2", "p3", "p4"],
    targetBook: bookA, targetDeck: dst, mode: "move"
  });
  assert.deepEqual(dst.pages.map((p) => p.id), ["p_d2", "p1", "p2", "p3", "p4"], "原页原样送达（id 不变）");
  assert.equal(src.pages.length, 1, "移空后自动补空白页");
  assert.equal(src.pages[0].mainText, "");
});

test("move 到源课文自身：等于挪到末尾，不补空白页", () => {
  const { bookA, src } = fixture();
  transferPages({
    sourceBook: bookA, sourceDeck: src, pageIds: ["p1"],
    targetBook: bookA, targetDeck: src, mode: "move"
  });
  assert.deepEqual(src.pages.map((p) => p.id), ["p2", "p3", "p4", "p1"]);
});

test("跨课本：被引用的「字|拼音」素材切片并入目标课本，源课本词库不动", () => {
  const { bookA, bookB, src, other } = fixture();
  transferPages({
    sourceBook: bookA, sourceDeck: src, pageIds: ["p2"],
    targetBook: bookB, targetDeck: other, mode: "move"
  });
  assert.ok(bookB.lexicon["春|chūn"], "p2 引用的 春|chūn 跟着页面进入课本B");
  assert.equal(bookB.lexicon["春|chūn"].examples[0].text, "春天来了");
  assert.ok(!bookB.lexicon["冬|dōng"], "未被所选页面引用的条目不搬");
  assert.ok(bookA.lexicon["春|chūn"], "源课本词库保留（同书其它课文可能还在用）");
});

test("同课本转移不动 lexicon；pageIds 里不存在的 id 被忽略", () => {
  const { bookA, src, dst } = fixture();
  const before = JSON.stringify(bookA.lexicon);
  const delivered = transferPages({
    sourceBook: bookA, sourceDeck: src, pageIds: ["p2", "不存在"],
    targetBook: bookA, targetDeck: dst, mode: "copy"
  });
  assert.equal(delivered.length, 1);
  assert.equal(JSON.stringify(bookA.lexicon), before);
  const none = transferPages({
    sourceBook: bookA, sourceDeck: src, pageIds: ["也不存在"],
    targetBook: bookA, targetDeck: dst, mode: "move"
  });
  assert.deepEqual(none, [], "全不存在时无操作");
});
