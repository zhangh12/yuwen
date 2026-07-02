// 生成 vendor/data-phrases.js：二字词 → 拼音 的离线词典，供多音字按词定音。
//
// 数据源：mozillazg/phrase-pinyin-data（MIT），pypinyin 同源。
// 用法：
//   curl -sL https://cdn.jsdelivr.net/gh/mozillazg/phrase-pinyin-data@master/pinyin.txt -o /tmp/phrase-pinyin.txt
//   node scripts/build-phrase-pinyin.mjs /tmp/phrase-pinyin.txt
//
// 只保留「二字、全汉字、且含至少一个多音字」的词条——单音字不需要词典，
// 三字以上词条对"看前后一个字"的匹配策略没有用处。含默认读音的词条也保留：
// 它们在运行时充当"认领者"（如「为了」认领「了」读 le，阻止「了解」抢走它）。

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
let kept = 0;

for (const line of lines) {
  if (!line || line.startsWith("#")) continue;
  const at = line.indexOf(":");
  if (at < 0) continue;
  const word = line.slice(0, at).trim();
  const pinyin = line.slice(at + 1).trim().replace(/\s+/g, " ");
  const chars = [...word];
  if (chars.length !== 2 || !chars.every(isHanzi)) continue;
  if (pinyin.split(" ").length !== 2) continue;
  if (!chars.some((ch) => lookupPinyin(ch).length >= 2)) continue;
  if (dict[word]) continue; // 重复词条取首见
  dict[word] = pinyin;
  kept += 1;
}

const header = `// 由 scripts/build-phrase-pinyin.mjs 生成，请勿手改。
// 数据源：mozillazg/phrase-pinyin-data（MIT）。二字词 → 拼音，仅含带多音字的词条。
// 共 ${kept} 条。供 core.js 的多音字按词定音（看前后一个字组词后匹配）。
`;
writeFileSync(new URL("../vendor/data-phrases.js", import.meta.url), `${header}window.zPhrasePinyin = ${JSON.stringify(dict)};\n`);
console.log(`kept ${kept} 条二字多音词`);
