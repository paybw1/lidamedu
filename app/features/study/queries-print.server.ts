// 학습지원 "복습 정리본"(인쇄→PDF) 전용 데이터 조회.
// 화면 목록(listWrongAttempts/listOxWrongAttempts)은 본문 스니펫만 주므로,
// 여기서 문제 전문·선택지·정답·해설을 보강해 인쇄에 적합한 형태로 반환한다.
// 문제 콘텐츠는 전체 공개 읽기라 요청 컨텍스트 client(RLS)로 조회 가능.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

import {
  listOxWrongAttempts,
  listWrongAttempts,
} from "~/features/study/queries.server";

export interface PrintChoice {
  index: number;
  bodyMd: string;
  isCorrect: boolean;
}

export interface WrongMcqPrintItem {
  problemId: string;
  lawCode: LawSubjectSlug;
  articleLabel: string | null;
  year: number | null;
  problemNumber: number | null;
  attempts: number;
  bodyMd: string;
  choices: PrintChoice[];
  answerIndex: number | null; // 정답 choice_index (없으면 null)
  explanationMd: string | null;
}

export interface WrongOxPrintItem {
  refType: "choice" | "box";
  refId: string;
  lawCode: LawSubjectSlug;
  articleLabel: string | null;
  year: number | null;
  problemNumber: number | null;
  attempts: number;
  statementMd: string;
  oxTruth: "O" | "X";
  myAnswer: "O" | "X";
  explanationMd: string | null;
}

export interface WrongNotePrintData {
  mcq: WrongMcqPrintItem[];
  ox: WrongOxPrintItem[];
}

const CHUNK = 200;

function chunked<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += CHUNK) out.push(arr.slice(i, i + CHUNK));
  return out;
}

export async function getWrongNotePrintData(
  client: SupabaseClient<Database>,
  userId: string,
  lawCode?: LawSubjectSlug,
): Promise<WrongNotePrintData> {
  const [mcqBase, oxBase] = await Promise.all([
    listWrongAttempts(client, userId, lawCode),
    listOxWrongAttempts(client, userId, lawCode),
  ]);

  // ── 객관식 보강: 문제 전문 + 해설 + 선택지(정답 포함) ──────────────
  const mcqIds = mcqBase.map((m) => m.problemId);
  const problemById = new Map<
    string,
    { bodyMd: string; explanationMd: string | null }
  >();
  const choicesByProblem = new Map<string, PrintChoice[]>();
  for (const ids of chunked(mcqIds)) {
    const [{ data: probs }, { data: chs }] = await Promise.all([
      client
        .from("problems")
        .select("problem_id, body_md, explanation_md")
        .in("problem_id", ids),
      client
        .from("problem_choices")
        .select("problem_id, choice_index, body_md, is_correct")
        .in("problem_id", ids)
        .order("choice_index", { ascending: true }),
    ]);
    for (const p of probs ?? [])
      problemById.set(p.problem_id, {
        bodyMd: p.body_md ?? "",
        explanationMd: p.explanation_md,
      });
    for (const c of chs ?? []) {
      const arr = choicesByProblem.get(c.problem_id) ?? [];
      arr.push({
        index: c.choice_index,
        bodyMd: c.body_md ?? "",
        isCorrect: c.is_correct,
      });
      choicesByProblem.set(c.problem_id, arr);
    }
  }
  const mcq: WrongMcqPrintItem[] = mcqBase.map((m) => {
    const p = problemById.get(m.problemId);
    const choices = (choicesByProblem.get(m.problemId) ?? []).sort(
      (a, b) => a.index - b.index,
    );
    const answer = choices.find((c) => c.isCorrect);
    return {
      problemId: m.problemId,
      lawCode: m.lawCode,
      articleLabel: m.primaryArticleLabel,
      year: m.year,
      problemNumber: m.problemNumber,
      attempts: m.attempts,
      bodyMd: p?.bodyMd ?? "",
      choices,
      answerIndex: answer ? answer.index : null,
      explanationMd: p?.explanationMd ?? null,
    };
  });

  // ── OX 보강: 지문 전문 + 해설 (choice / box_item) ─────────────────
  const choiceIds = oxBase.filter((o) => o.refType === "choice").map((o) => o.refId);
  const boxIds = oxBase.filter((o) => o.refType === "box").map((o) => o.refId);
  const choiceFull = new Map<string, { bodyMd: string; explanationMd: string | null }>();
  const boxFull = new Map<string, { bodyMd: string; explanationMd: string | null }>();
  for (const ids of chunked(choiceIds)) {
    const { data } = await client
      .from("problem_choices")
      .select("choice_id, body_md, explanation_md")
      .in("choice_id", ids);
    for (const c of data ?? [])
      choiceFull.set(c.choice_id, {
        bodyMd: c.body_md ?? "",
        explanationMd: c.explanation_md,
      });
  }
  for (const ids of chunked(boxIds)) {
    const { data } = await client
      .from("problem_box_items")
      .select("box_item_id, body_md, explanation_md")
      .in("box_item_id", ids);
    for (const b of data ?? [])
      boxFull.set(b.box_item_id, {
        bodyMd: b.body_md ?? "",
        explanationMd: b.explanation_md,
      });
  }
  const ox: WrongOxPrintItem[] = oxBase.map((o) => {
    const full =
      o.refType === "choice" ? choiceFull.get(o.refId) : boxFull.get(o.refId);
    return {
      refType: o.refType,
      refId: o.refId,
      lawCode: o.lawCode,
      articleLabel: o.primaryArticleLabel,
      year: o.year,
      problemNumber: o.problemNumber,
      attempts: o.attempts,
      statementMd: full?.bodyMd || o.bodySnippet,
      oxTruth: o.oxTruth,
      myAnswer: o.myAnswer,
      explanationMd: full?.explanationMd ?? null,
    };
  });

  return { mcq, ox };
}
