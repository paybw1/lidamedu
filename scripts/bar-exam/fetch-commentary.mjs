// 변호사시험 지적재산권법 **외부 해설·총평** 수집 (내부 참조용).
//
// 용도: 해설을 우리 손으로 다시 쓸 때 참조할 원문을 모아 둔다. 재배포용이 아니다.
//
// ★요약하지 않고 원문 그대로 받는다. 페이지를 모델에 요약시키면 그 요약이 곧 환각
//   표면이 된다 — 실제로 메가로이어스 목록을 요약으로 읽었을 때 제목이
//   「불합격에 대응하는 방법」 → 「객체의 포함되는 경우」로 바뀌어 나왔다.
//   그래서 HTML 을 직접 받아 태그만 걷어낸다(모델 개입 0).
// ★인코딩이 사이트마다 다르다 — 법률저널 UTF-8, 메가로이어스 EUC-KR.
//
//   node scripts/bar-exam/fetch-commentary.mjs <출력디렉터리>
import fs from "node:fs";
import path from "node:path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/**
 * 수집 대상. 회차별 커버리지는 index 에 그대로 적는다.
 * ★38523(제3회 «모의시험» 출제경향)은 넣지 않는다 — 실제 제3회 기출이 아니다.
 *   회차 칸에 끼워 넣으면 딱 이 프로젝트가 막으려는 종류의 오식별이 된다.
 */
const SOURCES = [
  // ── 법률저널 — 홍기석 「전문가 해설」 연재 (설문별 논점까지 다룬다) ────
  { round: 14, year: 2025, site: "법률저널", author: "홍기석", date: "2025-01-20",
    title: "2025년 제14회 변호사시험 지적재산권법 전문가 해설",
    url: "https://www.lec.co.kr/news/articleView.html?idxno=749242", kind: "lec" },
  { round: 13, year: 2024, site: "법률저널", author: "홍기석", date: "2024-01-16",
    title: "2024년 제13회 변호사시험 지적재산권법 전문가 해설",
    url: "https://www.lec.co.kr/news/articleView.html?idxno=745464", kind: "lec" },
  { round: 12, year: 2023, site: "법률저널", author: "홍기석", date: "2023-01-18",
    title: "2023년 제12회 변호사시험 지적재산권법 전문가 해설",
    url: "https://www.lec.co.kr/news/articleView.html?idxno=741759", kind: "lec" },
  { round: 11, year: 2022, site: "법률저널", author: "홍기석", date: "2022-01-19",
    title: "2022년 제11회 변호사시험 지적재산권법 전문가 해설",
    url: "https://www.lec.co.kr/news/articleView.html?idxno=733662", kind: "lec" },
  { round: 10, year: 2021, site: "법률저널", author: "이성진 기자", date: "2021-01-19",
    title: "2021년 제10회 변호사시험 지적재산권법 전문가 해설",
    url: "https://www.lec.co.kr/news/articleView.html?idxno=724865", kind: "lec" },
  // ── 법률저널 — 제5회 총평 ─────────────────────────────────────────────
  { round: 5, year: 2016, site: "법률저널", author: "정현석", date: "2016-01-15",
    title: "제5회 변호사시험 전문가 총평 및 해설-지적재산권법",
    url: "https://www.lec.co.kr/news/articleView.html?idxno=39323", kind: "lec" },
  // ── 메가로이어스 ──────────────────────────────────────────────────────
  { round: 6, year: 2017, site: "메가로이어스", author: "정현석 변호사", date: "2017-01-18",
    title: "[지적재산권법] 제6회 변호사시험 출제경향 분석 및 총평",
    url: "https://www.megalawyers.co.kr/prof/prof_notice_view.asp?idx=374&bCode=iplaw&sub_cd=23",
    kind: "mega" },
  // ★메가로이어스 제5회(idx=196)는 넣지 않는다 — 본문이 4줄 안내문뿐이고 상세 해설은
  //   로그인 필요 PDF 첨부(196_2016011970_01.pdf)다. 같은 필자의 법률저널 제5회 총평이
  //   같은 내용을 더 길게 담고 있다. 색인의 «열람 제한» 항목으로만 남긴다.
  { round: 6, year: 2017, site: "메가로이어스(고시위크 전재)", author: "고시위크", date: "2017-01",
    title: "[고시위크]2017년 제6회 변호사시험 지적재산권법 총평",
    url: "https://www.megalawyers.co.kr/board/exam_news_view.asp?idx=4234",
    kind: "mega" },
];

const ENTITIES = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&lsquo;": "‘", "&rsquo;": "’", "&ldquo;": "“", "&rdquo;": "”",
  "&middot;": "·", "&hellip;": "…", "&ndash;": "–", "&mdash;": "—",
  "&apos;": "'", "&#39;": "'", "&bull;": "•", "&sdot;": "⋅", "&prime;": "′",
  "&copy;": "©", "&reg;": "®", "&deg;": "°", "&times;": "×", "&laquo;": "«",
  "&raquo;": "»", "&sim;": "∼", "&rarr;": "→", "&larr;": "←", "&ensp;": " ",
  "&emsp;": " ", "&thinsp;": " ", "&#160;": " ",
};

/**
 * 기사 뒤에 붙는 상용구를 잘라낸다 — 필자 약력 반복·저작권 표시·SNS 공유 버튼.
 * ★본문을 자르지 않도록 **뒤쪽 30%** 안에서 나타난 표지만 자름점으로 인정한다.
 */
function trimBoilerplate(text) {
  const marks = [
    /^저작권자\s*©/m, /^무단전재/m, /^다른기사\s*보기/m, /^기사공유하기/m,
    /^페이스북$/m, /^URL복사$/m, /^목록$/m, /^이전글/m, /^다음글/m,
  ];
  let cut = text.length;
  for (const re of marks) {
    const m = text.match(re);
    if (m && m.index > text.length * 0.7) cut = Math.min(cut, m.index);
  }
  return text.slice(0, cut).trim();
}
const decodeEntities = (s) =>
  s.replace(/&[a-zA-Z]+;|&#\d+;/g, (e) =>
    ENTITIES[e] ?? (/^&#\d+;$/.test(e) ? String.fromCodePoint(Number(e.slice(2, -1))) : e),
  );

function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** 사이트별 본문 블록. 못 찾으면 통째로 넘겨 사람이 보게 한다(조용히 비우지 않는다). */
function extractBody(html, kind) {
  if (kind === "lec") {
    const m = html.match(/id="article-view-content-div"[\s\S]*?(?=<\/article>|<div id="article-bottom)/i);
    return m ? m[0] : null;
  }
  // 메가로이어스 — 본문은 div.boxRead2 안에 있다(테이블이 아니다).
  const i = html.search(/class="boxRead2/i);
  if (i < 0) return null;
  const rest = html.slice(i);
  const end = rest.search(/<!--\s*\/\/\s*MAIN|id="footer|class="btnArea/i);
  return end > 0 ? rest.slice(0, end) : rest;
}

const outDir = process.argv[2];
if (!outDir) {
  console.error("사용: node scripts/bar-exam/fetch-commentary.mjs <출력디렉터리>");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const manifest = [];
let fail = 0;

for (const s of SOURCES) {
  const res = await fetch(s.url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    console.log(`  FAIL 제${s.round}회 ${s.site} — HTTP ${res.status}`);
    fail += 1;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const charset = /charset=euc-kr/i.test(buf.subarray(0, 4000).toString("latin1"))
    ? "euc-kr"
    : "utf-8";
  const html = new TextDecoder(charset).decode(buf);
  const block = extractBody(html, s.kind);
  if (!block) {
    console.log(`  FAIL 제${s.round}회 ${s.site} — 본문 블록 못 찾음`);
    fail += 1;
    continue;
  }
  const text = trimBoilerplate(htmlToText(block));
  if (text.length < 500) {
    console.log(`  FAIL 제${s.round}회 ${s.site} — 본문 ${text.length}자(너무 짧음)`);
    fail += 1;
    continue;
  }

  const clean = (v) => v.replace(/[()]/g, "").replace(/\s+/g, "");
  const slug = `${String(s.round).padStart(2, "0")}회-${clean(s.site)}-${clean(s.author)}`;
  const file = path.join(outDir, `${slug}.md`);
  fs.writeFileSync(
    file,
    [
      `# ${s.title}`,
      "",
      "> **내부 참조용 — 재배포 금지.** 해설을 우리 손으로 다시 쓸 때 참조하려고 원문을",
      "> 그대로 보관한 것입니다. 저작권은 각 매체·필자에게 있습니다.",
      "",
      `- 출처: ${s.site}`,
      `- 필자: ${s.author}`,
      `- 게재일: ${s.date}`,
      `- 원문: ${s.url}`,
      `- 수집일: ${today}`,
      `- 대상: 제${s.round}회(${s.year}년 시행) 변호사시험 지적재산권법`,
      "",
      "---",
      "",
      text,
      "",
    ].join("\n"),
    "utf8",
  );
  const covers = {
    q1: /설문\s*1|제\s*1\s*문|특허법/.test(text),
    q2: /제\s*2\s*문|저작권법/.test(text),
  };
  manifest.push({ ...s, file: path.basename(file), chars: text.length, covers, fetchedAt: today });
  console.log(
    `  OK   제${String(s.round).padStart(2)}회 ${s.site.padEnd(18)} ${s.author.padEnd(10)} ` +
      `${String(text.length).padStart(6)}자 · 특허 ${covers.q1 ? "O" : "X"} 저작 ${covers.q2 ? "O" : "X"}`,
  );
}

fs.writeFileSync(path.join(outDir, "_manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(`\n수집 ${manifest.length}건 · 실패 ${fail} → ${outDir}`);
process.exit(fail > 0 ? 1 : 0);
