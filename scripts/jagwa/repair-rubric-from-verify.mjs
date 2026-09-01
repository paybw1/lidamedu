// 감수 지적사항 기반 채점기준·모범답안 자동 수리 (feat-2-034).
// verify-{law}.json 의 critical/warn 이 있는 문항만, 기존 생성물 + 지적사항(정정 포함) +
// 인용 조문 현행 전문을 근거로 교정본을 재생성해 {law}-{year}.json 을 제자리 갱신.
// 수리 후 재검증: node scripts/jagwa/verify-rubric-vs-book.mjs --law X --ids <problem_id,..>
//
//   node --import tsx scripts/jagwa/repair-rubric-from-verify.mjs --law trademark
// ★--import tsx 필수 — 인용 가드(citation-guard.ts)를 import 한다.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

// ★★생성 단계 차단(CLAUDE.md #12).
import { CITATION_PROMPT_RULE, checkCitations } from "../../app/features/cases/lib/citation-guard.ts";
import { loadKnownCaseNumbers } from "../../app/features/cases/lib/known-case-numbers.server.ts";

const MODEL = "claude-opus-4-7";
const GEN_DIR = "tmp/rubric-gen";
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
if (!LAW_LABEL[law]) {
  console.error("사용: --law patent|trademark|design [--src recheck]");
  process.exit(1);
}
// --src recheck : 재검증 결과(verify-{law}-recheck.json) 기반 2차 수리 — repaired_at 스킵 해제.
const srcSuffix = args.src === "recheck" ? "-recheck" : "";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 현행 조문 전문 (verify 와 동일 조립)
const { data: laws } = await supa.from("laws").select("law_id, law_code").eq("law_code", law);
const lawId = laws[0].law_id;
const arts = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supa
    .from("articles")
    .select("article_id, level, path, article_number, display_label, current_revision_id")
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
  const { data } = await supa
    .from("article_revisions")
    .select("revision_id, body_text")
    .in("revision_id", revIds.slice(i, i + 150));
  for (const r of data ?? []) revText.set(r.revision_id, r.body_text ?? "");
}
arts.sort((a, b) => String(a.path).localeCompare(String(b.path)));
const articleTextByNum = new Map();
for (const a of arts.filter((x) => x.level === "article")) {
  const prefix = String(a.path);
  const parts = arts
    .filter((x) => String(x.path) === prefix || String(x.path).startsWith(prefix + "."))
    .map((x) => revText.get(x.current_revision_id) ?? "")
    .filter(Boolean);
  articleTextByNum.set(String(a.article_number), `${a.display_label}\n${parts.join("\n")}`);
}

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

const knownCaseNumbers = await loadKnownCaseNumbers(supa);

const verify = JSON.parse(
  readFileSync(join(GEN_DIR, `verify-${law}${srcSuffix}.json`), "utf8"),
);
const genFiles = readdirSync(GEN_DIR).filter(
  (f) => f.startsWith(`${law}-`) && /-\d{4}\.json$/.test(f),
);
const genByFile = new Map(
  genFiles.map((f) => [f, JSON.parse(readFileSync(join(GEN_DIR, f), "utf8"))]),
);

const SYSTEM = `당신은 대한민국 변리사 2차 시험 수험 콘텐츠의 감수 반영 편집자입니다.
기존 '채점기준·모범답안·자기점검 체크리스트'에 대해 현행법·교재 대조 감수에서 나온 지적사항이
주어집니다. 지적사항의 정정 내용을 빠짐없이 반영해 **전체 교정본**을 다시 작성하세요.

원칙:
- 지적사항(critical/warn)의 correction 을 최우선 근거로 삼되, 함께 제공된 [현행 조문 전문]과
  모순되게 쓰지 마세요. 조문 번호·항·호와 기간·요건은 현행 조문 문언 그대로.
- 지적되지 않은 부분은 원본의 구조·서술을 최대한 유지하세요(불필요한 재작성 금지).
- 검증 불가(info)로만 분류된 판례 인용은 유지하되, 지적에서 오인용이 확인된 판례는 정정하세요.
- 형식은 원본과 동일: 채점기준(핵심 쟁점과 배점 표 + 축별 채점 기준 + 감점 주의),
  모범답안(목차 체계·조문→판례→포섭→소결), rubric_items(문항 배점 합계 유지).
${CITATION_PROMPT_RULE}`;

let repaired = 0;
for (const v of verify) {
  const issues = (v.issues ?? []).filter((i) => i.severity === "critical" || i.severity === "warn");
  if (!issues.length) continue;
  // 2차(recheck 기반) 수리는 critical 잔존 문항만 — warn-only 재수리는 감수 편차 churn 위험.
  if (srcSuffix && !issues.some((i) => i.severity === "critical")) continue;
  // 대상 gen item 찾기
  const file = `${law}-${v.year}.json`;
  const items = genByFile.get(file);
  const item = items?.find((it) => it.problem_number === v.problem_number && it.year === v.year);
  if (!item) {
    console.warn(`gen item 없음: ${law} ${v.year} 문제${v.problem_number}`);
    continue;
  }
  if (item.repaired_at && !srcSuffix) {
    console.log(`skip(이미 수리됨): ${law} ${v.year} 문제${v.problem_number}`);
    continue;
  }
  const genText = `${item.grading_rubric_md}\n${item.model_answer_md}`;
  const artNums = extractArticleCites(genText).slice(0, 14);
  const artBlocks = artNums.map(
    (n) => articleTextByNum.get(n) ?? `제${n}조 — ★현행 ${LAW_LABEL[law]}에 존재하지 않음(인용 금지)`,
  );
  const issuesMd = issues
    .map((i, k) => `${k + 1}. [${i.severity}] (${i.where})\n   지적: ${i.claim}\n   정정: ${i.correction}`)
    .join("\n");
  console.log(`수리: ${law} ${v.year} 문제${v.problem_number} (지적 ${issues.length})…`);
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
            grading_rubric_md: { type: "string" },
            model_answer_md: { type: "string" },
            rubric_items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: { label: { type: "string" }, points: { type: "number" } },
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
            text:
              `# 현행 조문 전문 (인용 조문)\n\n${artBlocks.join("\n\n")}\n\n` +
              `# 감수 지적사항 (반드시 반영)\n\n${issuesMd}\n\n` +
              `# 원본 — ${LAW_LABEL[law]} ${v.year}(제${v.round}회) 문제 ${v.problem_number} (배점 ${item.total_points ?? "미상"})\n\n` +
              `## [원본 채점기준]\n${item.grading_rubric_md}\n\n## [원본 모범답안]\n${item.model_answer_md}\n\n` +
              `## [원본 체크리스트]\n${JSON.stringify(item.rubric_items)}`,
          },
        ],
      },
    ],
  });
  const textBlock = res.content.find((b) => b.type === "text");
  const parsed = JSON.parse(textBlock.text);
  // ★인용 검사 — 근거는 [현행 조문 전문]·[감수 지적사항]과 DB 수록 사건번호뿐이다.
  //   **원본 텍스트를 근거로 삼지 않는다** — 원본에 섞인 잘못된 번호가 그대로 통과해 버린다.
  const citationSource = `${artBlocks.join("\n")}\n${issuesMd}`;
  const citationWarnings = [
    ...new Set(
      [
        parsed.grading_rubric_md,
        parsed.model_answer_md,
        ...parsed.rubric_items.map((it) => it.label),
      ].flatMap(
        (t) => checkCitations(t ?? "", knownCaseNumbers, citationSource).unknown,
      ),
    ),
  ];
  if (citationWarnings.length)
    console.warn(`  ⚠ 근거 없는 사건번호 인용: ${citationWarnings.join(", ")}`);

  Object.assign(item, parsed, {
    repaired_at: new Date().toISOString(),
    repair_issue_count: issues.length,
    citation_warnings: citationWarnings,
  });
  writeFileSync(join(GEN_DIR, file), JSON.stringify(items, null, 2), "utf8");
  repaired++;
}
console.log(`수리 완료: ${repaired}건`);
console.log(
  "재검증 대상 problem_ids:",
  verify
    .filter((v) => (v.issues ?? []).some((i) => i.severity !== "info"))
    .map((v) => {
      const items = genByFile.get(`${law}-${v.year}.json`);
      return items?.find((it) => it.problem_number === v.problem_number)?.problem_id;
    })
    .filter(Boolean)
    .join(","),
);
