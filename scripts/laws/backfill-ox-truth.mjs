// ox_truth 백필 — 화면 유도값(auto-ox 규칙) 굳힘. ★null 만 채움·기존값 덮어쓰기 없음
//   (특허 149선지 백필과 동일 원칙, 커밋 86c09e00 병행 작업의 스크립트화).
// 규칙(app/features/problems/lib/auto-ox.ts 미러):
//   choice: mc_short 만, 부정형=정답 X·나머지 O / 긍정형=정답 O·나머지 X
//   box_item: mc_box 만, 정답 choice body 에 marker 포함 = 정답그룹 → 동일 규칙
//   mc_case·극성 없음·ox_ineligible → 건드리지 않음
//
//   node scripts/laws/backfill-ox-truth.mjs --law trademark          # dry-run
//   node scripts/laws/backfill-ox-truth.mjs --law trademark --apply
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const lawIdx = process.argv.indexOf("--law");
const LAW = lawIdx >= 0 ? process.argv[lawIdx + 1] : null;
if (!LAW) {
  console.error("--law <slug> 필요");
  process.exit(1);
}
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function applyPolarity(polarity, inAnswerGroup) {
  if (polarity === "negative") return inAnswerGroup ? "X" : "O";
  return inAnswerGroup ? "O" : "X";
}

const { data: law } = await c.from("laws").select("law_id").eq("law_code", LAW).single();
let problems = [];
for (let from = 0; ; from += 500) {
  const { data } = await c
    .from("problems")
    .select("problem_id, format, polarity")
    .eq("law_id", law.law_id)
    .is("deleted_at", null)
    .range(from, from + 499);
  if (!data?.length) break;
  problems.push(...data);
  if (data.length < 500) break;
}
const byId = new Map(problems.map((p) => [p.problem_id, p]));
const pids = problems.map((p) => p.problem_id);
console.log(`${LAW} — 문제 ${problems.length} · ${APPLY ? "APPLY" : "DRY-RUN"}`);

let chSet = 0, chSkip = 0, boxSet = 0, boxSkip = 0;
const samples = [];

// ── choices (mc_short) ──
for (let i = 0; i < pids.length; i += 150) {
  const slice = pids.slice(i, i + 150);
  const { data: chs } = await c
    .from("problem_choices")
    .select("choice_id, problem_id, is_correct, ox_truth, ox_ineligible, body_md")
    .in("problem_id", slice)
    .limit(5000);
  for (const ch of chs ?? []) {
    const p = byId.get(ch.problem_id);
    if (!p || p.format !== "mc_short" || !p.polarity || ch.ox_ineligible || ch.ox_truth != null) {
      chSkip++;
      continue;
    }
    const truth = applyPolarity(p.polarity, !!ch.is_correct);
    chSet++;
    if (samples.length < 8)
      samples.push({ kind: "choice", truth, body: (ch.body_md ?? "").slice(0, 60) });
    if (APPLY) {
      const { error } = await c
        .from("problem_choices")
        .update({ ox_truth: truth })
        .eq("choice_id", ch.choice_id)
        .is("ox_truth", null); // 경합 안전 — 그 사이 값이 생겼으면 미변경
      if (error) throw error;
    }
  }
}

// ── box items (mc_box) — 정답 choice body 의 marker 포함 여부 ──
const boxProblemIds = problems.filter((p) => p.format === "mc_box" && p.polarity).map((p) => p.problem_id);
const correctBodyByProblem = new Map();
for (let i = 0; i < boxProblemIds.length; i += 150) {
  const { data: chs } = await c
    .from("problem_choices")
    .select("problem_id, body_md, is_correct")
    .in("problem_id", boxProblemIds.slice(i, i + 150))
    .eq("is_correct", true)
    .limit(2000);
  for (const ch of chs ?? []) correctBodyByProblem.set(ch.problem_id, ch.body_md ?? "");
}
for (let i = 0; i < boxProblemIds.length; i += 150) {
  const { data: items } = await c
    .from("problem_box_items")
    .select("box_item_id, problem_id, marker, ox_truth, ox_ineligible, body_md")
    .in("problem_id", boxProblemIds.slice(i, i + 150))
    .limit(5000);
  for (const it of items ?? []) {
    const p = byId.get(it.problem_id);
    const correctBody = correctBodyByProblem.get(it.problem_id);
    if (!p || it.ox_ineligible || it.ox_truth != null || !correctBody || !it.marker) {
      boxSkip++;
      continue;
    }
    const truth = applyPolarity(p.polarity, correctBody.includes(it.marker));
    boxSet++;
    if (samples.length < 12)
      samples.push({ kind: "box", truth, body: (it.body_md ?? "").slice(0, 60) });
    if (APPLY) {
      const { error } = await c
        .from("problem_box_items")
        .update({ ox_truth: truth })
        .eq("box_item_id", it.box_item_id)
        .is("ox_truth", null);
      if (error) throw error;
    }
  }
}

console.log(
  `완료 — 선지 채움 ${chSet}(스킵 ${chSkip}) · 박스 채움 ${boxSet}(스킵 ${boxSkip}) · ${APPLY ? "적재됨" : "DRY-RUN(미적재)"}`,
);
for (const s of samples) console.log(`  [${s.kind}] ${s.truth} — ${s.body}`);
