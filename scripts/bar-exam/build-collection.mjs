// 변호사시험 선택과목 «지적재산권법» 기출 자료집 생성.
//
// 입력: extract-ip.mjs 가 뽑은 회차별 본문 + fetch-cited-articles.mjs 의 조문 원문.
// 출력: 마크다운 자료집 1개.
//
// ★해설의 범위 — 법무부는 사례형 채점기준·모범답안을 공개하지 않는다. 즉 "공식 해설"
//   이라는 것이 존재하지 않는다. 그래서 이 자료집은 **검증 가능한 것만** 싣는다:
//     ① 문제 원문(법무부 원본 그대로)  ② 설문이 명시한 조문의 현행 원문
//     ③ 설문을 그대로 옮긴 쟁점 목록
//   법리 서술(요건 목록·학설 대립·판례의 태도)과 사건번호는 넣지 않는다 — 근거 없는
//   단정을 만들지 않기 위해서다(CLAUDE.md 금지 11·12).
//
//   node scripts/bar-exam/build-collection.mjs <기출텍스트디렉터리> <cited.json> <출력.md>
import fs from "node:fs";
import path from "node:path";

/** 영역 판정 신호 — 조문 인용이 없는 회차(초기)도 갈라야 한다. */
const AREA_SIGNALS = [
  ["특허법", ["특허", "발명", "진보성", "신규성", "청구항", "청구범위", "명세서", "출원", "균등"]],
  ["저작권법", ["저작", "복제", "공표", "저작물", "실연", "공중송신", "각색", "2차적"]],
  ["상표법", ["상표", "지정상품", "식별력", "상품표지", "서비스표"]],
  ["디자인보호법", ["디자인등록", "디자인권", "디자인보호법"]],
  ["부정경쟁방지법", ["부정경쟁", "영업비밀"]],
];

/**
 * 출제영역 — **주 영역 하나만** 붙인다.
 * ★보조 영역을 같이 달면 오히려 틀린다. 3회 제2문의 "상표법" 은 교재 목차를 묘사한
 *   지문("특허법-상표법-저작권법의 순서로")과 논문 제목에서 나온 말이고, 물어보는 것은
 *   전부 저작권법이다. 신호 분포를 보면 전 회차에서 1위가 2위를 압도한다(최소 7:2).
 */
function classify(text) {
  const scored = AREA_SIGNALS.map(([area, kws]) => [
    area,
    kws.reduce((n, k) => n + (text.split(k).length - 1), 0),
  ])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  return scored.length ? scored[0][0] : "미분류";
}

/**
 * 문(問)의 배점 합계.
 *
 * ★단순히 (N점)을 다 더하면 틀린다 — 상위 설문의 배점이 하위 설문의 합인 경우가 있다.
 *   판별 기준은 **위치**다.
 *     · 줄 끝의 배점  = 그 설문 전체의 총점 → 하위 배점과 겹치므로 하위를 빼야 한다
 *       (2회 "3. …답하시오. (40점)" 아래 (1)30점 (2)10점)
 *     · 문장 중간 배점 = 그 대목만의 배점 → 하위와 겹치지 않는다
 *       (3회 "2. …법리를 논하고(20점), 아래 각 사례…" 아래 (1)5 (2)8 (3)7 → 20+20)
 */
function totalPoints(lines) {
  const pts = (l) => [...l.matchAll(/\(\s*(\d+)\s*점\s*\)/g)].map((m) => Number(m[1]));
  const isTop = (l) => /^\d+\s*\./.test(l);
  const trailing = (l) => /\(\s*\d+\s*점\s*\)\s*[.。]?\s*$/.test(l);

  let total = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const p = pts(line);
    if (!p.length) continue;
    total += p.reduce((a, b) => a + b, 0);
    if (!isTop(line) || !trailing(line)) continue;
    // 줄 끝 배점을 가진 상위 설문 — 바로 아래 하위 설문들의 합이 같으면 중복이다.
    const kids = [];
    for (let j = i + 1; j < lines.length && !isTop(lines[j]); j++) kids.push(...pts(lines[j]));
    const kidSum = kids.reduce((a, b) => a + b, 0);
    if (kids.length && kidSum === p[p.length - 1]) total -= kidSum;
  }
  return total;
}

/**
 * 조문 표기 — 가지번호는 "제35조의3" 이지 "제35의3조" 가 아니다.
 * ★API 의 조문키는 "35의3" 형태라 그대로 `제${n}조` 에 끼우면 틀린 표기가 나온다.
 */
const artLabel = (num) => {
  const m = String(num).match(/^(\d+)의(\d+)$/);
  return m ? `제${m[1]}조의${m[2]}` : `제${num}조`;
};

/** 지문(사실관계)과 설문(번호 붙은 물음)을 가른다 — 같은 내용을 두 번 싣지 않기 위해. */
function splitFacts(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const at = lines.findIndex((l) => /^\d+\s*\./.test(l));
  return at < 0
    ? { facts: lines, asked: [] }
    : { facts: lines.slice(0, at), asked: lines.slice(at) };
}

/** 본문 → 문(問) 블록. 〈제 1 문〉 / 〈제1문의 1〉 두 표기를 함께 받는다. */
function splitQuestions(body) {
  const re = /〈\s*제\s*(\d)\s*문(?:\s*의\s*(\d))?\s*〉/g;
  const marks = [...body.matchAll(re)].map((m) => ({
    at: m.index,
    label: m[2] ? `제${m[1]}문의 ${m[2]}` : `제${m[1]}문`,
    main: Number(m[1]),
  }));
  return marks.map((mk, i) => ({
    ...mk,
    text: body.slice(mk.at + body.slice(mk.at).indexOf("〉") + 1, marks[i + 1]?.at ?? body.length).trim(),
  }));
}

/** 설문(번호 + 배점) 추출 — 배점이 붙은 줄만 센다. */
function subQuestions(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /\(\s*\d+\s*점\s*\)/.test(l))
    .map((l) => {
      const pt = Number(l.match(/\(\s*(\d+)\s*점\s*\)\s*$/)?.[1] ?? 0);
      return { text: l, points: pt };
    });
}

const [, , inDir, citedFile, outFile] = process.argv;
if (!inDir || !citedFile || !outFile) {
  console.error("사용: node scripts/bar-exam/build-collection.mjs <디렉터리> <cited.json> <출력.md>");
  process.exit(1);
}
const cited = JSON.parse(fs.readFileSync(citedFile, "utf8"));

const rounds = [];
for (const f of fs.readdirSync(inDir).filter((f) => /^\d+\.txt$/.test(f)).sort()) {
  const body = fs.readFileSync(path.join(inDir, f), "utf8");
  const round = Number(f.replace(".txt", ""));
  const year = Number(body.match(/(\d{4})년도/)?.[1] ?? 0);
  const qs = splitQuestions(body).map((q) => ({
    ...q,
    area: classify(q.text),
    subs: subQuestions(q.text),
    points: totalPoints(q.text.split("\n").map((l) => l.trim())),
  }));
  rounds.push({ round, year, qs, cites: cited.byRound[round] ?? [] });
}

// ── 검토용 표 ───────────────────────────────────────────────────────────
console.log("회차  연도  문           영역                배점   설문");
for (const r of rounds) {
  for (const q of r.qs) {
    console.log(
      `제${String(r.round).padStart(2)}회 ${r.year} ${q.label.padEnd(10)} ` +
        `${q.area.padEnd(14)} ${String(q.points).padStart(4)}점 ${String(q.subs.length).padStart(2)}개`,
    );
  }
}

// ── 배점 검산 — 제N문은 80점, 회차 합계는 160점 ─────────────────────────
// ★8·9회는 제1문이 「제1문의 1·2」로 쪼개져 있다. 그래서 문 단위가 아니라
//   **제N문 묶음**으로 더해야 한다(50+30, 40+40 → 각 80).
let pointFail = 0;
for (const r of rounds) {
  for (const main of [1, 2]) {
    const group = r.qs.filter((q) => q.main === main);
    if (!group.length) continue;
    const sum = group.reduce((a, q) => a + q.points, 0);
    if (sum !== 80) {
      pointFail += 1;
      console.log(`  ★제${r.round}회 제${main}문 배점 ${sum} (80 아님) — 확인 필요`);
    }
  }
  const tot = r.qs.reduce((a, q) => a + q.points, 0);
  if (tot !== 160) {
    pointFail += 1;
    console.log(`  ★제${r.round}회 총 배점 ${tot} (160 아님) — 확인 필요`);
  }
}
console.log(pointFail ? `\n배점 검산 실패 ${pointFail}건` : "\n배점 검산: 전 회차 제1문 80 · 제2문 80 · 합계 160 ✓");

// ── 마크다운 ────────────────────────────────────────────────────────────
const L = [];
L.push("# 변호사시험 선택과목 «지적재산권법» 기출 자료집");
L.push("");
L.push("**제1회(2012) ~ 제15회(2026) · 전 15회차 · 사례형 30문**");
L.push("");
L.push("## 이 자료집에 대하여");
L.push("");
L.push("- **문제 원문**은 법무부가 공개한 선택과목 문제지에서 그대로 옮겼습니다. 손대지 않았습니다.");
L.push("  출처: 법무부 「변호사시험 기출문제」 (공공누리 제1유형 · 출처표시).");
L.push("- **해설의 범위에 한계가 있습니다.** 법무부는 사례형의 채점기준표와 모범답안을 공개하지");
L.push("  않습니다. 즉 이 시험에는 *공식 해설이 존재하지 않습니다*. 그래서 이 자료집은 근거를");
L.push("  댈 수 있는 것만 싣습니다 — ① 문제 원문, ② 설문이 스스로 지목한 **조문의 현행 원문**,");
L.push("  ③ 설문을 그대로 옮긴 쟁점. 요건 목록·학설 대립·「판례의 태도」 같은 서술과 사건번호는");
L.push("  넣지 않았습니다. 근거 없이 그럴듯한 법리를 만들어 두면 그대로 잘못 외우게 됩니다.");
L.push("- **조문은 현행법 기준**입니다(시행일은 부록에 적었습니다). 기출이라도 현행법으로 푸는 것이");
L.push("  수험 목적에 맞고, 출제 당시와 조문이 달라진 경우는 그 자체가 학습 포인트입니다.");
L.push("");

// 개관 표
L.push("## 한눈에 보기");
L.push("");
L.push("| 회차 | 연도 | 제1문 | 제2문 | 설문 수 | 인용 조문 |");
L.push("|---|---|---|---|---|---|");
for (const r of rounds) {
  const byMain = [1, 2].map((n) => {
    const qs = r.qs.filter((q) => q.main === n);
    return qs.length ? [...new Set(qs.map((q) => q.area))].join(" · ") : "—";
  });
  const nSub = r.qs.reduce((a, q) => a + q.subs.length, 0);
  const cites = r.cites.length
    ? [...new Set(r.cites.map((c) => c.law))]
        .map((law) => `${law} ${r.cites.filter((c) => c.law === law).map((c) => artLabel(c.article)).join("·")}`)
        .join(" / ")
    : "—";
  L.push(`| 제${r.round}회 | ${r.year} | ${byMain[0]} | ${byMain[1]} | ${nSub} | ${cites} |`);
}
L.push("");

// ── 출제 논점 빈도 ──────────────────────────────────────────────────────
// ★법리를 해설하는 게 아니라 **문제 원문에 실제로 등장한 말**을 세는 것이다.
//   근거는 전부 지문·설문 자신이므로 지어낼 여지가 없다. 세는 범위는 설문(물음) 쪽으로
//   한정한다 — 사실관계에 스치듯 나온 낱말까지 세면 출제 논점이 부풀려진다.
const TOPICS = [
  ["특허법", "신규성", ["신규성"]],
  ["특허법", "진보성", ["진보성"]],
  ["특허법", "신규성 상실의 예외(공지예외)", ["신규성 상실 예외", "신규성 상실의 예외", "공지예외"]],
  ["특허법", "발명자·공동발명", ["공동발명", "발명자가 될", "발명자에 해당"]],
  ["특허법", "직무발명", ["직무발명"]],
  ["특허법", "특허를 받을 수 있는 권리·승계", ["특허를 받을 수 있는 권리"]],
  ["특허법", "침해금지·손해배상 청구", ["침해금지", "손해배상"]],
  ["특허법", "균등침해", ["균등"]],
  ["특허법", "무효심판·무효항변", ["등록무효", "무효심판", "무효의 항변", "특허무효"]],
  ["특허법", "권리남용", ["권리남용"]],
  ["특허법", "실시권(전용·통상)", ["전용실시권", "통상실시권"]],
  ["특허법", "이용·저촉관계", ["이용관계", "저촉"]],
  ["특허법", "선출원·확대된 선원", ["선출원", "확대된 선원"]],
  ["특허법", "정정", ["정정심판", "정정청구"]],
  ["저작권법", "저작물성·창작성", ["창작성", "저작물인지", "저작물에 해당"]],
  ["저작권법", "2차적저작물", ["2차적"]],
  ["저작권법", "업무상저작물", ["업무상 저작물", "업무상저작물"]],
  ["저작권법", "저작인격권", ["저작인격권", "성명표시권", "동일성유지권", "공표권"]],
  ["저작권법", "저작재산권 제한·공정이용", ["공정한 이용", "제35조의5", "제28조"]],
  ["저작권법", "인용", ["인용"]],
  ["저작권법", "사적이용을 위한 복제", ["사적이용", "사적 이용"]],
  ["저작권법", "영상저작물 특례", ["영상저작물"]],
  ["저작권법", "편집저작물·데이터베이스", ["편집저작물", "데이터베이스"]],
  ["저작권법", "실연자·저작인접권", ["실연자", "저작인접권"]],
  ["저작권법", "공동저작물", ["공동저작물"]],
];
const topicRows = TOPICS.map(([law, name, kws]) => {
  const hits = rounds.filter((r) =>
    r.qs.some((q) => {
      const asked = splitFacts(q.text).asked.join("\n");
      return kws.some((k) => asked.includes(k));
    }),
  ).map((r) => r.round);
  return { law, name, hits };
})
  .filter((t) => t.hits.length >= 2)
  .sort((a, b) => b.hits.length - a.hits.length || a.law.localeCompare(b.law));

L.push("## 출제 논점 빈도 (2회 이상 나온 것)");
L.push("");
L.push("문제 원문의 **설문**에 실제로 등장한 표현을 센 것입니다. 법리를 해설한 것이 아니라");
L.push("어떤 말이 몇 번 나왔는지를 집계했을 뿐이므로, 어느 논점이 반복되는지 보는 용도로만 쓰세요.");
L.push("");
L.push("| 법 | 논점 | 회차 | 출제 |");
L.push("|---|---|---|---|");
for (const t of topicRows) {
  L.push(`| ${t.law} | ${t.name} | ${t.hits.length}회 | ${t.hits.map((h) => `${h}`).join(", ")} |`);
}
L.push("");

// 회차별 본문 — 최신 회차부터
L.push("## 회차별 기출");
L.push("");
for (const r of [...rounds].reverse()) {
  L.push(`### 제${r.round}회 (${r.year}년 시행)`);
  L.push("");
  for (const q of r.qs) {
    L.push(`#### ${q.label} — ${q.area} (${q.points}점)`);
    L.push("");
    const { facts, asked } = splitFacts(q.text);
    if (facts.length) {
      L.push("**사실관계**");
      L.push("");
      for (const line of facts) L.push(`> ${line}`);
      L.push("");
    }
    if (asked.length) {
      L.push("**설문**");
      L.push("");
      // 배점 표기는 원문 그대로 둔다 — 문장 중간에 붙은 경우가 있어 떼면 뜻이 흐려진다.
      for (const line of asked) L.push(`> ${line}`);
      L.push("");
    }
    const qCites = r.cites.filter((c) => q.text.includes(artLabel(c.article)));
    if (qCites.length) {
      L.push(
        "**설문이 지목한 조문** — " +
          qCites.map((c) => `${c.law} ${artLabel(c.article)}`).join(", ") +
          " (원문은 부록)",
      );
      L.push("");
    }
  }
}

// 부록 — 조문 원문
L.push("## 부록. 인용 조문 원문 (현행)");
L.push("");
L.push("설문이 직접 지목한 조문만 실었습니다. 국가법령정보센터 현행 조문 그대로입니다.");
L.push("");
for (const [law, data] of Object.entries(cited.laws)) {
  const d = String(data.enforcedAt ?? "");
  const ymd = /^\d{8}$/.test(d) ? `${d.slice(0, 4)}. ${d.slice(4, 6)}. ${d.slice(6)}.` : "—";
  L.push(`### ${law}`);
  L.push("");
  L.push(`시행 ${ymd} 기준.`);
  L.push("");
  for (const [num, body] of Object.entries(data.articles)) {
    L.push(`**${artLabel(num)}**`);
    L.push("");
    L.push("```");
    L.push(body);
    L.push("```");
    L.push("");
  }
}
L.push("---");
L.push("");
L.push("문제 원문 © 법무부 · 공공누리 제1유형(출처표시). 조문 원문: 국가법령정보센터.");
L.push("");

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, L.join("\n"), "utf8");

// 같은 데이터를 JSON 으로도 남긴다 — 웹 자료집(build-html.mjs)이 이걸 읽는다.
// 두 산출물이 서로 다른 파싱을 하면 언젠가 어긋난다.
const dataFile = outFile.replace(/\.md$/, ".json");
fs.writeFileSync(
  dataFile,
  JSON.stringify(
    {
      rounds: rounds.map((r) => ({
        round: r.round,
        year: r.year,
        cites: r.cites,
        qs: r.qs.map((q) => ({
          label: q.label,
          main: q.main,
          area: q.area,
          points: q.points,
          ...splitFacts(q.text),
          cites: r.cites.filter((c) => q.text.includes(artLabel(c.article))),
        })),
      })),
      topics: topicRows,
      laws: cited.laws,
    },
    null,
    2,
  ),
  "utf8",
);
console.log(`데이터:   ${dataFile}`);
const chars = L.join("\n").length;
console.log(`\n자료집: ${outFile} (${chars.toLocaleString()}자)`);
