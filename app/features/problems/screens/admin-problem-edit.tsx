// 운영자 객관식 문제 편집 — 메타 (출처/유형/극성/연도/회차/scope) + 본문 + 5지문.

import {
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  CircleSlashIcon,
  ListIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import {
  Form,
  Link,
  data,
  redirect,
  useFetcher,
  useNavigation,
  useSearchParams,
} from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import { assertSubjectWritable } from "~/core/lib/staff-subject-guard.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { reindexProblems } from "~/features/ai-qna/lib/source-chunker.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  AdminSelect,
  Chip,
  Field,
} from "~/features/admin/components/admin-ui";
import {
  getStaffRole,
  getSystematicSkeleton,
} from "~/features/laws/queries.server";
import { getUnpublishedRevisions } from "~/features/errata/queries.server";
import { BoxItemEditor } from "~/features/problems/components/box-item-editor";
import { ChoiceEditor } from "~/features/problems/components/choice-editor";
import { ExplanationEditor } from "~/features/problems/components/explanation-editor";
import {
  FORMAT_LABEL,
  ORIGIN_HAS_ROUND,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  SCOPE_LABEL,
  type ProblemBoxItem,
  type ProblemChoice,
  type ProblemDetail,
  type ProblemFormat,
  type ProblemOrigin,
  type ProblemPolarity,
  type ProblemScope,
} from "~/features/problems/labels";
import {
  getProblemById,
  listProblemsBySubject,
} from "~/features/problems/queries.server";
import {
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-problem-edit";

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "문제 편집 | 리담변리사학원" }];
  return [
    {
      title: `문제 #${loaderData.problem.problemNumber ?? "?"} 편집 | 리담변리사학원`,
    },
  ];
};

const ORIGINS: ProblemOrigin[] = [
  "past_exam",
  "past_exam_variant",
  "mock",
  "expected",
];
// ★전체 유형 포함 필수 — 현재 값이 옵션에 없으면 셀렉트가 첫 옵션(mc_short)으로
// 폴백돼 저장 시 format 이 조용히 덮여쓰인다(주관식→단답형 오염 사고, 2026-07-29).
const FORMATS: ProblemFormat[] = [
  "mc_short",
  "mc_box",
  "mc_case",
  "ox",
  "blank",
  "subjective",
];
const POLARITIES: ProblemPolarity[] = ["positive", "negative"];
const SCOPES: ProblemScope[] = ["unit", "comprehensive"];
// header 의 검토완료 버튼이 form 속성으로 메인 폼을 가리키기 위한 고정 id.
const FORM_ID = "admin-problem-edit-form";

// returnTo 화이트리스트 — open-redirect 방지. admin-case-edit 의 safeReturnTo 와
// 동일 패턴. 우리 도메인 안의 안전 경로만 허용:
//   1) /admin/problems    — admin 목록·필터 보존 (?law=patent 등 query 포함)
//   2) /subjects/<slug>/<articles|chapters|systematic|cases|problems>/<id>
//      — 학습과목 viewer (조문·장·체계도 노드·판례·문제). OX 패널 "수정" 진입점.
function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//"))
    return "/admin/problems";
  if (/^\/admin\/problems(\/|\?|$)/.test(raw)) return raw;
  if (
    /^\/subjects\/[a-z_-]+\/(articles|chapters|systematic|cases|problems)\/[^/?#]+(\/|\?|#|$)/i.test(
      raw,
    )
  )
    return raw;
  // 과목 개요 OX 탭(/subjects/<slug>/ox) — id 세그먼트 없음.
  if (/^\/subjects\/[a-z_-]+\/ox(\/|\?|#|$)/i.test(raw)) return raw;
  return "/admin/problems";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loader({ params, request }: Route.LoaderArgs) {
  const problemId = params.problemId;
  if (!problemId) throw data("Missing problemId", { status: 404 });
  // 비-uuid (e.g. /admin/problems/link-suggest 같은 새 child 라우트 미빌드 시
  // 동적 라우트로 빠지는 사고 방지) — 404 로 graceful fail.
  if (!UUID_RE.test(problemId)) throw data("Invalid problemId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  const problem = await getProblemById(client, problemId);
  if (!problem) throw data("Problem not found", { status: 404 });
  // 체크리스트 위젯용 — 이 문제가 매핑된 mcq pack 목록 (학생 노출 경로 확인).
  const { data: packLinks } = await client
    .from("mcq_pack_problems")
    .select("pack_id, mcq_packs!inner(title, is_published)")
    .eq("problem_id", problemId);
  const mcqPacks = (packLinks ?? [])
    .filter((r) => r.mcq_packs != null)
    .map((r) => ({
      packId: r.pack_id,
      title: r.mcq_packs.title,
      isPublished: r.mcq_packs.is_published,
    }));

  // prev/next 시퀀스 — admin-problems-list 와 같은 필터 컨텍스트로 형제 problemId 목록을 만든다.
  // URL 의 subject 가 없으면 problem 의 law_id → law_code 로 도출.
  const url = new URL(request.url);
  const subjectParam = url.searchParams.get("subject");
  let subject: LawSubjectSlug | null = null;
  if (subjectParam && LAW_SUBJECT_SLUGS.includes(subjectParam as never)) {
    subject = subjectParam as LawSubjectSlug;
  } else {
    const { data: probRow } = await client
      .from("problems")
      .select("laws(law_code)")
      .eq("problem_id", problemId)
      .maybeSingle();
    const code = probRow?.laws?.law_code ?? null;
    if (code && LAW_SUBJECT_SLUGS.includes(code as never)) {
      subject = code as LawSubjectSlug;
    }
  }

  let siblings: {
    prevId: string | null;
    nextId: string | null;
    position: number;
    total: number;
  } = { prevId: null, nextId: null, position: 0, total: 0 };
  if (subject) {
    const reviewParam = url.searchParams.get("review");
    const mediaParam = url.searchParams.get("media");
    // origin=past_all → 기출+기출변형 통합 (목록 화면과 동일 매핑, enum 캐스팅 방지)
    const originParam = url.searchParams.get("origin") || undefined;
    const filters = {
      origin: (originParam === "past_all" ? undefined : originParam) as
        | ProblemOrigin
        | undefined,
      origins:
        originParam === "past_all"
          ? (["past_exam", "past_exam_variant"] as ProblemOrigin[])
          : undefined,
      format: (url.searchParams.get("format") || undefined) as
        | ProblemFormat
        | undefined,
      polarity: (url.searchParams.get("polarity") || undefined) as
        | ProblemPolarity
        | undefined,
      scope: (url.searchParams.get("scope") || undefined) as
        | ProblemScope
        | undefined,
      year: url.searchParams.get("year")
        ? Number(url.searchParams.get("year"))
        : undefined,
      hasUnclassified: url.searchParams.get("unclassified") === "1",
      reviewStatus:
        reviewParam === "reviewed" ||
        reviewParam === "pending" ||
        reviewParam === "mismatch"
          ? (reviewParam as "reviewed" | "pending" | "mismatch")
          : undefined,
      mediaStatus:
        mediaParam === "table" ||
        mediaParam === "image" ||
        mediaParam === "any" ||
        mediaParam === "none"
          ? (mediaParam as "table" | "image" | "any" | "none")
          : undefined,
    };
    const list = await listProblemsBySubject(client, subject, filters, {
      includeHiddenMock: true,
      includeUnapproved: true,
    });
    const idx = list.findIndex((p) => p.problemId === problemId);
    if (idx >= 0) {
      siblings = {
        prevId: idx > 0 ? list[idx - 1].problemId : null,
        nextId: idx < list.length - 1 ? list[idx + 1].problemId : null,
        position: idx + 1,
        total: list.length,
      };
    } else {
      siblings = { prevId: null, nextId: null, position: 0, total: list.length };
    }
  }

  // feat-4-A-340 — 한 조문이 (caseOnly 제외) ≥2 노드에 걸릴 때, 지문/박스 항목
  // 단위 배치(related_node_id) picker 로 제공.
  const subNodeOptions: Record<string, { nodeId: string; label: string }[]> =
    {};
  // 문제 단원 고정(primary_node_id) picker — 과목 전체 노드에서 선택 가능하게 한다.
  // (조문이 1개 노드에만 걸려도 임의 노드로 정밀 재배치 가능 → 노드 오분류 수동 교정 수단)
  let allNodeOptions: { nodeId: string; label: string }[] = [];
  let primaryNodeId: string | null = null;
  if (subject) {
    const skeleton = await getSystematicSkeleton(client, subject);
    const map: Record<string, { nodeId: string; label: string }[]> = {};
    for (const node of skeleton) {
      if (node.caseOnly) continue;
      for (const a of node.articles) {
        if (!a.articleNumber) continue;
        (map[a.articleNumber] ??= []).push({
          nodeId: node.nodeId,
          label: node.displayLabel,
        });
      }
    }
    for (const [num, opts] of Object.entries(map)) {
      if (opts.length >= 2) subNodeOptions[num] = opts;
    }
    // 과목 전체 노드 — 조상 라벨 breadcrumb 로 식별성 확보(트리 순서 = path 정렬 유지).
    const labelById = new Map(skeleton.map((n) => [n.nodeId, n.displayLabel]));
    const parentById = new Map(skeleton.map((n) => [n.nodeId, n.parentId]));
    const crumb = (id: string): string => {
      const labels: string[] = [];
      let cur: string | null = id;
      for (let i = 0; cur && i < 12; i++) {
        const lbl = labelById.get(cur);
        if (!lbl) break;
        labels.unshift(lbl);
        cur = parentById.get(cur) ?? null;
      }
      return labels.join(" › ");
    };
    allNodeOptions = skeleton
      .filter((n) => !n.caseOnly)
      .map((n) => ({ nodeId: n.nodeId, label: crumb(n.nodeId) }));
    const { data: pn } = await client
      .from("problems")
      .select("primary_node_id")
      .eq("problem_id", problemId)
      .maybeSingle();
    primaryNodeId = pn?.primary_node_id ?? null;
  }

  // 주관식 체계도 복수 배치(problem_systematic_links) — 설문별 논점 → 노드.
  const { data: placementRows } = await client
    .from("problem_systematic_links")
    .select("link_id, node_id, note, seq")
    .eq("problem_id", problemId)
    .order("seq", { ascending: true, nullsFirst: false });
  const nodeLabelById = new Map(allNodeOptions.map((o) => [o.nodeId, o.label]));
  const placements = (placementRows ?? []).map((r) => ({
    linkId: r.link_id,
    nodeId: r.node_id,
    label: nodeLabelById.get(r.node_id) ?? r.node_id,
    note: r.note,
  }));

  // feat-2-032 — 강사 채점평·예시답안(source=instructor). examiner(실제 채점위원)는 참고용 개수만.
  const { data: gradingNotes } = await client
    .from("problem_grading_notes")
    .select(
      "note_id, source, author, body_md, example_answer_md, source_year, form, created_at",
    )
    .eq("problem_id", problemId)
    .order("source", { ascending: true })
    .order("created_at", { ascending: true });
  const instructorNotes = (gradingNotes ?? []).filter(
    (n) => n.source === "instructor",
  );
  const examinerNoteCount = (gradingNotes ?? []).filter(
    (n) => n.source === "examiner",
  ).length;

  return {
    problem,
    mcqPacks,
    role,
    siblings,
    subNodeOptions,
    allNodeOptions,
    primaryNodeId,
    placements,
    instructorNotes,
    examinerNoteCount,
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const problemId = params.problemId;
  if (!problemId) return { ok: false, error: "Missing problemId" } as const;
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;
  const role = await getStaffRole(client, user.id);
  if (!role) return { ok: false, error: "Forbidden" } as const;

  // feat-7-041 — 강사는 담당 과목 문제만 수정 가능(admin/manager 는 전 과목).
  if (role === "instructor") {
    const { data: prob } = await client
      .from("problems")
      .select("laws(law_code)")
      .eq("problem_id", problemId)
      .maybeSingle();
    await assertSubjectWritable(role, user.id, prob?.laws?.law_code ?? []);
  }

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "save");
  if (intent === "delete") {
    await client
      .from("problems")
      .update({ deleted_at: new Date().toISOString() })
      .eq("problem_id", problemId);
    throw redirect("/admin/problems");
  }
  if (intent === "review" || intent === "unreview") {
    // 검토 완료 표시 시 재검토 필요 플래그는 자동 해제 (의미 충돌 방지).
    const { error } = await client
      .from("problems")
      .update({
        reviewed_at: intent === "review" ? new Date().toISOString() : null,
        reviewed_by: intent === "review" ? user.id : null,
        ...(intent === "review"
          ? { mismatch_flagged_at: null, mismatch_flagged_by: null }
          : {}),
      })
      .eq("problem_id", problemId);
    if (error) return { ok: false, error: error.message } as const;
    return { ok: true, kind: intent } as const;
  }
  if (intent === "flag_mismatch" || intent === "unflag_mismatch") {
    // 재검토 필요 플래그 시 검토 완료는 자동 해제.
    const flag = intent === "flag_mismatch";
    const { error } = await client
      .from("problems")
      .update({
        mismatch_flagged_at: flag ? new Date().toISOString() : null,
        mismatch_flagged_by: flag ? user.id : null,
        ...(flag ? { reviewed_at: null, reviewed_by: null } : {}),
      })
      .eq("problem_id", problemId);
    if (error) return { ok: false, error: error.message } as const;
    return { ok: true, kind: intent } as const;
  }
  if (intent === "sync_choice_articles") {
    // primary_article_id 를 모든 빈 related_article_id 의 choice / box_item 에 일괄 적용.
    // 운영자가 명시적으로 다른 article 을 지정한 항목은 보존 (NULL 인 것만 채움).
    const { data: cur } = await client
      .from("problems")
      .select(
        "primary_article_id, articles!primary_article_id(article_number)",
      )
      .eq("problem_id", problemId)
      .maybeSingle();
    const primaryArticleId = cur?.primary_article_id ?? null;
    const primaryArticleNumber = cur?.articles?.article_number ?? null;
    if (!primaryArticleId) {
      return {
        ok: false,
        error: "본문 조문(primary_article_id)이 설정되지 않았습니다.",
      } as const;
    }
    const [{ count: choicesUpdated }, { count: boxesUpdated }] =
      await Promise.all([
        client
          .from("problem_choices")
          .update(
            {
              related_article_id: primaryArticleId,
              related_article_number: primaryArticleNumber,
            },
            { count: "exact" },
          )
          .eq("problem_id", problemId)
          .is("related_article_id", null),
        client
          .from("problem_box_items")
          .update(
            {
              related_article_id: primaryArticleId,
              related_article_number: primaryArticleNumber,
            },
            { count: "exact" },
          )
          .eq("problem_id", problemId)
          .is("related_article_id", null),
      ]);
    return {
      ok: true,
      kind: intent,
      synced: (choicesUpdated ?? 0) + (boxesUpdated ?? 0),
    } as const;
  }

  // feat-2-032 — 강사 채점평·예시답안 추가/삭제(problem_grading_notes, source=instructor).
  if (intent === "add_grading_note") {
    const bodyMd = String(fd.get("bodyMd") ?? "").trim();
    if (!bodyMd)
      return { ok: false, error: "채점평 내용을 입력하세요." } as const;
    const exampleMd = String(fd.get("exampleAnswerMd") ?? "").trim();
    const author = String(fd.get("author") ?? "").trim() || null;
    const { error } = await client.from("problem_grading_notes").insert({
      problem_id: problemId,
      source: "instructor",
      author,
      body_md: bodyMd,
      example_answer_md: exampleMd || null,
      created_by: user.id,
    });
    if (error) return { ok: false, error: error.message } as const;
    return { ok: true, kind: "add_grading_note" } as const;
  }
  if (intent === "delete_grading_note") {
    const noteId = String(fd.get("noteId") ?? "");
    if (!noteId) return { ok: false, error: "noteId 누락" } as const;
    const { error } = await client
      .from("problem_grading_notes")
      .delete()
      .eq("note_id", noteId)
      .eq("problem_id", problemId)
      .eq("source", "instructor");
    if (error) return { ok: false, error: error.message } as const;
    return { ok: true, kind: "delete_grading_note" } as const;
  }

  // 주관식 체계도 복수 배치(problem_systematic_links) 추가/삭제 — 배치 수정 시
  // 주관식 탭 트리 카운트·노드 필터·카드 배지에 즉시 반영된다(loader 재계산).
  if (intent === "add_placement") {
    const nodeId = String(fd.get("nodeId") ?? "").trim();
    if (!nodeId) return { ok: false, error: "배치할 노드를 선택하세요." } as const;
    const note = String(fd.get("placementNote") ?? "").trim() || null;
    const { data: existing } = await client
      .from("problem_systematic_links")
      .select("seq")
      .eq("problem_id", problemId);
    const nextSeq =
      Math.max(0, ...(existing ?? []).map((r) => r.seq ?? 0)) + 1;
    const { error } = await client.from("problem_systematic_links").insert({
      problem_id: problemId,
      node_id: nodeId,
      note,
      seq: nextSeq,
      created_by: user.id,
    });
    if (error)
      return {
        ok: false,
        error:
          error.code === "23505" ? "이미 배치된 노드입니다." : error.message,
      } as const;
    return { ok: true, kind: "add_placement" } as const;
  }
  if (intent === "remove_placement") {
    const linkId = String(fd.get("linkId") ?? "");
    if (!linkId) return { ok: false, error: "linkId 누락" } as const;
    const { error } = await client
      .from("problem_systematic_links")
      .delete()
      .eq("link_id", linkId)
      .eq("problem_id", problemId);
    if (error) return { ok: false, error: error.message } as const;
    return { ok: true, kind: "remove_placement" } as const;
  }

  // primary_article_id 변경: articleNumber 텍스트 ("29" / "28의2" / "" )를 받아 같은 law 의 articles 조회.
  // 빈 문자열이면 null 로 unset.
  // 단, 현재 연결된 article 이 article_number = NULL (예: 우산 article "실용신안법") 인 경우 폼 default 도
  // 빈 문자열이라 사용자의 명시적 의도와 구분되지 않는다 → 같은 상태(=빈 문자열)면 primary_article_id 를
  // 건드리지 않는다 (운영자가 다른 값으로 바꿨을 때만 변경).
  const articleNumberInput = stringOrNull(fd.get("articleNumber"));
  // 현재 problem 의 law_id + 현재 primary article 의 article_number 를 한 번에 가져온다.
  const { data: curProblem } = await client
    .from("problems")
    .select("law_id, primary_article_id, articles!primary_article_id(article_number)")
    .eq("problem_id", problemId)
    .maybeSingle();
  const currentArticleNumber: string | null =
    curProblem?.articles?.article_number ?? null;
  let primaryArticleIdUpdate: { primary_article_id: string | null } | null = null;
  if (fd.has("articleNumber")) {
    if (articleNumberInput == null) {
      // 현재 article_number 도 NULL 이면 default 값 그대로 제출된 것 — 변경 의도 아님.
      // 현재 article_number 가 있는데 비웠다면 명시적 unset 의도.
      if (currentArticleNumber != null) {
        primaryArticleIdUpdate = { primary_article_id: null };
      }
    } else if (articleNumberInput === currentArticleNumber) {
      // 동일한 값 → 변경 없음.
    } else {
      if (!curProblem?.law_id) {
        return { ok: false, error: "법령 정보 없음" } as const;
      }
      const { data: art } = await client
        .from("articles")
        .select("article_id")
        .eq("law_id", curProblem.law_id)
        .eq("article_number", articleNumberInput)
        .is("deleted_at", null)
        .maybeSingle();
      if (!art) {
        return {
          ok: false,
          error: `조문 "${articleNumberInput}" 을(를) 찾을 수 없습니다`,
        } as const;
      }
      primaryArticleIdUpdate = { primary_article_id: art.article_id };
    }
  }

  // feat-4-A-340 — 체계도 소분류 단일 배치. uuid 아니면 null. 조문 미연결 시 노드도 해제.
  let primaryNodeIdUpdate: { primary_node_id: string | null } | null = null;
  if (fd.has("primaryNodeId")) {
    const raw = stringOrNull(fd.get("primaryNodeId"));
    primaryNodeIdUpdate = {
      primary_node_id: raw && UUID_RE.test(raw) ? raw : null,
    };
  }
  if (primaryArticleIdUpdate?.primary_article_id === null) {
    primaryNodeIdUpdate = { primary_node_id: null };
  }

  // 메타 + body 업데이트.
  // intent === "save_and_review" 인 경우 한 트랜잭션 안에서 검토 완료까지 같이 처리한다.
  const andReview = intent === "save_and_review";
  const update: Record<string, unknown> = {
    body_md: String(fd.get("bodyMd") ?? ""),
    explanation_md: stringOrNull(fd.get("explanationMd")),
    model_answer_md: stringOrNull(fd.get("modelAnswerMd")),
    grading_rubric_md: stringOrNull(fd.get("gradingRubricMd")),
    video_url: stringOrNull(fd.get("videoUrl")),
    subjective_kind: (() => {
      const v = stringOrNull(fd.get("subjectiveKind"));
      if (v === "case_based" || v === "theory" || v === "mixed") return v;
      return null;
    })(),
    subjective_keywords: (() => {
      const raw = stringOrNull(fd.get("subjectiveKeywords"));
      if (!raw) return null;
      const arr = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return arr.length > 0 ? arr : null;
    })(),
    subjective_topic: stringOrNull(fd.get("subjectiveTopic")),
    rubric_items: (() => {
      const raw = stringOrNull(fd.get("rubricItemsText"));
      if (!raw) return null;
      // 줄 단위 — "라벨 | 배점" 또는 "라벨 (배점)" 또는 "라벨, 배점".
      const items: { label: string; points: number }[] = [];
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        // 끝쪽에서 숫자 추출.
        const m = trimmed.match(/^(.*?)[\s|·,()\[\]]+(\d{1,3})\s*점?\s*\)?\s*$/);
        if (m) {
          const label = m[1].trim();
          const points = Number(m[2]);
          if (label.length > 0 && points >= 0 && points <= 100) {
            items.push({ label, points });
            continue;
          }
        }
        // 점수 없는 줄은 1점.
        items.push({ label: trimmed, points: 1 });
      }
      return items.length > 0 ? items : null;
    })(),
    origin: String(fd.get("origin") ?? "past_exam"),
    format: String(fd.get("format") ?? "mc_short"),
    polarity: stringOrNull(fd.get("polarity")),
    scope: stringOrNull(fd.get("scope")),
    year: numberOrNull(fd.get("year")),
    exam_round_no: numberOrNull(fd.get("examRoundNo")),
    problem_number: numberOrNull(fd.get("problemNumber")),
    updated_at: new Date().toISOString(),
    ...(primaryArticleIdUpdate ?? {}),
    ...(primaryNodeIdUpdate ?? {}),
    ...(andReview
      ? {
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          mismatch_flagged_at: null,
          mismatch_flagged_by: null,
        }
      : {}),
  };
  const { error: pErr } = await client
    .from("problems")
    .update(update)
    .eq("problem_id", problemId);
  if (pErr) return { ok: false, error: pErr.message } as const;

  // choices — 각 choice 별로 독립 update. correct_index + 관련 조문/판례.
  // 복수정답 — 체크된 정답 지문 전부(correctIndexes). 하나만 선택해도 정답 인정은 풀이 화면 채점이 처리.
  const correctIndexes = new Set<number>(
    fd
      .getAll("correctIndexes")
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n)),
  );
  const choiceCount = numberOrNull(fd.get("choiceCount")) ?? 0;

  // 같은 law 의 article_number → article_id 매핑은 한 번만 가져온다.
  // 위에서 이미 curProblem.law_id 를 조회했으므로 재사용.
  const curLawId = curProblem?.law_id ?? null;
  const articleIdByNumber = new Map<string, string>();
  if (curLawId) {
    const { data: arts } = await client
      .from("articles")
      .select("article_id, article_number")
      .eq("law_id", curLawId)
      .is("deleted_at", null)
      .not("article_number", "is", null);
    for (const a of arts ?? []) {
      if (a.article_number) articleIdByNumber.set(a.article_number, a.article_id);
    }
  }

  for (let i = 1; i <= choiceCount; i++) {
    const choiceId = String(fd.get(`choice_${i}_id`) ?? "");
    if (!choiceId) continue;
    const choiceType = stringOrNull(fd.get(`choice_${i}_type`));
    const articleNumber = stringOrNull(fd.get(`choice_${i}_article_number`));
    const caseNumber = stringOrNull(fd.get(`choice_${i}_case_number`));
    const articleId = articleNumber ? articleIdByNumber.get(articleNumber) ?? null : null;
    // feat-4-A-342 — 지문 체계도 소분류.
    const cNodeIdRaw = stringOrNull(fd.get(`choice_${i}_node_id`));
    const cNodeId = cNodeIdRaw && UUID_RE.test(cNodeIdRaw) ? cNodeIdRaw : null;
    const oxIneligibleSubmitted = fd.get(`choice_${i}_ox_ineligible`) === "1";
    const oxTruthRaw = stringOrNull(fd.get(`choice_${i}_ox_truth`));
    const oxTruth =
      oxIneligibleSubmitted ? null : oxTruthRaw === "O" || oxTruthRaw === "X" ? oxTruthRaw : null;
    const cUpdate: Record<string, unknown> = {
      body_md: String(fd.get(`choice_${i}_body`) ?? ""),
      explanation_md: stringOrNull(fd.get(`choice_${i}_explanation`)),
      choice_type: choiceType,
      is_correct: correctIndexes.has(i),
      // 조문 ref: 어떤 type 이든 articleNumber 가 채워져 있으면 저장 (판례도 관련 조문을 함께 보관).
      related_article_number: articleNumber,
      related_article_id: articleId,
      related_node_id: cNodeId,
      // 판례번호는 precedent 일 때만 의미 있음.
      related_case_number: choiceType === "precedent" ? caseNumber : null,
      // OX 자동 연결 부적합 표기.
      ox_ineligible: oxIneligibleSubmitted,
      // 정/오 라벨 — 부적합이면 강제 null.
      ox_truth: oxTruth,
    };
    const { error: cErr } = await client
      .from("problem_choices")
      .update(cUpdate)
      .eq("choice_id", choiceId)
      .eq("problem_id", problemId);
    if (cErr) return { ok: false, error: cErr.message } as const;
  }

  // 박스 항목 update — boxItemIds 가 있는 경우.
  const boxItemIdsRaw = String(fd.get("boxItemIds") ?? "");
  if (boxItemIdsRaw) {
    const boxItemIds = boxItemIdsRaw.split(",").filter(Boolean);
    for (const id of boxItemIds) {
      const bChoiceType = stringOrNull(fd.get(`box_${id}_type`));
      const bArticleNumber = stringOrNull(fd.get(`box_${id}_article_number`));
      const bCaseNumber = stringOrNull(fd.get(`box_${id}_case_number`));
      const bArticleId = bArticleNumber ? articleIdByNumber.get(bArticleNumber) ?? null : null;
      const bNodeIdRaw = stringOrNull(fd.get(`box_${id}_node_id`));
      const bNodeId = bNodeIdRaw && UUID_RE.test(bNodeIdRaw) ? bNodeIdRaw : null;
      const bOxIneligible = fd.get(`box_${id}_ox_ineligible`) === "1";
      const bOxTruthRaw = stringOrNull(fd.get(`box_${id}_ox_truth`));
      const bOxTruth = bOxIneligible
        ? null
        : bOxTruthRaw === "O" || bOxTruthRaw === "X"
          ? bOxTruthRaw
          : null;
      const bUpdate: Record<string, unknown> = {
        body_md: String(fd.get(`box_${id}_body`) ?? ""),
        explanation_md: stringOrNull(fd.get(`box_${id}_explanation`)),
        choice_type: bChoiceType,
        related_article_number: bArticleNumber,
        related_article_id: bArticleId,
        related_node_id: bNodeId,
        related_case_number: bChoiceType === "precedent" ? bCaseNumber : null,
        ox_ineligible: bOxIneligible,
        ox_truth: bOxTruth,
      };
      const { error: bErr } = await client
        .from("problem_box_items")
        .update(bUpdate)
        .eq("box_item_id", id)
        .eq("problem_id", problemId);
      if (bErr) return { ok: false, error: bErr.message } as const;
    }
  }

  // feat-9-001 RAG dirty hook — 문제 본문/보기/박스 변경 청크 재생성.
  runAfterResponse(reindexProblems([problemId]));
  // errata Phase 3 — [저장+발행] 경로: redirect 를 보류하고 원장 revision 묶음 반환.
  // ★문제 저장은 problems + 선지(problem_choices)가 각각 revision 을 만들므로
  //   복수 건을 전부 돌려준다(단건만 돌리면 정답 정정이 발행에서 누락된다 — 지시서 §3.3).
  if (fd.get("publishIntent") === "1") {
    const revisions = await getUnpublishedRevisions(
      client,
      ["mcq", "essay"],
      problemId,
    );
    return {
      ok: true,
      kind: "save_for_publish",
      revisionIds: revisions.map((r) => r.revisionId),
    } as const;
  }
  // viewer "수정" 등 외부에서 진입한 경우 returnTo 가 form 에 carry 됨 — 저장 후
  // 본래 화면으로 복귀. 없으면 기존 동작 그대로 (같은 페이지 + toast).
  const returnToRaw = fd.get("returnTo");
  if (typeof returnToRaw === "string" && returnToRaw.trim() !== "") {
    throw redirect(safeReturnTo(returnToRaw));
  }
  return { ok: true, kind: andReview ? "save_and_review" : "save" } as const;
}

// prev/next 네비게이션 시 같은 라우트의 path param 만 바뀌면 React Router 는
// 컴포넌트를 remount 하지 않는다 → 내부 useState 초기값·<Form> defaultValue 가
// 옛 문제 그대로 남아 "화면이 안 넘어가는" 것처럼 보인다. 외곽 wrapper 의
// `key={problemId}` 로 problemId 가 바뀔 때 inner 컴포넌트를 fresh mount 한다.
export default function AdminProblemEdit(props: Route.ComponentProps) {
  return (
    <AdminProblemEditInner
      key={props.loaderData.problem.problemId}
      {...props}
    />
  );
}

function AdminProblemEditInner({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    problem,
    mcqPacks,
    role,
    siblings,
    subNodeOptions,
    allNodeOptions,
    primaryNodeId,
    placements,
    instructorNotes,
    examinerNoteCount,
  } = loaderData;
  // prev/next 는 진입 시점의 목록 순서로 고정한다(mount-time snapshot). 조문을 바꿔 저장하면
  // 목록이 조문순으로 재정렬돼 형제가 달라지지만, 같은 problemId 동안엔 외곽 key 가 그대로라
  // remount 가 없어 이 snapshot 이 저장 후에도 유지된다. prev/next 로 다른 문제로 이동하면
  // key 변경 → remount → 새 문제 기준으로 재캡처. (저장마다 위치를 다시 찾는 불편 해소)
  const [frozenSiblings] = useState(siblings);
  // feat-4-A-340 — 체계도 소분류 선택. 조문이 (caseOnly 제외) ≥2 노드에 걸릴 때만 노출.
  const [articleNum, setArticleNum] = useState(
    String(problem.primaryArticleNumber ?? ""),
  );
  const [primaryNode, setPrimaryNode] = useState(primaryNodeId ?? "");
  // 목록에서 편집 진입 시 따라오는 필터 쿼리를 보존해 ← 클릭 시 같은 필터 상태로 되돌린다.
  // viewer "수정" 진입은 ?returnTo=<viewer URL> 로 들어오는데, 이 경우 ← 가 그
  // viewer 로 복귀하도록 우선 적용 + form hidden 으로 carry 해 저장 후 redirect.
  const [editSearchParams] = useSearchParams();
  const returnTo = editSearchParams.get("returnTo");
  const backQs = editSearchParams.toString();
  const backTo = returnTo
    ? returnTo
    : backQs
      ? `/admin/problems?${backQs}`
      : "/admin/problems";
  // prev/next 링크 — 현재 필터 쿼리(returnTo 제외) 그대로 보존해 같은 컨텍스트로 이동.
  const navQs = (() => {
    const p = new URLSearchParams(editSearchParams);
    p.delete("returnTo");
    return p.toString();
  })();
  const buildSiblingTo = (id: string) =>
    navQs ? `/admin/problems/${id}?${navQs}` : `/admin/problems/${id}`;
  const prevTo = frozenSiblings.prevId
    ? buildSiblingTo(frozenSiblings.prevId)
    : null;
  const nextTo = frozenSiblings.nextId
    ? buildSiblingTo(frozenSiblings.nextId)
    : null;
  // 메타 중 자식 (ChoiceEditor / BoxItemEditor) 의 자동 OX·기본 종류에 영향을 주는 값은 lift 해서
  // 저장 전에도 즉시 반영되게 한다. origin 은 showRound 토글에 사용.
  const [origin, setOrigin] = useState<ProblemOrigin>(problem.origin);
  const [format, setFormat] = useState<ProblemFormat>(problem.format);
  const [polarity, setPolarity] = useState<ProblemPolarity | "">(
    problem.polarity ?? "",
  );
  // 전체 정오문제 불가 일괄 체크/해제 — 자식 (ChoiceEditor / BoxItemEditor) 에 epoch 신호로 전파.
  const [bulkOxSignal, setBulkOxSignal] = useState<{
    epoch: number;
    ineligible: boolean;
  } | undefined>(undefined);
  const triggerBulkOx = (ineligible: boolean) =>
    setBulkOxSignal((prev) => ({
      epoch: (prev?.epoch ?? 0) + 1,
      ineligible,
    }));
  const showRound = ORIGIN_HAS_ROUND[origin];
  // 복수정답 지원 — 정답 지문 전체.
  const correctIndexes = problem.choices
    .filter((c) => c.isCorrect)
    .map((c) => c.choiceIndex);
  const navigation = useNavigation();
  const submittingIntent =
    navigation.state === "submitting"
      ? String(navigation.formData?.get("intent") ?? "")
      : null;
  const isSaving = submittingIntent === "save";
  const isSavingAndReviewing = submittingIntent === "save_and_review";
  const deleteFetcher = useFetcher();
  const isDeleting = deleteFetcher.state !== "idle";
  const reviewFetcher = useFetcher<{ ok?: boolean; kind?: string; error?: string }>();
  const isReviewing = reviewFetcher.state !== "idle";
  useEffect(() => {
    const r = reviewFetcher.data;
    if (!r) return;
    if (r.ok && r.kind === "review") toast.success("검토 완료로 표시했습니다");
    else if (r.ok && r.kind === "unreview") toast.success("검토 표시를 취소했습니다");
    else if (r.error) toast.error(r.error);
  }, [reviewFetcher.data]);
  const mismatchFetcher = useFetcher<{ ok?: boolean; kind?: string; error?: string }>();
  const isFlagging = mismatchFetcher.state !== "idle";
  // feat-2-032 — 강사 채점평 추가/삭제 fetcher.
  const gradingNoteFetcher = useFetcher<{
    ok?: boolean;
    kind?: string;
    error?: string;
  }>();
  const gnRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const r = gradingNoteFetcher.data;
    if (!r || gradingNoteFetcher.state !== "idle") return;
    if (r.ok && r.kind === "add_grading_note") {
      toast.success("강사 채점평을 추가했습니다");
      gnRef.current?.reset();
    } else if (r.ok && r.kind === "delete_grading_note")
      toast.success("삭제했습니다");
    else if (r.error) toast.error(r.error);
  }, [gradingNoteFetcher.data, gradingNoteFetcher.state]);
  useEffect(() => {
    const r = mismatchFetcher.data;
    if (!r) return;
    if (r.ok && r.kind === "flag_mismatch") toast.success("재검토 필요로 표시했습니다");
    else if (r.ok && r.kind === "unflag_mismatch") toast.success("재검토 표시를 취소했습니다");
    else if (r.error) toast.error(r.error);
  }, [mismatchFetcher.data]);
  // 주관식 체계도 배치 추가/삭제 fetcher.
  const placementFetcher = useFetcher<{
    ok?: boolean;
    kind?: string;
    error?: string;
  }>();
  const placementFormRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const r = placementFetcher.data;
    if (!r || placementFetcher.state !== "idle") return;
    if (r.ok && r.kind === "add_placement") {
      toast.success("체계도 배치를 추가했습니다");
      placementFormRef.current?.reset();
    } else if (r.ok && r.kind === "remove_placement")
      toast.success("배치를 삭제했습니다");
    else if (r.error) toast.error(r.error);
  }, [placementFetcher.data, placementFetcher.state]);
  const [selectedCorrect, setSelectedCorrect] = useState<Set<number>>(
    () => new Set(correctIndexes),
  );
  const toggleCorrect = (idx: number) =>
    setSelectedCorrect((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  useEffect(() => {
    if (!actionData) return;
    if (actionData.ok) {
      const kind = "kind" in actionData ? actionData.kind : null;
      if (kind === "review") toast.success("검토 완료로 표시했습니다");
      else if (kind === "unreview") toast.success("검토 표시를 취소했습니다");
      else if (kind === "flag_mismatch") toast.success("재검토 필요로 표시했습니다");
      else if (kind === "unflag_mismatch") toast.success("재검토 표시를 취소했습니다");
      else if (kind === "save_and_review") toast.success("저장하고 검토 완료로 표시했습니다");
      else toast.success("저장되었습니다");
    } else if (actionData.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);
  return (
    <AdminShell
      cluster={problem.format === "subjective" ? "subjective" : "problems"}
      role={role}
      width={1040}
      title={
        <span className="inline-flex flex-wrap items-baseline gap-2">
          {problem.primaryArticleLabel ?? "조문 미연결"}
          {problem.problemNumber ? (
            <span className="text-muted-foreground text-base font-normal">
              · 문제 #{problem.problemNumber}
            </span>
          ) : null}
          {/* 식별번호 — 인용·Q&A 특정용 전역 고유번호. 클릭 시 복사. */}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(`P-${problem.displayNo}`);
              toast.success(`P-${problem.displayNo} 복사됨`);
            }}
            title="식별번호 복사"
            className="bg-primary/10 text-link hover:bg-primary hover:text-primary-foreground rounded-full px-2.5 py-0.5 font-mono text-sm font-semibold transition"
          >
            P-{problem.displayNo}
          </button>
        </span>
      }
      desc={
        format === "subjective"
          ? "주관식 문제 — 메타·본문·모범답안·채점 기준을 편집합니다. 저장하지 않은 변경 사항은 유실됩니다."
          : "문제 메타·본문·지문·해설·관련 자료를 편집합니다. 저장하지 않은 변경 사항은 유실됩니다."
      }
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          {problem.reviewedAt ? (
            <reviewFetcher.Form method="post">
              <input type="hidden" name="intent" value="unreview" />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={isReviewing}
              >
                <CircleSlashIcon className="size-4" />
                {isReviewing ? "처리 중…" : "검토 표시 취소"}
              </Button>
            </reviewFetcher.Form>
          ) : (
            // 검토 완료 = 현재 폼 변경사항 자동 저장 + 검토 완료 표시.
            // form 속성으로 메인 form 을 가리켜 submit 을 위임한다.
            <Button
              type="submit"
              form={FORM_ID}
              name="intent"
              value="save_and_review"
              size="sm"
              disabled={isSavingAndReviewing || isSaving}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <CheckCircleIcon className="size-4" />
              {isSavingAndReviewing ? "처리 중…" : "검토 완료"}
            </Button>
          )}
          <mismatchFetcher.Form method="post">
            <input
              type="hidden"
              name="intent"
              value={
                problem.mismatchFlaggedAt ? "unflag_mismatch" : "flag_mismatch"
              }
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={isFlagging}
              className={cn(
                problem.mismatchFlaggedAt
                  ? "border-amber-500 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-200"
                  : "border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/20",
              )}
              title="문제와 해설이 매칭되지 않아 재검토가 필요할 때 표시"
            >
              <AlertTriangleIcon className="size-4" />
              {isFlagging
                ? "처리 중…"
                : problem.mismatchFlaggedAt
                  ? "재검토 표시 취소"
                  : "재검토 필요"}
            </Button>
          </mismatchFetcher.Form>
          <Button
            type="submit"
            form={FORM_ID}
            name="intent"
            value="save"
            size="sm"
            disabled={isSaving}
          >
            <SaveIcon className="size-4" /> {isSaving ? "저장 중…" : "저장"}
          </Button>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link
          to={backTo}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <ListIcon className="size-3.5" />
          {returnTo
            ? "이전 화면으로"
            : format === "subjective"
              ? "주관식 문제 목록"
              : "객관식 문제 목록"}
        </Link>
        {frozenSiblings.total > 0 ? (
          <div className="flex items-center gap-1.5">
            {prevTo ? (
              <Button asChild size="sm" variant="outline">
                <Link to={prevTo} prefetch="intent" title="이전 문제 (같은 필터)">
                  <ChevronLeftIcon className="size-4" /> 이전
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled>
                <ChevronLeftIcon className="size-4" /> 이전
              </Button>
            )}
            <span className="text-muted-foreground px-1 text-[11px] tabular-nums">
              {frozenSiblings.position} / {frozenSiblings.total}
            </span>
            {nextTo ? (
              <Button asChild size="sm" variant="outline">
                <Link to={nextTo} prefetch="intent" title="다음 문제 (같은 필터)">
                  다음 <ChevronRightIcon className="size-4" />
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled>
                다음 <ChevronRightIcon className="size-4" />
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {format === "subjective" ? (
          <Chip tone="violet">주관식 (2차)</Chip>
        ) : null}
        {problem.mismatchFlaggedAt ? (
          <Chip tone="amber">
            <AlertTriangleIcon className="size-3" />
            재검토 필요 ·{" "}
            {new Date(problem.mismatchFlaggedAt).toLocaleDateString("ko-KR")}
          </Chip>
        ) : problem.reviewedAt ? (
          <Chip tone="emerald">
            <CheckCircleIcon className="size-3" />
            검토 완료 ·{" "}
            {new Date(problem.reviewedAt).toLocaleDateString("ko-KR")}
          </Chip>
        ) : (
          <Chip tone="neutral">미검토</Chip>
        )}
      </div>

      <PublishChecklist problem={problem} mcqPacks={mcqPacks} />

      <Form method="post" id={FORM_ID} className="space-y-4">
        <input
          type="hidden"
          name="choiceCount"
          value={problem.choices.length}
        />
        {returnTo ? (
          <input type="hidden" name="returnTo" value={returnTo} />
        ) : null}

        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              메타
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <FormSelect
              name="origin"
              label="출처"
              value={origin}
              onChange={(v) => setOrigin(v as ProblemOrigin)}
              options={ORIGINS.map((v) => ({
                value: v,
                label: ORIGIN_LABEL[v],
              }))}
            />
            <FormSelect
              name="format"
              label="유형"
              value={format}
              onChange={(v) => setFormat(v as ProblemFormat)}
              options={FORMATS.map((v) => ({
                value: v,
                label: FORMAT_LABEL[v],
              }))}
            />
            <FormSelect
              name="polarity"
              label="극성"
              value={polarity}
              onChange={(v) => setPolarity(v as ProblemPolarity | "")}
              options={[
                { value: "", label: "—" },
                ...POLARITIES.map((v) => ({
                  value: v,
                  label: POLARITY_LABEL[v],
                })),
              ]}
            />
            <FormSelect
              name="scope"
              label="단원 / 종합"
              defaultValue={problem.scope ?? ""}
              options={[
                { value: "", label: "—" },
                ...SCOPES.map((v) => ({ value: v, label: SCOPE_LABEL[v] })),
              ]}
            />
            <FormInput
              name="year"
              label="연도"
              type="number"
              defaultValue={problem.year ?? ""}
              disabled={!showRound}
            />
            <FormInput
              name="examRoundNo"
              label="회차"
              type="number"
              defaultValue={problem.examRoundNo ?? ""}
              disabled={!showRound}
            />
            <FormInput
              name="problemNumber"
              label="문제 번호"
              type="number"
              defaultValue={problem.problemNumber ?? ""}
            />
            <FormInput
              name="articleNumber"
              label="조문"
              value={articleNum}
              onChange={setArticleNum}
              placeholder="예: 29 / 28의2 (비우면 미연결)"
            />
            <FormSelect
              name="primaryNodeId"
              label="체계도 단원 (고정 배치)"
              value={primaryNode}
              onChange={setPrimaryNode}
              options={[
                { value: "", label: "(자동 — 조문 연결 노드에 파생)" },
                ...allNodeOptions.map((o) => ({
                  value: o.nodeId,
                  label: o.label,
                })),
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              본문
            </p>
          </CardHeader>
          <CardContent>
            <ExplanationEditor
              name="bodyMd"
              defaultValue={problem.bodyMd}
              rows={4}
              placeholder="문제 발문 — markdown 표·이미지·수식 가능. 미리보기로 표/이미지 렌더를 확인하세요."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              종합 해설 (Markdown · 표/그림 가능)
            </p>
          </CardHeader>
          <CardContent>
            <ExplanationEditor defaultValue={problem.explanationMd ?? ""} rows={10} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              풀이 동영상 URL (강사 업로드 — 외부 링크)
            </p>
          </CardHeader>
          <CardContent>
            <Field hint="빈 값으로 저장하면 학생 viewer 에서 동영상 풀이 버튼이 숨겨집니다.">
              <Input
                name="videoUrl"
                type="url"
                maxLength={2000}
                defaultValue={problem.videoUrl ?? ""}
                placeholder="https://www.youtube.com/watch?v=…"
                data-testid="problem-video-url"
              />
            </Field>
          </CardContent>
        </Card>

        {format === "subjective" ? (
          <>
            <Card>
              <CardHeader>
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  주관식 분류 라벨
                </p>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Field label="유형" htmlFor="subjectiveKind">
                  <AdminSelect
                    id="subjectiveKind"
                    name="subjectiveKind"
                    defaultValue={problem.subjectiveKind ?? ""}
                    className="w-full"
                    data-testid="problem-subjective-kind"
                  >
                    <option value="">미지정</option>
                    <option value="case_based">사례형</option>
                    <option value="theory">논점형</option>
                    <option value="mixed">혼합형</option>
                  </AdminSelect>
                </Field>
                <Field label="주제(논점)" htmlFor="subjectiveTopic">
                  <Input
                    id="subjectiveTopic"
                    name="subjectiveTopic"
                    maxLength={200}
                    defaultValue={problem.subjectiveTopic ?? ""}
                    placeholder="예: 신규성 의제와 공지 예외의 관계"
                    data-testid="problem-subjective-topic"
                  />
                </Field>
                <Field
                  label="키워드 (콤마 구분)"
                  htmlFor="subjectiveKeywords"
                  className="sm:col-span-2"
                >
                  <Input
                    id="subjectiveKeywords"
                    name="subjectiveKeywords"
                    maxLength={500}
                    defaultValue={(problem.subjectiveKeywords ?? []).join(", ")}
                    placeholder="쉼표로 구분 — 예: 신규성, 공지예외, 우선권주장"
                    data-testid="problem-subjective-keywords"
                  />
                </Field>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  주관식 모범답안 (Markdown)
                </p>
              </CardHeader>
              <CardContent>
                <Textarea
                  name="modelAnswerMd"
                  rows={10}
                  defaultValue={problem.modelAnswerMd ?? ""}
                  placeholder="목차 + 본문 — 학생이 '모범답안 보기' 클릭 시 노출됩니다."
                  data-testid="problem-model-answer"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  채점 기준 (Markdown — 자유 기술)
                </p>
              </CardHeader>
              <CardContent>
                <Textarea
                  name="gradingRubricMd"
                  rows={6}
                  defaultValue={problem.gradingRubricMd ?? ""}
                  placeholder={
                    "자유 기술 — 학생에게 풀이 방향 안내용"
                  }
                  data-testid="problem-grading-rubric"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  채점 항목 체크리스트 (구조화 · 자기채점 UI)
                </p>
              </CardHeader>
              <CardContent>
                <Textarea
                  name="rubricItemsText"
                  rows={6}
                  defaultValue={(problem.rubricItems ?? [])
                    .map((it) => `${it.label} | ${it.points}`)
                    .join("\n")}
                  placeholder={
                    "한 줄에 하나씩 — '항목 | 배점' 형식\n예) 신규성 요건 정의 | 10\n공지 예외 사유 | 10\n사례 적용 | 10"
                  }
                  data-testid="problem-rubric-items"
                />
                <p className="text-muted-foreground mt-1 text-[11px]">
                  학생 viewer 에서 체크리스트로 변환되어 자기채점 점수 산출.
                </p>
              </CardContent>
            </Card>
          </>
        ) : null}

        {problem.boxItems.length > 0 ? (
          <Card>
            <CardHeader>
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                박스 보기 ({problem.boxItems.length})
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <input type="hidden" name="boxItemIds" value={problem.boxItems.map((bi) => bi.boxItemId).join(",")} />
              {problem.boxItems.map((bi) => (
                <BoxItemEditor
                  key={bi.boxItemId}
                  item={bi}
                  polarity={polarity || null}
                  format={format}
                  correctChoiceBody={
                    problem.choices.find((c) => selectedCorrect.has(c.choiceIndex))?.bodyMd ?? null
                  }
                  bulkOxSignal={bulkOxSignal}
                  subNodeOptions={subNodeOptions}
                />
              ))}
            </CardContent>
          </Card>
        ) : null}

        {/* 지문·정오문제 도구는 객관식 전용 — 주관식은 지문이 없어 카드 전체 숨김. */}
        {format !== "subjective" ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                지문 ({problem.choices.length}){problem.boxItems.length > 0 ? ` + 박스 보기 (${problem.boxItems.length})` : ""}
              </p>
              <div className="flex items-center gap-2">
                {problem.unclassifiedChoices > 0 ? (
                  <Chip tone="amber">미분류 {problem.unclassifiedChoices}</Chip>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => triggerBulkOx(true)}
                  title="모든 지문/박스 항목의 정오문제 불가를 일괄 체크"
                >
                  전체 정오문제 불가
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => triggerBulkOx(false)}
                  title="정오문제 불가 일괄 해제"
                >
                  해제
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {problem.choices.map((c) => (
              <ChoiceEditor
                key={c.choiceId}
                choice={c}
                multiCorrect
                selectedAsCorrect={selectedCorrect.has(c.choiceIndex)}
                onCorrect={() => toggleCorrect(c.choiceIndex)}
                polarity={polarity || null}
                format={format}
                bulkOxSignal={bulkOxSignal}
                subNodeOptions={subNodeOptions}
              />
            ))}
          </CardContent>
        </Card>
        ) : null}

        <div className="flex items-center justify-end">
          <Button type="submit" name="intent" value="save" disabled={isSaving}>
            <SaveIcon className="size-4" /> {isSaving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </Form>

      {format === "subjective" ? (
        <div className="border-border mt-8 rounded-xl border p-5">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold">체계도 배치 (설문별 논점)</h3>
            <p className="text-muted-foreground text-[11px]">
              주관식은 설문별 메인 논점 기준으로 여러 노드에 배치됩니다. 수정
              즉시 주관식 탭 트리 카운트·노드 필터·카드 배지에 반영됩니다.
            </p>
          </div>

          {placements.length > 0 ? (
            <ul className="mb-4 space-y-1.5">
              {placements.map((pl) => (
                <li
                  key={pl.linkId}
                  className="border-border bg-muted/20 flex items-center gap-2 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{pl.label}</p>
                    {pl.note ? (
                      <p className="text-muted-foreground truncate text-[11px]">
                        {pl.note}
                      </p>
                    ) : null}
                  </div>
                  <placementFetcher.Form method="post">
                    <input
                      type="hidden"
                      name="intent"
                      value="remove_placement"
                    />
                    <input type="hidden" name="linkId" value={pl.linkId} />
                    <button
                      type="submit"
                      className="text-muted-foreground hover:text-destructive text-[11px] font-semibold"
                      title="이 배치 삭제"
                      disabled={placementFetcher.state !== "idle"}
                    >
                      삭제
                    </button>
                  </placementFetcher.Form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mb-4 rounded-lg border border-dashed py-4 text-center text-xs">
              배치된 체계도 노드가 없습니다.
            </p>
          )}

          <placementFetcher.Form
            method="post"
            ref={placementFormRef}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="intent" value="add_placement" />
            <AdminSelect
              name="nodeId"
              defaultValue=""
              required
              className="min-w-0 flex-1"
              aria-label="배치할 체계도 노드"
            >
              <option value="" disabled>
                배치할 노드 선택…
              </option>
              {allNodeOptions.map((o) => (
                <option key={o.nodeId} value={o.nodeId}>
                  {o.label}
                </option>
              ))}
            </AdminSelect>
            <Input
              name="placementNote"
              maxLength={200}
              placeholder="메모(선택) — 예: 설문(2) — §128 손해배상"
              className="w-64"
            />
            <Button
              type="submit"
              size="sm"
              disabled={placementFetcher.state !== "idle"}
            >
              배치 추가
            </Button>
          </placementFetcher.Form>
        </div>
      ) : null}

      {format === "subjective" ? (
        <div className="border-border mt-8 rounded-xl border p-5">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold">강사 채점평 · 예시답안</h3>
            <p className="text-muted-foreground text-[11px]">
              실제 채점위원 채점평 {examinerNoteCount}건(자동 적재) 외에, 강사가
              직접 채점평·예시답안을 추가합니다. AI 채점 근거와 학생 열람에 함께
              쓰입니다.
            </p>
          </div>

          {instructorNotes.length > 0 ? (
            <ul className="mb-4 space-y-2">
              {instructorNotes.map((n) => (
                <li
                  key={n.note_id}
                  className="border-border bg-muted/20 rounded-lg border p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-muted-foreground text-[11px] font-semibold">
                      {n.author ? `${n.author} · ` : ""}강사 채점평
                      {n.example_answer_md ? " · 예시답안 포함" : ""}
                    </span>
                    <gradingNoteFetcher.Form method="post">
                      <input
                        type="hidden"
                        name="intent"
                        value="delete_grading_note"
                      />
                      <input type="hidden" name="noteId" value={n.note_id} />
                      <button
                        type="submit"
                        className="text-muted-foreground hover:text-destructive text-[11px] font-semibold"
                        title="이 채점평 삭제"
                      >
                        삭제
                      </button>
                    </gradingNoteFetcher.Form>
                  </div>
                  <p className="text-foreground text-sm whitespace-pre-wrap">
                    {n.body_md.length > 400
                      ? `${n.body_md.slice(0, 400)}…`
                      : n.body_md}
                  </p>
                  {n.example_answer_md ? (
                    <details className="mt-2">
                      <summary className="text-link cursor-pointer text-[11px] font-semibold">
                        예시답안 보기
                      </summary>
                      <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                        {n.example_answer_md}
                      </p>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mb-4 rounded-lg border border-dashed py-4 text-center text-xs">
              등록된 강사 채점평이 없습니다.
            </p>
          )}

          <gradingNoteFetcher.Form
            method="post"
            ref={gnRef}
            className="space-y-2"
          >
            <input type="hidden" name="intent" value="add_grading_note" />
            <input
              name="author"
              placeholder="작성자(선택) — 예: 홍길동 강사"
              className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
            <textarea
              name="bodyMd"
              required
              rows={4}
              placeholder="채점평 (필수) — 이 문제 답안에서 무엇을 보는지, 흔한 감점 등"
              className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
            <textarea
              name="exampleAnswerMd"
              rows={4}
              placeholder="예시답안 (선택) — 목차·본문"
              className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={gradingNoteFetcher.state !== "idle"}
              >
                채점평 추가
              </Button>
            </div>
          </gradingNoteFetcher.Form>
        </div>
      ) : null}

      <div className="border-border/60 mt-8 flex items-center justify-between gap-3 border-t pt-5">
        <p className="text-muted-foreground text-[11px]">
          삭제는 soft delete 로 처리되며 학생 화면에서 즉시 숨겨집니다.
        </p>
        <deleteFetcher.Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={isDeleting}
            onClick={(e) => {
              if (!confirm("이 문제를 삭제하시겠습니까? (soft delete)")) {
                e.preventDefault();
              }
            }}
          >
            <Trash2Icon className="size-4" />
            {isDeleting ? "삭제 중…" : "문제 삭제"}
          </Button>
        </deleteFetcher.Form>
      </div>
    </AdminShell>
  );
}

function FormSelect({
  name,
  label,
  defaultValue,
  value,
  onChange,
  options,
  disabled,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const isControlled = value !== undefined && onChange !== undefined;
  return (
    <Field label={label} htmlFor={name}>
      <AdminSelect
        id={name}
        name={name}
        {...(isControlled
          ? { value, onChange: (e) => onChange!(e.target.value) }
          : { defaultValue: defaultValue ?? "" })}
        disabled={disabled}
        className="w-full disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </AdminSelect>
    </Field>
  );
}

function FormInput({
  name,
  label,
  type = "text",
  defaultValue,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string | number;
  value?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const controlled = value !== undefined && onChange !== undefined;
  return (
    <Field label={label} htmlFor={name}>
      <Input
        id={name}
        type={type}
        name={name}
        disabled={disabled}
        placeholder={placeholder}
        {...(controlled
          ? {
              value,
              onChange: (e: ChangeEvent<HTMLInputElement>) =>
                onChange(e.target.value),
            }
          : { defaultValue })}
      />
    </Field>
  );
}


function stringOrNull(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function numberOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 출제 마무리 체크리스트 — 학생 노출 경로(과목 hub / 조문 정오문제 위젯 / 최신 정보 mcq pack)가
// 모두 연결되어 있는지 한눈에 확인 + 부족한 부분을 한 번에 보강할 수 있는 액션 제공.
function PublishChecklist({
  problem,
  mcqPacks,
}: {
  problem: ProblemDetail;
  mcqPacks: ReadonlyArray<{ packId: string; title: string; isPublished: boolean }>;
}) {
  const isMcq =
    problem.format === "mc_short" ||
    problem.format === "mc_box" ||
    problem.format === "mc_case";
  // mc_box 는 box 지문이 OX 후보, 그 외 mc 계열은 choices.
  // ChoiceEditor/BoxItemEditor 가 노출하는 동일 필드(relatedArticleId, oxTruth, oxIneligible)만
  // 정규화해서 OX 위젯 노출 조건을 한 곳에서 평가한다.
  type OxCandidate = {
    relatedArticleId: string | null;
    oxTruth: ProblemChoice["oxTruth"];
  };
  const oxCandidates: OxCandidate[] = !isMcq
    ? []
    : problem.format === "mc_box"
      ? problem.boxItems
          .filter((b: ProblemBoxItem) => !b.oxIneligible)
          .map((b: ProblemBoxItem) => ({
            relatedArticleId: b.relatedArticleId,
            oxTruth: b.oxTruth,
          }))
      : problem.choices
          .filter((c: ProblemChoice) => !c.oxIneligible)
          .map((c: ProblemChoice) => ({
            relatedArticleId: c.relatedArticleId,
            oxTruth: c.oxTruth,
          }));
  const oxMissingArticleCount = oxCandidates.filter(
    (c) => c.relatedArticleId === null,
  ).length;
  const oxMissingTruthCount = oxCandidates.filter(
    (c) => c.oxTruth === null,
  ).length;
  const oxReadyCount = oxCandidates.filter(
    (c) => c.relatedArticleId !== null && c.oxTruth !== null,
  ).length;

  const hasPrimary = problem.primaryArticleId !== null;
  const correctChoices = isMcq
    ? problem.choices.filter((c) => c.isCorrect)
    : [];
  const hasCorrect = !isMcq || correctChoices.length > 0;

  const syncFetcher = useFetcher<{
    ok?: boolean;
    kind?: string;
    synced?: number;
    error?: string;
  }>();
  useEffect(() => {
    const r = syncFetcher.data;
    if (!r) return;
    if (r.ok && r.kind === "sync_choice_articles") {
      toast.success(`본문 조문으로 ${r.synced ?? 0}개 항목을 자동 채움`);
    } else if (r.error) {
      toast.error(r.error);
    }
  }, [syncFetcher.data]);
  const isSyncing = syncFetcher.state !== "idle";

  const isSubjective = problem.format === "subjective";

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <h2 className="text-sm font-semibold">출제 마무리 체크리스트</h2>
        <p className="text-muted-foreground text-[11px]">
          {isSubjective
            ? "이 항목을 채워야 학생 주관식 화면(답안 작성·모범답안·자기채점)이 온전하게 동작합니다."
            : "이 항목을 모두 채워야 학생 화면(과목 hub · 조문 정오문제 위젯 · 최신 정보 mcq)에 정상 노출됩니다."}
        </p>
      </CardHeader>
      <CardContent className="grid gap-1.5 text-xs">
        <ChecklistRow
          state={hasPrimary ? "ok" : "warn"}
          label="본문 조문"
          detail={
            hasPrimary
              ? `${problem.primaryArticleLabel} 와 연결됨`
              : "미설정 — 아래 '관련 조문' 영역에 조문번호 입력"
          }
        />
        {isMcq ? (
          <ChecklistRow
            state={hasCorrect ? "ok" : "warn"}
            label="객관식 정답"
            detail={
              hasCorrect && correctChoices.length > 0
                ? `${correctChoices.map((c) => c.choiceIndex).join(", ")}번이 정답`
                : "미설정 — 지문 카드에서 정답 선택"
            }
          />
        ) : null}
        {isMcq ? (
          <ChecklistRow
            state={
              oxCandidates.length === 0
                ? "na"
                : oxMissingArticleCount === 0 && oxMissingTruthCount === 0
                  ? "ok"
                  : "warn"
            }
            label="조문 정오문제 위젯 노출"
            detail={
              oxCandidates.length === 0
                ? "정오문제 후보 지문 없음 (모두 정오문제 불가로 처리됨)"
                : oxMissingArticleCount > 0 || oxMissingTruthCount > 0
                  ? `노출 가능 ${oxReadyCount}/${oxCandidates.length} · 미분류: 조문 ${oxMissingArticleCount}개 · 정오(O/X) ${oxMissingTruthCount}개`
                  : `${oxCandidates.length}개 지문 모두 학생 정오문제 위젯에 노출 가능`
            }
            action={
              hasPrimary && oxMissingArticleCount > 0 ? (
                <syncFetcher.Form method="post">
                  <input
                    type="hidden"
                    name="intent"
                    value="sync_choice_articles"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={isSyncing}
                    className="h-7 px-2 text-[11px]"
                  >
                    {isSyncing ? "동기화 중…" : "본문 조문으로 일괄 채우기"}
                  </Button>
                </syncFetcher.Form>
              ) : null
            }
          />
        ) : null}
        {isMcq ? (
          <ChecklistRow
            state={mcqPacks.length > 0 ? "ok" : "warn"}
            label="최신 정보 mcq pack"
            detail={
              mcqPacks.length === 0
                ? "등록된 pack 없음 — '최신 정보 → 객관식 문제' 진입 경로가 없습니다"
                : `${mcqPacks.length}개 pack 매핑 · 공개 ${mcqPacks.filter((p) => p.isPublished).length}개`
            }
          />
        ) : null}
        {isSubjective ? (
          <>
            <ChecklistRow
              state={
                (problem.modelAnswerMd ?? "").trim() !== "" ? "ok" : "warn"
              }
              label="모범답안"
              detail={
                (problem.modelAnswerMd ?? "").trim() !== ""
                  ? "등록됨 — 학생 '모범답안 보기'에 노출"
                  : "미등록 — 아래 '주관식 모범답안' 카드에서 작성"
              }
            />
            <ChecklistRow
              state={(problem.rubricItems ?? []).length > 0 ? "ok" : "warn"}
              label="채점 항목 체크리스트"
              detail={
                (problem.rubricItems ?? []).length > 0
                  ? `${(problem.rubricItems ?? []).length}개 항목 — 자기채점 UI 활성`
                  : "미구성 — 학생 자기채점 점수 산출 불가"
              }
            />
            <ChecklistRow
              state={
                problem.subjectiveKind &&
                (problem.subjectiveKeywords ?? []).length > 0
                  ? "ok"
                  : "warn"
              }
              label="주관식 분류 (유형·키워드)"
              detail={
                problem.subjectiveKind
                  ? (problem.subjectiveKeywords ?? []).length > 0
                    ? `유형 지정 · 키워드 ${(problem.subjectiveKeywords ?? []).length}개 — 본문 해시태그로 노출`
                    : "유형은 지정됨 · 키워드 미입력 — 입력하면 본문에 해시태그로 노출"
                  : "유형 미지정 — '주관식 분류 라벨' 카드에서 설정"
              }
            />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChecklistRow({
  state,
  label,
  detail,
  action,
}: {
  state: "ok" | "warn" | "na";
  label: string;
  detail: string;
  action?: React.ReactNode;
}) {
  const icon =
    state === "ok" ? (
      <CheckCircleIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
    ) : state === "warn" ? (
      <AlertTriangleIcon className="size-4 text-amber-600 dark:text-amber-400" />
    ) : (
      <CircleSlashIcon className="text-muted-foreground size-4" />
    );
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 leading-relaxed">
        <span className="font-semibold">{label}</span>
        <span className="text-muted-foreground"> — {detail}</span>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
