// apply 전 최종 검수 — 각 건 사건명·주문 앞부분 + 2012후726 한자 포함 구간 길게.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REPORT = JSON.parse(readFileSync(resolve("tmp/law-api-import-report.json"), "utf-8"));
const RAW = resolve("tmp/law-api-raw");

function pickTag(xml, tag) {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  return m ? m[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim() : null;
}
// 첫 【주 ... 문】 단락 끝까지.
function headThroughJumun(t) {
  const m = /[\s\S]*?【주[\s ]*문】[\s\S]*?(?=\n【)/.exec(t);
  return m ? m[0] : t.slice(0, 600);
}

console.log(`\n=== apply 전 최종 검수 — 4건 ===\n`);
for (const u of REPORT.upgrade) {
  const svc = existsSync(resolve(RAW, `${u.serialId}.service.xml`))
    ? readFileSync(resolve(RAW, `${u.serialId}.service.xml`), "utf-8")
    : "";
  const sagimyeong = pickTag(svc, "사건명");
  const court = pickTag(svc, "법원명");
  const date = pickTag(svc, "선고일자");
  const text = u.apply.official_text_md;
  const head = headThroughJumun(text);
  const hanjaCount = (text.match(/[一-鿿]/g) ?? []).length;

  console.log(`────────────────────────────────────────`);
  console.log(`[${u.inputToken}]  ${court} ${date}`);
  console.log(`사건명: ${sagimyeong}`);
  console.log(`전문 ${text.length}자 / 한자 ${hanjaCount}자`);
  console.log(``);
  console.log(head);
  console.log(``);
}

// 2012후726 한자 포함 구간 — 한자 등장 위치 찾아 ±200자 컨텍스트로 발췌.
const TARGET = REPORT.upgrade.find((x) => x.inputToken === "2012후726");
if (TARGET) {
  const text = TARGET.apply.official_text_md;
  const HANJA_RE = /[一-鿿]/g;
  const matches = [...text.matchAll(HANJA_RE)];

  console.log(`\n=== 2012후726 — 한자 위치 분석 ===\n`);
  console.log(`총 한자 ${matches.length}자`);

  if (matches.length === 0) {
    console.log(`(본문에 한자 없음 — 모범답안이 한글 위주)`);
    console.log(`\n=== 2012후726 전문 마지막 1,500자 (한글 위주여도 본문 온전성 확인용) ===\n`);
    console.log(text.slice(-1500));
  } else {
    // 한자 등장 구간을 클러스터링 (인접 50자 이내 묶음).
    const clusters = [];
    for (const m of matches) {
      const idx = m.index ?? 0;
      const last = clusters[clusters.length - 1];
      if (last && idx - last.end < 50) {
        last.end = idx;
        last.count += 1;
      } else {
        clusters.push({ start: idx, end: idx, count: 1 });
      }
    }
    // 한자가 가장 많이 모인 클러스터 1개.
    clusters.sort((a, b) => b.count - a.count);
    const top = clusters[0];
    const ctxStart = Math.max(0, top.start - 200);
    const ctxEnd = Math.min(text.length, top.end + 300);
    console.log(`최다 클러스터: 한자 ${top.count}자 (위치 ${top.start}~${top.end}), 컨텍스트 ${ctxStart}~${ctxEnd}\n`);
    console.log(text.slice(ctxStart, ctxEnd));
    console.log(`\n  ◆ 한자 글자: ${[...new Set([...top.start === top.end ? [text[top.start]] : text.slice(top.start, top.end + 1).match(HANJA_RE) ?? []])].join(" ")}`);
  }
}
