// 생성된 채점기준·모범답안의 조문 인용 검증 (feat-2-034 Stage 3 안전망).
// tmp/rubric-gen/*.json 의 §N·제N조 인용을 추출해 현행 articles(article_number)와 대조.
// 존재하지 않는 조문(구법 번호 잔존·오변환 의심)과 "확인 필요" 마커를 리포트.
//
//   node scripts/jagwa/audit-rubric-citations.mjs

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const GEN_DIR = "tmp/rubric-gen";
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 현행 조문 번호 세트 (law_code → Set<article_number>)
const { data: laws } = await supa.from("laws").select("law_id, law_code");
const lawById = new Map(laws.map((l) => [l.law_id, l.law_code]));
const validByLaw = new Map(laws.map((l) => [l.law_code, new Set()]));
for (let from = 0; ; from += 1000) {
  const { data, error } = await supa
    .from("articles")
    .select("law_id, article_number, level")
    .eq("level", "article")
    .is("deleted_at", null)
    .range(from, from + 999);
  if (error) throw error;
  for (const a of data) {
    const code = lawById.get(a.law_id);
    if (code) validByLaw.get(code)?.add(String(a.article_number));
  }
  if (data.length < 1000) break;
}
console.log(
  "현행 조문 수:",
  [...validByLaw].map(([k, v]) => `${k}=${v.size}`).join(" "),
);

// 법명 → law_code (인용 앞 문맥에서 탐지)
const LAW_NAMES = [
  ["특허법", "patent"],
  ["상표법", "trademark"],
  ["디자인보호법", "design"],
  ["민사소송법", "civil-procedure"],
  ["민소법", "civil-procedure"],
  ["민법", "civil"],
];
// 검증 불가(우리 DB에 없는 법) — 인용 자체는 허용하고 스킵.
const SKIP_LAWS =
  /실용신안법|부정경쟁방지법|저작권법|민사집행법|헌법|상법|행정소송법|형법|형사소송법|법원조직법|변리사법|발명진흥법|조약|파리협약|TRIPs/;

// 텍스트에서 조문 인용 추출: §128의2①, 제33조의2 제1항, §34①7 등.
function extractCitations(text, defaultLaw) {
  const out = [];
  const re = /(§\s*(\d+(?:의\d+)?))|(제\s*(\d+(?:의\d+)?)\s*조(?:의(\d+))?)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    let num = m[2] ?? m[4];
    if (m[5]) num = `${num}의${m[5]}`; // "제33조의2" 형태
    const start = Math.max(0, m.index - 25);
    const ctx = text.slice(start, m.index + m[0].length + 5);
    const before = text.slice(start, m.index);
    // 앞 문맥의 법명 (가장 마지막 등장 우선)
    let law = defaultLaw;
    let lastPos = -1;
    for (const [name, code] of LAW_NAMES) {
      const pos = before.lastIndexOf(name);
      if (pos > lastPos) {
        lastPos = pos;
        law = code;
      }
    }
    if (SKIP_LAWS.test(before)) {
      const skipPos = before.search(SKIP_LAWS);
      if (skipPos > lastPos) continue; // 검증 불가 법 인용
    }
    const isOldLaw = /구\s*$|구\s*[가-힣]*법\s*$/.test(
      before.replace(/[\s(（]+$/, " "),
    ) || /구\s(특허법|상표법|디자인보호법|민사소송법|민법)?\s*§?\s*$/.test(before);
    out.push({ num, law, isOldLaw, ctx: ctx.replace(/\n/g, " ") });
  }
  return out;
}

const report = [];
let totalCit = 0;
let totalBad = 0;
for (const file of readdirSync(GEN_DIR).filter((f) => f.endsWith(".json"))) {
  const items = JSON.parse(readFileSync(join(GEN_DIR, file), "utf8"));
  for (const item of items) {
    const text = [
      item.grading_rubric_md,
      item.model_answer_md,
      ...(item.rubric_items ?? []).map((r) => r.label),
    ].join("\n");
    const cits = extractCitations(text, item.law);
    totalCit += cits.length;
    const bad = [];
    for (const c of cits) {
      if (c.isOldLaw) continue; // "구 …법" 명시 인용은 병기로 간주
      const valid = validByLaw.get(c.law);
      if (valid && !valid.has(c.num)) bad.push(c);
    }
    const marks = text.match(/현행 대응 확인 필요/g) ?? [];
    if (bad.length || marks.length) {
      totalBad += bad.length;
      report.push(
        `## ${item.law} ${item.year} 문제${item.problem_number}\n` +
          bad
            .map((b) => `- ✗ ${b.law} §${b.num} — 현행 조문 없음 · 문맥: …${b.ctx}…`)
            .join("\n") +
          (marks.length ? `\n- ⚠ "현행 대응 확인 필요" 마커 ${marks.length}건` : ""),
      );
    }
  }
}

const md =
  `# 조문 인용 검증 리포트\n\n총 인용 ${totalCit}건 중 의심 ${totalBad}건\n\n` +
  (report.length ? report.join("\n\n") : "이상 없음");
writeFileSync(join(GEN_DIR, "article-audit.md"), md, "utf8");
console.log(`인용 ${totalCit}건 / 의심 ${totalBad}건 / 파일 ${report.length}건 → ${join(GEN_DIR, "article-audit.md")}`);
