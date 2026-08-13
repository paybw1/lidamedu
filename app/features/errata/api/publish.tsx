// errata Phase 3 — 발행 모달 데이터(loader) + 발행/재채점 dry-run 액션.
// diff 의 권위는 원장 스냅샷(content_revisions.before/after_snapshot)이다.
import { data } from "react-router";
import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  ANSWER_FIELDS,
  ERRATA_KINDS,
  ERRATA_SEVERITIES,
  examScope,
  type ExamScope,
} from "~/features/errata/labels";

import type { Route } from "./+types/publish";

const MAX_FIELD_TEXT = 20_000;

export interface PublishFieldDiff {
  field: string;
  beforeText: string;
  afterText: string;
}
export interface PublishRevisionInfo {
  revisionId: string;
  contentType: string;
  contentId: string;
  op: string;
  changedFields: string[];
  effectiveDate: string | null;
  fieldDiffs: PublishFieldDiff[];
}
export interface PublishLocation {
  publicationTitle: string;
  editionLabel: string;
  pageNo: number | null;
  sortKey: number | null;
  tocPath: string | null;
  scope: ExamScope;
  targetExamDate: string | null;
  targetExamDateEstimate: string | null;
}
export interface PublishModalData {
  ok: boolean;
  error?: string;
  canPublish?: boolean;
  contentLabel?: string;
  revisions?: PublishRevisionInfo[];
  locations?: PublishLocation[];
  regradeSuggested?: boolean;
}

function snapshotFieldText(snapshot: unknown, field: string): string {
  if (snapshot == null || typeof snapshot !== "object") return "";
  const v = (snapshot as Record<string, unknown>)[field];
  if (v == null) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v, null, 1);
  return s.length > MAX_FIELD_TEXT ? s.slice(0, MAX_FIELD_TEXT) + "\n…(생략)" : s;
}

// 사람이 읽는 diff 필드 선정 — body_text(GENERATED)가 있으면 원시 body_json 은 숨긴다.
function diffFields(changed: string[]): string[] {
  const set = new Set(changed);
  if (set.has("body_text") && set.has("body_json")) set.delete("body_json");
  set.delete("search_tsv");
  return [...set].sort();
}

async function contentLabelOf(
  client: ReturnType<typeof makeServerClient>[0],
  contentType: string,
  contentId: string,
): Promise<string> {
  if (contentType === "statute") {
    const { data: a } = await client
      .from("articles")
      .select("display_label, laws(short_label)")
      .eq("article_id", contentId)
      .maybeSingle();
    return a ? `${a.laws?.short_label ?? ""} ${a.display_label}`.trim() : "조문";
  }
  if (contentType === "precedent") {
    const { data: c } = await client
      .from("cases")
      .select("case_number, nickname")
      .eq("case_id", contentId)
      .maybeSingle();
    return c ? `${c.case_number}${c.nickname ? ` (${c.nickname})` : ""}` : "판례";
  }
  const { data: p } = await client
    .from("problems")
    .select("display_no, year, problem_number")
    .eq("problem_id", contentId)
    .maybeSingle();
  return p ? `P-${p.display_no}${p.year ? ` · ${p.year}년` : ""}` : "문제";
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .filter((s) => z.string().uuid().safeParse(s).success);
  if (ids.length === 0) {
    return data<PublishModalData>({ ok: false, error: "revision 지정 없음" }, { status: 400 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data<PublishModalData>({ ok: false, error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data<PublishModalData>({ ok: false, error: "권한이 없습니다" }, { status: 403 });

  const { data: rows, error } = await client
    .from("content_revisions")
    .select(
      "revision_id, content_type, content_id, op, changed_fields, effective_date, notice_status, before_snapshot, after_snapshot",
    )
    .in("revision_id", ids);
  if (error) return data<PublishModalData>({ ok: false, error: error.message }, { status: 500 });
  const revisionsRaw = (rows ?? []).filter((r) => r.notice_status === "none");
  if (revisionsRaw.length === 0) {
    return data<PublishModalData>({ ok: false, error: "발행 가능한(미고지) revision 이 없습니다" }, { status: 404 });
  }

  const revisions: PublishRevisionInfo[] = revisionsRaw.map((r) => ({
    revisionId: r.revision_id,
    contentType: r.content_type,
    contentId: r.content_id,
    op: r.op,
    changedFields: r.changed_fields ?? [],
    effectiveDate: r.effective_date,
    fieldDiffs: diffFields(r.changed_fields ?? []).map((field) => ({
      field,
      beforeText: snapshotFieldText(r.before_snapshot, field),
      afterText: snapshotFieldText(r.after_snapshot, field),
    })),
  }));

  // 대상 위치 — publication_content_map 역참조 (매핑 없으면 빈 배열: 발행은 막지 않는다 §4.4)
  const contentIds = [...new Set(revisions.map((r) => r.contentId))];
  const { data: maps } = await client
    .from("publication_content_map")
    .select(
      "content_id, page_no, sort_key, toc_path, publication_editions(edition_label, target_exam_date, target_exam_date_estimate, publications(title))",
    )
    .in("content_id", contentIds);
  const effectiveDate = revisions.find((r) => r.effectiveDate)?.effectiveDate ?? null;
  const locations: PublishLocation[] = (maps ?? []).map((m) => {
    const e = m.publication_editions;
    return {
      publicationTitle: e?.publications?.title ?? "?",
      editionLabel: e?.edition_label ?? "?",
      pageNo: m.page_no,
      sortKey: m.sort_key,
      tocPath: m.toc_path,
      scope: examScope(effectiveDate, e?.target_exam_date ?? null),
      targetExamDate: e?.target_exam_date ?? null,
      targetExamDateEstimate: e?.target_exam_date_estimate ?? null,
    };
  });

  const regradeSuggested = revisions.some((r) =>
    r.changedFields.some((f) => (ANSWER_FIELDS as readonly string[]).includes(f)),
  );

  return data<PublishModalData>({
    ok: true,
    canPublish: role === "manager" || role === "admin",
    contentLabel: await contentLabelOf(client, revisions[0].contentType, revisions[0].contentId),
    revisions,
    locations,
    regradeSuggested,
  });
}

const publishSchema = z.object({
  revisionIds: z.array(z.string().uuid()).min(1).max(30),
  kind: z.enum(ERRATA_KINDS.map((k) => k.value) as [string, ...string[]]),
  severity: z.enum(ERRATA_SEVERITIES.map((s) => s.value) as [string, ...string[]]),
  title: z.string().min(1).max(300),
  beforeText: z.string().max(MAX_FIELD_TEXT).default(""),
  afterText: z.string().max(MAX_FIELD_TEXT).default(""),
  reason: z.string().max(2000).default(""),
  regrade: z.boolean().default(false),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") throw data("Method Not Allowed", { status: 405 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ ok: false, error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ ok: false, error: "권한이 없습니다" }, { status: 403 });

  const body: unknown = await request.json();
  const intent = (body as { intent?: string })?.intent;

  // 재채점 dry-run — 영향 인원·건수만 조회 (실행은 Phase 6, 플래그는 발행 시 세움)
  if (intent === "dry_run_regrade") {
    const problemId = z.string().uuid().safeParse((body as { problemId?: string })?.problemId);
    if (!problemId.success) return data({ ok: false, error: "problemId 필요" }, { status: 400 });
    // 시도 이력은 학생 소유 RLS 라 집계는 adminClient (읽기 전용 카운트)
    const { count: attempts } = await adminClient
      .from("user_problem_attempts")
      .select("attempt_id", { count: "exact", head: true })
      .eq("problem_id", problemId.data);
    const { data: users } = await adminClient
      .from("user_problem_attempts")
      .select("user_id")
      .eq("problem_id", problemId.data);
    const affectedUsers = new Set((users ?? []).map((u) => u.user_id)).size;
    return data({ ok: true, attempts: attempts ?? 0, affectedUsers });
  }

  // 발행 — 원장·관리자 전용 (지시서 §2. DB fn_publish_errata 의 is_publisher 가 이중 가드)
  if (role !== "manager" && role !== "admin") {
    return data({ ok: false, error: "발행 권한이 없습니다 (원장·관리자 전용)" }, { status: 403 });
  }
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return data({ ok: false, error: "입력값이 올바르지 않습니다" }, { status: 400 });
  }
  const p = parsed.data;

  const { data: published, error } = await client.rpc("fn_publish_errata", {
    p_revision_ids: p.revisionIds,
    p_errata_kind: p.kind,
    p_errata_severity: p.severity,
    p_errata_title: p.title,
    p_errata_payload: {
      before_text: p.beforeText,
      after_text: p.afterText,
      regrade_requested: p.regrade,
    },
    p_errata_reason: p.reason || "",
  });
  if (error) return data({ ok: false, error: error.message }, { status: 400 });
  const publishedIds = (published ?? []) as string[];
  if (publishedIds.length === 0) {
    return data({ ok: false, error: "발행된 항목이 없습니다 (이미 발행되었거나 대상 아님)" }, { status: 409 });
  }

  // 재채점 필요 플래그 — 실행은 Phase 6. 상태 필드라 append-only 가드 무접촉.
  if (p.regrade) {
    await client
      .from("content_revisions")
      .update({ requires_regrade: true })
      .in("revision_id", publishedIds);
  }

  return data({ ok: true, publishedIds });
}
