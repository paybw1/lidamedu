import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "~/core/lib/supa-batch.server";
import type { Database } from "database.types";

import type { AnnotationTargetType } from "~/features/annotations/queries.server";
import { articleSlug } from "~/features/laws/lib/identifier";
import {
  LAW_SUBJECTS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

// ---- 문제 난이도 (전체 사용자 시도 집계) ----
// 표시용 상수/타입은 client-safe 한 ./lib/difficulty 로 분리.
import {
  MIN_ATTEMPTS_FOR_DIFFICULTY,
  type ProblemAggregateStats,
  bucketDifficulty,
  emptyProblemAggregate,
} from "./lib/difficulty";

export interface StudyScope {
  subject: LawSubjectSlug;
  target_type: AnnotationTargetType;
  target_id: string;
  tab?: string;
}

export async function recordStudySession(
  client: SupabaseClient<Database>,
  userId: string,
  scope: StudyScope,
): Promise<void> {
  const { error } = await client.from("study_sessions").insert({
    user_id: userId,
    scope:
      scope as unknown as Database["public"]["Tables"]["study_sessions"]["Insert"]["scope"],
  });
  if (error) throw error;
}

export interface SubjectProgress {
  visitedArticleIds: Set<string>;
  totalArticleCount: number;
  pctViewed: number;
  // 판례 진도 — case-viewer 가 study_sessions 에 target_type='case' 로
  // 기록한 distinct 방문 집계. 같은 study_sessions 쿼리 안에서 article 과
  // 함께 카운트한다(추가 쿼리 없음).
  visitedCaseIds: Set<string>;
  totalCaseCount: number;
  pctCasesViewed: number;
  lastVisited: {
    articleId: string;
    articleNumber: string | null;
    displayLabel: string;
    visitedAt: string;
  } | null;
  // 마지막 학습 판례·문제 — 판례/문제 탭의 "이어서 보기" 대상(같은 study_sessions 집계).
  lastCase: {
    caseId: string;
    displayLabel: string;
    visitedAt: string;
  } | null;
  lastProblem: {
    problemId: string;
    displayLabel: string;
    visitedAt: string;
  } | null;
}

export async function getSubjectProgress(
  client: SupabaseClient<Database>,
  userId: string,
  lawCode: LawSubjectSlug,
  totalArticleCount: number,
  totalCaseCount: number,
): Promise<SubjectProgress> {
  // 본인의 study_sessions — article·case 방문을 같은 쿼리에서 집계.
  const { data, error } = await client
    .from("study_sessions")
    .select("scope, started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(500);

  if (error) throw error;

  const visited = new Set<string>();
  const visitedCases = new Set<string>();
  let last: SubjectProgress["lastVisited"] = null;
  let lastCase: SubjectProgress["lastCase"] = null;
  let lastProblem: SubjectProgress["lastProblem"] = null;
  for (const row of data ?? []) {
    const scope = row.scope as Partial<StudyScope> | null;
    if (!scope || scope.subject !== lawCode || !scope.target_id) continue;
    if (scope.target_type === "article") {
      visited.add(scope.target_id);
      if (!last) {
        last = {
          articleId: scope.target_id,
          articleNumber: null,
          displayLabel: "",
          visitedAt: row.started_at,
        };
      }
    } else if (scope.target_type === "case") {
      visitedCases.add(scope.target_id);
      // 정렬이 started_at DESC 라 첫 case 가 가장 최근.
      if (!lastCase) {
        lastCase = {
          caseId: scope.target_id,
          displayLabel: "",
          visitedAt: row.started_at,
        };
      }
    } else if (scope.target_type === "problem") {
      if (!lastProblem) {
        lastProblem = {
          problemId: scope.target_id,
          displayLabel: "",
          visitedAt: row.started_at,
        };
      }
    }
  }

  // 마지막 학습 조문/판례/문제의 표시 라벨 채우기 (각 탭 "이어서 보기" 대상).
  if (last) {
    const { data: a } = await client
      .from("articles")
      .select("article_number, display_label")
      .eq("article_id", last.articleId)
      .maybeSingle();
    if (a) {
      last.articleNumber = a.article_number;
      last.displayLabel = a.display_label;
    }
  }
  if (lastCase) {
    const { data: c } = await client
      .from("cases")
      .select("case_title, case_number")
      .eq("case_id", lastCase.caseId)
      .maybeSingle();
    if (c) lastCase.displayLabel = c.case_title || c.case_number || "판례";
  }
  if (lastProblem) {
    const { data: p } = await client
      .from("problems")
      .select("body_md, year, problem_number")
      .eq("problem_id", lastProblem.problemId)
      .maybeSingle();
    if (p) {
      const body = (p.body_md ?? "").replace(/\s+/g, " ").trim();
      lastProblem.displayLabel = body
        ? body.length > 30
          ? `${body.slice(0, 30)}…`
          : body
        : p.year
          ? `${p.year}년 ${p.problem_number ?? ""}번`
          : "문제";
    }
  }

  const pct =
    totalArticleCount > 0
      ? Math.round((visited.size / totalArticleCount) * 100)
      : 0;
  const pctCases =
    totalCaseCount > 0
      ? Math.round((visitedCases.size / totalCaseCount) * 100)
      : 0;

  return {
    visitedArticleIds: visited,
    totalArticleCount,
    pctViewed: pct,
    visitedCaseIds: visitedCases,
    totalCaseCount,
    pctCasesViewed: pctCases,
    lastVisited: last,
    lastCase,
    lastProblem,
  };
}

// ── 과목별 "마지막 학습 지점"(이어서 보기) — 학습현황 진도 런처용 ──
// study_sessions 를 1회만 조회해 과목별 최신 1건(조문/판례/문제)을 잡고,
// 표시 라벨은 타입별 배치 조회로 해결한다(getSubjectProgress 5회 호출 방지).
export interface SubjectLastPoint {
  type: "조문" | "판례" | "문제";
  label: string;
  sub: string;
  path: string;
}

function relativeKoTime(iso: string, now: number): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "어제";
  if (day < 7) return `${day}일 전`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}주 전`;
  return `${Math.floor(day / 30)}개월 전`;
}

export async function getLastStudyPointsBySubject(
  client: SupabaseClient<Database>,
  userId: string,
  subjects: { slug: LawSubjectSlug }[],
): Promise<Record<string, SubjectLastPoint[]>> {
  const { data, error } = await client
    .from("study_sessions")
    .select("scope, started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  type Kind = "article" | "case" | "problem";
  type Hit = { id: string; at: string };
  // DESC 정렬이라 (과목, 종류) 별 첫 등장이 최신. 과목×종류당 1건만 기록 —
  // 한 과목에서 조문/판례/문제 각각의 마지막 학습 지점을 따로 잡는다.
  const latest = new Map<string, Hit>(); // key = `${subject}::${kind}`
  for (const row of data ?? []) {
    const scope = row.scope as Partial<StudyScope> | null;
    const tt = scope?.target_type;
    if (!scope || !scope.subject || !scope.target_id) continue;
    if (tt !== "article" && tt !== "case" && tt !== "problem") continue;
    const key = `${scope.subject}::${tt}`;
    if (latest.has(key)) continue;
    latest.set(key, { id: scope.target_id, at: row.started_at });
  }

  const idsByKind = (kind: Kind): string[] => {
    const ids: string[] = [];
    for (const [key, hit] of latest) {
      if (key.endsWith(`::${kind}`)) ids.push(hit.id);
    }
    return ids;
  };
  const articleIds = idsByKind("article");
  const caseIds = idsByKind("case");
  const problemIds = idsByKind("problem");

  const [aData, cData, pData] = await Promise.all([
    articleIds.length
      ? client
          .from("articles")
          .select("article_id, article_number, display_label")
          .in("article_id", articleIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    caseIds.length
      ? client
          .from("cases")
          .select("case_id, case_title, case_number")
          .in("case_id", caseIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    problemIds.length
      ? client
          .from("problems")
          .select("problem_id, body_md, year, problem_number")
          .in("problem_id", problemIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  const aMap = new Map(aData.map((a) => [a.article_id, a] as const));
  const cMap = new Map(cData.map((c) => [c.case_id, c] as const));
  const pMap = new Map(pData.map((p) => [p.problem_id, p] as const));

  const now = Date.now();
  const out: Record<string, SubjectLastPoint[]> = {};
  for (const { slug } of subjects) {
    const points: SubjectLastPoint[] = [];

    // 조문
    const aHit = latest.get(`${slug}::article`);
    const a = aHit ? aMap.get(aHit.id) : undefined;
    if (aHit && a) {
      points.push({
        type: "조문",
        label: a.display_label || `제${a.article_number ?? ""}조`,
        sub: relativeKoTime(aHit.at, now),
        path:
          a.article_number != null
            ? `/subjects/${slug}/articles/${a.article_number}`
            : `/subjects/${slug}`,
      });
    }

    // 판례
    const cHit = latest.get(`${slug}::case`);
    const c = cHit ? cMap.get(cHit.id) : undefined;
    if (cHit && c) {
      points.push({
        type: "판례",
        label: c.case_title || c.case_number || "판례",
        sub: relativeKoTime(cHit.at, now),
        path: `/subjects/${slug}/cases/${cHit.id}`,
      });
    }

    // 문제
    const pHit = latest.get(`${slug}::problem`);
    if (pHit) {
      const p = pMap.get(pHit.id);
      const body = (p?.body_md ?? "").replace(/\s+/g, " ").trim();
      const label = body
        ? body.length > 30
          ? `${body.slice(0, 30)}…`
          : body
        : p?.year
          ? `${p.year}년 ${p.problem_number ?? ""}번`
          : "문제";
      points.push({
        type: "문제",
        label,
        sub: relativeKoTime(pHit.at, now),
        path: `/subjects/${slug}/problems/${pHit.id}`,
      });
    }

    out[slug] = points;
  }
  return out;
}

// ── 대시보드 "이어서 학습" — 전 과목 통틀어 가장 최근 학습 지점 1건 ──
// study_sessions 최신순으로 훑어 조문/판례/문제 중 첫 유효 항목을 잡고 라벨·경로 해결.
export interface ResumePoint {
  type: "조문" | "판례" | "문제";
  label: string;
  subjectName: string;
  when: string; // 상대 시간("3시간 전")
  path: string;
}

export async function getResumePoint(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<ResumePoint | null> {
  const { data } = await client
    .from("study_sessions")
    .select("scope, started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(30);
  let hit: {
    tt: "article" | "case" | "problem";
    id: string;
    subject: LawSubjectSlug;
    at: string;
  } | null = null;
  for (const row of data ?? []) {
    const scope = row.scope as Partial<StudyScope> | null;
    const tt = scope?.target_type;
    if (
      scope?.subject &&
      scope?.target_id &&
      (tt === "article" || tt === "case" || tt === "problem")
    ) {
      hit = {
        tt,
        id: scope.target_id,
        subject: scope.subject,
        at: row.started_at,
      };
      break;
    }
  }
  if (!hit) return null;

  const subjectName = LAW_SUBJECTS[hit.subject]?.name ?? hit.subject;
  const when = relativeKoTime(hit.at, Date.now());

  if (hit.tt === "article") {
    const { data: a } = await client
      .from("articles")
      .select("article_number, display_label")
      .eq("article_id", hit.id)
      .maybeSingle();
    return {
      type: "조문",
      label: a?.display_label || `제${a?.article_number ?? ""}조`,
      subjectName,
      when,
      path:
        a?.article_number != null
          ? `/subjects/${hit.subject}/articles/${a.article_number}`
          : `/subjects/${hit.subject}`,
    };
  }
  if (hit.tt === "case") {
    const { data: c } = await client
      .from("cases")
      .select("case_title, case_number")
      .eq("case_id", hit.id)
      .maybeSingle();
    return {
      type: "판례",
      label: c?.case_title || c?.case_number || "판례",
      subjectName,
      when,
      path: `/subjects/${hit.subject}/cases/${hit.id}`,
    };
  }
  const { data: p } = await client
    .from("problems")
    .select("body_md, year, problem_number")
    .eq("problem_id", hit.id)
    .maybeSingle();
  const body = (p?.body_md ?? "").replace(/\s+/g, " ").trim();
  const label = body
    ? body.length > 30
      ? `${body.slice(0, 30)}…`
      : body
    : p?.year
      ? `${p.year}년 ${p.problem_number ?? ""}번`
      : "문제";
  return {
    type: "문제",
    label,
    subjectName,
    when,
    path: `/subjects/${hit.subject}/problems/${hit.id}`,
  };
}

// 문제 시도 기록.
// OX 자동 채점: selectedChoiceId(또는 selectedBoxItemId) + oxAnswer ('O'|'X') 가 함께 오면 OX 시도로 기록.
// 일반 객관식: selectedChoiceId + selectedChoiceIndex 만 오고 oxAnswer 는 null.
export async function recordProblemAttempt(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    problemId: string;
    selectedChoiceId: string | null;
    selectedChoiceIndex: number | null;
    selectedBoxItemId?: string | null;
    oxAnswer?: "O" | "X" | null;
    isCorrect: boolean;
    mode?: "study" | "exam";
    timeSpentMs?: number | null;
    sessionId?: string | null;
  },
): Promise<void> {
  const { error } = await client.from("user_problem_attempts").insert({
    user_id: userId,
    problem_id: input.problemId,
    selected_choice_id: input.selectedChoiceId,
    selected_choice_index: input.selectedChoiceIndex,
    selected_box_item_id: input.selectedBoxItemId ?? null,
    ox_answer: input.oxAnswer ?? null,
    is_correct: input.isCorrect,
    mode: input.mode ?? "study",
    time_spent_ms: input.timeSpentMs ?? null,
    session_id: input.sessionId ?? null,
  });
  if (error) throw error;

  // feat-2-010 / 2-014 SRS hook — 시도 직후 SRS 상태 upsert. best-effort.
  if (input.oxAnswer == null) {
    // 객관식 단답/박스/사례 — problem 단위 SRS.
    const { applyProblemSrsUpdate } = await import(
      "~/features/study/srs.server"
    );
    await applyProblemSrsUpdate(
      client,
      userId,
      input.problemId,
      input.isCorrect,
    );
  } else if (input.selectedChoiceId || input.selectedBoxItemId) {
    // feat-2-014 — OX 채점, ref 단위 SRS.
    const { applyOxRefSrsUpdate } = await import(
      "~/features/study/ox-srs.server"
    );
    const refType = input.selectedChoiceId ? "choice" : "box_item";
    const refId = (input.selectedChoiceId ?? input.selectedBoxItemId)!;
    await applyOxRefSrsUpdate(client, userId, refType, refId, input.isCorrect);
  }
}

// ---- 퀴즈 세션 ----

export type QuizMode = "study" | "exam";
export type QuizScopeType =
  | "node"
  | "filter"
  | "wrong-note"
  | "bookmark"
  | "free"
  | "pack";

export interface QuizSession {
  sessionId: string;
  mode: QuizMode;
  lawCode: LawSubjectSlug | null;
  scienceSubject: "physics" | "chemistry" | "biology" | "earth_science" | null;
  scopeType: QuizScopeType;
  scopePayload: Record<string, unknown>;
  problemIds: string[];
  timeLimitSec: number | null;
  startedAt: string;
  completedAt: string | null;
  /** feat-10-005 — 통합 시험 교시 세션이면 그 응시(mcq_exam_attempts) id. */
  examAttemptId: string | null;
}

export async function createQuizSession(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    mode: QuizMode;
    // 둘 중 정확히 하나 (DB check 가 강제) — 법률 vs 자연과학.
    lawCode?: LawSubjectSlug;
    scienceSubject?: "physics" | "chemistry" | "biology" | "earth_science";
    scopeType: QuizScopeType;
    scopePayload?: Record<string, unknown>;
    problemIds: string[];
    timeLimitSec?: number | null;
    // MCQ 팩 응시 시 — 응시 결과를 pack 단위 통계와 묶기 위함.
    packId?: string | null;
    // feat-10-005 — 통합 시험 교시 세션이면 그 응시(mcq_exam_attempts).
    examAttemptId?: string | null;
  },
): Promise<string> {
  if (!!input.lawCode === !!input.scienceSubject) {
    throw new Error("createQuizSession: lawCode XOR scienceSubject");
  }
  const { data, error } = await client
    .from("quiz_sessions")
    .insert({
      user_id: userId,
      mode: input.mode,
      law_code: input.lawCode ?? null,
      science_subject: input.scienceSubject ?? null,
      scope_type: input.scopeType,
      scope_payload: (input.scopePayload ??
        {}) as Database["public"]["Tables"]["quiz_sessions"]["Insert"]["scope_payload"],
      problem_ids: input.problemIds,
      time_limit_sec: input.timeLimitSec ?? null,
      pack_id: input.packId ?? null,
      exam_attempt_id: input.examAttemptId ?? null,
    })
    .select("session_id")
    .single();
  if (error) throw error;
  return data.session_id;
}

export async function completeQuizSession(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
): Promise<void> {
  // feat-7-040 후속 P3 — 완료 시 점수 스냅샷(불변). 세션 attempts 집계 후 기록.
  // .is(completed_at, null) 가드로 최초 완료에만 기록 → 이후 시도 편집과 무관한 불변값.
  const { data: attempts } = await client
    .from("user_problem_attempts")
    .select("is_correct")
    .eq("session_id", sessionId)
    .eq("user_id", userId);
  const scoreTotal = attempts?.length ?? 0;
  const scoreCorrect = (attempts ?? []).filter((a) => a.is_correct).length;
  const { error } = await client
    .from("quiz_sessions")
    .update({
      completed_at: new Date().toISOString(),
      score_correct: scoreCorrect,
      score_total: scoreTotal,
    })
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .is("completed_at", null);
  if (error) throw error;
}

export async function getQuizSession(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
): Promise<QuizSession | null> {
  const { data, error } = await client
    .from("quiz_sessions")
    .select(
      "session_id, mode, law_code, science_subject, scope_type, scope_payload, problem_ids, time_limit_sec, started_at, completed_at, exam_attempt_id",
    )
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    sessionId: data.session_id,
    mode: data.mode as QuizMode,
    lawCode: data.law_code as LawSubjectSlug | null,
    scienceSubject: data.science_subject as QuizSession["scienceSubject"],
    scopeType: data.scope_type as QuizScopeType,
    scopePayload: (data.scope_payload as Record<string, unknown>) ?? {},
    problemIds: data.problem_ids,
    timeLimitSec: data.time_limit_sec,
    startedAt: data.started_at,
    completedAt: data.completed_at,
    examAttemptId: data.exam_attempt_id,
  };
}

// 재학습 진입점 위젯용 — 오답 / 즐겨찾기 / 메모 카운트.
// 학생은 한 학기 누적이라도 수천 건 단위 — 정확 count(*) HEAD 요청으로 가볍게.
export interface StudyAidCounts {
  wrongMcq: number; // 최근 시도가 오답인 객관식 문제
  wrongOx: number; // 최근 시도가 오답인 OX 지문
  bookmarks: number;
  memos: number;
  highlights: number;
  comments: number;
}

// since 가 주어지면 그 시각 이후 작성된 학습보조만 집계 — feat-3-209 v2.
// 오답 카운트는 listWrongAttempts/listOxWrongAttempts 가 "가장 최근 시도가 오답" 룰이라
// 기간 인자 호환이 모호 — since 적용은 annotation 류(bookmarks/memos/highlights/comments) 에만.
export async function getStudyAidCounts(
  client: SupabaseClient<Database>,
  userId: string,
  since: Date | null = null,
): Promise<StudyAidCounts> {
  const sinceIso = since?.toISOString();
  const applySince = <
    Q extends {
      gte: (col: string, v: string) => Q;
    },
  >(
    q: Q,
    col: string,
  ): Q => (sinceIso ? q.gte(col, sinceIso) : q);

  const [wrongs, oxWrongs, bookmarkRes, memoRes, highlightRes, commentRes] =
    await Promise.all([
      // 객관식 오답 카운트 — 최근 시도 기준 정확 카운트는 expensive 라서
      // 정확한 listWrongAttempts 를 한 번 돌려 길이를 본다 (실제 위젯 표시용).
      listWrongAttempts(client, userId),
      listOxWrongAttempts(client, userId),
      applySince(
        client
          .from("user_bookmarks")
          .select("bookmark_id", { count: "exact", head: true })
          .eq("user_id", userId)
          .is("deleted_at", null)
          .gt("star_level", 0),
        "updated_at",
      ),
      applySince(
        client
          .from("user_memos")
          .select("memo_id", { count: "exact", head: true })
          .eq("user_id", userId)
          .is("deleted_at", null),
        "updated_at",
      ),
      applySince(
        client
          .from("user_highlights")
          .select("highlight_id", { count: "exact", head: true })
          .eq("user_id", userId)
          .is("deleted_at", null),
        "created_at",
      ),
      applySince(
        client
          .from("content_comments")
          .select("comment_id", { count: "exact", head: true })
          .eq("author_id", userId)
          .is("deleted_at", null),
        "updated_at",
      ),
    ]);
  return {
    wrongMcq: wrongs.length,
    wrongOx: oxWrongs.length,
    bookmarks: bookmarkRes.count ?? 0,
    memos: memoRes.count ?? 0,
    highlights: highlightRes.count ?? 0,
    comments: commentRes.count ?? 0,
  };
}

// ──────── 주관식 3단계 훈련 기록 (feat-2-032 개편 2026-08-18) ────────
// 2차는 오프라인 지필 시험이라 온라인 완성 답안 작성은 효용이 낮다 —
// ① 논점 추출 ② 목차 구성 ③ 사안의 포섭·결론 3단계로 나눠 기록한다.
// 3단계는 AI 채점 3축(issue/structure/writing)과 1:1 대응.
export interface SubjectiveAttempt {
  attemptId: string;
  // 3단계 훈련 본문.
  issuesMd: string;
  outlineMd: string;
  analysisMd: string;
  updatedAt: string;
  // ※ answer_md·self_score·submitted_at·rubric_self_check·review_* 컬럼은 DB 에 남아 있지만
  //   (학습 데이터 무삭제 원칙) 자기채점·첨삭 폐지로 읽지 않는다 — 타입에서도 뺀다.
  // AI 채점 초안 (feat-2-032 S3) — 폐지된 자기채점·첨삭을 대신하는 유일한 점수 신호.
  aiOverallScore: number | null;
  // 축별 null = 해당 단계 미작성(채점 제외). 종합은 작성한 축만으로 재정규화된 값.
  aiAxisScores: {
    issue: number | null;
    structure: number | null;
    writing: number | null;
  } | null;
  aiFeedbackMd: string | null;
  aiGradedAt: string | null;
  // 시험 모드 응시 기록 (feat-2-033). NULL=학습 모드 제출.
  timedLimitMin: number | null;
  timedElapsedSec: number | null;
}

const ATTEMPT_COLUMNS =
  "attempt_id, user_id, problem_id, issues_md, outline_md, analysis_md, updated_at, ai_overall_score, ai_axis_scores, ai_feedback_md, ai_graded_at, timed_limit_min, timed_elapsed_sec";

function rowToAttempt(row: {
  attempt_id: string;
  issues_md?: string | null;
  outline_md?: string | null;
  analysis_md?: string | null;
  updated_at: string;
  ai_overall_score?: number | null;
  ai_axis_scores?: unknown;
  ai_feedback_md?: string | null;
  ai_graded_at?: string | null;
  timed_limit_min?: number | null;
  timed_elapsed_sec?: number | null;
}): SubjectiveAttempt {
  const ax = row.ai_axis_scores;
  // 미작성 축은 null 로 저장된다 — 0 으로 뭉개면 '0점'과 '채점 제외'가 구분되지 않는다.
  const axisValue = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const aiAxisScores =
    ax && typeof ax === "object" && "issue" in ax
      ? {
          issue: axisValue((ax as Record<string, unknown>).issue),
          structure: axisValue((ax as Record<string, unknown>).structure),
          writing: axisValue((ax as Record<string, unknown>).writing),
        }
      : null;
  return {
    attemptId: row.attempt_id,
    issuesMd: row.issues_md ?? "",
    outlineMd: row.outline_md ?? "",
    analysisMd: row.analysis_md ?? "",
    updatedAt: row.updated_at,
    aiOverallScore: row.ai_overall_score ?? null,
    aiAxisScores,
    aiFeedbackMd: row.ai_feedback_md ?? null,
    aiGradedAt: row.ai_graded_at ?? null,
    timedLimitMin: row.timed_limit_min ?? null,
    timedElapsedSec: row.timed_elapsed_sec ?? null,
  };
}

export async function getSubjectiveAttempt(
  client: SupabaseClient<Database>,
  userId: string,
  problemId: string,
): Promise<SubjectiveAttempt | null> {
  const { data, error } = await client
    .from("user_subjective_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("user_id", userId)
    .eq("problem_id", problemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToAttempt(data);
}

export async function upsertSubjectiveAttempt(
  client: SupabaseClient<Database>,
  userId: string,
  problemId: string,
  input: {
    // 3단계 본문 — 매 저장마다 전량 전송(부분 저장 없음).
    issuesMd: string;
    outlineMd: string;
    analysisMd: string;
    // 시험 모드 종료(조기 제출·시간 만료) 시에만 전달 — 미전달 시 기존 기록 보존.
    timed?: { limitMin: number; elapsedSec: number };
  },
): Promise<SubjectiveAttempt> {
  // answer_md(완성 답안)는 더 쓰지 않는다 — NOT NULL 이지만 DB default '' 가 받는다.
  const row: Database["public"]["Tables"]["user_subjective_attempts"]["Insert"] =
    {
      user_id: userId,
      problem_id: problemId,
      issues_md: input.issuesMd,
      outline_md: input.outlineMd,
      analysis_md: input.analysisMd,
      ...(input.timed
        ? {
            timed_limit_min: input.timed.limitMin,
            timed_elapsed_sec: input.timed.elapsedSec,
          }
        : {}),
    };
  // 작성 취소로 soft delete 된 row 위에 다시 쓰면 자동 복구(취소 시 상태 필드는 초기화됨).
  row.deleted_at = null;
  const { data, error } = await client
    .from("user_subjective_attempts")
    .upsert(row, {
      onConflict: "user_id,problem_id",
    })
    .select(ATTEMPT_COLUMNS)
    .single();
  if (error) throw error;
  return rowToAttempt(data);
}

// 답안 작성 취소 — 본인 답안을 soft delete 하고 상태 필드를 초기화해 '미작성'으로 되돌린다.
export async function cancelSubjectiveAttempt(
  client: SupabaseClient<Database>,
  userId: string,
  problemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await getSubjectiveAttempt(client, userId, problemId);
  if (!existing) return { ok: false, error: "취소할 기록이 없습니다." };
  const { error } = await client
    .from("user_subjective_attempts")
    .update({
      deleted_at: new Date().toISOString(),
      issues_md: "",
      outline_md: "",
      analysis_md: "",
      ai_overall_score: null,
      ai_axis_scores: null,
      ai_feedback_md: null,
      ai_graded_at: null,
      timed_limit_min: null,
      timed_elapsed_sec: null,
    })
    .eq("user_id", userId)
    .eq("problem_id", problemId);
  if (error) throw error;
  return { ok: true };
}

// 한 세션 안에서 사용자가 이미 응답한 attempts — problemId → 최신 응답 1건 매핑.
// 시험지(sheet) view 가 새로고침되어도 이전 응답을 복원하기 위해 사용.
export interface SessionAttemptEntry {
  selectedChoiceId: string | null;
  selectedChoiceIndex: number | null;
  isCorrect: boolean;
  timeSpentMs: number | null;
  attemptedAt: string;
}

export async function getSessionAttemptsMap(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
): Promise<Map<string, SessionAttemptEntry>> {
  const map = new Map<string, SessionAttemptEntry>();
  const { data, error } = await client
    .from("user_problem_attempts")
    .select(
      "problem_id, selected_choice_id, selected_choice_index, is_correct, time_spent_ms, attempted_at",
    )
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("attempted_at", { ascending: false });
  if (error) throw error;
  for (const r of data ?? []) {
    if (map.has(r.problem_id)) continue;
    map.set(r.problem_id, {
      selectedChoiceId: r.selected_choice_id,
      selectedChoiceIndex: r.selected_choice_index,
      isCorrect: r.is_correct,
      timeSpentMs: r.time_spent_ms,
      attemptedAt: r.attempted_at,
    });
  }
  return map;
}

// feat §A — "다시 볼 문제" 플래그 set. 재진입 시 sheet 복구용.
export async function getSessionFlagSet(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("user_quiz_flags")
    .select("problem_id")
    .eq("user_id", userId)
    .eq("session_id", sessionId);
  if (error) throw error;
  return (data ?? []).map((r) => r.problem_id);
}

// feat §B1 — 오답들의 근거 재료 bulk 추출.
//   우선순위: AI source_chunk_ids → 사용자가 선택한 오답 choice 의 related_article/case →
//   박스형 box_items 의 related_article/case → primary_article_id → explanation_md.
//
// 한 화면에서 한 번 호출 — bulk SELECT 로 RTT 1~3단 만에 채움.

export interface EvidenceArticleRef {
  articleId: string;
  displayLabel: string;
  pathSlug: string;
  lawCode: string;
  via: string;
}
export interface EvidenceCaseRef {
  caseId: string;
  caseNumber: string;
  caseTitle: string | null;
  lawCode: string;
  via: string;
}
export interface EvidenceAiChunk {
  chunkId: string;
  sourceType: string;
  headingPath: string | null;
  bodyPreview: string;
}
export interface WrongEvidence {
  problemId: string;
  articles: EvidenceArticleRef[];
  cases: EvidenceCaseRef[];
  aiChunks: EvidenceAiChunk[];
  explanationMd: string | null;
}

export async function getEvidenceForWrongProblems(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  wrongProblemIds: string[],
): Promise<Record<string, WrongEvidence>> {
  const out: Record<string, WrongEvidence> = {};
  if (wrongProblemIds.length === 0) return out;

  // 1) problems — primary_article_id, source_chunk_ids, explanation_md.
  const { data: probs, error: pErr } = await client
    .from("problems")
    .select("problem_id, primary_article_id, source_chunk_ids, explanation_md")
    .in("problem_id", wrongProblemIds);
  if (pErr) throw pErr;

  // 2) 사용자가 선택한 choice — selectedChoiceIndex 기준으로 그 choice 의 related_*.
  //    user_problem_attempts 에서 selected_choice_id 가져옴.
  const { data: attemptRows } = await client
    .from("user_problem_attempts")
    .select("problem_id, selected_choice_id, attempted_at")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .in("problem_id", wrongProblemIds)
    .order("attempted_at", { ascending: false });
  // 동일 problem 의 최신 attempt 만.
  const selectedChoiceByProblem = new Map<string, string | null>();
  for (const r of attemptRows ?? []) {
    if (!selectedChoiceByProblem.has(r.problem_id)) {
      selectedChoiceByProblem.set(r.problem_id, r.selected_choice_id);
    }
  }
  const selectedChoiceIds = [...selectedChoiceByProblem.values()].filter(
    (v): v is string => !!v,
  );
  const { data: selectedChoices } = selectedChoiceIds.length
    ? await client
        .from("problem_choices")
        .select(
          "choice_id, problem_id, related_article_id, related_case_id, related_article_number, related_case_number",
        )
        .in("choice_id", selectedChoiceIds)
    : { data: [] };

  // 3) box_items — mc_box 인 경우 모든 보기의 related_*. 사용자 선택 보기 추적은 단순화.
  const { data: boxItems } = await client
    .from("problem_box_items")
    .select(
      "box_item_id, problem_id, marker, related_article_id, related_case_id, ox_truth",
    )
    .in("problem_id", wrongProblemIds);

  // 4) 모은 article_ids / case_ids 일괄 메타 조회.
  const articleIds = new Set<string>();
  const caseIds = new Set<string>();
  const chunkIds = new Set<string>();
  for (const p of probs ?? []) {
    if (p.primary_article_id) articleIds.add(p.primary_article_id);
    if (Array.isArray(p.source_chunk_ids)) {
      for (const cid of p.source_chunk_ids as string[]) chunkIds.add(cid);
    }
  }
  for (const c of selectedChoices ?? []) {
    if (c.related_article_id) articleIds.add(c.related_article_id);
    if (c.related_case_id) caseIds.add(c.related_case_id);
  }
  for (const b of boxItems ?? []) {
    if (b.related_article_id) articleIds.add(b.related_article_id);
    if (b.related_case_id) caseIds.add(b.related_case_id);
  }

  const articlesByIdPromise = articleIds.size
    ? client
        .from("articles")
        .select("article_id, display_label, article_number, laws(law_code)")
        .in("article_id", [...articleIds])
    : Promise.resolve({ data: [] });
  const casesByIdPromise = caseIds.size
    ? client
        .from("cases")
        .select(
          "case_id, case_number, case_title, primary_article_id, articles!primary_article_id(laws(law_code))",
        )
        .in("case_id", [...caseIds])
    : Promise.resolve({ data: [] });
  const chunksByIdPromise = chunkIds.size
    ? client
        .from("content_chunks")
        .select("chunk_id, source_type, heading_path, body_text")
        .in("chunk_id", [...chunkIds])
    : Promise.resolve({ data: [] });
  const [articlesRes, casesRes, chunksRes] = await Promise.all([
    articlesByIdPromise,
    casesByIdPromise,
    chunksByIdPromise,
  ]);
  const articleMap = new Map<
    string,
    { displayLabel: string; pathSlug: string; lawCode: string }
  >();
  for (const a of articlesRes.data ?? []) {
    if (!a.laws?.law_code || !a.article_number) continue;
    articleMap.set(a.article_id, {
      displayLabel: a.display_label ?? a.article_number,
      pathSlug: articleSlug(a.article_number),
      lawCode: a.laws.law_code,
    });
  }
  const caseMap = new Map<
    string,
    { caseNumber: string; caseTitle: string | null; lawCode: string }
  >();
  for (const c of casesRes.data ?? []) {
    const lawCode = c.articles?.laws?.law_code ?? null;
    if (!lawCode) continue;
    caseMap.set(c.case_id, {
      caseNumber: c.case_number,
      caseTitle: c.case_title,
      lawCode,
    });
  }
  const chunkMap = new Map<string, EvidenceAiChunk>();
  for (const ch of chunksRes.data ?? []) {
    chunkMap.set(ch.chunk_id, {
      chunkId: ch.chunk_id,
      sourceType: ch.source_type,
      headingPath: ch.heading_path,
      bodyPreview:
        ch.body_text.length > 240
          ? ch.body_text.slice(0, 240) + "…"
          : ch.body_text,
    });
  }

  // 5) 문제별 evidence 합산.
  const probsById = new Map((probs ?? []).map((p) => [p.problem_id, p]));
  const selectedChoiceByProb = new Map(
    (selectedChoices ?? []).map((c) => [c.problem_id, c]),
  );
  const boxByProb = new Map<string, typeof boxItems>();
  for (const b of boxItems ?? []) {
    const list = boxByProb.get(b.problem_id) ?? [];
    list.push(b);
    boxByProb.set(b.problem_id, list);
  }

  for (const pid of wrongProblemIds) {
    const articles: EvidenceArticleRef[] = [];
    const cases: EvidenceCaseRef[] = [];
    const aiChunks: EvidenceAiChunk[] = [];
    const seenA = new Set<string>();
    const seenC = new Set<string>();

    // (1) AI source chunks — 우선순위 최상.
    const probRow = probsById.get(pid);
    if (probRow && Array.isArray(probRow.source_chunk_ids)) {
      for (const cid of probRow.source_chunk_ids as string[]) {
        const ch = chunkMap.get(cid);
        if (ch) aiChunks.push(ch);
      }
    }

    // (2) 사용자가 선택한 오답 choice 의 related_*.
    const sc = selectedChoiceByProb.get(pid);
    if (sc) {
      if (sc.related_article_id) {
        const a = articleMap.get(sc.related_article_id);
        if (a && !seenA.has(sc.related_article_id)) {
          seenA.add(sc.related_article_id);
          articles.push({
            articleId: sc.related_article_id,
            displayLabel: a.displayLabel,
            pathSlug: a.pathSlug,
            lawCode: a.lawCode,
            via: "내가 고른 보기 근거",
          });
        }
      }
      if (sc.related_case_id) {
        const c = caseMap.get(sc.related_case_id);
        if (c && !seenC.has(sc.related_case_id)) {
          seenC.add(sc.related_case_id);
          cases.push({
            caseId: sc.related_case_id,
            caseNumber: c.caseNumber,
            caseTitle: c.caseTitle,
            lawCode: c.lawCode,
            via: "내가 고른 보기 근거",
          });
        }
      }
    }

    // (3) 박스 항목들 — 박스형 오답의 보기별 근거.
    const boxes = boxByProb.get(pid) ?? [];
    for (const b of boxes) {
      if (b.related_article_id) {
        const a = articleMap.get(b.related_article_id);
        if (a && !seenA.has(b.related_article_id)) {
          seenA.add(b.related_article_id);
          articles.push({
            articleId: b.related_article_id,
            displayLabel: a.displayLabel,
            pathSlug: a.pathSlug,
            lawCode: a.lawCode,
            via: `${b.marker} 보기 근거`,
          });
        }
      }
      if (b.related_case_id) {
        const c = caseMap.get(b.related_case_id);
        if (c && !seenC.has(b.related_case_id)) {
          seenC.add(b.related_case_id);
          cases.push({
            caseId: b.related_case_id,
            caseNumber: c.caseNumber,
            caseTitle: c.caseTitle,
            lawCode: c.lawCode,
            via: `${b.marker} 보기 근거`,
          });
        }
      }
    }

    // (4) primary_article_id — fallback.
    if (probRow?.primary_article_id) {
      const a = articleMap.get(probRow.primary_article_id);
      if (a && !seenA.has(probRow.primary_article_id)) {
        seenA.add(probRow.primary_article_id);
        articles.push({
          articleId: probRow.primary_article_id,
          displayLabel: a.displayLabel,
          pathSlug: a.pathSlug,
          lawCode: a.lawCode,
          via: "주요 조문",
        });
      }
    }

    out[pid] = {
      problemId: pid,
      articles,
      cases,
      aiChunks,
      explanationMd: probRow?.explanation_md ?? null,
    };
  }
  return out;
}

export interface QuizSessionResultItem {
  problemId: string;
  problemNumber: number | null;
  year: number | null;
  bodySnippet: string;
  isCorrect: boolean | null; // null = 미응답
  selectedChoiceIndex: number | null;
  timeSpentMs: number | null;
  primaryArticleLabel: string | null;
}

export interface QuizSessionResult {
  session: QuizSession;
  items: QuizSessionResultItem[];
  attemptedCount: number;
  correctCount: number;
  totalTimeMs: number;
}

export async function getQuizSessionResult(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
): Promise<QuizSessionResult | null> {
  const session = await getQuizSession(client, userId, sessionId);
  if (!session) return null;

  // 세션 안의 모든 attempt — 동일 problem 다수 시도 시 최신 한 건만 사용.
  const { data: attemptRows, error: aErr } = await client
    .from("user_problem_attempts")
    .select(
      "problem_id, selected_choice_index, is_correct, time_spent_ms, attempted_at",
    )
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("attempted_at", { ascending: false });
  if (aErr) throw aErr;
  const latestByProblem = new Map<
    string,
    {
      isCorrect: boolean;
      selectedChoiceIndex: number | null;
      timeSpentMs: number | null;
    }
  >();
  for (const r of attemptRows ?? []) {
    if (!latestByProblem.has(r.problem_id)) {
      latestByProblem.set(r.problem_id, {
        isCorrect: r.is_correct,
        selectedChoiceIndex: r.selected_choice_index,
        timeSpentMs: r.time_spent_ms,
      });
    }
  }

  const { data: problemRows, error: pErr } = await client
    .from("problems")
    .select(
      "problem_id, problem_number, year, body_md, articles!primary_article_id(display_label)",
    )
    .in("problem_id", session.problemIds);
  if (pErr) throw pErr;
  const problemById = new Map(
    (problemRows ?? []).map((p) => [p.problem_id, p] as const),
  );

  let attemptedCount = 0;
  let correctCount = 0;
  let totalTimeMs = 0;
  const items: QuizSessionResultItem[] = session.problemIds.map((pid) => {
    const p = problemById.get(pid);
    const att = latestByProblem.get(pid);
    if (att) {
      attemptedCount += 1;
      if (att.isCorrect) correctCount += 1;
      if (att.timeSpentMs) totalTimeMs += att.timeSpentMs;
    }
    const body = p?.body_md ?? "";
    return {
      problemId: pid,
      problemNumber: p?.problem_number ?? null,
      year: p?.year ?? null,
      bodySnippet: body.length > 100 ? `${body.slice(0, 100)}…` : body,
      isCorrect: att ? att.isCorrect : null,
      selectedChoiceIndex: att?.selectedChoiceIndex ?? null,
      timeSpentMs: att?.timeSpentMs ?? null,
      primaryArticleLabel: p?.articles?.display_label ?? null,
    };
  });

  return {
    session,
    items,
    attemptedCount,
    correctCount,
    totalTimeMs,
  };
}

export type { DifficultyBucket, ProblemAggregateStats } from "./lib/difficulty";

export async function getProblemStatsBulk(
  client: SupabaseClient<Database>,
  problemIds: string[],
): Promise<Map<string, ProblemAggregateStats>> {
  const out = new Map<string, ProblemAggregateStats>();
  if (problemIds.length === 0) return out;
  const unique = Array.from(new Set(problemIds));
  // PostgREST RPC URL 길이 제한 회피 — 청크.
  const CHUNK = 200;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const { data, error } = await client.rpc("get_problem_stats", {
      p_ids: slice,
    });
    if (error) throw error;
    for (const r of data ?? []) {
      const accuracyPct =
        r.attempts > 0
          ? Math.round((r.correct_attempts / r.attempts) * 100)
          : null;
      out.set(r.problem_id, {
        attempts: r.attempts,
        correctAttempts: r.correct_attempts,
        distinctUsers: r.distinct_users,
        accuracyPct,
        bucket:
          r.attempts >= MIN_ATTEMPTS_FOR_DIFFICULTY && accuracyPct !== null
            ? bucketDifficulty(accuracyPct)
            : null,
      });
    }
  }
  return out;
}

export async function getProblemStats(
  client: SupabaseClient<Database>,
  problemId: string,
): Promise<ProblemAggregateStats> {
  const map = await getProblemStatsBulk(client, [problemId]);
  return map.get(problemId) ?? emptyProblemAggregate();
}

// ---- 미열람 권장 조문 (subject hub Articles 탭) ----
// 사용자가 아직 study_sessions 으로 방문하지 않은 article 중 importance 높은 순.

export interface RecommendedArticleItem {
  articleId: string;
  pathSlug: string;
  displayLabel: string;
  importance: number;
}

export async function getRecommendedArticles(
  client: SupabaseClient<Database>,
  userId: string,
  lawCode: LawSubjectSlug,
  limit = 6,
): Promise<RecommendedArticleItem[]> {
  // 1. 본인이 본 article 모음.
  const { data: sessRows } = await client
    .from("study_sessions")
    .select("scope")
    .eq("user_id", userId)
    .limit(5000);
  const visited = new Set<string>();
  for (const r of sessRows ?? []) {
    const scope = r.scope as Partial<StudyScope> | null;
    if (
      scope?.subject === lawCode &&
      scope.target_type === "article" &&
      scope.target_id
    ) {
      visited.add(scope.target_id);
    }
  }

  // 2. importance 높은 순으로 articles fetch — visited 제외.
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) return [];

  // limit 보다 많이 가져와서 클라에서 visited 제외 후 잘라야.
  const { data: rows } = await client
    .from("articles")
    .select("article_id, article_number, display_label, importance")
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .order("importance", { ascending: false, nullsFirst: false })
    .order("path", { ascending: true })
    .limit(limit + visited.size + 20);
  const out: RecommendedArticleItem[] = [];
  for (const r of rows ?? []) {
    if (visited.has(r.article_id)) continue;
    if (!r.article_number) continue;
    out.push({
      articleId: r.article_id,
      pathSlug: articleSlug(r.article_number),
      displayLabel: r.display_label,
      importance: r.importance ?? 0,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ---- 최근 학습 피드 (대시보드) ----
// study_sessions 시간순. article/case/problem 라벨 lookup.

export type ActivityType = "article" | "case" | "problem";

export interface RecentActivityItem {
  type: ActivityType;
  targetId: string;
  startedAt: string;
  subject: LawSubjectSlug | null;
  // 표시 라벨 (조문 표기 / 사건번호+제목 / 연도+문항 또는 본문 단편).
  label: string;
  // 클릭 이동 href.
  href: string;
}

export async function getRecentActivity(
  client: SupabaseClient<Database>,
  userId: string,
  limit = 12,
): Promise<RecentActivityItem[]> {
  // 1. 최근 study_sessions (target_id 가 있는 것만).
  const { data: sessRows, error } = await client
    .from("study_sessions")
    .select("scope, started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  // dedup: 같은 (type+id) 중 최근 1개만.
  const seen = new Set<string>();
  type Pending = {
    type: ActivityType;
    targetId: string;
    startedAt: string;
    subject: LawSubjectSlug | null;
  };
  const pending: Pending[] = [];
  for (const r of sessRows ?? []) {
    const scope = r.scope as Partial<StudyScope> | null;
    if (!scope?.target_id || !scope.target_type) continue;
    if (
      scope.target_type !== "article" &&
      scope.target_type !== "case" &&
      scope.target_type !== "problem"
    )
      continue;
    const key = `${scope.target_type}:${scope.target_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pending.push({
      type: scope.target_type as ActivityType,
      targetId: scope.target_id,
      startedAt: r.started_at,
      subject: (scope.subject as LawSubjectSlug | undefined) ?? null,
    });
    if (pending.length >= limit) break;
  }
  if (pending.length === 0) return [];

  // 2. 라벨 lookup — type 별 bulk.
  const articleIds = pending
    .filter((p) => p.type === "article")
    .map((p) => p.targetId);
  const caseIds = pending
    .filter((p) => p.type === "case")
    .map((p) => p.targetId);
  const problemIds = pending
    .filter((p) => p.type === "problem")
    .map((p) => p.targetId);

  const articleMap = new Map<
    string,
    { displayLabel: string; lawCode: string; pathSlug: string }
  >();
  if (articleIds.length > 0) {
    const { data: rows } = await client
      .from("articles")
      .select("article_id, article_number, display_label, laws!inner(law_code)")
      .in("article_id", articleIds);
    for (const r of rows ?? []) {
      if (!r.article_number) continue;
      articleMap.set(r.article_id, {
        displayLabel: r.display_label,
        lawCode: r.laws.law_code,
        pathSlug: articleSlug(r.article_number),
      });
    }
  }

  const caseMap = new Map<
    string,
    { caseNumber: string; caseTitle: string; lawCode: string }
  >();
  if (caseIds.length > 0) {
    const { data: rows } = await client
      .from("cases")
      .select("case_id, case_number, case_title, subject_laws")
      .in("case_id", caseIds);
    for (const r of rows ?? []) {
      caseMap.set(r.case_id, {
        caseNumber: r.case_number,
        caseTitle: r.case_title,
        lawCode: (r.subject_laws as string[] | null)?.[0] ?? "patent",
      });
    }
  }

  const problemMap = new Map<
    string,
    {
      snippet: string;
      year: number | null;
      problemNumber: number | null;
      lawCode: string;
    }
  >();
  if (problemIds.length > 0) {
    const { data: rows } = await client
      .from("problems")
      .select("problem_id, body_md, year, problem_number, laws!inner(law_code)")
      .in("problem_id", problemIds);
    for (const r of rows ?? []) {
      const body = r.body_md ?? "";
      problemMap.set(r.problem_id, {
        snippet: body.length > 60 ? `${body.slice(0, 60)}…` : body,
        year: r.year,
        problemNumber: r.problem_number,
        lawCode: r.laws.law_code,
      });
    }
  }

  return pending.flatMap((p): RecentActivityItem[] => {
    if (p.type === "article") {
      const a = articleMap.get(p.targetId);
      if (!a) return [];
      return [
        {
          type: "article",
          targetId: p.targetId,
          startedAt: p.startedAt,
          subject: (a.lawCode as LawSubjectSlug) ?? p.subject,
          label: a.displayLabel,
          href: `/subjects/${a.lawCode}/articles/${a.pathSlug}`,
        },
      ];
    }
    if (p.type === "case") {
      const c = caseMap.get(p.targetId);
      if (!c) return [];
      return [
        {
          type: "case",
          targetId: p.targetId,
          startedAt: p.startedAt,
          subject: (c.lawCode as LawSubjectSlug) ?? p.subject,
          label: `${c.caseNumber} · ${c.caseTitle}`,
          href: `/subjects/${c.lawCode}/cases/${p.targetId}`,
        },
      ];
    }
    const pr = problemMap.get(p.targetId);
    if (!pr) return [];
    const yearLabel = pr.year
      ? `${pr.year}년${pr.problemNumber ? ` · ${pr.problemNumber}번` : ""} — `
      : "";
    return [
      {
        type: "problem",
        targetId: p.targetId,
        startedAt: p.startedAt,
        subject: (pr.lawCode as LawSubjectSlug) ?? p.subject,
        label: `${yearLabel}${pr.snippet}`,
        href: `/subjects/${pr.lawCode}/problems/${p.targetId}`,
      },
    ];
  });
}

// ---- 전체 학습 진척도 (대시보드 도넛) ----
// 모든 과목 합산: 조문(study_sessions article 방문) · 판례(study_sessions case 방문) · 문제(시도한 distinct).

export interface OverallProgress {
  articles: { visited: number; total: number; pct: number };
  cases: { visited: number; total: number; pct: number };
  problems: { attempted: number; total: number; pct: number };
}

export async function getOverallProgress(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<OverallProgress> {
  // 총 조문/판례/문제 수.
  const [
    { count: totalArticles },
    { count: totalCases },
    { count: totalProblems },
  ] = await Promise.all([
    client
      .from("articles")
      .select("article_id", { head: true, count: "exact" })
      .eq("level", "article"),
    client
      .from("cases")
      .select("case_id", { head: true, count: "exact" })
      .is("deleted_at", null),
    client
      .from("problems")
      .select("problem_id", { head: true, count: "exact" })
      .is("deleted_at", null),
  ]);

  // 본인 study_sessions — article/case 방문 distinct.
  const { data: sessRows } = await client
    .from("study_sessions")
    .select("scope")
    .eq("user_id", userId)
    .limit(5000);
  const visitedArticles = new Set<string>();
  const visitedCases = new Set<string>();
  for (const r of sessRows ?? []) {
    const scope = r.scope as Partial<StudyScope> | null;
    if (!scope?.target_id) continue;
    if (scope.target_type === "article") visitedArticles.add(scope.target_id);
    else if (scope.target_type === "case") visitedCases.add(scope.target_id);
  }

  // 본인 attempt distinct.
  const { data: attRows } = await client
    .from("user_problem_attempts")
    .select("problem_id")
    .eq("user_id", userId)
    .limit(10000);
  const attempted = new Set<string>();
  for (const r of attRows ?? []) attempted.add(r.problem_id);

  const pctOf = (cur: number, total: number) =>
    total > 0 ? Math.round((cur / total) * 100) : 0;
  return {
    articles: {
      visited: visitedArticles.size,
      total: totalArticles ?? 0,
      pct: pctOf(visitedArticles.size, totalArticles ?? 0),
    },
    cases: {
      visited: visitedCases.size,
      total: totalCases ?? 0,
      pct: pctOf(visitedCases.size, totalCases ?? 0),
    },
    problems: {
      attempted: attempted.size,
      total: totalProblems ?? 0,
      pct: pctOf(attempted.size, totalProblems ?? 0),
    },
  };
}

// ---- 일별 학습 통계 (히트맵·주간 그래프) ----

export interface DailyStudyDay {
  // YYYY-MM-DD (로컬 KST 기준).
  date: string;
  attemptCount: number;
  correctCount: number;
  timeMs: number;
}

export interface DailyStudyStats {
  // 가장 오래된 날짜부터 오늘까지 daysBack 일치 (활동 없는 날은 0).
  days: DailyStudyDay[];
  totalActiveDays: number;
  avgHoursPerActiveDay: number;
  // 오늘 또는 어제부터 연속으로 활동한 일수.
  currentStreak: number;
}

function ymdKst(d: Date): string {
  // KST = UTC+9. supabase 는 UTC timestamptz 로 저장 → 변환.
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// custom 기간(from~to) 지원 옵션 — feat-3-209 v3.
//   - daysBack 모드: 오늘 기준 N일 (기본 84) — preset all/today/7d/30d
//   - since/until 모드: 명시적 KST 범위 — custom 적용 시
// since/until 이 주어지면 daysBack 무시. axis 는 since~until 의 KST 일별로 채움.
export async function getDailyStudyStats(
  client: SupabaseClient<Database>,
  userId: string,
  opts: { daysBack?: number; since?: Date | null; until?: Date | null } = {},
): Promise<DailyStudyStats> {
  const daysBack = opts.daysBack ?? 84;
  let rangeStart: Date;
  let rangeEnd: Date;
  if (opts.since || opts.until) {
    rangeStart = opts.since ?? new Date(0);
    rangeEnd = opts.until ?? new Date();
  } else {
    rangeStart = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    rangeEnd = new Date();
  }

  let q = client
    .from("user_problem_attempts")
    .select("attempted_at, is_correct, time_spent_ms")
    .eq("user_id", userId)
    .gte("attempted_at", rangeStart.toISOString())
    .order("attempted_at", { ascending: true })
    .limit(10000);
  if (opts.until)
    q = q.lt(
      "attempted_at",
      new Date(rangeEnd.getTime() + 86400000).toISOString(),
    );
  const { data: rows, error } = await q;
  if (error) throw error;

  const byDate = new Map<string, DailyStudyDay>();
  for (const r of rows ?? []) {
    const d = ymdKst(new Date(r.attempted_at));
    const cur = byDate.get(d) ?? {
      date: d,
      attemptCount: 0,
      correctCount: 0,
      timeMs: 0,
    };
    cur.attemptCount += 1;
    if (r.is_correct) cur.correctCount += 1;
    if (r.time_spent_ms) cur.timeMs += r.time_spent_ms;
    byDate.set(d, cur);
  }

  // since~until 범위의 KST 일자별로 빈 날 채움.
  const days: DailyStudyDay[] = [];
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  // 일자 step 으로 iter — KST 자정 기준 grid 가 자연스러움.
  for (let t = startMs; t <= endMs + 86400000 - 1; t += 86400000) {
    const ymd = ymdKst(new Date(t));
    if (days.length > 0 && days[days.length - 1].date === ymd) continue;
    days.push(
      byDate.get(ymd) ?? {
        date: ymd,
        attemptCount: 0,
        correctCount: 0,
        timeMs: 0,
      },
    );
    // 너무 긴 custom 범위 (1년+) 보호 — 최대 366일 grid.
    if (days.length >= 366) break;
  }

  const activeDays = days.filter((d) => d.attemptCount > 0);
  const totalActiveDays = activeDays.length;
  const avgHoursPerActiveDay =
    totalActiveDays > 0
      ? activeDays.reduce((s, d) => s + d.timeMs, 0) /
        totalActiveDays /
        (60 * 60 * 1000)
      : 0;

  // 오늘(혹은 axis 의 마지막) 부터 거꾸로 연속 활동 카운트.
  let currentStreak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i].attemptCount > 0) currentStreak += 1;
    else if (i === days.length - 1) continue;
    else break;
  }

  return { days, totalActiveDays, avgHoursPerActiveDay, currentStreak };
}

// 대시보드 상단 3종 KPI — 모든 과목 합산.
export interface DashboardKpis {
  // 누적 풀이 시간 (ms). user_problem_attempts.time_spent_ms 합.
  totalProblemTimeMs: number;
  // 시도한 distinct 문제 수 (모든 과목 합).
  totalProblemsAttempted: number;
  // 모든 시도 중 정답률 % (정수). 시도 0 이면 0.
  overallAccuracyPct: number;
  // 최근 7일 KPI (델타 계산용).
  last7d: {
    totalProblemTimeMs: number;
    totalProblemsAttempted: number;
  };
}

// since 가 주어지면 그 시각 이후 시도만 집계 — feat-3-209 v2(stats 기간 적용).
// last7d 통계는 항상 최근 7일 기준 — since 와 별개 (대시보드 표시용 보조 데이터).
export async function getDashboardKpis(
  client: SupabaseClient<Database>,
  userId: string,
  since: Date | null = null,
): Promise<DashboardKpis> {
  let q = client
    .from("user_problem_attempts")
    .select("problem_id, is_correct, time_spent_ms, attempted_at")
    .eq("user_id", userId)
    .order("attempted_at", { ascending: false })
    .limit(5000);
  if (since) q = q.gte("attempted_at", since.toISOString());
  const { data: rows, error } = await q;
  if (error) throw error;
  const list = rows ?? [];

  const distinct = new Set<string>();
  let correct = 0;
  let timeMs = 0;
  const distinct7d = new Set<string>();
  let timeMs7d = 0;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const r of list) {
    distinct.add(r.problem_id);
    if (r.is_correct) correct += 1;
    if (r.time_spent_ms) timeMs += r.time_spent_ms;
    const t = new Date(r.attempted_at).getTime();
    if (t >= sevenDaysAgo) {
      distinct7d.add(r.problem_id);
      if (r.time_spent_ms) timeMs7d += r.time_spent_ms;
    }
  }

  return {
    totalProblemTimeMs: timeMs,
    totalProblemsAttempted: distinct.size,
    overallAccuracyPct:
      list.length > 0 ? Math.round((correct / list.length) * 100) : 0,
    last7d: {
      totalProblemTimeMs: timeMs7d,
      totalProblemsAttempted: distinct7d.size,
    },
  };
}

export interface SubjectProgressRow {
  lawCode: LawSubjectSlug;
  name: string;
  pctViewed: number;
  visitedCount: number;
  totalArticleCount: number;
  problemsAttempted: number;
  accuracyPct: number | null;
}

// 5과목 진도 한 번에. UI 가 카드 5개 동시에 그릴 때 사용.
export async function getAllSubjectsProgress(
  client: SupabaseClient<Database>,
  userId: string,
  lawCodes: ReadonlyArray<{ slug: LawSubjectSlug; name: string }>,
): Promise<SubjectProgressRow[]> {
  // 각 law 의 article 총수 한 번에.
  const slugs = lawCodes.map((s) => s.slug) as string[];
  const { data: lawRows } = await client
    .from("laws")
    .select("law_id, law_code")
    .in("law_code", slugs);
  const lawByCode = new Map((lawRows ?? []).map((l) => [l.law_code, l.law_id]));

  // article 총수 — laws.law_id 별 count.
  const totals = new Map<string, number>();
  await Promise.all(
    Array.from(lawByCode.entries()).map(async ([code, lid]) => {
      const { count } = await client
        .from("articles")
        .select("article_id", { head: true, count: "exact" })
        .eq("law_id", lid)
        .eq("level", "article");
      totals.set(code, count ?? 0);
    }),
  );

  // 본 article (study_sessions). 한 번에 가져와 과목별 분류.
  const { data: sessRows } = await client
    .from("study_sessions")
    .select("scope, started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(2000);
  const visitedBySubject = new Map<string, Set<string>>();
  for (const r of sessRows ?? []) {
    const scope = r.scope as Partial<StudyScope> | null;
    if (!scope?.subject || scope.target_type !== "article" || !scope.target_id)
      continue;
    if (!visitedBySubject.has(scope.subject))
      visitedBySubject.set(scope.subject, new Set());
    visitedBySubject.get(scope.subject)!.add(scope.target_id);
  }

  // 문제 시도 — law_id 조인.
  const { data: attRows } = await client
    .from("user_problem_attempts")
    .select("problem_id, is_correct, problems!inner(law_id)")
    .eq("user_id", userId)
    .limit(5000);
  const distinctByLaw = new Map<string, Set<string>>();
  const correctByLaw = new Map<string, { correct: number; total: number }>();
  for (const r of attRows ?? []) {
    const lid = r.problems.law_id;
    if (!lid) continue;
    if (!distinctByLaw.has(lid)) distinctByLaw.set(lid, new Set());
    distinctByLaw.get(lid)!.add(r.problem_id);
    const cur = correctByLaw.get(lid) ?? { correct: 0, total: 0 };
    cur.total += 1;
    if (r.is_correct) cur.correct += 1;
    correctByLaw.set(lid, cur);
  }

  return lawCodes.map(({ slug, name }) => {
    const lid = lawByCode.get(slug);
    const total = totals.get(slug) ?? 0;
    const visited = visitedBySubject.get(slug)?.size ?? 0;
    const distinctAttempted = lid ? (distinctByLaw.get(lid)?.size ?? 0) : 0;
    const acc = lid ? correctByLaw.get(lid) : null;
    return {
      lawCode: slug,
      name,
      pctViewed: total > 0 ? Math.round((visited / total) * 100) : 0,
      visitedCount: visited,
      totalArticleCount: total,
      problemsAttempted: distinctAttempted,
      accuracyPct:
        acc && acc.total > 0
          ? Math.round((acc.correct / acc.total) * 100)
          : null,
    };
  });
}

export interface UserProblemStats {
  // 시도한 distinct 문제 수.
  attemptedCount: number;
  // 한 번이라도 정답 본 문제 수.
  correctCount: number;
  // 가장 최근 시도가 오답인 문제 수 (오답노트 큐).
  wrongCount: number;
  // 전체 시도 횟수 (대수롭지 않은 보조 지표).
  totalAttempts: number;
}

// 과목 단위 문제 풀이 통계 — 1차/2차 합산. lawCode 필터로 좁힘.
export async function getUserProblemStats(
  client: SupabaseClient<Database>,
  userId: string,
  lawCode: LawSubjectSlug,
): Promise<UserProblemStats> {
  // 시도한 모든 (problem_id, attempted_at, is_correct) 가져온 뒤 클라에서 집계.
  // 과목 필터: problems.law_id 매핑.
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) {
    return {
      attemptedCount: 0,
      correctCount: 0,
      wrongCount: 0,
      totalAttempts: 0,
    };
  }
  // ★행 상한 — 시도가 많은 학생(실측 1인 최대 4,635건)은 뒤가 잘린다.
  //   정렬은 attempted_at 만으로는 유일하지 않아 페이지 경계에서 흔들린다 → attempt_id 로 고정.
  const list = await fetchAllPages(() =>
    client
      .from("user_problem_attempts")
      .select("problem_id, is_correct, attempted_at, problems!inner(law_id)")
      .eq("user_id", userId)
      .eq("problems.law_id", law.law_id)
      .order("attempted_at", { ascending: false })
      .order("attempt_id"),
  );
  const distinct = new Set<string>();
  const everCorrect = new Set<string>();
  const lastByProblem = new Map<string, boolean>();
  for (const r of list) {
    distinct.add(r.problem_id);
    if (r.is_correct) everCorrect.add(r.problem_id);
    if (!lastByProblem.has(r.problem_id)) {
      lastByProblem.set(r.problem_id, r.is_correct);
    }
  }
  let wrongCount = 0;
  for (const v of lastByProblem.values()) if (!v) wrongCount += 1;
  return {
    attemptedCount: distinct.size,
    correctCount: everCorrect.size,
    wrongCount,
    totalAttempts: list.length,
  };
}

export interface WrongAttemptItem {
  problemId: string;
  lastAttemptedAt: string;
  attempts: number;
  bodySnippet: string;
  primaryArticleLabel: string | null;
  lawCode: LawSubjectSlug;
  year: number | null;
  problemNumber: number | null;
}

// ---- 약점 지표 (대시보드 위젯) ----
// "내 오답 + 글로벌 난이도(어려움 우선)" 정렬된 top N.

export interface WeakAreaItem {
  problemId: string;
  bodySnippet: string;
  lawCode: LawSubjectSlug;
  primaryArticleLabel: string | null;
  year: number | null;
  problemNumber: number | null;
  // 내 시도 통계.
  myAttempts: number;
  myLastWrongAt: string;
  // 글로벌 통계.
  globalAccuracyPct: number | null;
  globalAttempts: number;
  bucket: import("./lib/difficulty").DifficultyBucket | null;
}

export async function getWeakAreas(
  client: SupabaseClient<Database>,
  userId: string,
  limit = 5,
  since: Date | null = null,
): Promise<WeakAreaItem[]> {
  // 1. 본인 attempts 최신 → 마지막이 오답인 problem 만 후보. since 가 주어지면
  //    그 시각 이후 시도만 — 기간 안 약점 영역만 집계.
  const wrongs = await listWrongAttempts(client, userId, undefined, since);
  if (wrongs.length === 0) return [];

  // 2. 후보 problem_id 들의 글로벌 통계.
  const aggMap = await getProblemStatsBulk(
    client,
    wrongs.map((w) => w.problemId),
  );

  // 3. 정렬: 어려운 글로벌 (낮은 정답률) 먼저, 동률이면 본인 시도 많은 순.
  const enriched: WeakAreaItem[] = wrongs.map((w) => {
    const agg = aggMap.get(w.problemId);
    return {
      problemId: w.problemId,
      bodySnippet: w.bodySnippet,
      lawCode: w.lawCode,
      primaryArticleLabel: w.primaryArticleLabel,
      year: w.year,
      problemNumber: w.problemNumber,
      myAttempts: w.attempts,
      myLastWrongAt: w.lastAttemptedAt,
      globalAccuracyPct: agg?.accuracyPct ?? null,
      globalAttempts: agg?.attempts ?? 0,
      bucket: agg?.bucket ?? null,
    };
  });
  enriched.sort((a, b) => {
    const accA = a.globalAccuracyPct ?? 100;
    const accB = b.globalAccuracyPct ?? 100;
    if (accA !== accB) return accA - accB;
    return b.myAttempts - a.myAttempts;
  });
  return enriched.slice(0, limit);
}

// 가장 최근 시도가 오답인 문제 목록 (오답노트 — 일반 객관식). lawCode 미지정 시 전체 과목.
// OX 시도는 ref(choice/box-item) 단위 채점이라 별도 listOxWrongAttempts 가 처리.
export async function listWrongAttempts(
  client: SupabaseClient<Database>,
  userId: string,
  lawCode?: LawSubjectSlug,
  since: Date | null = null,
): Promise<WrongAttemptItem[]> {
  let q = client
    .from("user_problem_attempts")
    .select(
      "problem_id, is_correct, attempted_at, problems!inner(body_md, year, problem_number, primary_article_id, law_id, articles!primary_article_id(display_label), laws!inner(law_code))",
    )
    .eq("user_id", userId)
    .is("ox_answer", null)
    .order("attempted_at", { ascending: false })
    .limit(500);
  if (since) q = q.gte("attempted_at", since.toISOString());
  const { data: rows, error } = await q;
  if (error) throw error;
  const list = rows ?? [];
  const lastByProblem = new Map<
    string,
    { row: (typeof list)[number]; attempts: number }
  >();
  for (const r of list) {
    const cur = lastByProblem.get(r.problem_id);
    if (!cur) {
      lastByProblem.set(r.problem_id, { row: r, attempts: 1 });
    } else {
      cur.attempts += 1;
    }
  }
  const out: WrongAttemptItem[] = [];
  for (const { row, attempts } of lastByProblem.values()) {
    if (row.is_correct) continue;
    const probLawCode =
      (row.problems.laws.law_code as LawSubjectSlug) ?? "patent";
    if (lawCode && probLawCode !== lawCode) continue;
    const body = row.problems.body_md ?? "";
    out.push({
      problemId: row.problem_id,
      lastAttemptedAt: row.attempted_at,
      attempts,
      bodySnippet: body.length > 120 ? `${body.slice(0, 120)}…` : body,
      primaryArticleLabel: row.problems.articles?.display_label ?? null,
      lawCode: probLawCode,
      year: row.problems.year,
      problemNumber: row.problems.problem_number,
    });
  }
  out.sort(
    (a, b) =>
      new Date(b.lastAttemptedAt).getTime() -
      new Date(a.lastAttemptedAt).getTime(),
  );
  return out;
}

// 자연과학 오답 — listWrongAttempts 와 동일 룰(가장 최근 시도가 오답).
// listWrongAttempts 는 laws!inner 조인이라 law 없는 자과 문제가 원천 제외되므로 별도 함수.
export interface ScienceWrongAttemptItem {
  problemId: string;
  lastAttemptedAt: string;
  attempts: number;
  bodySnippet: string;
  scienceSubject: string;
  year: number | null;
  problemNumber: number | null;
}

export async function listScienceWrongAttempts(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<ScienceWrongAttemptItem[]> {
  const { data: rows, error } = await client
    .from("user_problem_attempts")
    .select(
      "problem_id, is_correct, attempted_at, problems!inner(body_md, year, problem_number, science_subject)",
    )
    .eq("user_id", userId)
    .is("ox_answer", null)
    .not("problems.science_subject", "is", null)
    .order("attempted_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const list = rows ?? [];
  const lastByProblem = new Map<
    string,
    { row: (typeof list)[number]; attempts: number }
  >();
  for (const r of list) {
    const cur = lastByProblem.get(r.problem_id);
    if (!cur) lastByProblem.set(r.problem_id, { row: r, attempts: 1 });
    else cur.attempts += 1;
  }
  const out: ScienceWrongAttemptItem[] = [];
  for (const { row, attempts } of lastByProblem.values()) {
    if (row.is_correct) continue;
    const sci = row.problems.science_subject;
    if (!sci) continue;
    const body = row.problems.body_md ?? "";
    out.push({
      problemId: row.problem_id,
      lastAttemptedAt: row.attempted_at,
      attempts,
      bodySnippet: body.length > 120 ? `${body.slice(0, 120)}…` : body,
      scienceSubject: sci,
      year: row.problems.year,
      problemNumber: row.problems.problem_number,
    });
  }
  out.sort(
    (a, b) =>
      new Date(b.lastAttemptedAt).getTime() -
      new Date(a.lastAttemptedAt).getTime(),
  );
  return out;
}

export interface OxWrongAttemptItem {
  refType: "choice" | "box";
  refId: string;
  problemId: string;
  bodySnippet: string;
  oxTruth: "O" | "X";
  myAnswer: "O" | "X";
  lastAttemptedAt: string;
  attempts: number;
  primaryArticleLabel: string | null;
  articleNumber: string | null;
  lawCode: LawSubjectSlug;
  year: number | null;
  problemNumber: number | null;
}

// OX 오답 목록. ref(choice 또는 box_item) 단위로 dedup 한 뒤,
// 가장 최근 응답이 오답인 항목만 노출. 정답 후에는 자동 제거.
export async function listOxWrongAttempts(
  client: SupabaseClient<Database>,
  userId: string,
  lawCode?: LawSubjectSlug,
  since: Date | null = null,
): Promise<OxWrongAttemptItem[]> {
  let q = client
    .from("user_problem_attempts")
    .select(
      "problem_id, selected_choice_id, selected_box_item_id, ox_answer, is_correct, attempted_at",
    )
    .eq("user_id", userId)
    .not("ox_answer", "is", null)
    .order("attempted_at", { ascending: false })
    .limit(2000);
  if (since) q = q.gte("attempted_at", since.toISOString());
  const { data: rows, error } = await q;
  if (error) throw error;
  const list = rows ?? [];

  type Row = (typeof list)[number];
  const byRef = new Map<string, { row: Row; attempts: number }>();
  for (const r of list) {
    const refKey = r.selected_choice_id
      ? `c:${r.selected_choice_id}`
      : r.selected_box_item_id
        ? `b:${r.selected_box_item_id}`
        : null;
    if (!refKey) continue;
    const cur = byRef.get(refKey);
    if (!cur) {
      byRef.set(refKey, { row: r, attempts: 1 });
    } else {
      cur.attempts += 1;
    }
  }

  const choiceIds: string[] = [];
  const boxIds: string[] = [];
  const wrongRefs: { refKey: string; row: Row; attempts: number }[] = [];
  for (const [refKey, v] of byRef.entries()) {
    if (v.row.is_correct) continue;
    wrongRefs.push({ refKey, ...v });
    if (v.row.selected_choice_id) choiceIds.push(v.row.selected_choice_id);
    else if (v.row.selected_box_item_id)
      boxIds.push(v.row.selected_box_item_id);
  }
  if (wrongRefs.length === 0) return [];

  const choiceMap = new Map<
    string,
    {
      bodyMd: string | null;
      articleId: string | null;
      problemId: string;
    }
  >();
  if (choiceIds.length > 0) {
    const { data: cRows } = await client
      .from("problem_choices")
      .select("choice_id, body_md, related_article_id, problem_id")
      .in("choice_id", choiceIds);
    for (const c of cRows ?? []) {
      choiceMap.set(c.choice_id, {
        bodyMd: c.body_md,
        articleId: c.related_article_id,
        problemId: c.problem_id,
      });
    }
  }

  const boxMap = new Map<
    string,
    {
      bodyMd: string | null;
      articleId: string | null;
      problemId: string;
    }
  >();
  if (boxIds.length > 0) {
    const { data: bRows } = await client
      .from("problem_box_items")
      .select("box_item_id, body_md, related_article_id, problem_id")
      .in("box_item_id", boxIds);
    for (const b of bRows ?? []) {
      boxMap.set(b.box_item_id, {
        bodyMd: b.body_md,
        articleId: b.related_article_id,
        problemId: b.problem_id,
      });
    }
  }

  const articleIds = new Set<string>();
  for (const c of choiceMap.values())
    if (c.articleId) articleIds.add(c.articleId);
  for (const b of boxMap.values()) if (b.articleId) articleIds.add(b.articleId);

  const articleMap = new Map<
    string,
    { displayLabel: string; articleNumber: string | null }
  >();
  if (articleIds.size > 0) {
    const { data: aRows } = await client
      .from("articles")
      .select("article_id, display_label, article_number")
      .in("article_id", [...articleIds]);
    for (const a of aRows ?? []) {
      articleMap.set(a.article_id, {
        displayLabel: a.display_label,
        articleNumber: a.article_number,
      });
    }
  }

  const problemIds = new Set<string>();
  for (const c of choiceMap.values()) problemIds.add(c.problemId);
  for (const b of boxMap.values()) problemIds.add(b.problemId);

  const problemMap = new Map<
    string,
    {
      year: number | null;
      problemNumber: number | null;
      lawCode: LawSubjectSlug;
    }
  >();
  if (problemIds.size > 0) {
    const { data: pRows } = await client
      .from("problems")
      .select(
        "problem_id, year, problem_number, deleted_at, laws!inner(law_code)",
      )
      .in("problem_id", [...problemIds]);
    for (const p of pRows ?? []) {
      if (p.deleted_at) continue;
      problemMap.set(p.problem_id, {
        year: p.year,
        problemNumber: p.problem_number,
        lawCode: (p.laws.law_code as LawSubjectSlug) ?? "patent",
      });
    }
  }

  // OX 정답(ox_truth) 은 ref 의 원본에서 다시 조회. 시점 차이로 ox_truth 가 바뀌었어도
  // 사용자가 최근에 잘못 답한 사실은 유효 — 현재 정답값을 표시.
  const choiceTruthMap = new Map<string, "O" | "X" | null>();
  if (choiceIds.length > 0) {
    const { data: ct } = await client
      .from("problem_choices")
      .select("choice_id, ox_truth")
      .in("choice_id", choiceIds);
    for (const r of ct ?? [])
      choiceTruthMap.set(r.choice_id, r.ox_truth as "O" | "X" | null);
  }
  const boxTruthMap = new Map<string, "O" | "X" | null>();
  if (boxIds.length > 0) {
    const { data: bt } = await client
      .from("problem_box_items")
      .select("box_item_id, ox_truth")
      .in("box_item_id", boxIds);
    for (const r of bt ?? [])
      boxTruthMap.set(r.box_item_id, r.ox_truth as "O" | "X" | null);
  }

  const out: OxWrongAttemptItem[] = [];
  for (const w of wrongRefs) {
    const myAnswer = w.row.ox_answer as "O" | "X";
    if (w.row.selected_choice_id) {
      const c = choiceMap.get(w.row.selected_choice_id);
      if (!c) continue;
      const prob = problemMap.get(c.problemId);
      if (!prob) continue;
      const truth = choiceTruthMap.get(w.row.selected_choice_id);
      if (!truth) continue;
      if (lawCode && prob.lawCode !== lawCode) continue;
      const body = c.bodyMd ?? "";
      const art = c.articleId ? articleMap.get(c.articleId) : null;
      out.push({
        refType: "choice",
        refId: w.row.selected_choice_id,
        problemId: c.problemId,
        bodySnippet: body.length > 120 ? `${body.slice(0, 120)}…` : body,
        oxTruth: truth,
        myAnswer,
        lastAttemptedAt: w.row.attempted_at,
        attempts: w.attempts,
        primaryArticleLabel: art?.displayLabel ?? null,
        articleNumber: art?.articleNumber ?? null,
        lawCode: prob.lawCode,
        year: prob.year,
        problemNumber: prob.problemNumber,
      });
    } else if (w.row.selected_box_item_id) {
      const b = boxMap.get(w.row.selected_box_item_id);
      if (!b) continue;
      const prob = problemMap.get(b.problemId);
      if (!prob) continue;
      const truth = boxTruthMap.get(w.row.selected_box_item_id);
      if (!truth) continue;
      if (lawCode && prob.lawCode !== lawCode) continue;
      // 정오문제 오답노트 스니펫 — 박스 식별자([㉠] 등)는 노이즈라 붙이지 않는다.
      const body = b.bodyMd ?? "";
      const art = b.articleId ? articleMap.get(b.articleId) : null;
      out.push({
        refType: "box",
        refId: w.row.selected_box_item_id,
        problemId: b.problemId,
        bodySnippet: body.length > 120 ? `${body.slice(0, 120)}…` : body,
        oxTruth: truth,
        myAnswer,
        lastAttemptedAt: w.row.attempted_at,
        attempts: w.attempts,
        primaryArticleLabel: art?.displayLabel ?? null,
        articleNumber: art?.articleNumber ?? null,
        lawCode: prob.lawCode,
        year: prob.year,
        problemNumber: prob.problemNumber,
      });
    }
  }

  out.sort(
    (a, b) =>
      new Date(b.lastAttemptedAt).getTime() -
      new Date(a.lastAttemptedAt).getTime(),
  );
  return out;
}

// ──────── 통합 학습 통계 페이지 (feat-2-008) ────────

export interface ArticleStudyStats {
  visitedDistinct: number;
  totalArticles: number;
  bookmarks: number;
  memos: number;
  highlights: number;
  bySubject: Array<{
    lawCode: LawSubjectSlug;
    name: string;
    visited: number;
    total: number;
    bookmarks: number;
    memos: number;
    highlights: number;
  }>;
}

// since 가 주어지면 study_sessions.started_at 이후 visited + 그 기간 안 작성된
// annotation(bookmark/memo/highlight) 만 집계 — feat-3-209 v3.
export async function getArticleStudyStats(
  client: SupabaseClient<Database>,
  userId: string,
  lawCodes: ReadonlyArray<{ slug: LawSubjectSlug; name: string }>,
  since: Date | null = null,
): Promise<ArticleStudyStats> {
  const sinceIso = since?.toISOString();
  const slugs = lawCodes.map((s) => s.slug) as string[];
  const { data: lawRows } = await client
    .from("laws")
    .select("law_id, law_code")
    .in("law_code", slugs);
  const lawByCode = new Map((lawRows ?? []).map((l) => [l.law_code, l.law_id]));
  const codeByLawId = new Map(
    (lawRows ?? []).map((l) => [l.law_id, l.law_code]),
  );

  const totals = new Map<string, number>();
  await Promise.all(
    Array.from(lawByCode.entries()).map(async ([code, lid]) => {
      const { count } = await client
        .from("articles")
        .select("article_id", { head: true, count: "exact" })
        .eq("law_id", lid)
        .eq("level", "article");
      totals.set(code, count ?? 0);
    }),
  );

  let sessQ = client
    .from("study_sessions")
    .select("scope")
    .eq("user_id", userId)
    .limit(5000);
  if (sinceIso) sessQ = sessQ.gte("started_at", sinceIso);
  const { data: sessRows } = await sessQ;
  const visitedAll = new Set<string>();
  const visitedBySubject = new Map<string, Set<string>>();
  for (const r of sessRows ?? []) {
    const scope = r.scope as Partial<StudyScope> | null;
    if (!scope?.target_id || scope.target_type !== "article") continue;
    visitedAll.add(scope.target_id);
    const subj = scope.subject;
    if (subj) {
      if (!visitedBySubject.has(subj)) visitedBySubject.set(subj, new Set());
      visitedBySubject.get(subj)!.add(scope.target_id);
    }
  }

  const fetchAnnotationIds = async (
    table: "user_bookmarks" | "user_memos" | "user_highlights",
  ): Promise<string[]> => {
    let q = client
      .from(table)
      .select("target_id")
      .eq("user_id", userId)
      .eq("target_type", "article")
      .is("deleted_at", null);
    if (table === "user_bookmarks") q = q.gt("star_level", 0);
    if (sinceIso) {
      q = q.gte(
        table === "user_highlights" ? "created_at" : "updated_at",
        sinceIso,
      );
    }
    const { data } = await q.limit(10000);
    return (data ?? []).map((r) => r.target_id as string);
  };
  const [bookmarkIds, memoIds, highlightIds] = await Promise.all([
    fetchAnnotationIds("user_bookmarks"),
    fetchAnnotationIds("user_memos"),
    fetchAnnotationIds("user_highlights"),
  ]);

  const allArticleIds = Array.from(
    new Set([...bookmarkIds, ...memoIds, ...highlightIds]),
  );
  const lawIdByArticleId = new Map<string, string>();
  if (allArticleIds.length > 0) {
    const { data: arts } = await client
      .from("articles")
      .select("article_id, law_id")
      .in("article_id", allArticleIds);
    for (const a of arts ?? []) {
      if (a.law_id) lawIdByArticleId.set(a.article_id, a.law_id);
    }
  }

  const countBySubject = (ids: string[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const aid of ids) {
      const lid = lawIdByArticleId.get(aid);
      const code = lid ? codeByLawId.get(lid) : undefined;
      if (!code) continue;
      m.set(code, (m.get(code) ?? 0) + 1);
    }
    return m;
  };
  const bookmarkBy = countBySubject(bookmarkIds);
  const memoBy = countBySubject(memoIds);
  const highlightBy = countBySubject(highlightIds);

  return {
    visitedDistinct: visitedAll.size,
    totalArticles: Array.from(totals.values()).reduce((a, b) => a + b, 0),
    bookmarks: bookmarkIds.length,
    memos: memoIds.length,
    highlights: highlightIds.length,
    bySubject: lawCodes.map(({ slug, name }) => ({
      lawCode: slug,
      name,
      visited: visitedBySubject.get(slug)?.size ?? 0,
      total: totals.get(slug) ?? 0,
      bookmarks: bookmarkBy.get(slug) ?? 0,
      memos: memoBy.get(slug) ?? 0,
      highlights: highlightBy.get(slug) ?? 0,
    })),
  };
}

export interface CaseStudyStats {
  visitedDistinct: number;
  totalCases: number;
  bookmarks: number;
  memos: number;
  highlights: number;
  bySubject: Array<{
    lawCode: LawSubjectSlug;
    name: string;
    visited: number;
    total: number;
  }>;
}

// since 가 주어지면 그 기간 안 visited + 작성된 annotation 만 집계 — feat-3-209 v3.
export async function getCaseStudyStats(
  client: SupabaseClient<Database>,
  userId: string,
  lawCodes: ReadonlyArray<{ slug: LawSubjectSlug; name: string }>,
  since: Date | null = null,
): Promise<CaseStudyStats> {
  const sinceIso = since?.toISOString();
  const { count: totalCases } = await client
    .from("cases")
    .select("case_id", { head: true, count: "exact" })
    .is("deleted_at", null);

  let sessQ = client
    .from("study_sessions")
    .select("scope")
    .eq("user_id", userId)
    .limit(5000);
  if (sinceIso) sessQ = sessQ.gte("started_at", sinceIso);
  const { data: sessRows } = await sessQ;
  const visitedAll = new Set<string>();
  const visitedBySubject = new Map<string, Set<string>>();
  for (const r of sessRows ?? []) {
    const scope = r.scope as Partial<StudyScope> | null;
    if (!scope?.target_id || scope.target_type !== "case") continue;
    visitedAll.add(scope.target_id);
    const subj = scope.subject;
    if (subj) {
      if (!visitedBySubject.has(subj)) visitedBySubject.set(subj, new Set());
      visitedBySubject.get(subj)!.add(scope.target_id);
    }
  }

  const totalsBySubject = new Map<string, number>();
  await Promise.all(
    lawCodes.map(async ({ slug }) => {
      const { count } = await client
        .from("cases")
        .select("case_id", { head: true, count: "exact" })
        .is("deleted_at", null)
        .contains("subject_laws", [slug]);
      totalsBySubject.set(slug, count ?? 0);
    }),
  );

  const fetchCount = async (
    table: "user_bookmarks" | "user_memos" | "user_highlights",
  ): Promise<number> => {
    let q = client
      .from(table)
      .select("target_id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("target_type", "case")
      .is("deleted_at", null);
    if (table === "user_bookmarks") q = q.gt("star_level", 0);
    if (sinceIso) {
      q = q.gte(
        table === "user_highlights" ? "created_at" : "updated_at",
        sinceIso,
      );
    }
    const { count } = await q;
    return count ?? 0;
  };
  const [bookmarks, memos, highlights] = await Promise.all([
    fetchCount("user_bookmarks"),
    fetchCount("user_memos"),
    fetchCount("user_highlights"),
  ]);

  return {
    visitedDistinct: visitedAll.size,
    totalCases: totalCases ?? 0,
    bookmarks,
    memos,
    highlights,
    bySubject: lawCodes.map(({ slug, name }) => ({
      lawCode: slug,
      name,
      visited: visitedBySubject.get(slug)?.size ?? 0,
      total: totalsBySubject.get(slug) ?? 0,
    })),
  };
}

export interface UserSubjectiveStats {
  totalAttempts: number;
  /** 3단계(논점·목차·포섭)를 모두 채운 문항 수. */
  completedAttempts: number;
  /** AI 채점을 받은 문항 수. */
  aiGradedAttempts: number;
  /** AI 종합 점수 평균 — 자기채점 폐지로 AI 초안이 유일한 점수 신호. */
  avgAiScore: number | null;
  bySubject: Array<{
    lawCode: LawSubjectSlug;
    name: string;
    attempts: number;
    avgAiScore: number | null;
  }>;
}

export async function getUserSubjectiveStats(
  client: SupabaseClient<Database>,
  userId: string,
  lawCodes: ReadonlyArray<{ slug: LawSubjectSlug; name: string }>,
  since: Date | null = null,
): Promise<UserSubjectiveStats> {
  let q = client
    .from("user_subjective_attempts")
    .select(
      "attempt_id, issues_md, outline_md, analysis_md, ai_overall_score, problems!inner(law_id, laws!inner(law_code))",
    )
    .eq("user_id", userId)
    .is("deleted_at", null);
  // updated_at 기준 — 작성/수정 시각.
  if (since) q = q.gte("updated_at", since.toISOString());
  const { data: rows, error } = await q;
  if (error) throw error;
  const list = rows ?? [];

  let completed = 0;
  let aiGraded = 0;
  const aiScores: number[] = [];
  const byCode = new Map<string, { attempts: number; scores: number[] }>();
  for (const r of list) {
    const stagesDone = [r.issues_md, r.outline_md, r.analysis_md].filter(
      (v) => (v ?? "").trim().length > 0,
    ).length;
    if (stagesDone >= 3) completed += 1;
    if (r.ai_overall_score != null) {
      aiGraded += 1;
      aiScores.push(r.ai_overall_score);
    }
    const code = r.problems?.laws?.law_code;
    if (code) {
      if (!byCode.has(code)) byCode.set(code, { attempts: 0, scores: [] });
      const c = byCode.get(code)!;
      c.attempts += 1;
      if (r.ai_overall_score != null) c.scores.push(r.ai_overall_score);
    }
  }
  const avg = (xs: number[]): number | null =>
    xs.length === 0
      ? null
      : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
  return {
    totalAttempts: list.length,
    completedAttempts: completed,
    aiGradedAttempts: aiGraded,
    avgAiScore: avg(aiScores),
    bySubject: lawCodes.map(({ slug, name }) => {
      const c = byCode.get(slug);
      return {
        lawCode: slug,
        name,
        attempts: c?.attempts ?? 0,
        avgAiScore: c ? avg(c.scores) : null,
      };
    }),
  };
}

// ─── 합격 진단 정밀화 (feat-7-024 정밀화) ────────────────────────────────

// 본인 GS(2차 모의) 평균 점수 % — 채점 완료된 응시만. 데이터 없으면 null.
export async function getUserGsAveragePct(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<number | null> {
  const { data: subs } = await client
    .from("gs_submissions")
    .select("submission_id, total_score, round_id")
    .eq("user_id", userId)
    .not("graded_at", "is", null);
  if (!subs || subs.length === 0) return null;
  const roundIds = Array.from(new Set(subs.map((s) => s.round_id)));
  const { data: questions } = await client
    .from("gs_questions")
    .select("round_id, max_score")
    .in("round_id", roundIds);
  const maxByRound = new Map<string, number>();
  for (const q of questions ?? []) {
    maxByRound.set(
      q.round_id,
      (maxByRound.get(q.round_id) ?? 0) + (q.max_score ?? 0),
    );
  }
  const pctList: number[] = [];
  for (const s of subs) {
    const max = maxByRound.get(s.round_id) ?? 0;
    if (max > 0 && s.total_score !== null) {
      pctList.push(((s.total_score ?? 0) / max) * 100);
    }
  }
  if (pctList.length === 0) return null;
  return (
    Math.round((pctList.reduce((a, b) => a + b, 0) / pctList.length) * 10) / 10
  );
}

// 본인 주별 정답률 추이 — 최근 N주(기본 12주). KST Monday 기준.
export interface UserWeeklyAccuracyItem {
  weekStart: string; // YYYY-MM-DD
  label: string; // "11주 전" ~ "이번 주"
  totalAttempts: number;
  correctAttempts: number;
  accuracyPct: number | null;
}

export interface UserWeeklyAccuracyTrend {
  weeks: UserWeeklyAccuracyItem[];
}

function ymdKstLocal(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}

function mondayStartKstLocal(d: Date): Date {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const day = k.getUTCDay();
  const diff = (day + 6) % 7;
  k.setUTCHours(0, 0, 0, 0);
  k.setUTCDate(k.getUTCDate() - diff);
  return new Date(k.getTime() - 9 * 3600 * 1000);
}

// weekCount 모드 또는 since/until 모드. since/until 이 주어지면 그 기간을 주 단위로 분할.
export async function getUserAccuracyTrend(
  client: SupabaseClient<Database>,
  userId: string,
  opts: { weekCount?: number; since?: Date | null; until?: Date | null } = {},
): Promise<UserWeeklyAccuracyTrend> {
  const thisWeekStart = mondayStartKstLocal(new Date());
  let firstWeekStart: Date;
  let lastWeekStart: Date;
  if (opts.since || opts.until) {
    firstWeekStart = mondayStartKstLocal(opts.since ?? new Date(0));
    lastWeekStart = mondayStartKstLocal(opts.until ?? new Date());
  } else {
    const weekCount = opts.weekCount ?? 12;
    firstWeekStart = new Date(
      thisWeekStart.getTime() - (weekCount - 1) * 7 * 24 * 3600 * 1000,
    );
    lastWeekStart = thisWeekStart;
  }

  let q = client
    .from("user_problem_attempts")
    .select("attempted_at, is_correct")
    .eq("user_id", userId)
    .gte("attempted_at", firstWeekStart.toISOString())
    .limit(20000);
  if (opts.until) {
    const tilEndWeek = new Date(lastWeekStart.getTime() + 7 * 24 * 3600 * 1000);
    q = q.lt("attempted_at", tilEndWeek.toISOString());
  }
  const { data: rows, error } = await q;
  if (error) throw error;

  const byWeek = new Map<string, { total: number; correct: number }>();
  for (const r of rows ?? []) {
    const weekStart = mondayStartKstLocal(new Date(r.attempted_at));
    const key = ymdKstLocal(weekStart);
    const entry = byWeek.get(key) ?? { total: 0, correct: 0 };
    entry.total += 1;
    if (r.is_correct) entry.correct += 1;
    byWeek.set(key, entry);
  }

  // firstWeekStart 부터 lastWeekStart 까지 한 주씩 채움 (최대 52주 보호).
  const weeks: UserWeeklyAccuracyItem[] = [];
  let cursor = firstWeekStart.getTime();
  const lastMs = lastWeekStart.getTime();
  let safety = 0;
  while (cursor <= lastMs && safety < 52) {
    const ws = new Date(cursor);
    const key = ymdKstLocal(ws);
    const entry = byWeek.get(key);
    const total = entry?.total ?? 0;
    const correct = entry?.correct ?? 0;
    const weeksAgo = Math.round(
      (thisWeekStart.getTime() - cursor) / (7 * 24 * 3600 * 1000),
    );
    const label =
      weeksAgo === 0
        ? "이번 주"
        : weeksAgo > 0
          ? `${weeksAgo}주 전`
          : `+${-weeksAgo}주`;
    weeks.push({
      weekStart: key,
      label,
      totalAttempts: total,
      correctAttempts: correct,
      accuracyPct: total > 0 ? Math.round((correct / total) * 1000) / 10 : null,
    });
    cursor += 7 * 24 * 3600 * 1000;
    safety += 1;
  }
  return { weeks };
}

// 합격 진단 점수 시계열 (feat-7-027) — pass_prediction_snapshots 의 최근 N일.
export interface PassPredictionSnapshotItem {
  snapshotDate: string; // YYYY-MM-DD
  score: number;
  rating: string;
}

// days 모드 또는 since/until 모드. since/until 이 주어지면 그 기간만.
export async function getUserPassPredictionTrend(
  client: SupabaseClient<Database>,
  userId: string,
  opts: { days?: number; since?: Date | null; until?: Date | null } = {},
): Promise<PassPredictionSnapshotItem[]> {
  let sinceYmd: string;
  let untilYmd: string | null = null;
  if (opts.since || opts.until) {
    sinceYmd = (opts.since ?? new Date(0)).toISOString().slice(0, 10);
    untilYmd = (opts.until ?? new Date()).toISOString().slice(0, 10);
  } else {
    const days = opts.days ?? 30;
    sinceYmd = new Date(Date.now() - days * 86_400_000)
      .toISOString()
      .slice(0, 10);
  }
  let q = client
    .from("pass_prediction_snapshots")
    .select("snapshot_date, score, rating")
    .eq("user_id", userId)
    .gte("snapshot_date", sinceYmd)
    .order("snapshot_date", { ascending: true });
  if (untilYmd) q = q.lte("snapshot_date", untilYmd);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    snapshotDate: r.snapshot_date,
    score: r.score,
    rating: r.rating,
  }));
}

// feat §B3 — 단원(systematic node) 별 정답률 집계. 한 회차의 약점 단원 찾기용.
//   problems → primary_article_id → article_systematic_links → node_id → systematic_nodes.label
//   primary_article 없는 문제는 "기타"로 묶음.

export interface WeakNodeRow {
  nodeId: string | null; // null = 기타
  label: string;
  correct: number;
  total: number;
  accuracyPct: number; // 0~100
}

export async function getSessionWeakNodes(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
): Promise<WeakNodeRow[]> {
  // 1) session.problemIds + 정오 (user_problem_attempts 최신).
  const { data: session } = await client
    .from("quiz_sessions")
    .select("problem_ids")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!session || !session.problem_ids?.length) return [];
  const pids: string[] = session.problem_ids;

  const [attemptsRes, probsRes] = await Promise.all([
    client
      .from("user_problem_attempts")
      .select("problem_id, is_correct, attempted_at")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .order("attempted_at", { ascending: false }),
    client
      .from("problems")
      .select("problem_id, primary_article_id, primary_node_id")
      .in("problem_id", pids),
  ]);

  // 동일 문제 최신만.
  const seen = new Set<string>();
  const correctMap = new Map<string, boolean>();
  for (const r of attemptsRes.data ?? []) {
    if (seen.has(r.problem_id)) continue;
    seen.add(r.problem_id);
    correctMap.set(r.problem_id, r.is_correct);
  }

  const articleByProblem = new Map<string, string | null>();
  const pinnedNodeByProblem = new Map<string, string | null>();
  for (const p of probsRes.data ?? []) {
    articleByProblem.set(p.problem_id, p.primary_article_id);
    pinnedNodeByProblem.set(p.problem_id, p.primary_node_id);
  }

  // 2) article → node 매핑.
  const articleIds = [...articleByProblem.values()].filter(
    (v): v is string => !!v,
  );
  const nodeByArticle = new Map<string, string>();
  if (articleIds.length > 0) {
    const { data: links } = await client
      .from("article_systematic_links")
      .select("article_id, node_id")
      .in("article_id", articleIds);
    // 한 article 이 여러 노드에 매핑된 경우 첫 번째만 사용 (단순화).
    for (const l of links ?? []) {
      if (!nodeByArticle.has(l.article_id)) {
        nodeByArticle.set(l.article_id, l.node_id);
      }
    }
  }

  // feat-4-A-340 — 문제별 최종 노드: primary_node_id 우선, 없으면 article→node.
  const nodeByProblem = new Map<string, string | null>();
  for (const pid of pids) {
    const pinned = pinnedNodeByProblem.get(pid) ?? null;
    if (pinned) {
      nodeByProblem.set(pid, pinned);
      continue;
    }
    const articleId = articleByProblem.get(pid) ?? null;
    nodeByProblem.set(
      pid,
      articleId ? (nodeByArticle.get(articleId) ?? null) : null,
    );
  }

  // 3) node 라벨.
  const nodeIds = [
    ...new Set([...nodeByProblem.values()].filter((v): v is string => !!v)),
  ];
  const labelByNode = new Map<string, string>();
  if (nodeIds.length > 0) {
    const { data: nodes } = await client
      .from("systematic_nodes")
      .select("node_id, display_label")
      .in("node_id", nodeIds);
    for (const n of nodes ?? []) labelByNode.set(n.node_id, n.display_label);
  }

  // 4) 노드별 집계 (응답한 문제만 분모).
  type Bucket = { correct: number; total: number };
  const byNode = new Map<string | null, Bucket>();
  for (const pid of pids) {
    const isCorrect = correctMap.get(pid);
    if (isCorrect === undefined) continue; // 미응답 skip
    const nodeId = nodeByProblem.get(pid) ?? null;
    const key = nodeId;
    const cur = byNode.get(key) ?? { correct: 0, total: 0 };
    cur.total += 1;
    if (isCorrect) cur.correct += 1;
    byNode.set(key, cur);
  }
  const rows: WeakNodeRow[] = [];
  for (const [nodeId, b] of byNode) {
    rows.push({
      nodeId,
      label: nodeId ? (labelByNode.get(nodeId) ?? "(라벨 없음)") : "기타",
      correct: b.correct,
      total: b.total,
      accuracyPct: b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0,
    });
  }
  rows.sort((a, b) => a.accuracyPct - b.accuracyPct);
  return rows;
}

// feat §B4 — 같은 pack 의 본인 이전 완료 응시 점수 추이 (지난 회차 대비 ±).
//   현재 응시(sessionId) 제외, 완료된 세션만, attempted_at 또는 completed_at desc.

export interface PreviousScoreRow {
  sessionId: string;
  completedAt: string;
  score: number; // 0~100 정답률 %
  total: number;
  correct: number;
}

export async function getPreviousPackScores(
  client: SupabaseClient<Database>,
  userId: string,
  packId: string,
  excludeSessionId: string,
  limit = 5,
): Promise<PreviousScoreRow[]> {
  // 같은 pack 의 본인 완료 exam 세션 — completedAt desc.
  const { data: sessions } = await client
    .from("quiz_sessions")
    .select("session_id, completed_at, problem_ids")
    .eq("user_id", userId)
    .eq("pack_id", packId)
    .eq("mode", "exam")
    .not("completed_at", "is", null)
    .neq("session_id", excludeSessionId)
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (!sessions || sessions.length === 0) return [];

  // 각 세션의 정답률 — user_problem_attempts 에서 isCorrect=true 카운트.
  const out: PreviousScoreRow[] = [];
  for (const s of sessions) {
    const total = s.problem_ids?.length ?? 0;
    if (total === 0) continue;
    const { data: attempts } = await client
      .from("user_problem_attempts")
      .select("problem_id, is_correct, attempted_at")
      .eq("user_id", userId)
      .eq("session_id", s.session_id)
      .order("attempted_at", { ascending: false });
    const seen = new Set<string>();
    let correct = 0;
    for (const r of attempts ?? []) {
      if (seen.has(r.problem_id)) continue;
      seen.add(r.problem_id);
      if (r.is_correct) correct += 1;
    }
    out.push({
      sessionId: s.session_id,
      completedAt: s.completed_at ?? "",
      score: Math.round((correct / total) * 100),
      total,
      correct,
    });
  }
  return out;
}
