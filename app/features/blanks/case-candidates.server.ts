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

interface AppendBlankInput {
  caseId: string;
  target: CaseBlankTarget;
  itemIndex: number | null;
  answer: string;
  // 지정 시 그 위치를 우선 검증(운영자 드래그·후보 anchor). 아니면 indexOf.
  cumOffset?: number | null;
  sourceOx?: string;
}

type AppendBlankResult =
  | { ok: true; pos: number; beforeContext: string; afterContext: string }
  | { ok: false; error: string };

// 판례 '기출 유래' 세트에 blank 추가 — 원문 verbatim 검증 → find-or-create →
// 같은 자리(정확 일치)는 근거 병합, 부분 겹침은 거부. 승인·뷰어 직접 추가 공용 진입점.
export async function appendBlankToAutoSet(
  client: SupabaseClient<Database>,
  ownerId: string,
  input: AppendBlankInput,
): Promise<AppendBlankResult> {
  const { caseId, target, itemIndex } = input;
  const answer = input.answer.trim();
  if (!answer) return { ok: false, error: "빈칸 정답이 비어 있습니다." };

  const text = await fetchTargetText(client, caseId, target, itemIndex);
  const pos =
    input.cumOffset != null && text.startsWith(answer, input.cumOffset)
      ? input.cumOffset
      : text.indexOf(answer);
  if (pos < 0)
    return {
      ok: false,
      error: `"${answer}" 가 판례 원문에 없습니다(원문 편집 또는 오타).`,
    };
  const beforeContext = text.slice(Math.max(0, pos - CONTEXT_LEN), pos);
  const afterContext = text.slice(
    pos + answer.length,
    pos + answer.length + CONTEXT_LEN,
  );

  const { data: sets, error: setErr } = await client
    .from("case_blank_sets")
    .select("set_id, blanks")
    .eq("case_id", caseId)
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
        case_id: caseId,
        owner_id: ownerId,
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

  // 같은 자리(target·항·정답) 정확 일치 → 근거 OX 만 병합. 부분 겹침 → 거부(렌더 충돌).
  const dup = blanks.find(
    (b) =>
      b.target === target &&
      (b.itemIndex ?? null) === itemIndex &&
      b.answer === answer,
  );
  if (dup) {
    if (
      input.sourceOx &&
      !(dup.sourceOx ?? "").split(", ").includes(input.sourceOx)
    ) {
      dup.sourceOx = dup.sourceOx
        ? `${dup.sourceOx}, ${input.sourceOx}`
        : input.sourceOx;
    }
  } else {
    const overlapping = blanks.some(
      (b) =>
        b.target === target &&
        (b.itemIndex ?? null) === itemIndex &&
        typeof b.cumOffset === "number" &&
        pos < b.cumOffset + b.answer.length &&
        pos + answer.length > b.cumOffset,
    );
    if (overlapping)
      return { ok: false, error: "이미 있는 빈칸과 자리가 겹칩니다." };
    blanks.push({
      idx: blanks.reduce((m, b) => Math.max(m, b.idx), -1) + 1,
      target,
      ...(itemIndex != null ? { itemIndex } : {}),
      answer,
      beforeContext,
      afterContext,
      cumOffset: pos,
      ...(input.sourceOx ? { sourceOx: input.sourceOx } : {}),
    });
  }

  const { error: updSetErr } = await client
    .from("case_blank_sets")
    .update({ blanks: blanks as never, updated_at: new Date().toISOString() })
    .eq("set_id", setId);
  if (updSetErr) return { ok: false, error: updSetErr.message };
  return { ok: true, pos, beforeContext, afterContext };
}

// 뷰어 편집 — 세트에서 blank 제거. 그 blank 를 만든 승인 후보는 rejected 로 동기화(큐 정합).
export async function removeCaseBlank(
  client: SupabaseClient<Database>,
  setId: string,
  blankIdx: number,
  reviewerId: string,
): Promise<MutationResult> {
  const { data: set, error: setErr } = await client
    .from("case_blank_sets")
    .select("set_id, case_id, blanks")
    .eq("set_id", setId)
    .maybeSingle();
  if (setErr) return { ok: false, error: setErr.message };
  if (!set) return { ok: false, error: "세트를 찾을 수 없습니다." };
  const blanks: CaseBlankItem[] = Array.isArray(set.blanks)
    ? (set.blanks as unknown as CaseBlankItem[])
    : [];
  const target = blanks.find((b) => b.idx === blankIdx);
  if (!target) return { ok: false, error: "해당 빈칸이 없습니다." };

  const { error: updErr } = await client
    .from("case_blank_sets")
    .update({
      blanks: blanks.filter((b) => b.idx !== blankIdx) as never,
      updated_at: new Date().toISOString(),
    })
    .eq("set_id", setId);
  if (updErr) return { ok: false, error: updErr.message };

  // 큐 동기화 — 같은 자리 승인 후보를 rejected 로 (운영자가 뷰어에서 의도적으로 제거).
  let candQuery = client
    .from("case_blank_candidates")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
    })
    .eq("case_id", set.case_id)
    .eq("status", "approved")
    .eq("target", target.target)
    .eq("answer", target.answer);
  candQuery =
    target.target === "summary"
      ? candQuery.eq("item_index", target.itemIndex ?? 0)
      : candQuery.is("item_index", null);
  const { error: candErr } = await candQuery;
  if (candErr) return { ok: false, error: candErr.message };
  return { ok: true };
}

// 승인 — 검증(원문 verbatim) → 세트 추가(appendBlankToAutoSet) → 후보 approved.
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

  const appended = await appendBlankToAutoSet(client, reviewerId, {
    caseId: cand.case_id,
    target,
    itemIndex,
    answer,
    cumOffset: answer === cand.answer ? cand.cum_offset : null,
    sourceOx:
      cand.source_display_no != null
        ? `P-${cand.source_display_no}`
        : undefined,
  });
  if (!appended.ok) return appended;

  // 후보에 승인 시점의 실제 값(수정 반영)을 남긴다 — 되돌리기 시 세트에서 같은 blank 를 특정하기 위함.
  const { error: updCandErr } = await client
    .from("case_blank_candidates")
    .update({
      status: "approved",
      answer,
      before_context: appended.beforeContext,
      after_context: appended.afterContext,
      cum_offset: appended.pos,
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
