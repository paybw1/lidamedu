import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { accrueQnaAnswerCredit } from "~/features/qna/rewards.server";

import type {
  QnaCitation,
  QnaMessage,
  QnaQualityGrade,
  QnaStatus,
  QnaTargetType,
  QnaThreadDetail,
  QnaThreadSummary,
} from "./labels";

export type {
  QnaCitation,
  QnaMessage,
  QnaQualityGrade,
  QnaStatus,
  QnaTargetType,
  QnaThreadDetail,
  QnaThreadSummary,
} from "./labels";

const SUMMARY_COLUMNS = `
  thread_id,
  target_type,
  target_id,
  subject,
  asker_id,
  answerer_id,
  title,
  status,
  quality_grade,
  created_at,
  answered_at,
  updated_at,
  node_id,
  asker:profiles!qna_threads_asker_id_fkey ( profile_id, name ),
  answerer:profiles!qna_threads_answerer_id_fkey ( profile_id, name )
`;

const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, question_md, answer_md`;

type RawSummaryRow = {
  thread_id: string;
  target_type: QnaTargetType;
  target_id: string | null;
  subject: string | null;
  asker_id: string;
  answerer_id: string | null;
  title: string;
  status: QnaStatus;
  quality_grade: QnaQualityGrade | null;
  created_at: string;
  answered_at: string | null;
  updated_at: string;
  node_id: string | null;
  asker: { profile_id: string; name: string } | null;
  answerer: { profile_id: string; name: string } | null;
};

type RawDetailRow = RawSummaryRow & {
  question_md: string;
  answer_md: string | null;
};

function toSummary(row: RawSummaryRow): QnaThreadSummary {
  return {
    threadId: row.thread_id,
    targetType: row.target_type,
    targetId: row.target_id,
    subject: row.subject,
    askerId: row.asker_id,
    askerName: row.asker?.name ?? null,
    answererId: row.answerer_id,
    answererName: row.answerer?.name ?? null,
    title: row.title,
    status: row.status,
    qualityGrade: row.quality_grade,
    createdAt: row.created_at,
    answeredAt: row.answered_at,
    updatedAt: row.updated_at,
    nodeId: row.node_id ?? null,
  };
}

function toDetail(row: RawDetailRow): QnaThreadDetail {
  return {
    ...toSummary(row),
    questionMd: row.question_md,
    answerMd: row.answer_md,
  };
}

// 엔티티 단위(조문/판례/문제) 패널용 — 해당 target 의 스레드 목록.
export async function listThreadsForTarget(
  client: SupabaseClient<Database>,
  targetType: QnaTargetType,
  targetId: string,
  limit = 20,
): Promise<QnaThreadSummary[]> {
  const { data, error } = await client
    .from("qna_threads")
    .select(SUMMARY_COLUMNS)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("thread_id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as RawSummaryRow[] | null ?? []).map(toSummary);
}

// 특정 조문 대상 + 특정 단원(node_id) 앵커 — 노드 뷰어 안의 조문 질문 탭용.
//   여러 쟁점에 걸친 조문(특허 29조 등)에서 현재 쟁점에 배정된 질문만 보여준다.
export async function listThreadsForArticleInNode(
  client: SupabaseClient<Database>,
  articleId: string,
  nodeId: string,
  limit = 300,
): Promise<QnaThreadSummary[]> {
  const { data, error } = await client
    .from("qna_threads")
    .select(SUMMARY_COLUMNS)
    .eq("target_type", "article")
    .eq("target_id", articleId)
    .eq("node_id", nodeId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("thread_id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data as unknown as RawSummaryRow[] | null) ?? []).map(toSummary);
}

// 단원(node_id) 앵커 스레드 — 대상은 조문/문제 등이어도 이 단원에 속한 질문.
//   아카이브 백필(backfill-qna-node-anchor)로 조문 질문이 세부 주제 노드에 분류돼 있어
//   노드 뷰어 Q&A 패널이 target_type='node' 와 합쳐 보여준다.
export async function listThreadsAnchoredToNode(
  client: SupabaseClient<Database>,
  nodeId: string,
  limit = 50,
): Promise<QnaThreadSummary[]> {
  const { data, error } = await client
    .from("qna_threads")
    .select(SUMMARY_COLUMNS)
    .eq("node_id", nodeId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("thread_id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data as unknown as RawSummaryRow[] | null) ?? []).map(toSummary);
}

// ── prev/next 컨텍스트(from=...) — 진입한 목록과 동일한 필터·정렬로 이웃 계산 ──
//   node:<nodeId>                : 노드 Q&A 패널(node 대상 ∪ 단원 앵커)
//   artnode:<articleId>:<nodeId> : 노드 뷰어 안 조문 질문 탭(조문+단원 앵커)
//   target:<type>:<id>           : 뷰어 대상 패널(조문/문제/판례 등)
//   (없음)                        : /qna 전체 목록
export type QnaNeighborCtx =
  | { kind: "node"; nodeId: string }
  | { kind: "artnode"; articleId: string; nodeId: string }
  | { kind: "target"; targetType: QnaTargetType; targetId: string }
  | null;

export function parseQnaNeighborCtx(raw: string | null): QnaNeighborCtx {
  if (!raw) return null;
  const p = raw.split(":");
  const UUID = /^[0-9a-f-]{36}$/;
  if (p[0] === "node" && UUID.test(p[1] ?? "")) return { kind: "node", nodeId: p[1] };
  if (p[0] === "artnode" && UUID.test(p[1] ?? "") && UUID.test(p[2] ?? ""))
    return { kind: "artnode", articleId: p[1], nodeId: p[2] };
  if (p[0] === "target" && p[2] && UUID.test(p[2]))
    return { kind: "target", targetType: p[1] as QnaTargetType, targetId: p[2] };
  return null;
}

/** 컨텍스트 목록(작성일 desc, thread_id desc) 기준 이웃 — prev=목록에서 위(더 최신), next=아래(더 과거). */
export async function getNeighborThreads(
  client: SupabaseClient<Database>,
  ctx: QnaNeighborCtx,
  cur: { threadId: string; createdAt: string },
): Promise<{
  prev: { threadId: string; title: string } | null;
  next: { threadId: string; title: string } | null;
}> {
  const base = () => {
    let q = client
      .from("qna_threads")
      .select("thread_id, title")
      .is("deleted_at", null);
    if (ctx?.kind === "node")
      q = q.or(
        `node_id.eq.${ctx.nodeId},and(target_type.eq.node,target_id.eq.${ctx.nodeId})`,
      );
    else if (ctx?.kind === "artnode")
      q = q
        .eq("target_type", "article")
        .eq("target_id", ctx.articleId)
        .eq("node_id", ctx.nodeId);
    else if (ctx?.kind === "target")
      q = q.eq("target_type", ctx.targetType).eq("target_id", ctx.targetId);
    return q;
  };
  const [{ data: newer }, { data: older }] = await Promise.all([
    base()
      .or(
        `created_at.gt.${cur.createdAt},and(created_at.eq.${cur.createdAt},thread_id.gt.${cur.threadId})`,
      )
      .order("created_at", { ascending: true })
      .order("thread_id", { ascending: true })
      .limit(1)
      .maybeSingle(),
    base()
      .or(
        `created_at.lt.${cur.createdAt},and(created_at.eq.${cur.createdAt},thread_id.lt.${cur.threadId})`,
      )
      .order("created_at", { ascending: false })
      .order("thread_id", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    prev: newer ? { threadId: newer.thread_id, title: newer.title } : null,
    next: older ? { threadId: older.thread_id, title: older.title } : null,
  };
}

export interface ListFilter {
  // review = 강사 검토 큐(미답 open + AI 미검토 ai_answered 모아보기).
  scope: "all" | "asked-by-me" | "answered-by-me" | "open" | "review";
  query?: string;
  targetType?: QnaTargetType;
  /** 과목 분류 필터(law_code 류). */
  subject?: string;
  limit?: number;
  /** 1-base 페이지 — limit 단위 페이지네이션(기본 1). */
  page?: number;
}

// 통합 목록(검색/필터). RLS 가 가시성 처리하므로 추가 권한 체크 불요.
export async function listThreads(
  client: SupabaseClient<Database>,
  userId: string,
  filter: ListFilter,
): Promise<{ items: QnaThreadSummary[]; total: number }> {
  let q = client
    .from("qna_threads")
    .select(SUMMARY_COLUMNS, { count: "exact" })
    .is("deleted_at", null);

  if (filter.targetType) q = q.eq("target_type", filter.targetType);
  if (filter.subject) q = q.eq("subject", filter.subject);

  if (filter.scope === "asked-by-me") {
    q = q.eq("asker_id", userId);
  } else if (filter.scope === "answered-by-me") {
    q = q.eq("answerer_id", userId);
  } else if (filter.scope === "open") {
    q = q.eq("status", "open");
  } else if (filter.scope === "review") {
    // 강사 검토 큐 — 미답 + AI 미검토(평가/정정 대기).
    q = q.in("status", ["open", "ai_answered"]);
  }

  if (filter.query && filter.query.trim().length > 0) {
    const term = filter.query.trim().replace(/[,()]/g, " ");
    // title / question_md / answer_md ILIKE OR
    q = q.or(
      `title.ilike.%${term}%,question_md.ilike.%${term}%,answer_md.ilike.%${term}%`,
    );
  }

  // 검토 큐는 오래된 것부터(FIFO — 묵은 질문이 밀리지 않게), 그 외는 최신순.
  const ascending = filter.scope === "review";
  const pageSize = filter.limit ?? 50;
  const page = Math.max(1, filter.page ?? 1);
  q = q
    .order("created_at", { ascending })
    .order("thread_id", { ascending })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw error;
  return {
    items: ((data as unknown as RawSummaryRow[] | null) ?? []).map(toSummary),
    total: count ?? 0,
  };
}

/** 강사 검토 큐 전역 건수 — 미답(open) + AI 미검토(ai_answered). 카운트 배지용. */
export async function countReviewQueue(
  client: SupabaseClient<Database>,
): Promise<number> {
  const { count, error } = await client
    .from("qna_threads")
    .select("thread_id", { count: "exact", head: true })
    .is("deleted_at", null)
    .in("status", ["open", "ai_answered"]);
  if (error) throw error;
  return count ?? 0;
}

// 스레드 타임라인 메시지(AI 즉답·강사·학생 후속). 공개 읽기(RLS), soft-delete 제외.
function parseCitations(raw: unknown): QnaCitation[] {
  if (!Array.isArray(raw)) return [];
  const out: QnaCitation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (
      typeof c.label === "number" &&
      typeof c.sourceType === "string" &&
      typeof c.sourceId === "string"
    ) {
      out.push({
        label: c.label,
        sourceType: c.sourceType,
        sourceId: c.sourceId,
        headingPath: typeof c.headingPath === "string" ? c.headingPath : "",
      });
    }
  }
  return out;
}

type RawMessageRow = {
  message_id: string;
  thread_id: string;
  role: QnaMessage["role"];
  author_id: string | null;
  body_md: string;
  citations: unknown;
  verifies_message_id: string | null;
  verdict: string | null;
  verified_at: string | null;
  feedback: number | null;
  created_at: string;
  author: { profile_id: string; name: string } | null;
  verifier: { profile_id: string; name: string } | null;
};

export async function listThreadMessages(
  client: SupabaseClient<Database>,
  threadId: string,
): Promise<QnaMessage[]> {
  const { data, error } = await client
    .from("qna_messages")
    .select(
      `message_id, thread_id, role, author_id, body_md, citations,
       verifies_message_id, verdict, verified_at, feedback, created_at,
       author:profiles!qna_messages_author_id_fkey ( profile_id, name ),
       verifier:profiles!qna_messages_verified_by_fkey ( profile_id, name )`,
    )
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data as unknown as RawMessageRow[] | null) ?? []).map((r) => ({
    messageId: r.message_id,
    threadId: r.thread_id,
    role: r.role,
    authorId: r.author_id,
    authorName: r.author?.name ?? null,
    bodyMd: r.body_md,
    citations: parseCitations(r.citations),
    verifiesMessageId: r.verifies_message_id,
    verdict: r.verdict === "correct" || r.verdict === "incorrect" ? r.verdict : null,
    verifiedByName: r.verifier?.name ?? null,
    verifiedAt: r.verified_at,
    feedback: r.feedback,
    createdAt: r.created_at,
  }));
}

/**
 * 강사의 AI 답변 정오 평가. staff 만(RLS + 액션 게이트). AI 메시지에 verdict 부착하고
 * 스레드 상태를 조정한다 — 정확→verified, 부정확→ai_answered(강사 정정답변 폼 재노출).
 * 그 사이 강사 정식답변(answer_md)으로 answered/closed 된 스레드는 상태를 건드리지 않음.
 */
export async function setAiVerdict(
  client: SupabaseClient<Database>,
  verifierId: string,
  input: { threadId: string; messageId: string; verdict: "correct" | "incorrect" },
): Promise<void> {
  const { error: msgError } = await client
    .from("qna_messages")
    .update({
      verdict: input.verdict,
      verified_by: verifierId,
      verified_at: new Date().toISOString(),
    })
    .eq("message_id", input.messageId)
    .eq("thread_id", input.threadId)
    .eq("role", "ai")
    .is("deleted_at", null);
  if (msgError) throw msgError;

  if (input.verdict === "correct") {
    const { error } = await client
      .from("qna_threads")
      .update({ status: "verified" })
      .eq("thread_id", input.threadId)
      .is("deleted_at", null)
      .in("status", ["ai_answered", "verified"]);
    if (error) throw error;
  } else {
    // 부정확 — verified 였다면 ai_answered 로 되돌려 강사 정정답변 폼을 다시 띄운다.
    const { error } = await client
      .from("qna_threads")
      .update({ status: "ai_answered" })
      .eq("thread_id", input.threadId)
      .is("deleted_at", null)
      .eq("status", "verified");
    if (error) throw error;
  }
}

// 질문자 후속 메시지(멀티턴) — RLS(author 본인) 로 insert. AI 재응답은 호출부가 트리거.
export async function addStudentMessage(
  client: SupabaseClient<Database>,
  userId: string,
  threadId: string,
  bodyMd: string,
): Promise<void> {
  const { error } = await client.from("qna_messages").insert({
    thread_id: threadId,
    role: "student",
    author_id: userId,
    body_md: bodyMd,
  });
  if (error) throw error;
}

export async function getThreadDetail(
  client: SupabaseClient<Database>,
  threadId: string,
): Promise<QnaThreadDetail | null> {
  const { data, error } = await client
    .from("qna_threads")
    .select(DETAIL_COLUMNS)
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toDetail(data as unknown as RawDetailRow);
}

// 콘텐츠 대상(조문/판례/문제)의 과목(law_code) 도출 — 과목 분류 필터용.
async function resolveSubjectForTarget(
  client: SupabaseClient<Database>,
  targetType: QnaTargetType,
  targetId: string,
): Promise<string | null> {
  if (targetType === "article") {
    const { data } = await client
      .from("articles")
      .select("laws(law_code)")
      .eq("article_id", targetId)
      .maybeSingle();
    return data?.laws?.law_code ?? null;
  }
  if (targetType === "case") {
    const { data } = await client
      .from("cases")
      .select("subject_laws")
      .eq("case_id", targetId)
      .maybeSingle();
    return data?.subject_laws?.[0] ?? null;
  }
  if (targetType === "problem") {
    const { data } = await client
      .from("problems")
      .select("laws(law_code)")
      .eq("problem_id", targetId)
      .maybeSingle();
    return data?.laws?.law_code ?? null;
  }
  if (targetType === "node") {
    const { data } = await client
      .from("systematic_nodes")
      .select("law_code")
      .eq("node_id", targetId)
      .maybeSingle();
    return data?.law_code ?? null;
  }
  return null;
}

// 대상(조문/판례/문제/쟁점)의 체계도 노드(단원) 도출 — 학습분석 집계용으로 스레드에 캡처.
//   조문→article_systematic_links 첫 노드(path 우선) / 판례·문제→primary_node_id /
//   쟁점→자기 자신 / 공부방법·일반→null.
export async function resolveNodeForTarget(
  client: SupabaseClient<Database>,
  targetType: QnaTargetType,
  targetId: string,
): Promise<string | null> {
  if (targetType === "node") return targetId;
  if (targetType === "problem") {
    const { data } = await client
      .from("problems")
      .select("primary_node_id")
      .eq("problem_id", targetId)
      .maybeSingle();
    return data?.primary_node_id ?? null;
  }
  if (targetType === "case") {
    const { data } = await client
      .from("cases")
      .select("primary_node_id")
      .eq("case_id", targetId)
      .maybeSingle();
    return data?.primary_node_id ?? null;
  }
  if (targetType === "article") {
    const { data: links } = await client
      .from("article_systematic_links")
      .select("node_id")
      .eq("article_id", targetId);
    const ids = [...new Set((links ?? []).map((l) => l.node_id))];
    if (ids.length === 0) return null;
    const { data: nodes } = await client
      .from("systematic_nodes")
      .select("node_id, path")
      .in("node_id", ids);
    return (
      (nodes ?? [])
        .sort((a, b) => String(a.path).localeCompare(String(b.path)))[0]
        ?.node_id ?? null
    );
  }
  return null;
}

// 과학 문제 대상의 과학 단원(science_sections) 도출 — node_id 와 대칭(과학 축).
export async function resolveScienceSectionForTarget(
  client: SupabaseClient<Database>,
  targetType: QnaTargetType,
  targetId: string,
): Promise<string | null> {
  if (targetType !== "problem") return null;
  const { data } = await client
    .from("problems")
    .select("science_section_id")
    .eq("problem_id", targetId)
    .maybeSingle();
  return data?.science_section_id ?? null;
}

export async function createThread(
  client: SupabaseClient<Database>,
  asker_id: string,
  input: {
    targetType: QnaTargetType;
    /** study_method 는 null(콘텐츠 앵커 없음). */
    targetId: string | null;
    title: string;
    questionMd: string;
    /** study_method 필수. 콘텐츠 대상은 미지정 시 대상에서 도출. */
    subject?: string | null;
  },
): Promise<QnaThreadDetail> {
  const subject =
    input.targetType === "study_method"
      ? (input.subject ?? null)
      : input.targetId
        ? await resolveSubjectForTarget(
            client,
            input.targetType,
            input.targetId,
          )
        : (input.subject ?? null);
  // 단원 캡처 — 콘텐츠 대상만. 법과목=체계도 노드 / 과학=science_sections.
  //   공부방법·앵커 없는 질문은 둘 다 null.
  const hasAnchor = input.targetType !== "study_method" && !!input.targetId;
  const [nodeId, scienceSectionId] = hasAnchor
    ? await Promise.all([
        resolveNodeForTarget(client, input.targetType, input.targetId!),
        resolveScienceSectionForTarget(
          client,
          input.targetType,
          input.targetId!,
        ),
      ])
    : [null, null];
  const { data, error } = await client
    .from("qna_threads")
    .insert({
      target_type: input.targetType,
      target_id: input.targetType === "study_method" ? null : input.targetId,
      asker_id,
      title: input.title,
      question_md: input.questionMd,
      subject,
      node_id: nodeId,
      science_section_id: scienceSectionId,
    })
    .select(DETAIL_COLUMNS)
    .single();
  if (error) throw error;
  return toDetail(data as unknown as RawDetailRow);
}

export async function answerThread(
  client: SupabaseClient<Database>,
  answerer_id: string,
  threadId: string,
  input: { answerMd: string; qualityGrade: QnaQualityGrade },
): Promise<QnaThreadDetail> {
  const { data, error } = await client
    .from("qna_threads")
    .update({
      answerer_id,
      answer_md: input.answerMd,
      quality_grade: input.qualityGrade,
      status: "answered",
      answered_at: new Date().toISOString(),
    })
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .select(DETAIL_COLUMNS)
    .single();
  if (error) throw error;
  // feat-7-042 — 강사 답변 적립(스레드당 1건, 실패해도 답변은 성공 처리).
  try {
    await accrueQnaAnswerCredit(answerer_id, threadId);
  } catch {
    // 적립 실패는 무시 — 지급 화면 대사에서 발견 가능.
  }
  return toDetail(data as unknown as RawDetailRow);
}

export async function closeThread(
  client: SupabaseClient<Database>,
  threadId: string,
): Promise<void> {
  const { error } = await client
    .from("qna_threads")
    .update({ status: "closed" })
    .eq("thread_id", threadId)
    .is("deleted_at", null);
  if (error) throw error;
}

export async function softDeleteThread(
  client: SupabaseClient<Database>,
  threadId: string,
): Promise<void> {
  // soft-delete 는 SECURITY DEFINER RPC 로 — SELECT 정책(deleted_at IS NULL)이
  // UPDATE 새 행을 막아 직접 UPDATE 는 RLS(42501)로 실패. RPC 가 asker/answerer/staff
  // 검사 후 우회.
  const { error } = await client.rpc("soft_delete_qna_thread", {
    p_id: threadId,
  });
  if (error) throw error;
}
