// 2차 기출 채점기준·모범답안 AI 생성 (feat-2-034 Stage 2).
// 근거 = ①강사별 해설(tmp/instructor-explanations, Stage 1 산출) ②채점위원 채점평
// (problem_grading_notes, 2010~2017) ③3축 루브릭 표준(feat-2-032 채점평 코퍼스 도출)
//       ④출제 당시·현행 조문 전문 + 전부개정 대응표(tmp/law-history, fetch-law-history/
//         derive-article-mapping 산출) ⑤리담 교재 코퍼스(tmp/book-corpus — 상표 제20판·
//         디자인 제15판·심사기준, build-book-corpus 산출)
// 출력 = tmp/rubric-gen/{law}-{year}.json + 검수용 {law}-{year}-review.md — DB 반영 없음(별도 승인 단계).
//
//   node scripts/jagwa/gen-rubric-model-answers.mjs --law patent --year 2025
//   옵션: --problems 1,2  (기본 전체 4문)

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const MODEL = "claude-opus-4-7";
const EXPL_DIR = "tmp/instructor-explanations";
const OUT_DIR = "tmp/rubric-gen";
const YEAR_TO_ROUND = (y) => y - 1963;
const LAW_LABEL = {
  patent: "특허법",
  trademark: "상표법",
  design: "디자인보호법",
  "civil-procedure": "민사소송법",
};

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean),
);
const law = args.law;
const year = Number(args.year);
if (!LAW_LABEL[law] || !year) {
  console.error("사용: --law patent|trademark|design|civil-procedure --year YYYY [--problems 1,2]");
  process.exit(1);
}
const onlyProblems = args.problems ? args.problems.split(",").map(Number) : null;
const round = YEAR_TO_ROUND(year);

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ① 대상 문제
const { data: laws } = await supa.from("laws").select("law_id").eq("law_code", law).limit(1);
const lawId = laws?.[0]?.law_id;
if (!lawId) throw new Error(`law_code=${law} 없음`);
const { data: problems, error: pErr } = await supa
  .from("problems")
  .select("problem_id, problem_number, body_md, total_points, subjective_kind, display_no")
  .eq("format", "subjective")
  .eq("law_id", lawId)
  .eq("year", year)
  .is("deleted_at", null)
  .order("problem_number");
if (pErr) throw pErr;
const targets = (problems ?? []).filter(
  (p) => !onlyProblems || onlyProblems.includes(p.problem_number),
);
if (!targets.length) throw new Error("대상 문제 0건");

// ② 강사 해설 번들 (해당 회차·과목 전 파일)
const manifest = JSON.parse(readFileSync(join(EXPL_DIR, "manifest.json"), "utf8"));
const explFiles = manifest.filter(
  (m) => m.round === round && m.subject === law && !m.error && !m.suspectScan,
);
if (!explFiles.length) throw new Error(`${round}회 ${law} 강사 해설 텍스트 없음`);
const explBundle = explFiles
  .map((m) => {
    const txt = readFileSync(
      join(EXPL_DIR, `${m.round}회`, m.file.replace(/\.(pdf|hwpx)$/i, "") + ".txt"),
      "utf8",
    );
    return `### 강사 해설 자료: ${m.file}\n${txt}`;
  })
  .join("\n\n---\n\n");

// ③ 채점위원 채점평 (있으면 — 2010~2017 회차만 존재)
const { data: notes } = await supa
  .from("problem_grading_notes")
  .select("problem_id, source, body_md, example_answer_md")
  .in("problem_id", targets.map((t) => t.problem_id))
  .eq("source", "examiner");
const noteByProblem = new Map((notes ?? []).map((n) => [n.problem_id, n]));

// ④ 연혁법령(당시·현행 조문) + 전부개정 대응표 (있으면)
let lawVersions = [];
let reformMapping = null;
try {
  const dir = `tmp/law-history/${law}`;
  lawVersions = readdirSync(dir)
    .filter((f) => /^\d{8}-\d+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
} catch {
  /* 민소 등 연혁 미수집 법 — 조문 블록 생략 */
}
try {
  reformMapping = JSON.parse(readFileSync(`tmp/law-history/${law}-mapping.json`, "utf8"));
} catch {
  /* 전부개정 없는 법 */
}
// 효력시작 ≤ D 중 공포일자 최신 (공포·시행 엇갈림 대응)
function versionAt(date) {
  const cands = lawVersions.filter((v) => v.meta.효력시작 <= date);
  cands.sort((a, b) =>
    (a.meta.공포일자 + a.meta.효력시작).localeCompare(b.meta.공포일자 + b.meta.효력시작),
  );
  return cands[cands.length - 1] ?? null;
}
const currentV = lawVersions.length ? versionAt("99999999") : null;
const currentByNo = new Map((currentV?.articles ?? []).map((a) => [String(a.no), a]));

// ⑤ 교재 코퍼스 (있으면 — 상표·디자인)
let bookChunks = [];
try {
  bookChunks = JSON.parse(readFileSync(`tmp/book-corpus/${law}-chunks.json`, "utf8"));
} catch {
  /* 특허·민소 — DB/해설 근거로 진행 */
}
const STOP = new Set(["경우", "해당", "여부", "관련", "대한", "대하여", "있는", "하는", "위한", "따라", "또는", "판단", "규정", "적용", "청구", "설문", "사안", "문제", "답안", "채점", "기준", "판례", "학설", "결론", "포섭", "논증", "그리고", "이를", "있다", "한다", "된다", "인정", "부정", "가능", "성립", "다음", "위와", "같이", "같다"]);
function keywordsOf(text, n) {
  const freq = new Map();
  for (const m of text.matchAll(/[가-힣]{2,6}/g)) {
    const w = m[0];
    if (STOP.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}
function retrieveChunks(queryText, artTerms, topK) {
  if (!bookChunks.length) return [];
  const kws = keywordsOf(queryText, 15);
  return bookChunks
    .map((c) => {
      let score = 0;
      for (const t of artTerms) if (c.text.includes(t)) score += 3;
      for (const k of kws) score += Math.min(c.text.split(k).length - 1, 3);
      return { c, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((s) => s.score >= 5)
    .map((s) => s.c);
}
// 같은 법 조문 인용 추출 (타법 문맥 제외)
function extractArticleCites(text) {
  const out = new Set();
  const re = /(?:§\s*(\d+(?:의\d+)?))|(?:제\s*(\d+(?:의\d+)?)\s*조(?:의(\d+))?)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    let num = m[1] ?? m[2];
    if (m[3]) num = `${num}의${m[3]}`;
    const before = text.slice(Math.max(0, m.index - 20), m.index);
    const otherLaw = /민법|민사소송법|민소법|상법|헌법|실용신안법|부정경쟁|저작권|민사집행|행정소송|형법|조약/.test(before);
    const thisLaw = new RegExp(LAW_LABEL[law]).test(before);
    if (otherLaw && !thisLaw) continue;
    out.add(num);
  }
  return [...out];
}

const SYSTEM = `당신은 대한민국 변리사 2차 시험(주관식·논술) 수험 콘텐츠 전문가입니다.
주어진 기출문제에 대해 '채점기준'과 '모범답안'을 작성합니다.

[근거 자료 사용 원칙]
- 반드시 함께 제공되는 강사 해설 자료(복수 강사)에 근거해 작성하세요. 해설 간 차이가 있으면 다수설·판례
  중심으로 종합하되, 임의로 해설에 없는 쟁점을 창작하지 마세요.
- '실제 채점위원 채점평'이 제공되면 그 지적사항(득점·감점 포인트)을 채점기준에 최우선 반영하세요.
- 조문·판례 인용은 해설 자료에 나온 것만 사용하세요.

[현행법(개정법) 기준 원칙 — 매우 중요]
- 채점기준·모범답안은 반드시 **현행 시행 법령(2026년 기준)** 의 조문 체계·법리로 작성하세요. 강사 해설이
  출제 당시 구법 조문을 인용하고 있으면 현행 조문번호로 변환해 인용하고, 혼동 여지가 있으면
  "구 상표법 §7①7(현행 §34①7)" 처럼 병기하세요.
  - 상표법: 2016 전부개정으로 조문 전면 재배열(예: 구§6 등록요건→현§33, 구§7 부등록사유→현§34,
    구§51 효력제한→현§90, 구§73 취소심판→현§119 등).
  - 디자인보호법: 2013 전부개정으로 조문 재배열(예: 구§5 등록요건→현§33, 구§7 확대된 선출원→현§33③ 등).
  - 특허법·민사소송법: 부분개정 누적(예: 특허법 §128 증액배상 신설, 구§163 확정심결 일사부재리 판례 변경 등).
- 개정으로 법리·결론 자체가 달라진 부분은 **현행법 기준으로 결론을 내리고**, 해당 항목에
  "(개정 반영: 무엇이 달라졌는지)" 를 한 줄 명시하세요. 구법 기준 결론을 그대로 옮기면 안 됩니다.
- 판례 인용은 유지하되, 개정법 아래에서 더 이상 유지될 수 없는 판시는 그 취지를 밝히세요.
- 조문 번호 변환이 확실하지 않으면 임의로 만들지 말고 "구법 §N(현행 대응 확인 필요)" 로 표기하세요.
- 문제와 함께 [현행 조문 전문]·[출제 당시 시행 조문]·[전부개정 조문 대응]·[교재 발췌] 블록이 제공되면:
  · 답안·채점기준의 조문 인용과 조문 내용 서술은 반드시 **[현행 조문 전문]의 실제 문언**에 근거하세요.
  · [출제 당시 시행 조문]은 발문·강사 해설(당시 법 기준)을 해석하는 용도로만 쓰세요.
  · [교재 발췌](최신판 리담 교재·심사기준)의 법리·개정 이력 서술을 강사 해설보다 우선하세요.

[채점 3축 기준 — 실제 채점위원 채점평(2010~2017) 코퍼스에서 도출된 표준. 채점기준은 이 구조를 따를 것]
1) 논점 추출(40%): 출제자가 무엇을 묻는지(설문 취지·핵심)를 정확히 파악했는가. 사안의 특정 사실을
   포착해 배점에 맞는 쟁점을 빠짐없이 적시했는가. 묻지 않은 것·무관한 조문·일반론 나열, 설문 단서
   위반, 자의적 해석, 핵심 쟁점 누락은 감점.
2) 목차·구성(25%): 쟁점별 목차·소제목으로 체계화했는가. 배점 비례로 분량·강약을 배분(일반론
   최소·사안 해결에 지면 할애)했는가. 학설·판례를 구분 배치했는가. 수험서 목차 단순 암기, 특정 쟁점
   편중, 서론 장황, 조문 전사식 나열은 감점.
3) 답안 작성·논증(35%): 실정법(조문)→학설·판례 순으로 근거를 제시하고 사안에 포섭·적용했는가.
   명확한 결론과 결론에 이르는 일관된 논리가 있는가. 학설 대립 시 자기 입장·논거를 밝혔는가. 법전
   전사, 애매모호한 결론, 논리 비약, 본문↔결론 모순은 감점.

[출력 형식]
1. grading_rubric_md (채점기준, 한국어 마크다운):
   - "## 핵심 쟁점과 배점" — 쟁점별 표(쟁점 | 배점 | 득점 포인트). 배점 합계 = 문제 배점.
   - "## 축별 채점 기준" — 3축(논점 추출/목차·구성/답안 작성·논증) 각각에 대해 이 문제에서의
     구체적 득점·감점 포인트 목록. 채점위원 채점평이 있으면 그 문구의 취지를 반영.
   - "## 감점 주의" — 이 문제에서 수험생이 흔히 하는 실수(해설·채점평 근거).
2. model_answer_md (모범답안, 한국어 마크다운):
   - 실제 시험 답안 형식: 로마숫자·아라비아숫자 목차 체계(Ⅰ. Ⅱ. … / 1. 2. … / (1) (2) …).
   - 각 쟁점마다 조문 → 판례·학설 → 사안 포섭 → 소결 순.
   - 배점 비례 분량 배분. 마지막에 "Ⅴ. 결론"류의 명확한 결론.
   - 강사 해설의 예시답안이 있으면 그 목차·논증 흐름을 우선 참고.
3. rubric_items (자기점검 체크리스트): 수험생이 자기 답안을 점검할 항목 4~8개.
   각 항목 = { label: "…을 적시했는가" 형식 한 문장, points: 배점 } — points 합계 = 문제 배점.`;

mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, `${law}-${year}.json`);
const results = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : [];
const doneIds = new Set(results.map((r) => r.problem_id));

let totalIn = 0;
let totalOut = 0;
for (const p of targets) {
  if (doneIds.has(p.problem_id)) {
    console.log(`skip 문제${p.problem_number} (이미 생성됨)`);
    continue;
  }
  const note = noteByProblem.get(p.problem_id);

  // 조문·교재 근거 블록 (학습 자료 기반 — 있을 때만)
  let groundingBlocks = "";
  let currentNums = [];
  if (lawVersions.length) {
    const examDate = `${year}0725`;
    const oldV = versionAt(examDate);
    const bodyNums = extractArticleCites(p.body_md ?? "");
    const isPreReform = reformMapping && examDate < reformMapping.meta.new.효력시작;
    const mapLines = [];
    currentNums = [...bodyNums];
    if (isPreReform && reformMapping) {
      currentNums = [];
      for (const n of bodyNums) {
        const m = reformMapping.mapping.find((x) => String(x.old_no) === n);
        if (m?.best && m.best.score >= 0.4) {
          currentNums.push(String(m.best.no));
          mapLines.push(
            `구§${m.old_no}(${m.old_title}) → 현§${m.best.no}(${m.best.title}) [유사도 ${m.best.score.toFixed(2)}]`,
          );
        }
      }
    }
    currentNums = [...new Set(currentNums)].slice(0, 10);
    const oldByNo = new Map((oldV?.articles ?? []).map((a) => [String(a.no), a]));
    const oldBlocks =
      oldV && oldV.meta.효력시작 !== currentV?.meta.효력시작
        ? bodyNums
            .slice(0, 10)
            .map((n) => oldByNo.get(n))
            .filter(Boolean)
            .map((a) => `제${a.no}조(${a.title})\n${a.text.slice(0, 1500)}`)
        : [];
    const curBlocks = currentNums
      .map((n) => currentByNo.get(n))
      .filter(Boolean)
      .map((a) => `제${a.no}조(${a.title})\n${a.text.slice(0, 2500)}`);
    const excerpts = retrieveChunks(
      `${p.body_md ?? ""}\n${note?.body_md ?? ""}`,
      currentNums.flatMap((n) => [`제${n}조`, `§${n}`]),
      6,
    );
    groundingBlocks = [
      curBlocks.length ? `\n## 현행 조문 전문 (발문 관련 — 인용·서술의 기준)\n${curBlocks.join("\n\n")}` : "",
      oldBlocks.length ? `\n## 출제 당시(${year}) 시행 조문 — 발문·해설 해석용\n${oldBlocks.join("\n\n")}` : "",
      mapLines.length ? `\n## 전부개정 조문 대응 (자동 도출)\n${mapLines.join("\n")}` : "",
      excerpts.length
        ? `\n## 교재 발췌 (최신판 리담 교재·심사기준 — 현행 법리 근거)\n${excerpts.map((c) => `### [${c.source}] ${c.heading}\n${c.text}`).join("\n\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const perProblem = [
    `## 대상 기출문제 — ${LAW_LABEL[law]} 제${round}회(${year}년) 문제 ${p.problem_number} (배점 ${p.total_points ?? "미상"}점)`,
    p.body_md,
    note?.body_md ? `\n## 실제 채점위원 채점평(이 문제 소속 폼)\n${note.body_md}` : "",
    note?.example_answer_md ? `\n## 채점위원 예시답안\n${note.example_answer_md}` : "",
    groundingBlocks,
  ]
    .filter(Boolean)
    .join("\n");

  console.log(
    `생성 중: ${LAW_LABEL[law]} ${year} 문제${p.problem_number} (채점평 ${note ? "O" : "X"}·근거 ${groundingBlocks ? "O" : "X"})…`,
  );
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            grading_rubric_md: { type: "string", description: "채점기준 마크다운" },
            model_answer_md: { type: "string", description: "모범답안 마크다운" },
            rubric_items: {
              type: "array",
              description: "자기점검 체크리스트 4~8개, points 합계=배점",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: "string" },
                  points: { type: "number" },
                },
                required: ["label", "points"],
              },
            },
          },
          required: ["grading_rubric_md", "model_answer_md", "rubric_items"],
        },
      },
    },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `# ${round}회 ${LAW_LABEL[law]} 강사 해설 자료 모음\n\n${explBundle}`,
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: perProblem },
        ],
      },
    ],
  });
  totalIn += res.usage?.input_tokens ?? 0;
  totalOut += res.usage?.output_tokens ?? 0;
  const textBlock = res.content.find((b) => b.type === "text");
  const parsed = JSON.parse(textBlock.text);
  const itemSum = parsed.rubric_items.reduce((s, it) => s + it.points, 0);
  if (p.total_points != null && itemSum !== p.total_points)
    console.warn(`  ⚠ rubric_items 배점 합 ${itemSum} ≠ 문제 배점 ${p.total_points}`);
  results.push({
    problem_id: p.problem_id,
    law,
    year,
    round,
    problem_number: p.problem_number,
    display_no: p.display_no,
    total_points: p.total_points,
    has_examiner_note: Boolean(note),
    source_files: explFiles.map((m) => m.file),
    ...parsed,
    generated_at: new Date().toISOString(),
    model: MODEL,
  });
  writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`  완료 (rubric ${parsed.grading_rubric_md.length}자, answer ${parsed.model_answer_md.length}자, items ${parsed.rubric_items.length})`);
}

// 검수용 마크다운
const review = results
  .filter((r) => r.law === law && r.year === year)
  .sort((a, b) => a.problem_number - b.problem_number)
  .map(
    (r) =>
      `# ${LAW_LABEL[law]} 제${r.round}회(${r.year}) 문제 ${r.problem_number} (${r.total_points ?? "?"}점${r.has_examiner_note ? " · 채점위원 채점평 반영" : ""})\n\n` +
      `## 자기점검 체크리스트\n${r.rubric_items.map((it) => `- [ ] ${it.label} (${it.points}점)`).join("\n")}\n\n` +
      `${r.grading_rubric_md}\n\n---\n\n# 모범답안\n\n${r.model_answer_md}`,
  )
  .join("\n\n\n═══════════════════════════════════\n\n\n");
writeFileSync(join(OUT_DIR, `${law}-${year}-review.md`), review, "utf8");
console.log(`\n저장: ${outPath} + ${law}-${year}-review.md`);
console.log(`토큰: in ${totalIn.toLocaleString()} / out ${totalOut.toLocaleString()}`);
