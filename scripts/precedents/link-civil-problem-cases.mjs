// 민법 문항 ↔ 판례 상호 링크 + 중요도 후처리 (원장 지시 2026-08-20).
//
// 특허법과 같은 방식 — problem_case_links(relation_type='cited') 한 방향만 저장하고
// 조회에서 양방향으로 읽는다(개발 원칙 Layer 2-9).
//
// 하는 일
//   ① 민법 문항의 지문·선지·해설에서 사건번호를 뽑아 DB 의 민법 판례와 매칭 → 링크 insert
//   ② 인용 문항수 1건인 판례의 중요도를 NULL 로 (미부여) — 2~3=1 / 4~5=2 / 6+=3 과 구분
//
//   node scripts/precedents/link-civil-problem-cases.mjs           # dry-run
//   node scripts/precedents/link-civil-problem-cases.mjs --apply
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const CIVIL_LAW_ID = "74dc73af-f25d-40ff-aead-fb039471982c";
const NOTE = "civil-exam-scan";
const BATCH = 200;

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// 부호는 민사·가사·행정·형사까지 — 민법 문제가 인접 분야 판례를 인용한다.
const CASE_RE = /(\d{2,4})\s*(다카|다|므|스|마|그|재다|누|두|도|후|허|나|가합|가단)\s*(\d{1,6})/g;

async function pageAll(build) {
  const out = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await build().range(from, from + 499);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 500) break;
  }
  return out;
}

async function main() {
  const probs = await pageAll(() =>
    sb
      .from("problems")
      .select("problem_id, display_no, body_md, explanation_md, main_case_number")
      .eq("law_id", CIVIL_LAW_ID)
      .is("deleted_at", null)
      .order("problem_id"),
  );
  const ids = probs.map((p) => p.problem_id);
  const choices = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await sb
      .from("problem_choices")
      .select("problem_id, body_md, explanation_md, related_case_number")
      .in("problem_id", ids.slice(i, i + 150));
    if (error) throw new Error(error.message);
    choices.push(...(data ?? []));
  }
  const choiceText = new Map();
  for (const c of choices) {
    const prev = choiceText.get(c.problem_id) ?? "";
    choiceText.set(
      c.problem_id,
      `${prev}\n${c.body_md ?? ""}\n${c.explanation_md ?? ""}\n${c.related_case_number ?? ""}`,
    );
  }

  // 사건번호 → 인용 문항 집합
  const cited = new Map();
  for (const p of probs) {
    const text = [
      p.body_md ?? "",
      p.explanation_md ?? "",
      p.main_case_number ?? "",
      choiceText.get(p.problem_id) ?? "",
    ].join("\n");
    for (const m of text.matchAll(CASE_RE)) {
      const raw = `${m[1]}${m[2]}${m[3]}`;
      if (!cited.has(raw)) cited.set(raw, new Set());
      cited.get(raw).add(p.problem_id);
    }
  }

  // DB 의 민법 판례와 매칭 — 없는 사건번호는 링크 대상이 아니다(적재 실패분·미수록분).
  const numbers = [...cited.keys()];
  const caseIdOf = new Map();
  for (let i = 0; i < numbers.length; i += 100) {
    const { data, error } = await sb
      .from("cases")
      .select("case_id, case_number")
      .contains("subject_laws", ["civil"])
      .in("case_number", numbers.slice(i, i + 100))
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) caseIdOf.set(c.case_number, c.case_id);
  }

  // 이미 있는 링크는 건너뛴다(멱등).
  const caseIds = [...caseIdOf.values()];
  const have = new Set();
  for (let i = 0; i < caseIds.length; i += 100) {
    const { data, error } = await sb
      .from("problem_case_links")
      .select("problem_id, case_id")
      .in("case_id", caseIds.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const l of data ?? []) have.add(`${l.problem_id}:${l.case_id}`);
  }

  const rows = [];
  let unmatched = 0;
  for (const [raw, set] of cited) {
    const caseId = caseIdOf.get(raw);
    if (!caseId) {
      unmatched += 1;
      continue;
    }
    for (const problemId of set) {
      if (have.has(`${problemId}:${caseId}`)) continue;
      rows.push({
        problem_id: problemId,
        case_id: caseId,
        relation_type: "cited",
        note: NOTE,
      });
    }
  }

  // 중요도 후처리 — 인용 문항 1건이면 미부여(NULL).
  const singles = [...cited.entries()]
    .filter(([raw, set]) => set.size === 1 && caseIdOf.has(raw))
    .map(([raw]) => caseIdOf.get(raw));

  console.log(
    `민법 문항 ${probs.length}건 · 인용 사건번호 ${cited.size}개 · DB 매칭 ${caseIdOf.size}개 (미매칭 ${unmatched})`,
  );
  console.log(`새 링크 ${rows.length}건 · 기존 ${have.size}건`);
  console.log(`중요도 NULL 처리 대상(1문항 인용): ${singles.length}건`);
  if (!APPLY) {
    console.log("\n--apply 를 붙이면 반영합니다.");
    return;
  }

  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await sb
      .from("problem_case_links")
      .insert(rows.slice(i, i + BATCH));
    if (error) throw new Error(`링크 insert 실패: ${error.message}`);
    console.log(`  링크 ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  for (let i = 0; i < singles.length; i += 100) {
    const { error } = await sb
      .from("cases")
      .update({ importance: null })
      .in("case_id", singles.slice(i, i + 100));
    if (error) throw new Error(`중요도 갱신 실패: ${error.message}`);
  }
  console.log(`\n링크 ${rows.length}건 · 중요도 NULL ${singles.length}건 반영 완료.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
