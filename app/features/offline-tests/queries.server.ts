// feat-7-042 — 오프라인 테스트 서버 쿼리.
// 시험지(테스트) CRUD + 문항 조합(빈칸/OX/객관식) + 후보 탐색(과목·파트·중요도).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { fetchAllIn } from "~/core/lib/supa-batch.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

import type { ScienceSubjectSlug } from "~/features/subjects/lib/science";

import type {
  BlankCandidate,
  McqCandidate,
  OfflineQuestionRef,
  OfflineQuestionType,
  OfflineTestDetail,
  OfflineTestQuestion,
  OfflineTestSubject,
  OfflineTestSummary,
  OxCandidate,
} from "./labels";

// 타입·라벨은 클라이언트 안전한 ./labels 가 SSOT — 서버 소비자 편의로 재노출.
export type {
  BlankCandidate,
  McqCandidate,
  OfflineQuestionRef,
  OfflineQuestionType,
  OfflineTestDetail,
  OfflineTestQuestion,
  OfflineTestSummary,
  OxCandidate,
} from "./labels";

const snippet = (s: string | null | undefined, n = 90): string => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

export async function listOfflineTests(
  client: SupabaseClient<Database>,
  assignmentId: string,
): Promise<OfflineTestSummary[]> {
  const { data: tests, error } = await client
    .from("offline_tests")
    .select(
      "test_id, assignment_id, cohort_id, title, law_code, science_subject, duration_min, created_at",
    )
    .eq("assignment_id", assignmentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const list = tests ?? [];
  if (list.length === 0) return [];

  const testIds = list.map((t) => t.test_id);
  const [qRows, rRows] = await Promise.all([
    fetchAllIn(testIds, (slice) =>
      client
        .from("offline_test_questions")
        .select("test_id, points, question_id")
        .in("test_id", slice)
        .order("question_id"),
    ),
    fetchAllIn(testIds, (slice) =>
      client
        .from("offline_test_results")
        .select("test_id, result_id")
        .in("test_id", slice)
        .order("result_id"),
    ),
  ]);
  const countByTest = new Map<string, { n: number; pts: number }>();
  for (const q of qRows) {
    const cur = countByTest.get(q.test_id) ?? { n: 0, pts: 0 };
    cur.n += 1;
    cur.pts += Number(q.points ?? 0);
    countByTest.set(q.test_id, cur);
  }
  const resultByTest = new Map<string, number>();
  for (const r of rRows) {
    resultByTest.set(r.test_id, (resultByTest.get(r.test_id) ?? 0) + 1);
  }

  return list.map((t) => ({
    testId: t.test_id,
    assignmentId: t.assignment_id,
    cohortId: t.cohort_id,
    title: t.title,
    lawCode: t.law_code as LawSubjectSlug | null,
    scienceSubject: t.science_subject as ScienceSubjectSlug | null,
    durationMin: t.duration_min,
    questionCount: countByTest.get(t.test_id)?.n ?? 0,
    totalPoints: countByTest.get(t.test_id)?.pts ?? 0,
    resultCount: resultByTest.get(t.test_id) ?? 0,
    createdAt: t.created_at,
  }));
}

export async function createOfflineTest(
  client: SupabaseClient<Database>,
  input: {
    assignmentId: string;
    cohortId: string;
    title: string;
    subject: OfflineTestSubject;
    createdBy: string;
  },
): Promise<string> {
  const { data, error } = await client
    .from("offline_tests")
    .insert({
      assignment_id: input.assignmentId,
      cohort_id: input.cohortId,
      title: input.title,
      law_code: input.subject.lawCode,
      science_subject: input.subject.scienceSubject,
      created_by: input.createdBy,
    })
    .select("test_id")
    .single();
  if (error) throw error;
  return data.test_id;
}

export async function updateOfflineTest(
  client: SupabaseClient<Database>,
  testId: string,
  patch: { title?: string; durationMin?: number | null; instructionsMd?: string | null },
): Promise<void> {
  const { error } = await client
    .from("offline_tests")
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.durationMin !== undefined ? { duration_min: patch.durationMin } : {}),
      ...(patch.instructionsMd !== undefined
        ? { instructions_md: patch.instructionsMd }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("test_id", testId);
  if (error) throw error;
}

export async function softDeleteOfflineTest(
  client: SupabaseClient<Database>,
  testId: string,
): Promise<void> {
  const { error } = await client
    .from("offline_tests")
    .update({ deleted_at: new Date().toISOString() })
    .eq("test_id", testId)
    .is("deleted_at", null);
  if (error) throw error;
}

// ── 테스트 + 문항 (표시 라벨 보강) ──────────────────────────────────────────

export async function getOfflineTestWithQuestions(
  client: SupabaseClient<Database>,
  testId: string,
): Promise<OfflineTestDetail | null> {
  const { data: t, error } = await client
    .from("offline_tests")
    .select(
      "test_id, assignment_id, cohort_id, title, law_code, science_subject, duration_min, instructions_md, series_id, series_round_no",
    )
    .eq("test_id", testId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!t) return null;

  const { data: qs, error: qErr } = await client
    .from("offline_test_questions")
    .select(
      "question_id, ord, points, question_type, problem_id, ox_ref_type, ox_ref_id, ox_problem_id, blank_set_id",
    )
    .eq("test_id", testId)
    .order("ord", { ascending: true });
  if (qErr) throw qErr;
  const rows = qs ?? [];

  // 표시 라벨 일괄 보강 — 문제 본문, OX 지문, 빈칸 세트(조문 라벨).
  const problemIds = [
    ...new Set(
      rows.flatMap((r) => [r.problem_id, r.ox_problem_id].filter((v): v is string => !!v)),
    ),
  ];
  const choiceIds = rows
    .filter((r) => r.ox_ref_type === "choice" && r.ox_ref_id)
    .map((r) => r.ox_ref_id as string);
  const boxIds = rows
    .filter((r) => r.ox_ref_type === "box" && r.ox_ref_id)
    .map((r) => r.ox_ref_id as string);
  const blankSetIds = rows
    .map((r) => r.blank_set_id)
    .filter((v): v is string => !!v);

  const [problems, choices, boxes, blankSets] = await Promise.all([
    problemIds.length
      ? fetchAllIn(problemIds, (slice) =>
          client
            .from("problems")
            .select("problem_id, body_md, year, problem_number")
            .in("problem_id", slice)
            .order("problem_id"),
        )
      : Promise.resolve([]),
    choiceIds.length
      ? fetchAllIn(choiceIds, (slice) =>
          client
            .from("problem_choices")
            .select("choice_id, body_md, ox_truth")
            .in("choice_id", slice)
            .order("choice_id"),
        )
      : Promise.resolve([]),
    boxIds.length
      ? fetchAllIn(boxIds, (slice) =>
          client
            .from("problem_box_items")
            .select("box_item_id, body_md, ox_truth")
            .in("box_item_id", slice)
            .order("box_item_id"),
        )
      : Promise.resolve([]),
    blankSetIds.length
      ? fetchAllIn(blankSetIds, (slice) =>
          client
            .from("article_blank_sets")
            .select("set_id, display_name, blanks, articles!inner(display_label)")
            .in("set_id", slice)
            .order("set_id"),
        )
      : Promise.resolve([]),
  ]);
  const problemById = new Map(problems.map((p) => [p.problem_id, p] as const));
  const choiceById = new Map(choices.map((c) => [c.choice_id, c] as const));
  const boxById = new Map(boxes.map((b) => [b.box_item_id, b] as const));
  const blankById = new Map(blankSets.map((b) => [b.set_id, b] as const));

  const questions: OfflineTestQuestion[] = rows.map((r) => {
    let label = "—";
    let sub: string | null = null;
    if (r.question_type === "mcq" && r.problem_id) {
      const p = problemById.get(r.problem_id);
      label = snippet(p?.body_md);
      sub = p?.year ? `${p.year}년${p.problem_number ? ` ${p.problem_number}번` : ""}` : null;
    } else if (r.question_type === "ox" && r.ox_ref_id) {
      const ref =
        r.ox_ref_type === "choice"
          ? choiceById.get(r.ox_ref_id)
          : boxById.get(r.ox_ref_id);
      label = snippet(ref?.body_md);
      const p = r.ox_problem_id ? problemById.get(r.ox_problem_id) : undefined;
      sub = p?.year ? `${p.year}년 기출 지문` : null;
    } else if (r.question_type === "blank" && r.blank_set_id) {
      const b = blankById.get(r.blank_set_id);
      const blanksCount = Array.isArray(b?.blanks) ? b.blanks.length : 0;
      label = b?.articles?.display_label ?? "조문";
      sub = `${b?.display_name ? `${b.display_name} · ` : ""}빈칸 ${blanksCount}개`;
    }
    return {
      questionId: r.question_id,
      ord: r.ord,
      points: Number(r.points ?? 1),
      questionType: r.question_type as OfflineQuestionType,
      problemId: r.problem_id,
      oxRefType: (r.ox_ref_type as "choice" | "box" | null) ?? null,
      oxRefId: r.ox_ref_id,
      oxProblemId: r.ox_problem_id,
      blankSetId: r.blank_set_id,
      label,
      sub,
    };
  });

  return {
    testId: t.test_id,
    assignmentId: t.assignment_id,
    cohortId: t.cohort_id,
    title: t.title,
    lawCode: t.law_code as LawSubjectSlug | null,
    scienceSubject: t.science_subject as ScienceSubjectSlug | null,
    durationMin: t.duration_min,
    instructionsMd: t.instructions_md,
    seriesId: t.series_id,
    seriesRoundNo: t.series_round_no,
    questions,
  };
}

// ── 문항 추가/삭제/순서/배점 ─────────────────────────────────────────────────

const refKey = (r: OfflineQuestionRef): string =>
  r.questionType === "mcq"
    ? `mcq:${r.problemId}`
    : r.questionType === "ox"
      ? `ox:${r.oxRefType}:${r.oxRefId}`
      : `blank:${r.blankSetId}`;

// 문항 추가 — 기존과 중복되는 참조는 건너뛰고 끝 순번부터 append. 추가된 수 반환.
export async function addTestQuestions(
  client: SupabaseClient<Database>,
  testId: string,
  refs: OfflineQuestionRef[],
): Promise<number> {
  if (refs.length === 0) return 0;
  const { data: existing, error } = await client
    .from("offline_test_questions")
    .select("ord, question_type, problem_id, ox_ref_type, ox_ref_id, blank_set_id")
    .eq("test_id", testId);
  if (error) throw error;
  const seen = new Set(
    (existing ?? []).map((r) =>
      refKey({
        questionType: r.question_type as OfflineQuestionType,
        problemId: r.problem_id ?? undefined,
        oxRefType: (r.ox_ref_type as "choice" | "box" | null) ?? undefined,
        oxRefId: r.ox_ref_id ?? undefined,
        blankSetId: r.blank_set_id ?? undefined,
      }),
    ),
  );
  let ord = (existing ?? []).reduce((m, r) => Math.max(m, r.ord), -1) + 1;

  const inserts: Database["public"]["Tables"]["offline_test_questions"]["Insert"][] = [];
  for (const r of refs) {
    const key = refKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    inserts.push({
      test_id: testId,
      ord: ord++,
      question_type: r.questionType,
      problem_id: r.questionType === "mcq" ? (r.problemId ?? null) : null,
      ox_ref_type: r.questionType === "ox" ? (r.oxRefType ?? null) : null,
      ox_ref_id: r.questionType === "ox" ? (r.oxRefId ?? null) : null,
      ox_problem_id: r.questionType === "ox" ? (r.oxProblemId ?? null) : null,
      blank_set_id: r.questionType === "blank" ? (r.blankSetId ?? null) : null,
    });
  }
  if (inserts.length === 0) return 0;
  const { error: insErr } = await client
    .from("offline_test_questions")
    .insert(inserts);
  if (insErr) throw insErr;
  return inserts.length;
}

export async function removeTestQuestion(
  client: SupabaseClient<Database>,
  testId: string,
  questionId: string,
): Promise<void> {
  const { error } = await client
    .from("offline_test_questions")
    .delete()
    .eq("test_id", testId)
    .eq("question_id", questionId);
  if (error) throw error;
  await compactOrds(client, testId);
}

// 삭제 후 ord 를 0..n-1 로 압축 (인쇄 문항 번호 = ord+1 가 이빨 빠지지 않게).
async function compactOrds(
  client: SupabaseClient<Database>,
  testId: string,
): Promise<void> {
  const { data: rows, error } = await client
    .from("offline_test_questions")
    .select("question_id, ord")
    .eq("test_id", testId)
    .order("ord", { ascending: true });
  if (error) throw error;
  const list = rows ?? [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].ord !== i) {
      const { error: uErr } = await client
        .from("offline_test_questions")
        .update({ ord: i })
        .eq("question_id", list[i].question_id);
      if (uErr) throw uErr;
    }
  }
}

// 위/아래 이동 — 인접 문항과 ord 스왑.
export async function moveTestQuestion(
  client: SupabaseClient<Database>,
  testId: string,
  questionId: string,
  dir: "up" | "down",
): Promise<void> {
  const { data: rows, error } = await client
    .from("offline_test_questions")
    .select("question_id, ord")
    .eq("test_id", testId)
    .order("ord", { ascending: true });
  if (error) throw error;
  const list = rows ?? [];
  const idx = list.findIndex((r) => r.question_id === questionId);
  if (idx < 0) return;
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return;
  const a = list[idx];
  const b = list[swapIdx];
  // 임시 ord 로 unique 충돌 없이 스왑 (unique 제약은 없지만 규칙 유지).
  const { error: e1 } = await client
    .from("offline_test_questions")
    .update({ ord: -1 })
    .eq("question_id", a.question_id);
  if (e1) throw e1;
  const { error: e2 } = await client
    .from("offline_test_questions")
    .update({ ord: a.ord })
    .eq("question_id", b.question_id);
  if (e2) throw e2;
  const { error: e3 } = await client
    .from("offline_test_questions")
    .update({ ord: b.ord })
    .eq("question_id", a.question_id);
  if (e3) throw e3;
}

export async function setTestQuestionPoints(
  client: SupabaseClient<Database>,
  testId: string,
  questionId: string,
  points: number,
): Promise<void> {
  const { error } = await client
    .from("offline_test_questions")
    .update({ points })
    .eq("test_id", testId)
    .eq("question_id", questionId);
  if (error) throw error;
}

// ── 인쇄(시험지/정답지)용 전문 데이터 ───────────────────────────────────────
// 빌더의 라벨 스니펫과 달리 문제 전문·선지·정답·해설·빈칸 본문을 전부 싣는다.
// (mc_box 는 wrong-note 인쇄와 동일하게 body_md 에 박스가 포함된 형태를 그대로 사용.)

export interface PrintBlankItem {
  idx: number;
  answer: string;
  length: number;
}

export interface OfflineTestPrintQuestion {
  ord: number;
  points: number;
  questionType: OfflineQuestionType;
  mcq: {
    bodyMd: string;
    year: number | null;
    problemNumber: number | null;
    choices: Array<{ index: number; bodyMd: string; isCorrect: boolean }>;
    explanationMd: string | null;
  } | null;
  ox: {
    statementMd: string;
    truth: "O" | "X";
    explanationMd: string | null;
  } | null;
  blank: {
    articleLabel: string;
    bodyText: string; // [[BLANK:N]] 토큰 포함
    blanks: PrintBlankItem[];
  } | null;
}

export interface OfflineTestPrintData extends OfflineTestSubject {
  testId: string;
  title: string;
  durationMin: number | null;
  instructionsMd: string | null;
  totalPoints: number;
  questions: OfflineTestPrintQuestion[];
}

export async function getOfflineTestPrintData(
  client: SupabaseClient<Database>,
  testId: string,
): Promise<OfflineTestPrintData | null> {
  const detail = await getOfflineTestWithQuestions(client, testId);
  if (!detail) return null;

  const mcqIds = detail.questions
    .filter((q) => q.questionType === "mcq" && q.problemId)
    .map((q) => q.problemId as string);
  const choiceRefIds = detail.questions
    .filter((q) => q.questionType === "ox" && q.oxRefType === "choice" && q.oxRefId)
    .map((q) => q.oxRefId as string);
  const boxRefIds = detail.questions
    .filter((q) => q.questionType === "ox" && q.oxRefType === "box" && q.oxRefId)
    .map((q) => q.oxRefId as string);
  const blankSetIds = detail.questions
    .filter((q) => q.questionType === "blank" && q.blankSetId)
    .map((q) => q.blankSetId as string);

  const [problems, choices, oxChoices, oxBoxes, blankSets] = await Promise.all([
    mcqIds.length
      ? fetchAllIn(mcqIds, (slice) =>
          client
            .from("problems")
            .select("problem_id, body_md, year, problem_number, explanation_md")
            .in("problem_id", slice)
            .order("problem_id"),
        )
      : Promise.resolve([]),
    mcqIds.length
      ? fetchAllIn(mcqIds, (slice) =>
          client
            .from("problem_choices")
            .select("problem_id, choice_index, body_md, is_correct")
            .in("problem_id", slice)
            .order("choice_index"),
        )
      : Promise.resolve([]),
    choiceRefIds.length
      ? fetchAllIn(choiceRefIds, (slice) =>
          client
            .from("problem_choices")
            .select("choice_id, body_md, ox_truth, explanation_md")
            .in("choice_id", slice)
            .order("choice_id"),
        )
      : Promise.resolve([]),
    boxRefIds.length
      ? fetchAllIn(boxRefIds, (slice) =>
          client
            .from("problem_box_items")
            .select("box_item_id, body_md, ox_truth, explanation_md")
            .in("box_item_id", slice)
            .order("box_item_id"),
        )
      : Promise.resolve([]),
    blankSetIds.length
      ? fetchAllIn(blankSetIds, (slice) =>
          client
            .from("article_blank_sets")
            .select("set_id, body_text, blanks, articles!inner(display_label)")
            .in("set_id", slice)
            .order("set_id"),
        )
      : Promise.resolve([]),
  ]);

  const problemById = new Map(problems.map((p) => [p.problem_id, p] as const));
  const choicesByProblem = new Map<
    string,
    Array<{ index: number; bodyMd: string; isCorrect: boolean }>
  >();
  for (const c of choices) {
    const arr = choicesByProblem.get(c.problem_id) ?? [];
    arr.push({ index: c.choice_index, bodyMd: c.body_md ?? "", isCorrect: c.is_correct });
    choicesByProblem.set(c.problem_id, arr);
  }
  const oxChoiceById = new Map(oxChoices.map((c) => [c.choice_id, c] as const));
  const oxBoxById = new Map(oxBoxes.map((b) => [b.box_item_id, b] as const));
  const blankById = new Map(blankSets.map((b) => [b.set_id, b] as const));

  const parseBlankItems = (raw: unknown): PrintBlankItem[] => {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((b) => {
        const o = b as { idx?: number; answer?: string; length?: number };
        return {
          idx: Number(o.idx ?? 0),
          answer: String(o.answer ?? ""),
          length: Number(o.length ?? String(o.answer ?? "").length),
        };
      })
      .sort((a, b) => a.idx - b.idx);
  };

  const questions: OfflineTestPrintQuestion[] = detail.questions.map((q) => {
    let mcq: OfflineTestPrintQuestion["mcq"] = null;
    let ox: OfflineTestPrintQuestion["ox"] = null;
    let blank: OfflineTestPrintQuestion["blank"] = null;
    if (q.questionType === "mcq" && q.problemId) {
      const p = problemById.get(q.problemId);
      mcq = {
        bodyMd: p?.body_md ?? "",
        year: p?.year ?? null,
        problemNumber: p?.problem_number ?? null,
        choices: (choicesByProblem.get(q.problemId) ?? []).sort(
          (a, b) => a.index - b.index,
        ),
        explanationMd: p?.explanation_md ?? null,
      };
    } else if (q.questionType === "ox" && q.oxRefId) {
      const ref =
        q.oxRefType === "choice"
          ? oxChoiceById.get(q.oxRefId)
          : oxBoxById.get(q.oxRefId);
      ox = {
        statementMd: ref?.body_md ?? "",
        truth: (ref?.ox_truth as "O" | "X") ?? "O",
        explanationMd: ref?.explanation_md ?? null,
      };
    } else if (q.questionType === "blank" && q.blankSetId) {
      const b = blankById.get(q.blankSetId);
      blank = {
        articleLabel: b?.articles?.display_label ?? "조문",
        bodyText: b?.body_text ?? "",
        blanks: parseBlankItems(b?.blanks),
      };
    }
    return {
      ord: q.ord,
      points: q.points,
      questionType: q.questionType,
      mcq,
      ox,
      blank,
    };
  });

  return {
    testId: detail.testId,
    title: detail.title,
    lawCode: detail.lawCode,
    scienceSubject: detail.scienceSubject,
    durationMin: detail.durationMin,
    instructionsMd: detail.instructionsMd,
    totalPoints: questions.reduce((s, q) => s + q.points, 0),
    questions,
  };
}

// ── 후보 탐색 (과목 · 파트(체계도 노드) · 중요도) ────────────────────────────

// 노드에 귀속되는 문제 id — primary_node_id 직접 + primary_article_id→링크 간접
// (getOxQuestionsForNode 와 동일 규칙).
async function problemIdsForNode(
  client: SupabaseClient<Database>,
  nodeId: string,
): Promise<string[]> {
  const ids = new Set<string>();
  const { data: pinned } = await client
    .from("problems")
    .select("problem_id")
    .eq("primary_node_id", nodeId)
    .is("deleted_at", null);
  for (const p of pinned ?? []) ids.add(p.problem_id);
  const articleIds = await articleIdsForNode(client, nodeId);
  if (articleIds.length > 0) {
    const viaArticle = await fetchAllIn(articleIds, (slice) =>
      client
        .from("problems")
        .select("problem_id")
        .in("primary_article_id", slice)
        .is("deleted_at", null)
        .order("problem_id"),
    );
    for (const p of viaArticle) ids.add(p.problem_id);
  }
  return [...ids];
}

async function articleIdsForNode(
  client: SupabaseClient<Database>,
  nodeId: string,
): Promise<string[]> {
  const { data: links, error } = await client
    .from("article_systematic_links")
    .select("article_id")
    .eq("node_id", nodeId);
  if (error) throw error;
  return [...new Set((links ?? []).map((l) => l.article_id))];
}

async function lawIdByCode(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
): Promise<string | null> {
  const { data } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  return data?.law_id ?? null;
}

export async function listMcqCandidates(
  client: SupabaseClient<Database>,
  filter: {
    lawCode: LawSubjectSlug;
    nodeId?: string | null;
    minImportance?: number;
    limit?: number;
  },
): Promise<McqCandidate[]> {
  const lawId = await lawIdByCode(client, filter.lawCode);
  if (!lawId) return [];
  const nodeProblemIds = filter.nodeId
    ? await problemIdsForNode(client, filter.nodeId)
    : null;
  if (nodeProblemIds && nodeProblemIds.length === 0) return [];

  const makeQuery = (slice: string[] | null) => {
    let q = client
      .from("problems")
      .select("problem_id, body_md, year, problem_number, importance, format")
      .eq("law_id", lawId)
      .eq("review_status", "approved")
      .is("deleted_at", null)
      .in("format", ["mc_short", "mc_box", "mc_case"]);
    if (filter.minImportance) q = q.gte("importance", filter.minImportance);
    if (slice) q = q.in("problem_id", slice);
    return q
      .order("importance", { ascending: false })
      .order("year", { ascending: false })
      .order("problem_id");
  };

  const rows = nodeProblemIds
    ? await fetchAllIn(nodeProblemIds, (slice) => makeQuery(slice))
    : ((await makeQuery(null).limit(filter.limit ?? 100)).data ?? []);

  return rows
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0) || (b.year ?? 0) - (a.year ?? 0))
    .slice(0, filter.limit ?? 100)
    .map((p) => ({
      problemId: p.problem_id,
      snippet: snippet(p.body_md),
      year: p.year,
      problemNumber: p.problem_number,
      importance: p.importance ?? 0,
      format: p.format,
    }));
}

// 자연과학 객관식 후보 — 과목(물/화/생/지) + 단원(science_sections) 필터.
// 자과는 OX·빈칸이 없으므로 시험지 문항 유형은 mcq 뿐.
export async function listScienceMcqCandidates(
  client: SupabaseClient<Database>,
  filter: {
    scienceSubject: ScienceSubjectSlug;
    sectionId?: string | null;
    limit?: number;
  },
): Promise<McqCandidate[]> {
  let q = client
    .from("problems")
    .select("problem_id, body_md, year, problem_number, importance, format")
    .eq("subject_type", "science")
    .eq("science_subject", filter.scienceSubject)
    .eq("review_status", "approved")
    .is("deleted_at", null);
  if (filter.sectionId) q = q.eq("science_section_id", filter.sectionId);
  const { data, error } = await q
    .order("year", { ascending: false })
    .order("problem_number", { ascending: true })
    .order("problem_id")
    .limit(filter.limit ?? 100);
  if (error) throw error;
  return (data ?? []).map((p) => ({
    problemId: p.problem_id,
    snippet: snippet(p.body_md),
    year: p.year,
    problemNumber: p.problem_number,
    importance: p.importance ?? 0,
    format: p.format,
  }));
}

export async function listOxCandidates(
  client: SupabaseClient<Database>,
  filter: {
    lawCode: LawSubjectSlug;
    nodeId?: string | null;
    minImportance?: number;
    limit?: number;
  },
): Promise<OxCandidate[]> {
  const lawId = await lawIdByCode(client, filter.lawCode);
  if (!lawId) return [];
  const nodeProblemIds = filter.nodeId
    ? await problemIdsForNode(client, filter.nodeId)
    : null;
  if (nodeProblemIds && nodeProblemIds.length === 0) return [];
  const limit = filter.limit ?? 100;

  const makeChoiceQuery = (slice: string[] | null) => {
    let q = client
      .from("problem_choices")
      .select(
        "choice_id, problem_id, body_md, ox_truth, problems!inner(year, importance, law_id, review_status, deleted_at)",
      )
      .eq("problems.law_id", lawId)
      .eq("problems.review_status", "approved")
      .is("problems.deleted_at", null)
      .eq("ox_ineligible", false)
      .not("ox_truth", "is", null);
    if (filter.minImportance) q = q.gte("problems.importance", filter.minImportance);
    if (slice) q = q.in("problem_id", slice);
    return q.order("choice_id");
  };
  const makeBoxQuery = (slice: string[] | null) => {
    let q = client
      .from("problem_box_items")
      .select(
        "box_item_id, problem_id, body_md, ox_truth, problems!inner(year, importance, law_id, review_status, deleted_at)",
      )
      .eq("problems.law_id", lawId)
      .eq("problems.review_status", "approved")
      .is("problems.deleted_at", null)
      .eq("ox_ineligible", false)
      .not("ox_truth", "is", null);
    if (filter.minImportance) q = q.gte("problems.importance", filter.minImportance);
    if (slice) q = q.in("problem_id", slice);
    return q.order("box_item_id");
  };

  const [choiceRows, boxRows] = await Promise.all([
    nodeProblemIds
      ? fetchAllIn(nodeProblemIds, (slice) => makeChoiceQuery(slice))
      : makeChoiceQuery(null)
          .limit(limit)
          .then((r) => r.data ?? []),
    nodeProblemIds
      ? fetchAllIn(nodeProblemIds, (slice) => makeBoxQuery(slice))
      : makeBoxQuery(null)
          .limit(limit)
          .then((r) => r.data ?? []),
  ]);

  const out: OxCandidate[] = [
    ...choiceRows.map((r) => ({
      refType: "choice" as const,
      refId: r.choice_id,
      problemId: r.problem_id,
      snippet: snippet(r.body_md),
      oxTruth: r.ox_truth as "O" | "X",
      year: r.problems.year,
      importance: r.problems.importance ?? 0,
    })),
    ...boxRows.map((r) => ({
      refType: "box" as const,
      refId: r.box_item_id,
      problemId: r.problem_id,
      snippet: snippet(r.body_md),
      oxTruth: r.ox_truth as "O" | "X",
      year: r.problems.year,
      importance: r.problems.importance ?? 0,
    })),
  ];
  out.sort((a, b) => b.importance - a.importance || (b.year ?? 0) - (a.year ?? 0));
  return out.slice(0, limit);
}

export async function listBlankCandidates(
  client: SupabaseClient<Database>,
  filter: {
    lawCode: LawSubjectSlug;
    nodeId?: string | null;
    minImportance?: number;
    limit?: number;
  },
): Promise<BlankCandidate[]> {
  const lawId = await lawIdByCode(client, filter.lawCode);
  if (!lawId) return [];
  const nodeArticleIds = filter.nodeId
    ? await articleIdsForNode(client, filter.nodeId)
    : null;
  if (nodeArticleIds && nodeArticleIds.length === 0) return [];

  const makeQuery = (slice: string[] | null) => {
    let q = client
      .from("article_blank_sets")
      .select(
        "set_id, display_name, blanks, article_id, articles!inner(display_label, importance, law_id)",
      )
      .eq("articles.law_id", lawId);
    if (filter.minImportance) {
      q = q.gte("articles.importance", filter.minImportance);
    }
    if (slice) q = q.in("article_id", slice);
    return q.order("set_id");
  };
  const rows = nodeArticleIds
    ? await fetchAllIn(nodeArticleIds, (slice) => makeQuery(slice))
    : ((await makeQuery(null).limit(filter.limit ?? 100)).data ?? []);

  return rows
    .map((r) => ({
      setId: r.set_id,
      articleLabel: r.articles.display_label,
      displayName: r.display_name,
      blanksCount: Array.isArray(r.blanks) ? r.blanks.length : 0,
      articleImportance: r.articles.importance ?? 0,
    }))
    .sort((a, b) => b.articleImportance - a.articleImportance)
    .slice(0, filter.limit ?? 100);
}
