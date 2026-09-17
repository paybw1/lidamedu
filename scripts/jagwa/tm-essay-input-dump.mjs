// 상표법 2차 주관식 문항 입력 패킷 덤프 — 읽기 전용 (feat-2-039).
// problems(trademark·subjective) 68건을 tmp/essay/input/tm-<year>-<no>.json 으로 저장한다.
// 작성 에이전트는 이 파일만 읽고 DB 를 직접 만지지 않는다.
//
//   node scripts/jagwa/tm-essay-input-dump.mjs            # 전체
//   node scripts/jagwa/tm-essay-input-dump.mjs 2015 1     # 한 문항
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const OUT = "tmp/essay/input";
mkdirSync(OUT, { recursive: true });
const INSTR = "tmp/instructor-explanations";
const manifest = existsSync(`${INSTR}/manifest.json`)
  ? JSON.parse(readFileSync(`${INSTR}/manifest.json`, "utf8"))
  : [];
const [onlyYear, onlyNo] = process.argv.slice(2).map(Number);
// 변리사 2차 회차 = 연도 − 1963 (2015 → 52회)
const ROUND_OFFSET = 1963;

const { data: law, error: le } = await supa
  .from("laws")
  .select("law_id")
  .eq("law_code", "trademark")
  .single();
if (le) throw new Error(le.message);

let q = supa
  .from("problems")
  .select(
    "problem_id, year, problem_number, total_points, body_md, model_answer_md, grading_rubric_md, rubric_items, rubric_ai_generated_at",
  )
  .eq("law_id", law.law_id)
  .eq("format", "subjective")
  .is("deleted_at", null)
  .order("year")
  .order("problem_number");
if (onlyYear) q = q.eq("year", onlyYear);
if (onlyNo) q = q.eq("problem_number", onlyNo);
const { data: rows, error } = await q;
if (error) throw new Error(error.message);

const ids = rows.map((r) => r.problem_id);
const notes = [];
for (let i = 0; i < ids.length; i += 100) {
  const { data, error: ne } = await supa
    .from("problem_grading_notes")
    .select("problem_id, source, form, author, body_md")
    .in("problem_id", ids.slice(i, i + 100));
  if (ne) throw new Error(ne.message);
  notes.push(...data);
}
const noteBy = new Map();
for (const n of notes) {
  if (!noteBy.has(n.problem_id)) noteBy.set(n.problem_id, []);
  noteBy.get(n.problem_id).push(n);
}
const srcCount = {};
for (const n of notes) {
  const k = `${n.source}/${n.form ?? ""}`;
  srcCount[k] = (srcCount[k] ?? 0) + 1;
}

for (const r of rows) {
  const images = [...(r.body_md ?? "").matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(
    (m, i) => ({ n: i + 1, url: m[1] }),
  );
  let imgIdx = 0;
  const body = (r.body_md ?? "").replace(
    /!\[[^\]]*\]\([^)]*\)/g,
    () => `[img#${(imgIdx += 1)}]`,
  );
  const round = r.year - ROUND_OFFSET;
  const instructor_files = manifest
    .filter((e) => e.subject === "trademark" && e.round === round && !e.error)
    .map((e) => `${INSTR}/${round}회/${e.file.replace(/\.(pdf|hwpx?)$/i, ".txt")}`)
    .filter((p) => existsSync(p));
  const packet = {
    problem_id: r.problem_id,
    year: r.year,
    no: r.problem_number,
    round,
    points: r.total_points,
    body_md: body,
    // 발문의 상표 견본 이미지(본문의 [img#N] 과 대응). 표장 형태가 쟁점이면 받아서 본다.
    images,
    // 리담 강사 해설(2026-07 추출 텍스트, 있는 회차만). 논점·목차 참고용.
    instructor_files,
    grading_notes: (noteBy.get(r.problem_id) ?? []).map((n) => ({
      source: n.source,
      form: n.form,
      author: n.author,
      body_md: n.body_md,
    })),
    // B군(기존 생성분)만 값이 있다. 규칙 미반영분이므로 논점 참고용이며 문장을 옮기지 않는다.
    existing: r.model_answer_md
      ? {
          model_answer_md: r.model_answer_md,
          grading_rubric_md: r.grading_rubric_md,
          rubric_items: r.rubric_items,
          rubric_ai_generated_at: r.rubric_ai_generated_at,
        }
      : null,
  };
  writeFileSync(
    `${OUT}/tm-${r.year}-${r.problem_number}.json`,
    JSON.stringify(packet, null, 2),
  );
}
console.log(
  `wrote ${rows.length} packets → ${OUT}; existing MA: ${rows.filter((r) => r.model_answer_md).length}; notes by source/form: ${JSON.stringify(srcCount)}`,
);
