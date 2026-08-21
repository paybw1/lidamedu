// errata Phase 3 — 발행 모달 데이터(loader) + 발행/재채점 dry-run 액션.
// diff 의 권위는 원장 스냅샷(content_revisions.before/after_snapshot)이다.
import type { Route } from "./+types/publish";

import { data } from "react-router";
import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import type { DohaeBlock } from "~/features/dohae/labels";
import { diffTextNodes } from "~/features/dohae/lib/dohae-edit";
import {
  ANSWER_FIELDS,
  ERRATA_KINDS,
  ERRATA_SEVERITIES,
  type ExamScope,
  examScope,
} from "~/features/errata/labels";
// ★변경 전/후 문구 생성은 공용 모듈이 단일 소유 — 기존 발행분 재계산 스크립트와
//   같은 결과가 나와야 한다(정답 O/X 표기, 구간 라벨).
import {
  MAX_FIELD_TEXT,
  diffFields,
  revisionDiffText,
  snapshotFieldText,
} from "~/features/errata/lib/revision-diff-text";
import { regenerateForRevisions } from "~/features/errata/pdf/regenerate.server";
import { getStaffRole } from "~/features/laws/queries.server";

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

/**
 * 도해 유닛의 사람이 읽는 diff — blocks jsonb 를 텍스트 경로 단위로 비교한다.
 * 바뀐 칸이 여럿이면 한 필드에 줄바꿈으로 모아 싣는다(모달의 before/after 프리필용).
 */
function dohaeFieldDiffs(before: unknown, after: unknown): PublishFieldDiff[] {
  const blocksOf = (snap: unknown): DohaeBlock[] | null => {
    if (!snap || typeof snap !== "object") return null;
    const b = (snap as { blocks?: unknown }).blocks;
    return Array.isArray(b) ? (b as DohaeBlock[]) : null;
  };
  const diffs = diffTextNodes(blocksOf(before), blocksOf(after));
  if (diffs.length === 0) return [];
  const cut = (s: string) =>
    s.length > MAX_FIELD_TEXT ? s.slice(0, MAX_FIELD_TEXT) + "\n…(생략)" : s;
  return [
    {
      field: "본문",
      beforeText: cut(diffs.map((d) => `[${d.label}] ${d.before}`).join("\n")),
      afterText: cut(diffs.map((d) => `[${d.label}] ${d.after}`).join("\n")),
    },
  ];
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
    return a
      ? `${a.laws?.short_label ?? ""} ${a.display_label}`.trim()
      : "조문";
  }
  if (contentType === "dohae") {
    const { data: u } = await client
      .from("dohae_units")
      .select("kind, unit_no, ref_no, title, chapter_no, pdf_page")
      .eq("unit_id", contentId)
      .maybeSingle();
    if (!u) return "도해";
    const no =
      u.kind === "topic" ? String(u.unit_no ?? "") : `참고 ${u.ref_no ?? ""}`;
    return `도해특허법 ${no} ${u.title}${u.pdf_page ? ` (p.${u.pdf_page})` : ""}`;
  }
  if (contentType === "precedent") {
    const { data: c } = await client
      .from("cases")
      .select("case_number, nickname")
      .eq("case_id", contentId)
      .maybeSingle();
    return c
      ? `${c.case_number}${c.nickname ? ` (${c.nickname})` : ""}`
      : "판례";
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
    return data<PublishModalData>(
      { ok: false, error: "revision 지정 없음" },
      { status: 400 },
    );
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user)
    return data<PublishModalData>(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  const role = await getStaffRole(client, user.id);
  if (!role)
    return data<PublishModalData>(
      { ok: false, error: "권한이 없습니다" },
      { status: 403 },
    );

  const { data: rows, error } = await client
    .from("content_revisions")
    .select(
      "revision_id, content_type, content_id, op, changed_fields, effective_date, notice_status, before_snapshot, after_snapshot",
    )
    .in("revision_id", ids);
  if (error)
    return data<PublishModalData>(
      { ok: false, error: error.message },
      { status: 500 },
    );
  const revisionsRaw = (rows ?? []).filter((r) => r.notice_status === "none");
  if (revisionsRaw.length === 0) {
    return data<PublishModalData>(
      { ok: false, error: "발행 가능한(미고지) revision 이 없습니다" },
      { status: 404 },
    );
  }

  const revisions: PublishRevisionInfo[] = revisionsRaw.map((r) => ({
    revisionId: r.revision_id,
    contentType: r.content_type,
    contentId: r.content_id,
    op: r.op,
    changedFields: r.changed_fields ?? [],
    effectiveDate: r.effective_date,
    fieldDiffs:
      // 도해의 blocks 는 유닛 전체 구조를 담은 jsonb — 그대로 덤프하면 사람이 못 읽고
      // 20k 로 잘려 정작 바뀐 곳이 안 보인다. 텍스트 경로 단위 diff 로 바꿔 싣는다.
      r.content_type === "dohae"
        ? dohaeFieldDiffs(r.before_snapshot, r.after_snapshot)
        : diffFields(r.changed_fields ?? []).map((field) => ({
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
  const effectiveDate =
    revisions.find((r) => r.effectiveDate)?.effectiveDate ?? null;
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
    r.changedFields.some((f) =>
      (ANSWER_FIELDS as readonly string[]).includes(f),
    ),
  );

  return data<PublishModalData>({
    ok: true,
    canPublish: role === "manager" || role === "admin",
    contentLabel: await contentLabelOf(
      client,
      revisions[0].contentType,
      revisions[0].contentId,
    ),
    revisions,
    locations,
    regradeSuggested,
  });
}

/**
 * 한 revision 의 변경 전/후 문구 — 바뀐 줄만 남긴다(발행 모달의 프리필과 같은 규칙).
 *
 * ★여러 건을 한 번에 발행할 때 쓴다. 모달은 문구 입력이 하나뿐이라, 그 하나를 N 건에
 *   그대로 복사하면 각 항목이 "다른 항목의 문장까지" 함께 싣게 된다 — 실제로 P-5839 가
 *   같은 문장을 두 번 찍었다(원장 신고 2026-08-21). 2건 이상이면 각자의 스냅샷에서 뽑는다.
 */
const publishSchema = z.object({
  revisionIds: z.array(z.string().uuid()).min(1).max(30),
  kind: z.enum(ERRATA_KINDS.map((k) => k.value) as [string, ...string[]]),
  severity: z.enum(
    ERRATA_SEVERITIES.map((s) => s.value) as [string, ...string[]],
  ),
  title: z.string().min(1).max(300),
  beforeText: z.string().max(MAX_FIELD_TEXT).default(""),
  afterText: z.string().max(MAX_FIELD_TEXT).default(""),
  reason: z.string().max(2000).default(""),
  regrade: z.boolean().default(false),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    throw data("Method Not Allowed", { status: 405 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ ok: false, error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role)
    return data({ ok: false, error: "권한이 없습니다" }, { status: 403 });

  const body: unknown = await request.json();
  const intent = (body as { intent?: string })?.intent;

  // 재채점 dry-run — 영향 인원·건수만 조회 (실행은 Phase 6, 플래그는 발행 시 세움)
  if (intent === "dry_run_regrade") {
    const problemId = z
      .string()
      .uuid()
      .safeParse((body as { problemId?: string })?.problemId);
    if (!problemId.success)
      return data({ ok: false, error: "problemId 필요" }, { status: 400 });
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
    return data(
      { ok: false, error: "발행 권한이 없습니다 (원장·관리자 전용)" },
      { status: 403 },
    );
  }
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return data(
      { ok: false, error: "입력값이 올바르지 않습니다" },
      { status: 400 },
    );
  }
  const p = parsed.data;

  // ★내용 없는 항목은 발행하지 않는다 — 공백만 바뀐 변경이 "변경 전 — / 변경 후 —" 로
  //   찍혀 수험생에게 빈 항목이 배포됐다(P-5839, 2026-08-21). 2건 이상은 서버가
  //   항목별로 문구를 채우므로 이 검사를 건너뛴다.
  if (
    p.revisionIds.length === 1 &&
    !p.beforeText.trim() &&
    !p.afterText.trim()
  ) {
    return data(
      {
        ok: false,
        error:
          "변경 전·후 문구가 모두 비어 있습니다. 공백만 달라진 변경은 발행 대상이 아닙니다.",
      },
      { status: 400 },
    );
  }

  // ★문구는 revision 마다 따로 싣는다. 하나를 N 건에 복사하면 각 항목이 다른 항목의
  //   문장까지 함께 찍는다(P-5839 중복 문장, 2026-08-21). 1건이면 입력한 문구 그대로.
  const single = p.revisionIds.length === 1;
  let snapshots: Array<{
    revision_id: string;
    before_snapshot: unknown;
    after_snapshot: unknown;
    changed_fields: string[] | null;
  }> = [];
  if (!single) {
    const { data: rows, error: snapErr } = await client
      .from("content_revisions")
      .select("revision_id, before_snapshot, after_snapshot, changed_fields")
      .in("revision_id", p.revisionIds);
    if (snapErr)
      return data({ ok: false, error: snapErr.message }, { status: 400 });
    snapshots = rows ?? [];
  }

  const publishedIds: string[] = [];
  for (const revisionId of p.revisionIds) {
    const snap = snapshots.find((r) => r.revision_id === revisionId);
    const text =
      single || !snap
        ? { beforeText: p.beforeText, afterText: p.afterText }
        : revisionDiffText(snap);
    const { data: published, error } = await client.rpc("fn_publish_errata", {
      p_revision_ids: [revisionId],
      p_errata_kind: p.kind,
      p_errata_severity: p.severity,
      p_errata_title: p.title,
      p_errata_payload: {
        before_text: text.beforeText,
        after_text: text.afterText,
        regrade_requested: p.regrade,
      },
      p_errata_reason: p.reason || "",
    });
    if (error)
      return data({ ok: false, error: error.message }, { status: 400 });
    publishedIds.push(...((published ?? []) as string[]));
  }
  if (publishedIds.length === 0) {
    return data(
      {
        ok: false,
        error: "발행된 항목이 없습니다 (이미 발행되었거나 대상 아님)",
      },
      { status: 409 },
    );
  }

  // 재채점 필요 플래그 — 실행은 Phase 6. 상태 필드라 append-only 가드 무접촉.
  if (p.regrade) {
    await client
      .from("content_revisions")
      .update({ requires_regrade: true })
      .in("revision_id", publishedIds);
  }

  // §3.3 — 영향 교재 시트 자동 재렌더. 발행은 이미 커밋 — 렌더 실패는 발행을
  // 롤백하지 않는다(응답 후 실행 + 실패 로그, 어드민 수동 재렌더로 복구).
  runAfterResponse(regenerateForRevisions(publishedIds));

  return data({ ok: true, publishedIds });
}
