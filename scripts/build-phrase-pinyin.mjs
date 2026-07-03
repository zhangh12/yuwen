// 生成 vendor/data-phrases.js：词 → 拼音 的离线词典，供多音字按词定音。
//
// 数据源：mozillazg/phrase-pinyin-data（MIT），pypinyin 同源。
// 用法：
//   curl -sL https://cdn.jsdelivr.net/gh/mozillazg/phrase-pinyin-data@master/pinyin.txt -o /tmp/phrase-pinyin.txt
//   node scripts/build-phrase-pinyin.mjs /tmp/phrase-pinyin.txt
//
// 收词规则（与 core.applyPhrasePinyin 的最长优先窗口匹配配套）：
// - 二字词：全汉字且含至少一个多音字就收。含默认读音的词条也保留：它们在
//   运行时充当"认领者"（如「为了」认领「了」读 le，阻止「了解」抢走它）。
// - 三/四字词：只收「某个多音字在词里读非默认音（且该读音在候选内）」的词条
//   （如「为什么」的 为→wèi、「一唱一和」的 和→hè）。全默认读音的长词不改变
//   任何输出（落空后二字词/默认读音给出同样结果），排除后体积从 ~800KB 降到
//   ~140KB。
import { readFileSync, writeFileSync } from "node:fs";

globalThis.window = globalThis;
await import("../vendor/data-chars-local.js");
const { lookupPinyin, isHanzi } = await import("../src/core.js");

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error("用法：node scripts/build-phrase-pinyin.mjs <pinyin.txt 路径>");
  process.exit(1);
}

const lines = readFileSync(sourcePath, "utf-8").split("\n");
const dict = {};
const kept = { 2: 0, 3: 0, 4: 0 };

for (const line of lines) {
  if (!line || line.startsWith("#")) continue;
  const at = line.indexOf(":");
  if (at < 0) continue;
  const word = line.slice(0, at).trim();
  const pinyin = line.slice(at + 1).trim().replace(/\s+/g, " ");
  const chars = [...word];
  const len = chars.length;
  if (len < 2 || len > 4 || !chars.every(isHanzi)) continue;
  const readings = pinyin.split(" ");
  if (readings.length !== len) continue;
  const keep = len === 2
    ? chars.some((ch) => lookupPinyin(ch).length >= 2)
    : chars.some((ch, i) => {
        const candidates = lookupPinyin(ch);
        return candidates.length >= 2 && readings[i] !== candidates[0] && candidates.includes(readings[i]);
      });
  if (!keep) continue;
  if (dict[word]) continue; // 重复词条取首见
  dict[word] = pinyin;
  kept[len] += 1;
}

const total = kept[2] + kept[3] + kept[4];
const header = `// 由 scripts/build-phrase-pinyin.mjs 生成，请勿手改。
// 数据源：mozillazg/phrase-pinyin-data（MIT）。词 → 拼音：二字词收全部含多音字
// 的词条；三/四字词只收含非默认读音多音字的词条。共 ${total} 条（二字 ${kept[2]} /
// 三字 ${kept[3]} / 四字 ${kept[4]}）。供 core.js 的多音字按词定音（最长优先窗口匹配）。
`;
writeFileSync(new URL("../vendor/data-phrases.js", import.meta.url), `${header}window.zPhrasePinyin = ${JSON.stringify(dict)};\n`);
console.log(`kept ${total} 条（二字 ${kept[2]} / 三字 ${kept[3]} / 四字 ${kept[4]}）`);
