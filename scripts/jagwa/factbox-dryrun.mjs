// 사례형 문제 사실관계 박스처리 DRY-RUN. 적용하지 않고 제안만 생성.
//   - 후보: mc_case/mc_box/mc_short, 미박스, 본문에 표/이미지 없음, 충분한 길이.
//   - 휴리스틱: 질문 지시문 경계를 찾아 그 앞(사례)을 case-box 로 감싼 proposed 생성.
//   - status: auto(자신감) / review(경계 모호·지시문 선행) / skip(사례 없음·경계 못 찾음).
//   out: scripts/jagwa/.factbox/worklist.json (+ 요약·샘플 stdout)
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) throw new Error("missing SUPABASE_ACCESS_TOKEN");
async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

// 질문/지시문 시작 마커(사례-선행형 경계). 가장 이른 등장이 경계.
const Q_MARKERS = [
  "상기 사실관계", "이러한 사실관계", "위 사실관계", "위 사안", "이러한 사안", "이 사안",
  "이에 관한 설명", "에 관한 설명으로", "에 대한 설명으로", "에 관한 다음 설명", "에 관한 다음",
  "다음 각 설명", "다음 설명 중", "다음 중 옳", "다음 중 틀", "다음 중 가장", "다음 중 적절", "다음 중 가능",
  "옳은 것을 모두 고", "옳지 않은 것을 모두 고", "틀린 것을 모두 고", "옳은 것만을", "옳은 것만으로", "옳은 것은?", "옳지 않은 것은?",
];
// 사례(선행 텍스트)가 진짜 사실관계인지: 서술어 종결 + 당사자/숫자 신호.
const DECL = /(다\.|다。|음\.|함\.|였다|이다\.|된다\.|한다\.)/;
const PARTY = /[甲乙丙丁戊]|회사|출원|특허|계약|매도|매수|체결|상속|채무|토지|건물|발명|등록/;

// 줄바꿈 보존(원본 \n → <br>) + 빈 줄 제거. 본문이 MarkdownView 로 렌더되면 단일 \n 이
// 공백으로 합쳐져 ㄱㄴㄷ 보기가 한 줄로 붙으므로, 보이는 줄바꿈을 전부 <br> 로 고정한다.
function fmt(s) {
  return s
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("<br>");
}
// 사례(산문) 박스용 — 줄 보존 + 한 줄 안 문장 종결어미 뒤에도 줄바꿈(가독). 보기 없는 사례에만.
function fmtBox(s) {
  return fmt(s).replace(
    /(였다|이다|된다|한다|았다|었다|겠다|없다|있다)\.\s+/g,
    "$1.<br>",
  );
}

function analyze(body) {
  const text = body.replace(/\r/g, "").trim();
  if (text.length < 60) return { status: "skip", reason: "too short" };

  const dirFirst = /^(다음|아래)\b[^.?!]{0,60}?(읽고|참고하여|보고서|기재한)/.test(text);

  if (dirFirst) {
    // 지시문 선행형: 첫 문장(…고르시오.|…것은?) 뒤를 사례로 박스.
    const m = text.match(/^.*?(고르시오\.|것인지\s*고르시오\.|것은\?|것을 고르시오\.)/);
    if (!m) return { status: "skip", reason: "dir-first: no q-end" };
    const cut = m[0].length;
    const scenario = text.slice(cut).trim();
    if (scenario.length < 30 || !DECL.test(scenario))
      return { status: "skip", reason: "dir-first: no scenario after" };
    const intro = text.slice(0, cut).trim();
    return {
      status: "review",
      reason: "directive-first",
      proposed: `${fmt(intro)}\n\n<div class="case-box">\n${fmtBox(scenario)}\n</div>`,
    };
  }

  // 사례-선행형: 가장 이른 질문 마커.
  let bIdx = -1, hit = "";
  for (const mk of Q_MARKERS) {
    const i = text.indexOf(mk);
    if (i >= 0 && (bIdx < 0 || i < bIdx)) { bIdx = i; hit = mk; }
  }
  if (bIdx < 0) return { status: "skip", reason: "no question marker" };
  const scenario = text.slice(0, bIdx).trim();
  const question = text.slice(bIdx).trim();
  if (scenario.length < 30) return { status: "skip", reason: "scenario too short (topic-only?)" };
  if (!DECL.test(scenario) || !PARTY.test(scenario))
    return { status: "skip", reason: "before-marker looks like topic, not 사실관계" };
  // 사례가 1문장 짧으면 review, 길면 auto.
  const conf = scenario.length >= 80 ? "auto" : "review";
  return {
    status: conf,
    reason: `marker="${hit}" scenarioLen=${scenario.length}`,
    proposed: `<div class="case-box">\n${fmtBox(scenario)}\n</div>\n\n${fmt(question)}`,
  };
}

const rows = await q(`
  select p.problem_id, l.law_code, p.format, p.body_md
  from problems p join laws l on l.law_id=p.law_id
  where p.format in ('mc_case','mc_box','mc_short') and p.deleted_at is null
    and p.body_md not like '%case-box%' and p.body_md not like '%<table%' and p.body_md not like '%![%'
    and length(p.body_md) > 80
  order by l.law_code, p.problem_id`);

const out = rows.map((r) => {
  const a = analyze(r.body_md);
  return { problemId: r.problem_id, lawCode: r.law_code, format: r.format, original: r.body_md, ...a };
});

const dir = path.join("scripts", "jagwa", ".factbox");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "worklist.json"), JSON.stringify(out, null, 2));

const by = (s) => out.filter((o) => o.status === s).length;
console.log(`후보 ${out.length}건 → auto ${by("auto")} / review ${by("review")} / skip ${by("skip")}`);
const subj = {};
for (const o of out) { subj[o.lawCode] ??= { auto: 0, review: 0, skip: 0 }; subj[o.lawCode][o.status]++; }
console.log("과목별:", JSON.stringify(subj));

// 샘플 8건(auto) — 경계 품질 확인용.
console.log("\n===== AUTO 샘플(경계 확인) =====");
for (const o of out.filter((o) => o.status === "auto").slice(0, 8)) {
  const sc = o.proposed.match(/<div class="case-box">\n([\s\S]*?)\n<\/div>/)?.[1] ?? "";
  const qz = o.proposed.split("</div>\n\n")[1] ?? "";
  console.log(`\n[${o.lawCode} ${o.problemId.slice(0, 8)}] ${o.reason}`);
  console.log(`  📦사례: ${sc.replace(/<br>/g, " ⏎ ").slice(0, 150)}`);
  console.log(`  ❓질문: ${qz.slice(0, 90)}`);
}
console.log("\n(전체 제안: scripts/jagwa/.factbox/worklist.json)");
