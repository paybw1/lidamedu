// 상표 판례 인덱스의 메타 정보를 구조화 필드로 이동 (원장 지시 2026-07-07).
//  - "N회(YYYY) 기출."            → cases.exam_2nd_years (뷰어 기출 칩으로 노출)
//  - "대법원 판례해설 N호 M면."    → case_references (kind=paper)
//  - "지식재산법 중요판례평석(YYYY)." → case_references (kind=paper)
// 해당 줄은 인덱스에서 제거, 인덱스가 비면 섹션 삭제. 멱등(중복 삽입 없음).
// 재적재(backfill --apply) 후에는 이 스크립트를 재실행해야 한다.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const EXAM_RE = /^(\d{1,3})회\((\d{4})\)\s*기출\.?$/;
const HAESEOL_RE = /^대법원\s*판[례레]해설\s*(\d+)호(?:\s*(\d+)면)?\.?$/;
const PYEONGSEOK_RE = /^지식재산법\s*중요판례평석\s*\((\d{4})\)\.?$/;

const { data: rows, error } = await sb
  .from("cases")
  .select("case_id, case_number, exam_2nd_years, book_sections")
  .eq("subject_laws", "{trademark}")
  .not("book_sections", "is", null)
  .is("deleted_at", null);
if (error) throw error;

let examN = 0, refN = 0, caseN = 0;
for (const r of rows) {
  const sections = r.book_sections?.sections;
  if (!Array.isArray(sections)) continue;
  const idxAt = sections.findIndex((s) => s.key === "index");
  if (idxAt < 0) continue;
  const idx = sections[idxAt];
  const keep = [];
  const examYears = new Set(r.exam_2nd_years ?? []);
  const refs = [];
  for (const b of idx.blocks) {
    const t = b.type === "p" ? b.text.trim() : "";
    let m;
    if (b.type === "p" && (m = EXAM_RE.exec(t))) {
      examYears.add(Number(m[2]));
      continue;
    }
    if (b.type === "p" && (m = HAESEOL_RE.exec(t))) {
      refs.push(`대법원 판례해설 ${m[1]}호${m[2] ? ` ${m[2]}면` : ""}`);
      continue;
    }
    if (b.type === "p" && (m = PYEONGSEOK_RE.exec(t))) {
      refs.push(`지식재산법 중요판례평석(${m[1]})`);
      continue;
    }
    keep.push(b);
  }
  const examChanged = examYears.size !== (r.exam_2nd_years ?? []).length;
  if (keep.length === idx.blocks.length && !examChanged && refs.length === 0) continue;
  caseN++;

  // 인덱스 갱신 (비면 섹션 제거)
  if (keep.length > 0) sections[idxAt] = { ...idx, blocks: keep };
  else sections.splice(idxAt, 1);

  const patch = { book_sections: { ...r.book_sections, sections } };
  if (examChanged) {
    patch.exam_2nd_years = [...examYears].sort((a, b) => a - b);
    examN++;
  }
  const { error: e1 } = await sb.from("cases").update(patch).eq("case_id", r.case_id);
  if (e1) throw e1;

  // 문헌 upsert (동일 title 기존재 skip)
  if (refs.length > 0) {
    const { data: existing, error: e2 } = await sb
      .from("case_references")
      .select("title")
      .eq("case_id", r.case_id);
    if (e2) throw e2;
    const have = new Set((existing ?? []).map((x) => x.title));
    let ord = 0;
    const inserts = refs
      .filter((t) => !have.has(t))
      .map((t) => ({ case_id: r.case_id, kind: "paper", title: t, ord: ord++ }));
    if (inserts.length > 0) {
      const { error: e3 } = await sb.from("case_references").insert(inserts);
      if (e3) throw e3;
      refN += inserts.length;
    }
  }
  console.log(
    `OK ${r.case_number}: 기출 ${examChanged ? [...examYears].join(",") : "-"} / 문헌 +${refs.length} / 인덱스 잔여 ${keep.length}`,
  );
}
console.log(`\n완료 — 판례 ${caseN}건, 기출 갱신 ${examN}건, 문헌 삽입 ${refN}건`);
