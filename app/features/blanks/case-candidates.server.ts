// feat-2-029 S5 — 판례 빈칸 후보(case_blank_candidates) 승인 큐.
//   승인 = 대상 판례의 '기출 유래' 세트(case_blank_sets)에 blank 추가(없으면 세트 생성).
//   거절/되돌리기 포함. 전 과정 요청 클라이언트(RLS staff 정책)로 수행 — adminClient 불필요.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { CaseBlankItem, CaseBlankTarget } from "./case-queries.server";

// 승인분이 쌓이는 세트 식별자(케이스당 1개 find-or-create).
const AUTO_SET_DISPLAY_NAME = "기출 유래";

export type CaseCandidateStatus = "pending" | "approved" | "rejected";

export interface CaseBlankCandidateRow {
  candidateId: string;
  caseId: string;
  caseNumber: string;
  caseTitle: string | null;
  subjectSlug: string | null;
  target: CaseBlankTarget;
  itemIndex: number | null;
  answer: string;
  beforeContext: string | null;
  afterContext: string | null;
  sourceDisplayNo: number | null;
  sourceProblemId: string | null;
  falseStatement: string | null;
  rationale: string | null;
  status: CaseCandidateStatus;
  createdAt: string;
}

type RawCandidate = {
  candidate_id: string;
  case_id: string;
  target: string;
  item_index: number | null;
  answer: string;
  before_context: string | null;
  after_context: string | null;
  source_display_no: number | null;
  source_problem_id: string | null;
  false_statement: string | null;
  rationale: string | null;
  status: string;
  created_at: string;
  cases: {
    case_number: string;
    case_title: string | null;
    subject_laws: string[] | null;
  } | null;
};

function rowToCandidate(r: RawCandidate): CaseBlankCandidateRow {
  return {
    candidateId: r.candidate_id,
    caseId: r.case_id,
    caseNumber: r.cases?.case_number ?? "(판례 없음)",
    caseTitle: r.cases?.case_title ?? null,
    subjectSlug: r.cases?.subject_laws?.[0] ?? null,
    target: (r.target === "reasoning" || r.target === "comment"
      ? r.target
      : "summary") as CaseBlankTarget,
    itemIndex: r.item_index,
    answer: r.answer,
    beforeContext: r.before_context,
    afterContext: r.after_context,
    sourceDisplayNo: r.source_display_no,
    sourceProblemId: r.source_problem_id,
    falseStatement: r.false_statement,
    rationale: r.rationale,
    status: (r.status === "approved" || r.status === "rejected"
      ? r.status
      : "pending") as CaseCandidateStatus,
    createdAt: r.created_at,
  };
}

const CANDIDATE_SELECT =
  "candidate_id, case_id, target, item_index, answer, before_context, after_context, source_display_no, source_problem_id, false_statement, rationale, status, created_at, cases!case_id(case_number, case_title, subject_laws)";

// 상태별 후보 목록 — 판례(사건번호)별로 묶여 보이도록 case_id, created_at 순 정렬.
export async function listCaseBlankCandidates(
  client: SupabaseClient<Database>,
  status: CaseCandidateStatus,
  limit = 600,
): Promise<CaseBlankCandidateRow[]> {
  const { data, error } = await client
    .from("case_blank_candidates")
    .select(CANDIDATE_SELECT)
    .eq("status", status)
    .order("case_id")
    .order("created_at")
    .limit(limit);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as RawCandidate[]).map(rowToCandidate);
  // 같은 판례끼리는 이미 인접 — 판례 그룹 자체를 사건번호순으로 재정렬.
  return rows.sort(
    (a, b) =>
      a.caseNumber.localeCompare(b.caseNumber, "ko") ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

export async function countCaseBlankCandidates(
  client: SupabaseClient<Database>,
): Promise<Record<CaseCandidateStatus, number>> {
  const count = async (status: CaseCandidateStatus) => {
    const { count: n, error } = await client
      .from("case_blank_candidates")
      .select("candidate_id", { count: "exact", head: true })
      .eq("status", status);
    if (error) throw error;
    return n ?? 0;
  };
  const [pending, approved, rejected] = await Promise.all([
    count("pending"),
    count("approved"),
    count("rejected"),
  ]);
  return { pending, approved, rejected };
}

type MutationResult = { ok: true } | { ok: false; error: string };

type CandidateFull = RawCandidate & { cum_offset: number | null };

async function fetchCandidate(
  client: SupabaseClient<Database>,
  candidateId: string,
): Promise<CandidateFull | null> {
  const { data, error } = await client
    .from("case_blank_candidates")
    .select(`${CANDIDATE_SELECT}, cum_offset`)
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as CandidateFull | null;
}

// 후보의 target 이 가리키는 판례 원문 텍스트(요지 항 body / 판시이유 / 평석).
async function fetchTargetText(
  client: SupabaseClient<Database>,
  caseId: string,
  target: CaseBlankTarget,
  itemIndex: number | null,
): Promise<string> {
  const { data, error } = await client
    .from("cases")
    .select("summary_items, reasoning_md, comment_body_md")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return "";
  if (target === "reasoning") return data.reasoning_md ?? "";
  if (target === "comment") return data.comment_body_md ?? "";
  const items = Array.isArray(data.summary_items) ? data.summary_items : [];
  const item = items[itemIndex ?? 0] as { body?: string } | undefined;
  return item?.body ?? "";
}

const CONTEXT_LEN = 30;

// 승인 — 검증(원문 verbatim) → 세트 find-or-create → blank 추가(중복은 근거 병합) → 후보 approved.
export async function approveCaseCandidate(
  client: SupabaseClient<Database>,
  candidateId: string,
  reviewerId: string,
  editedAnswer?: string,
): Promise<MutationResult> {
  const cand = await fetchCandidate(client, candidateId);
  if (!cand) return { ok: false, error: "후보를 찾을 수 없습니다." };
  if (cand.status === "approved")
    return { ok: false, error: "이미 승인된 후보입니다." };

  const target = (
    cand.target === "reasoning" || cand.target === "comment"
      ? cand.target
      : "summary"
  ) as CaseBlankTarget;
  const itemIndex = target === "summary" ? (cand.item_index ?? 0) : null;
  const answer = (editedAnswer ?? cand.answer).trim();
  if (!answer) return { ok: false, error: "빈칸 정답이 비어 있습니다." };

  // 원문 verbatim 재검증 — 후보 생성 이후 판례가 편집됐을 수 있으므로 승인 시점에 다시 확인.
  const text = await fetchTargetText(client, cand.case_id, target, itemIndex);
  let pos =
    answer === cand.answer &&
    cand.cum_offset != null &&
    text.startsWith(answer, cand.cum_offset)
      ? cand.cum_offset
      : text.indexOf(answer);
  if (pos < 0)
    return {
      ok: false,
      error: `"${answer}" 가 판례 원문에 없습니다(원문 편집 또는 수정 오타).`,
    };
  const beforeContext = text.slice(Math.max(0, pos - CONTEXT_LEN), pos);
  const afterContext = text.slice(pos + answer.length, pos + answer.length + CONTEXT_LEN);
  const sourceOx =
    cand.source_display_no != null ? `P-${cand.source_display_no}` : undefined;

  // 세트 find-or-create — 케이스당 '기출 유래' 세트 1개에 누적.
  const { data: sets, error: setErr } = await client
    .from("case_blank_sets")
    .select("set_id, blanks")
    .eq("case_id", cand.case_id)
    .eq("display_name", AUTO_SET_DISPLAY_NAME)
    .order("created_at")
    .limit(1);
  if (setErr) return { ok: false, error: setErr.message };
  let setId = sets?.[0]?.set_id;
  let blanks: CaseBlankItem[] = Array.isArray(sets?.[0]?.blanks)
    ? (sets[0].blanks as unknown as CaseBlankItem[])
    : [];
  if (!setId) {
    const { data: created, error: insErr } = await client
      .from("case_blank_sets")
      .insert({
        case_id: cand.case_id,
        owner_id: reviewerId,
        version: "v1",
        display_name: AUTO_SET_DISPLAY_NAME,
        importance: 1,
        blanks: [] as never,
      })
      .select("set_id")
      .single();
    if (insErr) return { ok: false, error: insErr.message };
    setId = created.set_id;
    blanks = [];
  }

  // 같은 자리(target·항·정답) blank 가 이미 있으면 새로 뚫지 않고 근거 OX 만 병합.
  const dup = blanks.find(
    (b) =>
      b.target === target &&
      (b.itemIndex ?? null) === itemIndex &&
      b.answer === answer,
  );
  if (dup) {
    if (sourceOx && !(dup.sourceOx ?? "").split(", ").includes(sourceOx)) {
      dup.sourceOx = dup.sourceOx ? `${dup.sourceOx}, ${sourceOx}` : sourceOx;
    }
  } else {
    blanks.push({
      idx: blanks.reduce((m, b) => Math.max(m, b.idx), -1) + 1,
      target,
      ...(itemIndex != null ? { itemIndex } : {}),
      answer,
      beforeContext,
      afterContext,
      cumOffset: pos,
      ...(sourceOx ? { sourceOx } : {}),
    });
  }

  const { error: updSetErr } = await client
    .from("case_blank_sets")
    .update({ blanks: blanks as never, updated_at: new Date().toISOString() })
    .eq("set_id", setId);
  if (updSetErr) return { ok: false, error: updSetErr.message };

  // 후보에 승인 시점의 실제 값(수정 반영)을 남긴다 — 되돌리기 시 세트에서 같은 blank 를 특정하기 위함.
  const { error: updCandErr } = await client
    .from("case_blank_candidates")
    .update({
      status: "approved",
      answer,
      before_context: beforeContext,
      after_context: afterContext,
      cum_offset: pos,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
    })
    .eq("candidate_id", candidateId);
  if (updCandErr) return { ok: false, error: updCandErr.message };
  return { ok: true };
}

export async function rejectCaseCandidate(
  client: SupabaseClient<Database>,
  candidateId: string,
  reviewerId: string,
): Promise<MutationResult> {
  const { error } = await client
    .from("case_blank_candidates")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
    })
    .eq("candidate_id", candidateId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 되돌리기 — approved 는 세트에서 해당 blank 제거(동일 blank 를 공유하는 다른 승인 후보가 없을 때만).
export async function revertCaseCandidate(
  client: SupabaseClient<Database>,
  candidateId: string,
): Promise<MutationResult> {
  const cand = await fetchCandidate(client, candidateId);
  if (!cand) return { ok: false, error: "후보를 찾을 수 없습니다." };
  if (cand.status === "approved") {
    const target = (
      cand.target === "reasoning" || cand.target === "comment"
        ? cand.target
        : "summary"
    ) as CaseBlankTarget;
    const itemIndex = target === "summary" ? (cand.item_index ?? 0) : null;

    // 같은 blank 로 병합된 다른 승인 후보가 남아 있으면 세트는 건드리지 않는다.
    let sibQuery = client
      .from("case_blank_candidates")
      .select("candidate_id")
      .eq("case_id", cand.case_id)
      .eq("status", "approved")
      .eq("target", target)
      .eq("answer", cand.answer)
      .neq("candidate_id", candidateId);
    sibQuery =
      itemIndex != null
        ? sibQuery.eq("item_index", itemIndex)
        : sibQuery.is("item_index", null);
    const { data: siblings, error: sibErr } = await sibQuery;
    if (sibErr) return { ok: false, error: sibErr.message };
    const shared = (siblings ?? []).length > 0;

    if (!shared) {
      const { data: sets, error: setErr } = await client
        .from("case_blank_sets")
        .select("set_id, blanks")
        .eq("case_id", cand.case_id)
        .eq("display_name", AUTO_SET_DISPLAY_NAME)
        .limit(1);
      if (setErr) return { ok: false, error: setErr.message };
      const set = sets?.[0];
      if (set) {
        const blanks = (
          Array.isArray(set.blanks)
            ? (set.blanks as unknown as CaseBlankItem[])
            : []
        ).filter(
          (b) =>
            !(
              b.target === target &&
              (b.itemIndex ?? null) === itemIndex &&
              b.answer === cand.answer
            ),
        );
        const { error: updErr } = await client
          .from("case_blank_sets")
          .update({
            blanks: blanks as never,
            updated_at: new Date().toISOString(),
          })
          .eq("set_id", set.set_id);
        if (updErr) return { ok: false, error: updErr.message };
      }
    }
  }
  const { error } = await client
    .from("case_blank_candidates")
    .update({ status: "pending", reviewed_at: null, reviewed_by: null })
    .eq("candidate_id", candidateId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
