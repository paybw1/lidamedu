// 판례 인용 추적 — admin-problem-edit 의 선택지에서 "해설 종류 = 판례"
// (choice_type='precedent') 일 때 활성되는 판례번호 입력란
// (problem_choices.related_case_number) 값을 기준으로 한 case 가 어디에서
// 인용되었는지 모은다. 자유 텍스트(explanation_md)는 일괄 변경 대상이 아니며,
// 구조 연결(problem_case_links) 은 보조 정보로 함께 표시한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { COURT_LABELS, type CaseCourt } from "~/features/cases/labels";
import type {
  ProblemExamRound,
  ProblemFormat,
} from "~/features/problems/labels";

export interface CaseCitationProblem {
  problemId: string;
  year: number | null;
  examRound: ProblemExamRound | null;
  problemNumber: number | null;
  format: ProblemFormat | null;
  hasLink: boolean;
  precedentChoices: Array<{
    choiceId: string;
    choiceIndex: number;
  }>;
}

export interface CaseCitationSummary {
  linkedCount: number;
  precedentChoiceCount: number;
  missingLinkCount: number;
  problems: CaseCitationProblem[];
}

export async function getCaseCitationsInProblems(
  client: SupabaseClient<Database>,
  caseId: string,
  caseNumber: string,
): Promise<CaseCitationSummary> {
  const [linkRowsRes, choiceRowsRes] = await Promise.all([
    client.from("problem_case_links").select("problem_id").eq("case_id", caseId),
    // 해설 종류가 판례인 선택지의 판례번호 입력란만 정확 매치.
    client
      .from("problem_choices")
      .select("choice_id, problem_id, choice_index")
      .eq("choice_type", "precedent")
      .eq("related_case_number", caseNumber),
  ]);
  if (linkRowsRes.error) throw linkRowsRes.error;
  if (choiceRowsRes.error) throw choiceRowsRes.error;

  const linkedProblemIds = new Set(
    (linkRowsRes.data ?? []).map((r) => r.problem_id),
  );

  const choiceHitsByProblem = new Map<
    string,
    CaseCitationProblem["precedentChoices"]
  >();
  for (const row of choiceRowsRes.data ?? []) {
    const list = choiceHitsByProblem.get(row.problem_id) ?? [];
    list.push({ choiceId: row.choice_id, choiceIndex: row.choice_index });
    choiceHitsByProblem.set(row.problem_id, list);
  }

  const allProblemIds = new Set<string>([
    ...linkedProblemIds,
    ...choiceHitsByProblem.keys(),
  ]);
  if (allProblemIds.size === 0) {
    return {
      linkedCount: 0,
      precedentChoiceCount: 0,
      missingLinkCount: 0,
      problems: [],
    };
  }

  const { data: problemRows, error } = await client
    .from("problems")
    .select("problem_id, year, exam_round, problem_number, format")
    .in("problem_id", [...allProblemIds])
    .is("deleted_at", null);
  if (error) throw error;

  const problems: CaseCitationProblem[] = (problemRows ?? [])
    .map((p) => ({
      problemId: p.problem_id,
      year: p.year,
      examRound: p.exam_round,
      problemNumber: p.problem_number,
      format: p.format,
      hasLink: linkedProblemIds.has(p.problem_id),
      precedentChoices: (choiceHitsByProblem.get(p.problem_id) ?? []).sort(
        (a, b) => a.choiceIndex - b.choiceIndex,
      ),
    }))
    .sort((a, b) => {
      const ya = a.year ?? 0;
      const yb = b.year ?? 0;
      if (yb !== ya) return yb - ya;
      return (a.problemNumber ?? 0) - (b.problemNumber ?? 0);
    });

  const linkedCount = problems.filter((p) => p.hasLink).length;
  const precedentChoiceCount = problems.filter(
    (p) => p.precedentChoices.length > 0,
  ).length;
  const missingLinkCount = problems.filter(
    (p) => !p.hasLink && p.precedentChoices.length > 0,
  ).length;

  return { linkedCount, precedentChoiceCount, missingLinkCount, problems };
}

// 본 단원에서만 사용. COURT_LABELS 직접 사용 위함.
export type { CaseCourt };

export interface MigrateCaseCitationResult {
  newCase: {
    caseId: string;
    caseNumber: string;
    court: CaseCourt;
    decidedAt: string;
  };
  updatedChoices: number;
  examYearsAdded: { first: number[]; second: number[] };
  linksTransferred: number;
  linksDropped: number;
}

// 판례 인용 마이그레이션:
// problem_choices 의 choice_type='precedent' AND related_case_number=oldNumber
// 행들을 새 case_number 로 일괄 갱신. 자유 텍스트(explanation_md)는 건드리지
// 않는다. 옵션으로 옛 case 의 기출연도(exam_*_years) 를 새 case 에 union 으로
// 합산(옛 case 는 보존).
export async function migrateCaseCitation(
  client: SupabaseClient<Database>,
  oldCaseId: string,
  newCaseNumber: string,
  options: { transferExamYears: boolean; transferProblemLinks: boolean },
): Promise<MigrateCaseCitationResult> {
  const [oldRes, newRes] = await Promise.all([
    client
      .from("cases")
      .select(
        "case_id, case_number, court, decided_at, exam_1st_years, exam_2nd_years",
      )
      .eq("case_id", oldCaseId)
      .is("deleted_at", null)
      .maybeSingle(),
    client
      .from("cases")
      .select(
        "case_id, case_number, court, decided_at, exam_1st_years, exam_2nd_years",
      )
      .eq("case_number", newCaseNumber)
      .is("deleted_at", null),
  ]);
  if (oldRes.error) throw oldRes.error;
  if (newRes.error) throw newRes.error;
  const oldCase = oldRes.data;
  if (!oldCase) throw new Error("옛 판례를 찾을 수 없습니다");
  const newRows = newRes.data ?? [];
  if (newRows.length === 0)
    throw new Error(`새 사건번호 ${newCaseNumber} 의 판례가 없습니다`);
  if (newRows.length > 1)
    throw new Error(
      `새 사건번호 ${newCaseNumber} 의 판례가 ${newRows.length}건이라 모호합니다`,
    );
  const newCase = newRows[0];
  if (oldCase.case_id === newCase.case_id)
    throw new Error("옛/새 판례가 같습니다");

  // 1) 영향 받는 선택지 카운트 — update 전 select 로 정확 카운트.
  const { data: targetChoices, error: selErr } = await client
    .from("problem_choices")
    .select("choice_id")
    .eq("choice_type", "precedent")
    .eq("related_case_number", oldCase.case_number);
  if (selErr) throw selErr;
  const updatedChoices = targetChoices?.length ?? 0;

  // 2) related_case_number 일괄 갱신.
  if (updatedChoices > 0) {
    const { error: upErr } = await client
      .from("problem_choices")
      .update({ related_case_number: newCase.case_number })
      .eq("choice_type", "precedent")
      .eq("related_case_number", oldCase.case_number);
    if (upErr) throw upErr;
  }

  // 3) problem_case_links 이전 — 옛 case 의 link 를 새 case 로 옮긴다.
  //    충돌(같은 problem 에 새 case link 이미 존재)인 옛 link 는 삭제.
  //    1차 기출 칩(getExamProblemsByCase)이 problem_case_links 파생이므로
  //    이전을 안 하면 옛 case 에 그대로 남고 새 case 에 안 보인다.
  let linksTransferred = 0;
  let linksDropped = 0;
  if (options.transferProblemLinks) {
    const [oldLinksRes, newLinksRes] = await Promise.all([
      client
        .from("problem_case_links")
        .select("link_id, problem_id")
        .eq("case_id", oldCase.case_id),
      client
        .from("problem_case_links")
        .select("problem_id")
        .eq("case_id", newCase.case_id),
    ]);
    if (oldLinksRes.error) throw oldLinksRes.error;
    if (newLinksRes.error) throw newLinksRes.error;
    const existing = new Set(
      (newLinksRes.data ?? []).map((r) => r.problem_id),
    );
    const toUpdate: string[] = [];
    const toDelete: string[] = [];
    for (const lk of oldLinksRes.data ?? []) {
      if (existing.has(lk.problem_id)) toDelete.push(lk.link_id);
      else toUpdate.push(lk.link_id);
    }
    if (toUpdate.length > 0) {
      const { error: upErr } = await client
        .from("problem_case_links")
        .update({ case_id: newCase.case_id })
        .in("link_id", toUpdate);
      if (upErr) throw upErr;
      linksTransferred = toUpdate.length;
    }
    if (toDelete.length > 0) {
      const { error: delErr } = await client
        .from("problem_case_links")
        .delete()
        .in("link_id", toDelete);
      if (delErr) throw delErr;
      linksDropped = toDelete.length;
    }
  }

  // 4) exam years union 추가 (옛 case 는 그대로).
  let examYearsAdded = { first: [] as number[], second: [] as number[] };
  if (options.transferExamYears) {
    const oldFirst = (oldCase.exam_1st_years ?? []) as number[];
    const oldSecond = (oldCase.exam_2nd_years ?? []) as number[];
    const newFirst = (newCase.exam_1st_years ?? []) as number[];
    const newSecond = (newCase.exam_2nd_years ?? []) as number[];
    const addFirst = oldFirst.filter((y) => !newFirst.includes(y));
    const addSecond = oldSecond.filter((y) => !newSecond.includes(y));
    if (addFirst.length > 0 || addSecond.length > 0) {
      const mergedFirst = [...newFirst, ...addFirst].sort((a, b) => a - b);
      const mergedSecond = [...newSecond, ...addSecond].sort((a, b) => a - b);
      const { error: upErr } = await client
        .from("cases")
        .update({
          exam_1st_years: mergedFirst,
          exam_2nd_years: mergedSecond,
        })
        .eq("case_id", newCase.case_id);
      if (upErr) throw upErr;
      examYearsAdded = { first: addFirst, second: addSecond };
    }
  }

  return {
    newCase: {
      caseId: newCase.case_id,
      caseNumber: newCase.case_number,
      court: newCase.court,
      decidedAt: newCase.decided_at ?? "",
    },
    updatedChoices,
    examYearsAdded,
    linksTransferred,
    linksDropped,
  };
}

// related_case_number 가 caseNumber 인 선택지의 problem_id 중
// problem_case_links 에 없는 곳에 relation_type='cited' 로 link 추가.
export async function backfillCaseLinks(
  client: SupabaseClient<Database>,
  caseId: string,
  caseNumber: string,
  createdBy: string,
): Promise<{ added: number }> {
  const [choiceRowsRes, linkRowsRes] = await Promise.all([
    client
      .from("problem_choices")
      .select("problem_id")
      .eq("choice_type", "precedent")
      .eq("related_case_number", caseNumber),
    client
      .from("problem_case_links")
      .select("problem_id")
      .eq("case_id", caseId),
  ]);
  if (choiceRowsRes.error) throw choiceRowsRes.error;
  if (linkRowsRes.error) throw linkRowsRes.error;

  const textProblemIds = new Set(
    (choiceRowsRes.data ?? []).map((r) => r.problem_id),
  );
  const linkedProblemIds = new Set(
    (linkRowsRes.data ?? []).map((r) => r.problem_id),
  );
  const missing = [...textProblemIds].filter(
    (pid) => !linkedProblemIds.has(pid),
  );
  if (missing.length === 0) return { added: 0 };

  const inserts = missing.map((pid) => ({
    problem_id: pid,
    case_id: caseId,
    created_by: createdBy,
    relation_type: "cited" as const,
  }));
  const { error } = await client.from("problem_case_links").insert(inserts);
  if (error) throw error;
  return { added: missing.length };
}
