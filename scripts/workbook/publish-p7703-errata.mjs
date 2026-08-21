// P-7703 ⑤ 정오표 발행 — 교재(객관식 Ⅱ 예상문제 제20판) 문구를 DB 정정본으로 바로잡는다.
//
// 워크북 기울임체 작업(extract-cross-unit) 중 원본과 DB 문구가 어긋난 걸 발견했다.
// 원장 확인: DB 가 원본을 고친 쪽이다 → 교재 쪽에 정오표를 낸다.
//
//   교재: … 분할출원은 **그 우선권 주장의 기초가 된 출원일**부터 1년 2개월이 …
//   정정: … 분할출원은 **원출원일**부터 1년 2개월이 …
//
// ★개정 원장(content_revisions)에 이 정정에 해당하는 행이 없다(DB 가 시드 단계에서 이미
//   정정본이었다). 발행하려면 원장 행이 있어야 하므로 스냅샷을 만들어 넣고 발행한다.
//
//   node scripts/workbook/publish-p7703-errata.mjs            # dry-run
//   node scripts/workbook/publish-p7703-errata.mjs --apply
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const PROD_REF = "mcgdoplovrjgklbxmozi";
if (!process.env.SUPABASE_URL?.includes(PROD_REF)) throw new Error("운영 DB 가 아니다 — 중단");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PROBLEM_ID = "6874e6a3-4907-4acc-851c-2b226e5e4fa1"; // P-7703
const CHOICE_INDEX = 5;
const ADMIN_ID = "e20ac99a-bfa6-4862-94dd-23c063189463"; // 임병웅 admin
/** 교재 제20판 문제편 원문 — scripts/workbook/extract-cross-unit.mjs 추출분. */
const BOOK_TEXT =
  "특허출원서에 최초로 첨부한 명세서에 청구범위를 적지 아니한 분할출원은 그 우선권 주장의 기초가 된 출원일부터 1년 2개월이 지난 후에도 분할출원을 한 날로부터 3개월 이내에 명세서에 청구범위를 적는 보정을 할 수 있다.";
/** 정오표 위치 표기 — 이 문항 매핑에 toc_path 가 비어 "수록순 11" 로만 나온다. */
const TOC_PATH = "이익제도 > 분할출원";

const { data: problem, error: pErr } = await sb
  .from("problems")
  .select("problem_id, display_no, format, law_id, primary_node_id, science_subject, body_md")
  .eq("problem_id", PROBLEM_ID)
  .single();
if (pErr) throw pErr;

const { data: choice, error: cErr } = await sb
  .from("problem_choices")
  .select("*")
  .eq("problem_id", PROBLEM_ID)
  .eq("choice_index", CHOICE_INDEX)
  .single();
if (cErr) throw cErr;

if (choice.body_md === BOOK_TEXT) {
  throw new Error("DB 가 이미 교재 원문과 같다 — 정정할 게 없다(중단)");
}

// 이미 같은 취지로 발행된 게 있으면 중복 발행하지 않는다.
const { data: existing, error: eErr } = await sb
  .from("content_revisions")
  .select("revision_id, notice_status, errata_title, errata_payload")
  .eq("content_id", PROBLEM_ID);
if (eErr) throw eErr;
const dup = (existing ?? []).find(
  (r) => r.notice_status === "published" && r.errata_payload?.before_text === BOOK_TEXT,
);
if (dup) throw new Error(`이미 발행됨: ${dup.revision_id} (${dup.errata_title}) — 중단`);

console.log(`P-${problem.display_no} ${String(problem.body_md).slice(0, 40)} · 지문 ${CHOICE_INDEX}`);
console.log(`  변경 전(교재): ${BOOK_TEXT}`);
console.log(`  변경 후(정정): ${choice.body_md}`);
console.log(`  기존 원장 행 ${existing?.length ?? 0}건`);

const title = `P-${problem.display_no} · 예상문제`;
const before = { ...choice, body_md: BOOK_TEXT };
const after = { ...choice };
// cross_unit 은 이번 표시 작업으로 붙인 파생 플래그다 — 정오 스냅샷에서는 뺀다.
delete before.cross_unit;
delete after.cross_unit;

console.log(`\n제목 "${title}" · 종류 typo · 심각도 normal · 재채점 없음`);
console.log(`위치 표기 toc_path → "${TOC_PATH}"`);
if (!APPLY) {
  console.log("\n--apply 를 붙이면 발행합니다.");
  process.exit(0);
}

const { data: rev, error: insErr } = await sb
  .from("content_revisions")
  .insert({
    content_type: "mcq",
    content_id: PROBLEM_ID,
    node_id: problem.primary_node_id,
    op: "UPDATE",
    before_snapshot: before,
    after_snapshot: after,
    changed_fields: ["body_md"],
    notice_status: "none",
    apply_status: "applied",
    applied_at: new Date().toISOString(),
    created_by: ADMIN_ID,
    source_ref: {
      id: choice.choice_id,
      table: "problem_choices",
      format: problem.format,
      choice_no: String(CHOICE_INDEX),
    },
    subject_ref: { law_id: problem.law_id, science_subject: problem.science_subject },
  })
  .select("revision_id")
  .single();
if (insErr) throw insErr;
console.log(`원장 행 생성 ${rev.revision_id}`);

// 위치 표기 보강 — 없으면 "수록순 11" 로만 나와 교재에서 찾기 어렵다.
const { error: mapErr } = await sb
  .from("publication_content_map")
  .update({ toc_path: TOC_PATH })
  .eq("content_type", "mcq")
  .eq("content_id", PROBLEM_ID)
  .is("toc_path", null);
if (mapErr) throw mapErr;

const { data: published, error: pubErr } = await sb.rpc("fn_publish_errata", {
  p_revision_ids: [rev.revision_id],
  p_errata_kind: "typo",
  p_errata_severity: "normal",
  p_errata_title: title,
  p_errata_payload: {
    before_text: BOOK_TEXT,
    after_text: choice.body_md,
    regrade_requested: false,
  },
  p_errata_reason: "",
});
if (pubErr) throw pubErr;
console.log(`발행 완료 ${JSON.stringify(published)}`);
