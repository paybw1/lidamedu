// 생성 채점기준·모범답안 ↔ 리담 교재 대조 검증 (feat-2-034).
// 근거 = ①현행 조문 전문(articles/article_revisions.body_text)
//        ②판례 요지·평석(cases.summary_*, 교재 기반 편집물)
//        ③교재 코퍼스 발췌(tmp/book-corpus/{law}-chunks.json — 상표 제20판·디자인 제15판
//          + 심사기준. build-book-corpus.mjs 산출. 특허는 DB 가 제25판 기반이라 ①②로 충분)
// 각 문항에서 인용한 조문·판례를 근거와 대조해 AI 가 개정 미반영·오인용을 판정.
// 출력 = tmp/rubric-gen/verify-{law}.md (+ json)
//
//   node scripts/jagwa/verify-rubric-vs-book.mjs --law patent [--year 2016]

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const MODEL = "claude-opus-4-7";
const GEN_DIR = "tmp/rubric-gen";
const LAW_LABEL = {
  patent: "특허법",
  trademark: "상표법",
  design: "디자인보호법",
  "civil-procedure": "민사소송법",
  civil: "민법",
};

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean),
);
const law = args.law ?? "patent";
const onlyYear = args.year ? Number(args.year) : null;
// --ids p1,p2 : 해당 problem_id 만 재검증 (수리 후 recheck). 출력 파일도 -recheck 접미.
const onlyIds = args.ids ? new Set(args.ids.split(",")) : null;
const OUT_SUFFIX = onlyIds ? "-recheck" : "";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── 현행 조문 전문 로드 (조 단위로 하위 항·호·목 body_text 조립) ──
const { data: laws } = await supa.from("laws").select("law_id, law_code").eq("law_code", law);
const lawId = laws[0].law_id;
const arts = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supa
    .from("articles")
    .select("article_id, parent_id, level, path, article_number, display_label, current_revision_id")
    .eq("law_id", lawId)
    .is("deleted_at", null)
    .range(from, from + 999);
  if (error) throw error;
  arts.push(...data);
  if (data.length < 1000) break;
}
const revIds = arts.map((a) => a.current_revision_id).filter(Boolean);
const revText = new Map();
for (let i = 0; i < revIds.length; i += 150) {
  const { data, error } = await supa
    .from("article_revisions")
    .select("revision_id, body_text")
    .in("revision_id", revIds.slice(i, i + 150));
  if (error) throw error;
  for (const r of data) revText.set(r.revision_id, r.body_text ?? "");
}
// path 기준 정렬 후, 조(article) 별로 자기+하위 노드 텍스트 조립.
arts.sort((a, b) => String(a.path).localeCompare(String(b.path)));
const articleTextByNum = new Map(); // "128의2" -> 전문
for (const a of arts.filter((x) => x.level === "article")) {
  const prefix = String(a.path);
  const parts = arts
    .filter((x) => String(x.path) === prefix || String(x.path).startsWith(prefix + "."))
    .map((x) => revText.get(x.current_revision_id) ?? "")
    .filter(Boolean);
  articleTextByNum.set(String(a.article_number), `${a.display_label}\n${parts.join("\n")}`);
}
console.log(`현행 ${LAW_LABEL[law]} 조문 로드: ${articleTextByNum.size}개 조`);

// ── 교재 코퍼스 (있으면) ──
const BOOK_EDITION = {
  patent: "리담특허법(제25판)",
  trademark: "리담상표법(제20판)",
  design: "리담디자인보호법(제15판)",
}[law];
let bookChunks = [];
try {
  bookChunks = JSON.parse(readFileSync(`tmp/book-corpus/${law}-chunks.json`, "utf8"));
  console.log(`교재 코퍼스 로드: ${bookChunks.length} chunks`);
} catch {
  console.log("교재 코퍼스 없음 — 조문·판례 DB 만으로 검증");
}

// ── 연혁법령(출제 당시 시행 조문) + 전부개정 대응표 (있으면) ──
let lawVersions = [];
let reformMapping = null;
try {
  const dir = `tmp/law-history/${law}`;
  lawVersions = readdirSync(dir)
    .filter((f) => /^\d{8}-\d+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
  console.log(`연혁법령 로드: ${lawVersions.length} 버전`);
} catch {
  console.log("연혁법령 없음 — 당시 시행 조문 대조 생략");
}
try {
  reformMapping = JSON.parse(readFileSync(`tmp/law-history/${law}-mapping.json`, "utf8"));
  console.log(`전부개정 대응표 로드: ${reformMapping.mapping.length}건 (신법 효력 ${reformMapping.meta.new.효력시작})`);
} catch {
  /* 전부개정 없는 법(특허·민소) */
}
// 효력시작 ≤ D 중 공포일자 최신 (공포·시행 엇갈림 대응 — 상표 2012 사례)
function versionAt(date) {
  const cands = lawVersions.filter((v) => v.meta.효력시작 <= date);
  cands.sort((a, b) =>
    (a.meta.공포일자 + a.meta.효력시작).localeCompare(b.meta.공포일자 + b.meta.효력시작),
  );
  return cands[cands.length - 1] ?? null;
}

// 한글 stopword 성 짙은 토큰 제외한 키워드 추출 (빈도순).
const STOP = new Set(["경우", "해당", "여부", "관련", "대한", "대하여", "있는", "하는", "위한", "따라", "또는", "판단", "규정", "적용", "청구", "설문", "사안", "문제", "답안", "채점", "기준", "판례", "학설", "결론", "포섭", "논증", "그리고", "이를", "있다", "한다", "된다", "인정", "부정", "가능", "성립"]);
function keywordsOf(text, n) {
  const freq = new Map();
  for (const m of text.matchAll(/[가-힣]{2,6}/g)) {
    const w = m[0];
    if (STOP.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}
function retrieveChunks(genText, artNums, topK) {
  if (!bookChunks.length) return [];
  const artTerms = artNums.flatMap((num) => [`제${num}조`, `§${num}`]);
  const kws = keywordsOf(genText, 15);
  const scored = bookChunks.map((c) => {
    let score = 0;
    for (const t of artTerms) if (c.text.includes(t)) score += 3;
    for (const k of kws) {
      const hits = c.text.split(k).length - 1;
      score += Math.min(hits, 3);
    }
    return { c, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((s) => s.score >= 5)
    .map((s) => s.c);
}

// ── 인용 추출 ──
function extractArticleCites(text) {
  const out = new Set();
  const re = /(?:§\s*(\d+(?:의\d+)?))|(?:제\s*(\d+(?:의\d+)?)\s*조(?:의(\d+))?)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    let num = m[1] ?? m[2];
    if (m[3]) num = `${num}의${m[3]}`;
    // 앞 문맥에 다른 법명이 붙으면 제외 (이 법 조문만 검증).
    const before = text.slice(Math.max(0, m.index - 20), m.index);
    const otherLaw = /민법|민사소송법|민소법|상법|헌법|실용신안법|부정경쟁|저작권|민사집행|행정소송|형법|조약/.test(before);
    const thisLaw = new RegExp(LAW_LABEL[law]).test(before);
    if (otherLaw && !thisLaw && law === "patent") continue;
    if (otherLaw && !thisLaw) continue;
    out.add(num);
  }
  return [...out];
}
function extractCaseCites(text) {
  const out = new Set();
  const re = /(\d{2,4})\s*(다|후|허|마|도|누|두|카합|카기|그|재후)\s*(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) out.add(`${m[1]}${m[2]}${m[3]}`);
  return [...out];
}

// ── 판례 요지 로드 (한 번에 캐시) ──
const caseCache = new Map();
async function getCaseSummary(num) {
  if (caseCache.has(num)) return caseCache.get(num);
  const { data } = await supa
    .from("cases")
    .select("case_number, summary_title, summary_body_md, summary_items, is_en_banc")
    .ilike("case_number", `%${num}%`)
    .is("deleted_at", null)
    .limit(1);
  const row = data?.[0] ?? null;
  const text = row
    ? `대법원 ${row.case_number}${row.is_en_banc ? " 전원합의체" : ""} — ${row.summary_title ?? ""}\n${(row.summary_body_md ?? "").slice(0, 2500)}`
    : null;
  caseCache.set(num, text);
  return text;
}

const SYSTEM = `당신은 대한민국 변리사 시험 교재 "${BOOK_EDITION ?? `리담${LAW_LABEL[law]}`}" 의 감수자입니다.
AI 가 작성한 기출문제 채점기준·모범답안이 **현행법(2026 시행)과 교재 내용에 맞게** 작성됐는지 감수합니다.

함께 제공되는 [현행 조문 전문]·[판례 요지(교재 기반)]·[교재 발췌]만을 근거로 다음을 점검하세요.
교재 발췌에 "20XX년 개정 전 구법은 …" 류의 개정 이력 서술이 있으면 이를 개정 반영 판단의 1차 근거로
사용하세요 (구법 법리를 현행처럼 서술한 부분 적발).
1. 조문 인용 정확성: 인용된 조문 번호·항·호가 현행 조문의 실제 내용과 일치하는가.
   (구법 번호를 현행 번호처럼 쓴 오변환, 항·호 오지정, 조문 내용 오서술)
2. 개정 미반영: 답안의 법리·결론이 구법 기준이어서 현행법과 다른 부분이 있는가.
   (제공된 현행 조문 전문과 배치되는 서술만 지적 — 조문 근거 없는 추측 금지)
3. 판례 인용 정확성: 판례 번호·판시 취지가 제공된 판례 요지와 일치하는가.
   (요지가 제공되지 않은 판례는 '검증 불가'로만 분류하고 오류로 단정하지 말 것)
심각도: critical(틀린 법리·결론, 반영 시 수험생 오도) / warn(번호·표기 부정확, 뉘앙스 차이) / info(검증 불가·참고).
문제가 전혀 없으면 issues 빈 배열.`;

const files = readdirSync(GEN_DIR).filter(
  (f) =>
    f.startsWith(`${law}-`) && /-\d{4}\.json$/.test(f) && !f.includes("audit"),
);
// 중단 재개 — 기존 결과 로드 후 이미 검증된 문항은 스킵.
let results = [];
try {
  results = JSON.parse(
    readFileSync(join(GEN_DIR, `verify-${law}${OUT_SUFFIX}.json`), "utf8"),
  );
} catch {
  /* 신규 실행 */
}
const doneKeys = new Set(results.map((r) => `${r.year}|${r.problem_number}`));
for (const file of files) {
  const items = JSON.parse(readFileSync(join(GEN_DIR, file), "utf8"));
  for (const item of items) {
    if (onlyYear && item.year !== onlyYear) continue;
    if (onlyIds && !onlyIds.has(item.problem_id)) continue;
    if (doneKeys.has(`${item.year}|${item.problem_number}`)) continue;
    const genText = `${item.grading_rubric_md}\n${item.model_answer_md}\n${(item.rubric_items ?? []).map((r) => r.label).join("\n")}`;
    const artNums = extractArticleCites(genText);
    const caseNums = extractCaseCites(genText);
    const artBlocks = artNums.map((n) => articleTextByNum.get(n) ?? `제${n}조 — ★현행 ${LAW_LABEL[law]}에 존재하지 않음`);
    const caseBlocks = [];
    for (const n of caseNums) {
      const t = await getCaseSummary(n);
      caseBlocks.push(t ?? `${n} — (교재 DB 에 요지 없음: 검증 불가)`);
    }
    const excerpts = retrieveChunks(genText, artNums, 8);

    // 출제 당시 시행 조문 + 전부개정 대응 (연혁 데이터 있을 때)
    let historyBlock = "";
    if (lawVersions.length) {
      const examDate = `${item.year}0725`; // 2차 시험 ≈ 7월 말
      const oldV = versionAt(examDate);
      if (oldV && oldV.meta.효력시작 !== lawVersions[lawVersions.length - 1]?.meta.효력시작) {
        // 발문(당시 법 기준 인용) 조문 추출
        const { data: pRows } = await supa
          .from("problems")
          .select("body_md")
          .eq("problem_id", item.problem_id ?? "00000000-0000-0000-0000-000000000000")
          .limit(1);
        const bodyMd = pRows?.[0]?.body_md ?? "";
        const bodyNums = extractArticleCites(bodyMd);
        // 대응표: 생성물 인용(현행) ← 구법 / 발문 인용(당시) → 현행
        const mapLines = [];
        const isPreReform = reformMapping && examDate < reformMapping.meta.new.효력시작;
        if (isPreReform) {
          for (const m of reformMapping.mapping) {
            const hitNew = artNums.includes(String(m.best?.no));
            const hitOld = bodyNums.includes(String(m.old_no));
            if ((hitNew || hitOld) && (m.best?.score ?? 0) >= 0.4)
              mapLines.push(
                `구§${m.old_no}(${m.old_title}) → 현§${m.best.no}(${m.best.title}) [유사도 ${m.best.score.toFixed(2)}]`,
              );
          }
        }
        const oldByNo = new Map(oldV.articles.map((a) => [String(a.no), a]));
        const oldNums = [...new Set([...bodyNums, ...(isPreReform ? reformMapping.mapping.filter((m) => artNums.includes(String(m.best?.no))).map((m) => String(m.old_no)) : artNums)])].slice(0, 10);
        const oldBlocks = oldNums
          .map((n) => oldByNo.get(n))
          .filter(Boolean)
          .map((a) => `제${a.no}조(${a.title})\n${a.text.slice(0, 1500)}`);
        if (oldBlocks.length || mapLines.length) {
          historyBlock =
            `\n\n# 출제 당시(${item.year}, 효력 ${oldV.meta.효력시작} 기준) 시행 조문 — 발문·해설은 이 법 기준일 수 있음\n\n` +
            oldBlocks.join("\n\n") +
            (mapLines.length
              ? `\n\n# 전부개정 조문 대응 (자동 도출 후보)\n${mapLines.join("\n")}`
              : "");
        }
      }
    }
    console.log(
      `검증: ${law} ${item.year} 문제${item.problem_number} (조문 ${artNums.length}·판례 ${caseNums.length}·교재발췌 ${excerpts.length}·당시조문 ${historyBlock ? "O" : "X"})…`,
    );
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              issues: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    severity: { type: "string", enum: ["critical", "warn", "info"] },
                    where: { type: "string", description: "채점기준|모범답안|체크리스트 + 위치" },
                    claim: { type: "string", description: "생성물의 문제 서술(원문 인용)" },
                    correction: { type: "string", description: "현행 조문·판례 요지에 근거한 정정" },
                  },
                  required: ["severity", "where", "claim", "correction"],
                },
              },
              summary: { type: "string", description: "한 줄 총평" },
            },
            required: ["issues", "summary"],
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
              text:
                `# 현행 조문 전문 (인용된 조만)\n\n${artBlocks.join("\n\n")}\n\n` +
                `# 판례 요지 (교재 기반)\n\n${caseBlocks.join("\n\n") || "(인용 판례 없음)"}` +
                (excerpts.length
                  ? `\n\n# 교재 발췌 — ${BOOK_EDITION}·심사기준 (관련도순)\n\n${excerpts
                      .map((c) => `### [${c.source}] ${c.heading}\n${c.text}`)
                      .join("\n\n")}`
                  : ""),
            },
            {
              type: "text",
              text: `# 감수 대상 — ${LAW_LABEL[law]} ${item.year}(제${item.round}회) 문제 ${item.problem_number}\n\n${genText}`,
            },
          ],
        },
      ],
    });
    const textBlock = res.content.find((b) => b.type === "text");
    const parsed = JSON.parse(textBlock.text);
    results.push({
      year: item.year,
      round: item.round,
      problem_number: item.problem_number,
      cited_articles: artNums,
      cited_cases: caseNums,
      ...parsed,
    });
    writeFileSync(
      join(GEN_DIR, `verify-${law}${OUT_SUFFIX}.json`),
      JSON.stringify(results, null, 2),
      "utf8",
    );
  }
}

// 리포트
const sevOrder = { critical: 0, warn: 1, info: 2 };
const md = [
  `# 리담${LAW_LABEL[law]}(제25판) 대조 검증 리포트`,
  `문항 ${results.length}건 · critical ${results.flatMap((r) => r.issues).filter((i) => i.severity === "critical").length} · warn ${results.flatMap((r) => r.issues).filter((i) => i.severity === "warn").length} · info ${results.flatMap((r) => r.issues).filter((i) => i.severity === "info").length}`,
  "",
  ...results
    .sort((a, b) => a.year - b.year || a.problem_number - b.problem_number)
    .map((r) => {
      const head = `## ${r.year}(제${r.round}회) 문제 ${r.problem_number} — ${r.summary}`;
      if (!r.issues.length) return `${head}\n- 이상 없음`;
      return (
        head +
        "\n" +
        r.issues
          .sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity])
          .map((i) => `- **[${i.severity}]** (${i.where}) ${i.claim}\n  → ${i.correction}`)
          .join("\n")
      );
    }),
].join("\n");
writeFileSync(join(GEN_DIR, `verify-${law}${OUT_SUFFIX}.md`), md, "utf8");
console.log(`저장: verify-${law}${OUT_SUFFIX}.md / verify-${law}${OUT_SUFFIX}.json`);
