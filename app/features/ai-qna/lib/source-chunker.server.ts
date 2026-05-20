// feat-9-001 — 콘텐츠 변경 hook 에서 호출하는 reindex 헬퍼.
// source_id 만 받아 DB 에서 최신 본문을 조회한 뒤 chunker 로 ChunkInput[] 생성 → upsertChunks.
// hash 가 동일하면 unchanged 로 처리(재임베딩 skip), 다르면 embedded_at=null 로 dirty 마킹.
//
// 모두 service_role 클라이언트(`supa-admin-client`) 사용 — content_chunks write RLS 우회.

import adminClient from "~/core/lib/supa-admin-client.server";

import {
  type ProblemChoicePlain,
  chunkArticle,
  chunkCase,
  chunkProblem,
} from "./chunker";
import { deleteChunksForSource, upsertChunks } from "../queries.server";

// ── article ──────────────────────────────────────────────────────────────

export async function reindexArticles(articleIds: string[]): Promise<void> {
  if (articleIds.length === 0) return;

  const { data: articles, error } = await adminClient
    .from("articles")
    .select("article_id, display_label, current_revision_id, laws(law_code)")
    .in("article_id", articleIds)
    .is("deleted_at", null);
  if (error) throw error;
  if (!articles || articles.length === 0) return;

  const revIds = articles
    .map((a) => a.current_revision_id)
    .filter((id): id is string => id !== null);
  if (revIds.length === 0) return;

  const { data: revisions } = await adminClient
    .from("article_revisions")
    .select("revision_id, body_text")
    .in("revision_id", revIds);
  const revMap = new Map<string, string>(
    (revisions ?? []).map((r) => [r.revision_id, r.body_text ?? ""]),
  );

  const chunks = articles.flatMap((a) => {
    if (!a.current_revision_id) return [];
    const bodyText = revMap.get(a.current_revision_id);
    if (!bodyText) return [];
    const lawCode = a.laws?.law_code ?? "";
    return chunkArticle({
      articleId: a.article_id,
      lawCode,
      displayLabel: a.display_label ?? `article ${a.article_id.slice(0, 8)}`,
      bodyText,
    });
  });

  if (chunks.length > 0) {
    await upsertChunks(adminClient, chunks);
  }
}

// ── case ─────────────────────────────────────────────────────────────────

export async function reindexCases(caseIds: string[]): Promise<void> {
  if (caseIds.length === 0) return;

  const { data: cases, error } = await adminClient
    .from("cases")
    .select(
      "case_id, subject_laws, court, decided_at, case_number, summary_title, summary_body_md, reasoning_md, comment_body_md",
    )
    .in("case_id", caseIds)
    .is("deleted_at", null);
  if (error) throw error;
  if (!cases || cases.length === 0) return;

  const chunks = cases.flatMap((c) => {
    const courtLabel = c.court ?? "";
    const dateLabel = c.decided_at ?? "";
    const headingPath = [courtLabel, dateLabel, c.case_number]
      .filter((x) => x && String(x).length > 0)
      .join(" ");
    const lawCode = c.subject_laws?.[0] ?? null;
    return chunkCase({
      caseId: c.case_id,
      headingPath,
      lawCode,
      summaryTitle: c.summary_title,
      summaryBodyMd: c.summary_body_md,
      reasoningMd: c.reasoning_md,
      commentBodyMd: c.comment_body_md,
    });
  });

  if (chunks.length > 0) {
    await upsertChunks(adminClient, chunks);
  }
}

// ── problem ──────────────────────────────────────────────────────────────

function pickChoiceLabel(choiceIndex: number | null): string {
  // 객관식 보기는 0/1 베이스 smallint — UI 에선 ① ② … 사용. 청킹은 단순 숫자 라벨.
  const n = (choiceIndex ?? 0) + 1;
  return `${n}`;
}

export async function reindexProblems(problemIds: string[]): Promise<void> {
  if (problemIds.length === 0) return;

  const { data: problems, error } = await adminClient
    .from("problems")
    .select(
      "problem_id, year, problem_number, body_md, explanation_md, model_answer_md, grading_rubric_md, laws(law_code)",
    )
    .in("problem_id", problemIds)
    .is("deleted_at", null);
  if (error) throw error;
  if (!problems || problems.length === 0) return;

  const [{ data: choices }, { data: boxes }] = await Promise.all([
    adminClient
      .from("problem_choices")
      .select("problem_id, choice_index, body_md, ox_truth")
      .in("problem_id", problemIds)
      .order("choice_index", { ascending: true }),
    adminClient
      .from("problem_box_items")
      .select("problem_id, position_index, marker, body_md, ox_truth")
      .in("problem_id", problemIds)
      .order("position_index", { ascending: true }),
  ]);

  const choicesByPid = new Map<string, ProblemChoicePlain[]>();
  for (const c of choices ?? []) {
    const arr = choicesByPid.get(c.problem_id) ?? [];
    arr.push({
      label: pickChoiceLabel(c.choice_index),
      bodyMd: c.body_md ?? "",
      oxTruth: (c.ox_truth as "O" | "X" | null) ?? null,
    });
    choicesByPid.set(c.problem_id, arr);
  }
  const boxesByPid = new Map<string, ProblemChoicePlain[]>();
  for (const b of boxes ?? []) {
    const arr = boxesByPid.get(b.problem_id) ?? [];
    arr.push({
      label: b.marker ?? `${(b.position_index ?? 0) + 1}`,
      bodyMd: b.body_md ?? "",
      oxTruth: (b.ox_truth as "O" | "X" | null) ?? null,
    });
    boxesByPid.set(b.problem_id, arr);
  }

  const chunks = problems.flatMap((p) => {
    const heading =
      p.year && p.problem_number
        ? `${p.year}년 ${p.problem_number}번`
        : `문제 ${p.problem_id.slice(0, 8)}`;
    return chunkProblem({
      problemId: p.problem_id,
      headingPath: heading,
      lawCode: p.laws?.law_code ?? null,
      bodyMd: p.body_md ?? "",
      explanationMd: p.explanation_md,
      choices: choicesByPid.get(p.problem_id) ?? [],
      boxItems: boxesByPid.get(p.problem_id) ?? [],
      modelAnswerMd: p.model_answer_md,
      gradingRubricMd: p.grading_rubric_md,
    });
  });

  if (chunks.length > 0) {
    await upsertChunks(adminClient, chunks);
  }
}

// ── 삭제 hook ────────────────────────────────────────────────────────────

/**
 * source soft-delete / hard-delete 시 해당 청크 전부 제거. 호출부는 source_type 별로 1번만.
 */
export async function removeSourceChunks(
  sourceType: "article" | "case" | "problem",
  sourceIds: ReadonlyArray<string>,
): Promise<void> {
  for (const id of sourceIds) {
    await deleteChunksForSource(adminClient, sourceType, id);
  }
}
