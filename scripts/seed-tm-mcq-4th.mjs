// 리담상표법 객관식 제4판 → 운영 DB **전량 재시드** (원장 지시 2026-09-14).
//
// 「교재 정답이 맞고, 전량 재시드」 — 발문·선지·해설·정답을 전부 교재에서 새로 쓴다.
// DB 값을 내용의 근거로 삼지 않는다.
//
// ★★다만 **교재에 없는 정보**는 옮겨 붙인다. 버리면 되살릴 수 없고, 교재를 다시 읽어도
//   복구되지 않기 때문이다:
//     · exam_number      — 실제 시험 문항번호. 제4판은 주제별로 재편하며 이 번호를 **버렸다**
//     · primary_node_id  — 체계도 배치(2026-07-30 마이그레이션 산물)
//     · problem_number   — 노드 내 순번
//     · 판례 연결 175 · 모의고사 수록 219 · 오프라인시험 20 · 학생 풀이 56 · SRS 43
//   옛 문항은 soft delete 하고, 위 연결들은 **새 문항으로 재지정**한다.
//
// ★정답 규약: 교재의 「정답 없음」(출제오류 정답취소)은 **전항정답**으로 적재한다
//   — 2026-08-01 원장 확정('정답키 0개' 관례 폐기).
//
//   node scripts/seed-tm-mcq-4th.mjs <parsed.json> [--apply]

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { readFileSync } from "node:fs";

const LAW_CODE = "trademark";
const DOC_LABEL = "리담상표법 객관식 문제집 (제4판)";
const DOC_FILE = "[완0914+내지] 리담상표법 객관식 문제집 (제4판).hwpx";

const [, , parsedPath] = process.argv;
const apply = process.argv.includes("--apply");
if (!parsedPath) {
  console.error("사용: node scripts/seed-tm-mcq-4th.mjs <parsed.json> [--apply]");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정 (.env)");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** 발문 비교용 정규화 — 공백·문장부호를 지운다. */
const norm = (s) =>
  (s ?? "")
    .replace(/\s+/g, "")
    .replace(/[·․.,''‘’"“”「」『』()（）\[\]]/g, "")
    .replace(/[ㆍ・]/g, "");

/** 페이지 단위로 전부 읽는다(PostgREST 기본 1000행 절단 방지 — 선례: mcq-answer-explanation-drift). */
async function selectAll(table, columns, apply_) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const q = apply_(db.from(table).select(columns).range(from, from + 999));
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows;
}

// ── 1. 교재 ───────────────────────────────────────────────────────────────────
const book = JSON.parse(readFileSync(parsedPath, "utf8"));
console.log("교재 문항:", book.length);

// ── 2. 현행 DB ────────────────────────────────────────────────────────────────
const { data: law } = await db.from("laws").select("law_id").eq("law_code", LAW_CODE).single();
const lawId = law.law_id;

const dbProblems = await selectAll(
  "problems",
  "problem_id, year, exam_number, exam_round_no, problem_number, primary_node_id, body_md, source_doc_id",
  (q) => q.eq("law_id", lawId).eq("scope", "comprehensive").is("deleted_at", null),
);
console.log("DB 현행 문항:", dbProblems.length);

// ── 3. 매칭 (연도 + 발문) ─────────────────────────────────────────────────────
// ★DB 발문에는 박스(ㄱ,ㄴ…)가 이어 붙어 있는 경우가 있어 **앞부분 비교**를 쓴다.
//   교재 쪽 오타·표기차(「유사여부에 판단에」)도 있으므로 길이를 줄여 가며 재시도한다.
const used = new Set();
const matchOf = new Map(); // book.no → db row
for (const len of [40, 28, 20, 14]) {
  const index = new Map();
  for (const d of dbProblems) {
    if (used.has(d.problem_id)) continue;
    const k = d.year + "|" + norm(d.body_md).slice(0, len);
    if (!index.has(k)) index.set(k, []);
    index.get(k).push(d);
  }
  for (const b of book) {
    if (matchOf.has(b.no)) continue;
    const k = b.year + "|" + norm(b.stem).slice(0, len);
    const hit = (index.get(k) ?? []).find((d) => !used.has(d.problem_id));
    if (hit) {
      used.add(hit.problem_id);
      matchOf.set(b.no, hit);
    }
  }
}
// ★마지막 단계 — 문구가 달라 못 붙은 것들. 같은 연도에 **남은 DB 행이 딱 하나**일 때만
//   짝지운다. 문구 차이의 실체는 교재 개정(「상표의 유사 판단」↔「상표의 유사여부 판단」)
//   이거나 DB 오타(「유사여부에 판단에」)다. 하나뿐일 때만 붙이므로 엉뚱한 짝이 생기지 않는다.
const byYearLeft = new Map();
for (const d of dbProblems) {
  if (used.has(d.problem_id)) continue;
  if (!byYearLeft.has(d.year)) byYearLeft.set(d.year, []);
  byYearLeft.get(d.year).push(d);
}
const looseMatches = [];
for (const b of book) {
  if (matchOf.has(b.no)) continue;
  const cands = (byYearLeft.get(b.year) ?? []).filter((d) => !used.has(d.problem_id));
  if (cands.length !== 1) continue;
  used.add(cands[0].problem_id);
  matchOf.set(b.no, cands[0]);
  looseMatches.push({ no: b.no, year: b.year, exam: cands[0].exam_number, book: b.stem.slice(0, 34), db: cands[0].body_md.slice(0, 34) });
}
if (looseMatches.length) {
  console.log("\n연도 단독 대응(문구 차이) " + looseMatches.length + "건 — 확인 대상:");
  for (const m of looseMatches) {
    console.log(`  [${m.no}] ${m.year}-${m.exam}\n      교재: ${m.book}\n      DB  : ${m.db}`);
  }
}

const unmatchedBook = book.filter((b) => !matchOf.has(b.no));
const orphanDb = dbProblems.filter((d) => !used.has(d.problem_id));
console.log(
  `매칭 ${matchOf.size}/${book.length} | 교재에만 ${unmatchedBook.length} | DB에만 ${orphanDb.length}`,
);
if (unmatchedBook.length)
  console.log(
    "  교재에만:",
    unmatchedBook.map((b) => `[${b.no}]${b.year}`).join(" "),
  );
if (orphanDb.length)
  console.log("  DB에만:", orphanDb.map((d) => `${d.year}-${d.exam_number ?? "?"}`).join(" "));

// ── 4. 적재할 행 만들기 ───────────────────────────────────────────────────────
/** 교재 「정답 없음」 = 출제오류 정답취소 → 전항정답(2026-08-01 원장 확정). */
const correctSetOf = (b) => (b.answerNone ? [0, 1, 2, 3, 4] : b.answers);

// ★교재 조판 잔재 — 발문 앞에 붙은 외톨이 한 글자(110번 「상A는 …」). 교재 원문에 있지만
//   문장이 아니라 판면 부스러기다. 지우되 **조용히 지우지 않는다** — 아래에 찍어서 보고한다.
const artifacts = [];
const cleanStem = (no, stem) => {
  const m = /^([가-힣])(?=[A-Z甲乙丙丁])/.exec(stem);
  if (!m) return stem;
  artifacts.push({ no, removed: m[1], after: stem.slice(0, 40) });
  return stem.slice(1);
};

const rows = book.map((b) => {
  const m = matchOf.get(b.no);
  const complete = b.choiceExplanations.length >= b.choices.length;
  const stem = cleanStem(b.no, b.stem);
  return {
    book: b,
    old: m ?? null,
    problem: {
      law_id: lawId,
      exam_round: "first",
      subject_type: "law",
      origin: "past_exam",
      format: "mc_short",
      scope: "comprehensive",
      polarity: b.polarity,
      year: b.year,
      exam_round_no: m?.exam_round_no ?? b.year - 1963,
      // ★교재가 버린 값들 — 옛 행에서 옮겨 온다.
      exam_number: m?.exam_number ?? null,
      problem_number: m?.problem_number ?? null,
      primary_node_id: m?.primary_node_id ?? null,
      body_md: b.box ? `${stem}\n\n${b.box}` : stem,
      // ★선지별 해설이 **완비될 때만** 선지에 넣고, 아니면 문제 단위 종합해설로 둔다.
      //   둘 다 채우면 화면에 같은 글이 두 번 나온다(선례: haeseol-lives-in-choices).
      explanation_md: complete ? null : (b.explanationRaw ?? null),
      review_status: "approved",
      approved_at: new Date().toISOString(),
    },
    choices: b.choices.map((c) => ({
      choice_index: c.index + 1, // ★DB 는 1-based
      body_md: c.text,
      is_correct: correctSetOf(b).includes(c.index),
      explanation_md: complete
        ? (b.choiceExplanations.find((e) => e.index === c.index)?.md ?? null)
        : null,
    })),
  };
});

const stat = {
  "전항정답(교재 정답없음)": rows.filter((r) => r.book.answerNone).length,
  복수정답: rows.filter((r) => !r.book.answerNone && r.book.answers.length > 1).length,
  "선지해설 완비": rows.filter((r) => r.choices.some((c) => c.explanation_md)).length,
  "종합해설로 둠": rows.filter((r) => r.problem.explanation_md).length,
  "배치 이어받음": rows.filter((r) => r.problem.primary_node_id).length,
  "시험번호 이어받음": rows.filter((r) => r.problem.exam_number != null).length,
  박스보유: rows.filter((r) => r.book.box).length,
};
console.log("\n적재 예정:");
for (const [k, v] of Object.entries(stat)) console.log(`  ${k}: ${v}`);
if (artifacts.length) {
  console.log("\n★교재 조판 잔재 제거 " + artifacts.length + "건:");
  for (const a of artifacts) console.log(`  [${a.no}] 「${a.removed}」 제거 → ${a.after}`);
}

const badRows = rows.filter((r) => r.choices.length !== 5 || !r.choices.some((c) => c.is_correct));
if (badRows.length) {
  console.error("★적재 불가 행:", badRows.map((r) => r.book.no).join(","));
  process.exit(1);
}

if (!apply) {
  console.log("\n(dry-run) --apply 를 붙이면 실제로 적재합니다.");
  process.exit(0);
}

// ── 5. 적재 ───────────────────────────────────────────────────────────────────
const { data: doc, error: docErr } = await db
  .from("problem_source_docs")
  .upsert({ label: DOC_LABEL, file_name: DOC_FILE, kind: "workbook", edition: "제4판" }, { onConflict: "label" })
  .select("source_doc_id")
  .single();
if (docErr) throw docErr;
console.log("source_doc:", doc.source_doc_id);

const idMap = new Map(); // old problem_id → new problem_id
let inserted = 0;
for (const r of rows) {
  const { data: p, error } = await db
    .from("problems")
    .insert({ ...r.problem, source_doc_id: doc.source_doc_id })
    .select("problem_id")
    .single();
  if (error) throw new Error(`[${r.book.no}] ${error.message}`);
  const { error: cErr } = await db
    .from("problem_choices")
    .insert(r.choices.map((c) => ({ ...c, problem_id: p.problem_id })));
  if (cErr) throw new Error(`[${r.book.no}] 선지 ${cErr.message}`);
  if (r.old) idMap.set(r.old.problem_id, p.problem_id);
  inserted++;
  if (inserted % 40 === 0) console.log("  적재", inserted, "/", rows.length);
}
console.log("문항 적재 완료:", inserted);

// ── 6. 연결 재지정 ────────────────────────────────────────────────────────────
// ★새 문항으로 옮겨 붙인다. 옮기지 않으면 판례 연결·모의고사 수록이 soft-delete 된
//   옛 문항을 가리킨 채 화면에서 사라진다.
const REPOINT = [
  ["problem_case_links", "problem_id"],
  ["mcq_pack_problems", "problem_id"],
  ["offline_test_questions", "problem_id"],
  ["offline_test_questions", "ox_problem_id"],
  ["user_problem_attempts", "problem_id"],
  ["user_problem_srs", "problem_id"],
  ["user_quiz_flags", "problem_id"],
];
for (const [table, col] of REPOINT) {
  let moved = 0;
  for (const [oldId, newId] of idMap) {
    const { error, count } = await db
      .from(table)
      .update({ [col]: newId }, { count: "exact" })
      .eq(col, oldId);
    if (error) throw new Error(`${table}.${col}: ${error.message}`);
    moved += count ?? 0;
  }
  console.log(`재지정 ${table}.${col}: ${moved}`);
}

// ── 7. 옛 문항 soft delete ────────────────────────────────────────────────────
// ★**교체된 것만** 지운다. 교재에 없는 DB 행(국제조약 2건 — 교재가 「상표관련 조약문제는
//   아님」이라며 뺀 것)은 대체하는 새 문항이 없으므로, 지우면 순손실이다. 살려 둔다.
const nowIso = new Date().toISOString();
const oldIds = [...idMap.keys()];
const kept = dbProblems.filter((d) => !idMap.has(d.problem_id));
if (kept.length) {
  console.log(
    "\n교재에 없어 **살려 두는** 옛 문항 " + kept.length + "건: " +
      kept.map((d) => `${d.year}-${d.exam_number ?? "?"}`).join(", "),
  );
}
for (let i = 0; i < oldIds.length; i += 100) {
  const { error } = await db
    .from("problems")
    .update({ deleted_at: nowIso })
    .in("problem_id", oldIds.slice(i, i + 100));
  if (error) throw error;
}
console.log("옛 문항 soft delete:", oldIds.length);
console.log("\n★후속 필수: ox_truth 재산출 + 미배치 문항 배치 확인");
