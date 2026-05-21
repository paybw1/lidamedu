// 리담특허법판례 hwpx → 텍스트(+`<u>` 밑줄 마커) 변환기.
// 출력: source/_converted/precedents_raw_with_underline.txt
//
// 알고리즘:
//   1) header.xml 에서 underLine type != "NONE" 인 hh:charPr id 집합 추출
//   2) section0.xml 의 hp:p 를 순회. 각 paragraph 의 hp:run 토큰을 in-order 로 읽어
//      텍스트와 line-break, charPr underline transition 을 합성해 한 line(들) 출력
//   3) 연속된 underline run 은 `<u>...</u>` 한 묶음으로 처리 — `</u><u>` 가 생기지 않게
//   4) line-break 가 underline 한가운데 있으면 underline 을 닫고 다음 행으로
//   5) HTML 엔티티 디코딩. `▪`(LOZENGE) 는 그대로 — 기존 parser 가 단락 시작 마커로 사용
//
// 사용:
//   node scripts/precedents/hwpx-to-text-underline.mjs <hwpx-path> [out-path]

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const hwpxPath = resolve(
  process.argv[2] ?? "source/리담특허법판례_최종_20260521.hwpx",
);
const outPath = resolve(
  process.argv[3] ?? "source/_converted/precedents_raw_with_underline.txt",
);

// unzip 한 임시 디렉토리 — git bash 의 unzip 사용.
const work = mkdtempSync(join(tmpdir(), "hwpx-"));
try {
  execFileSync("unzip", ["-o", hwpxPath, "-d", work], { stdio: "ignore" });
} catch (e) {
  console.error("unzip 실패:", e.message);
  process.exit(1);
}

const header = readFileSync(join(work, "Contents/header.xml"), "utf-8");
const section = readFileSync(join(work, "Contents/section0.xml"), "utf-8");
rmSync(work, { recursive: true, force: true });

// 1) underline charPr id 집합
const ulIds = new Set();
const charPrRe = /<hh:charPr\s+([^>]*?)>([\s\S]*?)<\/hh:charPr>/g;
let cm;
while ((cm = charPrRe.exec(header)) !== null) {
  const idM = /\bid="(\d+)"/.exec(cm[1]);
  if (!idM) continue;
  const uM = /<hh:underline\s+type="([^"]+)"/.exec(cm[2]);
  if (uM && uM[1] !== "NONE") ulIds.add(Number(idM[1]));
}

// 2) 엔티티 디코드 — XML 기본 5종만. cases-import-entity-cleanup 메모에 따라
//    HWP 가 내보내는 일부 숫자 엔티티는 별도 정정 단계가 필요할 수 있으나,
//    여기서는 hwpx 가 표준 UTF-8 이라 거의 발생하지 않는다(필요 시 후속 step 으로 처리).
function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

// 2-bis) hp:t 안에 nested 된 inline element 정리.
//   hp:tab → \t, hp:fwSpace → " ", hp:lineBreak → \n, 그 외 알려지지 않은 self-closing
//   hp:* element 는 제거. (각주 hp:fn 본문 자체는 별도 처리 영역이라 본문 줄에서 제외)
function postCleanInlineTags(s) {
  return s
    .replace(/<hp:tab[^>]*\/>/g, "\t")
    .replace(/<hp:fwSpace\s*\/>/g, " ")
    .replace(/<hp:lineBreak\s*\/>/g, "\n")
    .replace(/<hp:fn[\s\S]*?<\/hp:fn>/g, "") // 각주는 inline 으로 제거 (본문 가독성 우선)
    .replace(/<hp:[^/>]+\/>/g, "");
}

// 3) hp:run body 를 in-order 토큰화
function tokenizeRunBody(body) {
  const re =
    /<hp:t[^>]*>([\s\S]*?)<\/hp:t>|<hp:lineBreak\s*\/>|<hp:tab[^>]*\/>/g;
  const out = [];
  let mm;
  while ((mm = re.exec(body)) !== null) {
    if (mm[1] !== undefined)
      out.push({ k: "t", text: decodeEntities(postCleanInlineTags(mm[1])) });
    else if (mm[0].includes("lineBreak")) out.push({ k: "br" });
    else if (mm[0].includes("tab")) out.push({ k: "tab" });
  }
  return out;
}

// 4) hp:p 순회 — paragraph 텍스트 (+ `<u>` 마커) 산출
//    leaf-only 매칭: body 안에 다시 hp:p 가 나오면 종료. 표(hp:tr/hp:tc) 안의 cell
//    paragraph 까지 모두 별도 line 으로 추출되고, 그것을 감싸는 outer paragraph 는
//    매칭 실패해 자연스럽게 skip 된다.
const pRe = /<hp:p\b[^>]*>((?:(?!<\/?hp:p\b)[\s\S])*?)<\/hp:p>/g;
const runRe = /<hp:run\s+charPrIDRef="(\d+)"[^>]*>([\s\S]*?)<\/hp:run>/g;

const lines = [];
let pm;
let ulRunCount = 0;
let ulCharCount = 0;
let totalCharCount = 0;

while ((pm = pRe.exec(section)) !== null) {
  const inner = pm[1];
  // 한 paragraph 안에 sub-line 이 생기면 \n 으로 split 해서 push
  let buf = "";
  let inU = false;
  function flushSubLine() {
    if (inU) {
      buf += "</u>";
      inU = false;
    }
    lines.push(buf);
    buf = "";
  }
  let rm;
  runRe.lastIndex = 0;
  while ((rm = runRe.exec(inner)) !== null) {
    const cid = Number(rm[1]);
    const body = rm[2];
    const isU = ulIds.has(cid);
    if (isU) ulRunCount++;
    const toks = tokenizeRunBody(body);
    for (const t of toks) {
      if (t.k === "t") {
        if (!t.text) continue;
        if (isU !== inU) {
          buf += inU ? "</u>" : "<u>";
          inU = isU;
        }
        buf += t.text;
        totalCharCount += t.text.length;
        if (isU) ulCharCount += t.text.length;
      } else if (t.k === "br") {
        // line break — 현재 라인 종료
        flushSubLine();
      } else if (t.k === "tab") {
        if (inU) {
          buf += "</u>";
          inU = false;
        }
        buf += "\t";
      }
    }
  }
  if (inU) {
    buf += "</u>";
    inU = false;
  }
  lines.push(buf);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, lines.join("\n"), "utf-8");

console.log(`hwpx     : ${hwpxPath}`);
console.log(`out      : ${outPath}`);
console.log(`paragraphs (lines incl. empty): ${lines.length}`);
console.log(`underline charPr ids         : ${ulIds.size}`);
console.log(`underline run hits           : ${ulRunCount}`);
console.log(
  `underline chars              : ${ulCharCount} / ${totalCharCount}` +
    ` (${((ulCharCount / Math.max(1, totalCharCount)) * 100).toFixed(2)}%)`,
);
