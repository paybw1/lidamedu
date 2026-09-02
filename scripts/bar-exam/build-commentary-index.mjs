// 수집한 외부 해설·총평의 **색인** 생성.
//
// ★색인에는 법리를 옮겨 적지 않는다. "이 자료가 무엇을 다루는가" 까지만 쓴다.
//   사건번호도 색인에 올리지 않는다 — 우리 문서에 사건번호가 들어오는 순간
//   4곳 검증 규칙이 붙는다(CLAUDE.md 금지 12). 번호는 원문 파일 안에 남겨 둔다.
//
//   node scripts/bar-exam/build-commentary-index.mjs <참조자료디렉터리> <출력.md>
import fs from "node:fs";
import path from "node:path";

const [, , srcDir, outFile] = process.argv;
if (!srcDir || !outFile) {
  console.error("사용: node scripts/bar-exam/build-commentary-index.mjs <디렉터리> <출력.md>");
  process.exit(1);
}
const man = JSON.parse(fs.readFileSync(path.join(srcDir, "_manifest.json"), "utf8"));
const rel = path.relative(path.dirname(outFile), srcDir).replace(/\\/g, "/");

/** 열람은 되지만 본문을 가져올 수 없는 것 — 있다는 사실 자체가 정보다. */
const GATED = [
  {
    round: 5,
    site: "메가로이어스",
    title: "제 5회 변호사시험 지적재산권법 총평 및 해설",
    url: "https://www.megalawyers.co.kr/prof/prof_notice_view.asp?idx=196&bCode=iplaw&sub_cd=23",
    note: "본문은 4줄 안내문뿐. 상세 해설은 첨부 PDF(196_2016011970_01.pdf)이며 **로그인 필요**. 같은 필자의 법률저널 제5회 총평이 같은 내용을 더 길게 담고 있어 그쪽을 받아 두었다.",
  },
];

const L = [];
L.push("# 변호사시험 지적재산권법 — 외부 해설·총평 참조자료 색인");
L.push("");
L.push("> **내부 참조용.** 해설을 우리 손으로 다시 쓸 때 참조하려고 모은 것입니다.");
L.push("> 저작권은 각 매체·필자에게 있으므로 **외부 공개·재배포하지 않습니다.**");
L.push("> 원문은 `" + rel + "/` 에 수집 당시 그대로 보관돼 있습니다.");
L.push("");
L.push("## 이 자료의 지위");
L.push("");
L.push("여기 모인 글은 **참조 자료이지 근거가 아닙니다.** 해설을 쓸 때는 다음이 그대로 적용됩니다.");
L.push("");
L.push("- 이 자료들이 인용한 **사건번호는 그대로 옮기지 않습니다.** 네 곳(`cases` · `case_lower_courts` ·");
L.push("  리담 교재 · 국가법령정보센터 정확일치)에서 확인된 것만 씁니다.");
L.push("- 「판례의 태도는 ~이다」, 「통설은 ~이다」 같은 단정형 서술은 **교재에서 해당 대목을**");
L.push("  **찾은 범위에서만** 씁니다. 남의 해설에 그렇게 쓰여 있다는 것은 근거가 아닙니다.");
L.push("- 문장을 옮겨 쓰지 않습니다. 논점의 얼개를 참고하고 서술은 우리가 새로 씁니다.");
L.push("");

// ── 수집 현황 ──────────────────────────────────────────────────────────
L.push("## 수집한 자료");
L.push("");
L.push("| 회차 | 연도 | 출처 | 필자 | 게재일 | 분량 | 다루는 범위 | 파일 |");
L.push("|---|---|---|---|---|---|---|---|");
for (const m of man) {
  const scope = m.covers.q2 ? "제1문 · 제2문" : "제1문(특허법)";
  L.push(
    `| 제${m.round}회 | ${m.year} | [${m.site}](${m.url}) | ${m.author} | ${m.date} | ` +
      `${m.chars.toLocaleString()}자 | ${scope} | \`${m.file}\` |`,
  );
}
L.push("");

// ── 커버리지 ───────────────────────────────────────────────────────────
const byRound = new Map();
for (const m of man) {
  if (!byRound.has(m.round)) byRound.set(m.round, []);
  byRound.get(m.round).push(m);
}
L.push("## 회차별 커버리지");
L.push("");
L.push("★**제2문(저작권법) 해설이 거의 없습니다.** 연재물인 법률저널 「전문가 해설」(홍기석)은");
L.push("특허법 전문강사가 쓰는 글이라 **제1문만** 다룹니다. 저작권법까지 다룬 것은 제5·6회 총평뿐입니다.");
L.push("");
L.push("| 회차 | 연도 | 제1문(특허법) | 제2문(저작권법) | 자료 수 |");
L.push("|---|---|---|---|---|");
for (let r = 15; r >= 1; r--) {
  const items = byRound.get(r) ?? [];
  const q1 = items.some((i) => i.covers.q1);
  const q2 = items.some((i) => i.covers.q2);
  const year = items[0]?.year ?? 2011 + r;
  L.push(`| 제${r}회 | ${year} | ${q1 ? "✅" : "—"} | ${q2 ? "✅" : "—"} | ${items.length || "—"} |`);
}
L.push("");

// ── 찾다가 확인한 것 ───────────────────────────────────────────────────
L.push("## 찾다가 확인한 것 (다시 찾지 않도록 남깁니다)");
L.push("");
L.push("- **법률신문에는 지적재산권법 해설이 없습니다.** 「변호사시험 해설」 섹션을 연재하지만");
L.push("  대상이 **필수과목뿐**입니다(민법·형법·행정법 등). 선택과목은 다루지 않습니다.");
L.push("- **제15회(2026) 지적재산권법 해설은 아직 나오지 않았습니다.** 법률저널에서 「제15회");
L.push("  변호사시험」으로 검색하면 합격률·제도 기사만 나오고, 연재 필자의 글 목록에도 제15회가");
L.push("  없습니다. 시험이 2026년 1월이라 나올 여지는 있으니 뒤에 다시 확인할 만합니다.");
L.push("- **제1~4회·제7~9회는 찾지 못했습니다.** 법률저널 연재는 제10회부터 시작했고, 그 앞으로는");
L.push("  제5·6회 총평만 있습니다.");
L.push("");
L.push("### 열람 제한 자료");
L.push("");
for (const g of GATED) {
  L.push(`- 제${g.round}회 · [${g.site} 「${g.title}」](${g.url}) — ${g.note}`);
}
L.push("");
L.push("---");
L.push("");
L.push(`수집일 ${man[0]?.fetchedAt ?? ""} · 자료 ${man.length}건. 다시 받으려면:`);
L.push("");
L.push("```bash");
L.push("node scripts/bar-exam/fetch-commentary.mjs \"source/변호사시험-지적재산권법-참조자료\"");
L.push("node scripts/bar-exam/build-commentary-index.mjs \"source/변호사시험-지적재산권법-참조자료\" \\");
L.push("  docs/bar-exam/참조자료-색인.md");
L.push("```");
L.push("");

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, L.join("\n"), "utf8");

const q1 = [...byRound.values()].filter((v) => v.some((i) => i.covers.q1)).length;
const q2 = [...byRound.values()].filter((v) => v.some((i) => i.covers.q2)).length;
console.log(`색인: ${outFile}`);
console.log(`  자료 ${man.length}건 · 제1문 해설 ${q1}개 회차 · 제2문 해설 ${q2}개 회차 (전 15회차 중)`);
