// 판례 등록/수정 API (feat-7-005). staff(instructor/admin) 전용.

import type { Json } from "database.types";
import { data, redirect } from "react-router";
import { z } from "zod";

import { assertSubjectWritable } from "~/core/lib/staff-subject-guard.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { reindexCases } from "~/features/ai-qna/lib/source-chunker.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import {
  CASE_IMAGE_POSITIONS,
  parseCaseImages,
  type CaseImage,
  type CaseImagePosition,
} from "~/features/cases/labels";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECT_SLUGS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/case";

function parseIntList(raw: FormDataEntryValue | null): number[] {
  if (!raw) return [];
  const s = String(raw);
  return s
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter((p) => /^\d+$/.test(p))
    .map((p) => parseInt(p, 10));
}

function parseStringArray(raw: FormDataEntryValue | null): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const courtEnum = z.enum([
  "supreme",
  "patent_court",
  "high_court",
  "district_court",
]);

const upsertSchema = z.object({
  subjectLaws: z.array(z.string()).min(1, "subject_laws 필수"),
  court: courtEnum,
  decidedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  caseNumber: z.string().trim().min(1).max(100),
  caseTitle: z.string().trim().min(1).max(500),
  nickname: z.string().trim().max(100).nullable(),
  isEnBanc: z.boolean(),
  caseType: z.string().trim().max(100).nullable(),
  summaryItems: z
    .array(
      z.object({
        title: z.string().max(500),
        body: z.string().max(20_000),
        // 항목별 비고(코멘트). 빈 문자열은 저장 시 제거 후 commentMd 키 자체를 빼둔다.
        commentMd: z.string().max(20_000).optional(),
      }),
    )
    .max(30),
  reasoningMd: z.string().max(50_000).nullable(),
  // commentSource 는 admin UI 에서 입력 필드 제거됨 — DB 컬럼·기존 데이터는 보존하고,
  // upsert 시 이 필드는 건드리지 않는다(payload 에 comment_source 포함 안 함).
  commentBodyMd: z.string().max(50_000).nullable(),
  // "비고 — 전체 판결문" 블록 표시 분류 (비고/관련판례/평석). 기본 remark.
  commentLabel: z
    .enum(["remark", "related_cases", "commentary"])
    .default("remark"),
  relatedMd: z.string().max(50_000).nullable(),
  // 관련 판례 인용 목록 — 자유 인용 텍스트(+ 선택 사건명 + 요지/내용). 빈 인용은 제거.
  relatedCases: z
    .array(
      z.object({
        citation: z.string().max(300),
        caseTitle: z.string().max(500).nullable().optional(),
        content: z.string().max(20_000).nullable().optional(),
      }),
    )
    .max(50),
  exam1stYears: z.array(z.number().int().min(1990).max(2099)),
  exam2ndYears: z.array(z.number().int().min(1990).max(2099)),
});

// feat-3-213 — 판례집 구조화 본문(book_sections) 편집. 폼에 bookSections 필드가 있을 때만
// 반영(없으면 컬럼 불변). 섹션 0개면 null 저장 → 뷰어가 generic 필드 렌더로 복귀.
const bookSectionsSchema = z
  .array(
    z.object({
      key: z.string().trim().min(1).max(40),
      label: z.string().trim().min(1).max(60),
      source: z.string().max(500).nullable().optional(),
      title: z.string().max(300).nullable().optional(),
      blocks: z
        .array(
          z.union([
            z.object({ type: z.literal("p"), text: z.string().max(20_000) }),
            z.object({
              type: z.literal("table"),
              rows: z
                .array(
                  z
                    .array(
                      z.object({
                        text: z.string().max(4_000),
                        images: z
                          .array(
                            z.object({
                              url: z.string().url().max(1_000),
                              alt: z.string().max(300),
                            }),
                          )
                          .max(10),
                        colSpan: z.number().int().min(1).max(12).optional(),
                        rowSpan: z.number().int().min(1).max(60).optional(),
                      }),
                    )
                    .max(12),
                )
                .max(60),
            }),
          ]),
        )
        .max(80),
    }),
  )
  .max(20);

// 판결전문 PDF storage 버킷.
const FULL_TEXT_PDF_BUCKET = "case-full-text-pdfs";
const FULL_TEXT_PDF_MAX_BYTES = 30 * 1024 * 1024;
const FULL_TEXT_PDF_URL_RE = new RegExp(
  `/storage/v1/object/public/${FULL_TEXT_PDF_BUCKET}/(.+)$`,
);

// 판례 본문 이미지 storage 버킷.
const CASE_IMAGES_BUCKET = "case-images";
const CASE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const CASE_IMAGE_ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
]);
const CASE_IMAGE_URL_RE = new RegExp(
  `/storage/v1/object/public/${CASE_IMAGES_BUCKET}/(.+)$`,
);

// CaseImage[] → Supabase Json. interface 의 strict 필드는 jsonb 컬럼 타입(Json)과
// 직접 호환되지 않으므로 round-trip 으로 plain object 로 변환.
function imagesToJson(arr: CaseImage[]): Json {
  return JSON.parse(JSON.stringify(arr)) as Json;
}

function emptyToNull(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

// returnTo 화이트리스트 — open-redirect 방지. 우리 도메인 안의 안전 경로만 허용.
//   1) /admin/cases  — admin 목록·필터 보존
//   2) /subjects/<slug>/cases/<uuid> — 학생/공개 판례 본문 (case-body 의 "수정" 진입점)
// 그 외(외부 URL, `//evil.com`, `/admin/users` 등)는 모두 기본값으로 대체.
// admin-case-edit.tsx loader 와 동일 함수 — 두 곳에 두지만 5줄짜리 정규식이라 lib 분리 보류.
function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//"))
    return "/admin/cases?law=patent";
  if (/^\/admin\/cases(\/|\?|$)/.test(raw)) return raw;
  // 학생/공개 뷰어 계열(학습과목 subjects·학습정보 latest) 전반 — 판례 본문·체계도·flow 등
  // 진입 경로 변형(query 포함)을 모두 수용. 같은 도메인 내부 경로라 open-redirect 안전.
  if (/^\/subjects\//.test(raw)) return raw;
  if (/^\/latest\/cases(\/|\?|$)/.test(raw)) return raw;
  return "/admin/cases?law=patent";
}

// GET(브라우저 직접 접근 등) — POST 전용 리소스 라우트라 loader 가 없으면 React Router 가
// 500(Unexpected Server Error)을 던진다. 안내와 함께 405 로 정중히 거절.
// (★data() 는 리소스 라우트 GET 에서 status 미전파 — Response.json 사용)
export async function loader() {
  return Response.json(
    { error: "POST 전용 API 입니다. 판례 수정 화면(/admin/cases)에서 사용됩니다." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  // feat-7-041 — 강사는 담당 과목 판례만 쓰기 가능(admin/manager 전 과목).
  // 대상 판례의 subject_laws(복수 과목 가능) 중 하나라도 담당이면 허용.
  if (role === "instructor") {
    const targetCaseId = String(fd.get("caseId") ?? "");
    if (z.string().uuid().safeParse(targetCaseId).success) {
      const { data: target } = await client
        .from("cases")
        .select("subject_laws")
        .eq("case_id", targetCaseId)
        .maybeSingle();
      await assertSubjectWritable(role, user.id, target?.subject_laws ?? []);
    } else {
      // 신규 등록 — 폼의 과목 필드 기준.
      const subj = emptyToNull(fd.get("subjectLaws")) ?? emptyToNull(fd.get("law"));
      await assertSubjectWritable(role, user.id, subj ? subj.split(",").map((s) => s.trim()) : []);
    }
  }

  if (intent === "delete") {
    const caseId = String(fd.get("caseId") ?? "");
    if (!z.string().uuid().safeParse(caseId).success) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    // 삭제 후 redirect 대상 결정에 필요한 placement·subject 정보를 미리 조회.
    // viewer URL 로 그대로 보내면 그 case 는 deleted_at 으로 404 가 떨어진다 →
    // 노드(또는 조문) 목록 URL 로 변환해 같은 컨텍스트를 유지한다.
    const { data: kase } = await client
      .from("cases")
      .select("primary_node_id, primary_article_id, subject_laws")
      .eq("case_id", caseId)
      .maybeSingle();
    const { error } = await client
      .from("cases")
      .update({ deleted_at: new Date().toISOString() })
      .eq("case_id", caseId);
    if (error) return data({ error: error.message }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "case.delete",
      entityType: "case",
      entityId: caseId,
    });
    const returnToRaw = fd.get("returnTo");
    const returnToStr = typeof returnToRaw === "string" ? returnToRaw : "";
    const isViewerReturn =
      /^\/subjects\/[a-z_-]+\/cases\/[a-f0-9-]+(\?|#|$)/i.test(returnToStr);
    if (isViewerReturn && kase) {
      const slug = (kase.subject_laws ?? [])[0] ?? "patent";
      const params = new URLSearchParams();
      params.set("tab", "cases");
      if (kase.primary_node_id) {
        params.set("case_node", kase.primary_node_id);
      } else if (kase.primary_article_id) {
        params.set("case_article", kase.primary_article_id);
      }
      return redirect(`/subjects/${slug}?${params.toString()}`);
    }
    return redirect(safeReturnTo(returnToRaw));
  }

  if (intent === "upload_full_text_pdf" || intent === "remove_full_text_pdf") {
    const caseId = String(fd.get("caseId") ?? "");
    if (!z.string().uuid().safeParse(caseId).success) {
      return data({ error: "Invalid caseId" }, { status: 400 });
    }

    // 기존 PDF 가 storage 에 있으면 우선 제거 (교체/제거 공통). 외부 URL 은 best-effort skip.
    const { data: existing } = await client
      .from("cases")
      .select("full_text_pdf, case_number")
      .eq("case_id", caseId)
      .maybeSingle();
    const existingUrl = existing?.full_text_pdf ?? null;
    if (existingUrl) {
      const m = existingUrl.match(FULL_TEXT_PDF_URL_RE);
      if (m) {
        await client.storage.from(FULL_TEXT_PDF_BUCKET).remove([m[1]]);
      }
    }

    if (intent === "remove_full_text_pdf") {
      const { error } = await client
        .from("cases")
        .update({ full_text_pdf: null })
        .eq("case_id", caseId);
      if (error) return data({ error: error.message }, { status: 400 });
      void logAuditEvent({
        actorId: user.id,
        actorRole: role,
        action: "case.remove_full_text_pdf",
        entityType: "case",
        entityId: caseId,
      });
      return data({ ok: true });
    }

    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return data({ error: "파일이 없습니다." }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return data({ error: "PDF 파일만 업로드 가능합니다." }, { status: 400 });
    }
    if (file.size > FULL_TEXT_PDF_MAX_BYTES) {
      return data({ error: "파일이 30MB 를 초과합니다." }, { status: 400 });
    }

    const ts = Date.now();
    const safeBase = (file.name || "case.pdf")
      .replace(/\\/g, "/")
      .split("/")
      .pop()!
      .replace(/[^\w.-]+/g, "_")
      .slice(-80);
    const objectPath = `${caseId}/${ts}-${safeBase}`;

    const { error: upErr } = await client.storage
      .from(FULL_TEXT_PDF_BUCKET)
      .upload(objectPath, file, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (upErr) return data({ error: upErr.message }, { status: 400 });

    const { data: pub } = client.storage
      .from(FULL_TEXT_PDF_BUCKET)
      .getPublicUrl(objectPath);
    const publicUrl = pub.publicUrl;

    const { error: updErr } = await client
      .from("cases")
      .update({ full_text_pdf: publicUrl })
      .eq("case_id", caseId);
    if (updErr) return data({ error: updErr.message }, { status: 400 });

    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "case.upload_full_text_pdf",
      entityType: "case",
      entityId: caseId,
      metadata: {
        caseNumber: existing?.case_number ?? null,
        bytes: file.size,
      },
    });
    return data({ ok: true, url: publicUrl });
  }

  // ── 메인 조문 + 발명 sub-node placement 단일 결정 (feat-7-005 후속) ─
  // primary_article_id 가 set 되면 그 case 는 단일 위치에 표시됨.
  // primary_article_id 가 발명(제2조) 인 경우만 primary_node_id 도 함께 받음.
  if (intent === "set_primary_placement") {
    const caseId = String(fd.get("caseId") ?? "");
    if (!z.string().uuid().safeParse(caseId).success) {
      return data({ error: "Invalid caseId" }, { status: 400 });
    }
    const articleIdRaw = String(fd.get("articleId") ?? "");
    const nodeIdRaw = String(fd.get("nodeId") ?? "");
    const articleId =
      articleIdRaw && z.string().uuid().safeParse(articleIdRaw).success
        ? articleIdRaw
        : null;
    const nodeId =
      nodeIdRaw && z.string().uuid().safeParse(nodeIdRaw).success
        ? nodeIdRaw
        : null;
    const { error } = await client
      .from("cases")
      .update({ primary_article_id: articleId, primary_node_id: nodeId })
      .eq("case_id", caseId);
    if (error) return data({ error: error.message }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "case.set_primary_placement",
      entityType: "case",
      entityId: caseId,
      metadata: { articleId, nodeId },
    });
    return data({ ok: true });
  }

  // ── (legacy) add_systematic / remove_systematic — 사용 안 함. ──────
  // 사용자 결정에 따라 단일 placement 모델로 전환됨. set_primary_placement 사용.
  if (intent === "add_systematic" || intent === "remove_systematic") {
    return data(
      { error: "deprecated — use set_primary_placement" },
      { status: 410 },
    );
  }

  // ── 체계도 위치(source_seq) 재배열 — 같은 placement(primary_node_id 우선,
  //     없으면 primary_article_id) 형제 case 들의 순서를 staff 가 수동 조정.
  //     direction:
  //       up / down            — 인접 형제와 swap
  //       first / last         — 맨 위/아래로
  //       to_position(+pos N)  — 1-base 위치 N 으로 이동
  //     매 호출마다 모든 형제의 source_seq 를 1..N 으로 renumber (작은 set 라 안전).
  if (intent === "move_source_seq") {
    const caseId = String(fd.get("caseId") ?? "");
    if (!z.string().uuid().safeParse(caseId).success) {
      return data({ error: "Invalid caseId" }, { status: 400 });
    }
    const direction = String(fd.get("direction") ?? "");
    const positionRaw = String(fd.get("position") ?? "");
    const targetPosition = positionRaw && /^\d+$/.test(positionRaw)
      ? parseInt(positionRaw, 10)
      : null;

    // 1) 현재 case 의 placement key
    const { data: me, error: meErr } = await client
      .from("cases")
      .select("primary_node_id, primary_article_id, case_number")
      .eq("case_id", caseId)
      .maybeSingle();
    if (meErr) return data({ error: meErr.message }, { status: 400 });
    if (!me) return data({ error: "case 를 찾을 수 없음" }, { status: 404 });
    const useNode = me.primary_node_id !== null;
    const placementId = me.primary_node_id ?? me.primary_article_id;
    if (!placementId) {
      return data(
        { error: "메인 조문/노드가 설정되지 않은 case 는 순서 조정 불가" },
        { status: 400 },
      );
    }

    // 2) 형제 cases 조회 (source_seq 정렬)
    let q = client
      .from("cases")
      .select("case_id, case_number, source_seq")
      .is("deleted_at", null);
    q = useNode
      ? q.eq("primary_node_id", placementId)
      : q
          .eq("primary_article_id", placementId)
          .is("primary_node_id", null);
    const { data: siblings, error: sibErr } = await q
      .order("source_seq", { ascending: true, nullsFirst: false })
      .order("case_number", { ascending: true });
    if (sibErr) return data({ error: sibErr.message }, { status: 400 });
    if (!siblings || siblings.length === 0) {
      return data({ error: "형제 case 가 없음" }, { status: 400 });
    }

    const idx = siblings.findIndex((s) => s.case_id === caseId);
    if (idx < 0) {
      return data({ error: "형제 목록에 현재 case 없음" }, { status: 400 });
    }

    // 3) 새 위치 계산 (0-based)
    let newIdx: number;
    switch (direction) {
      case "up":
        newIdx = Math.max(0, idx - 1);
        break;
      case "down":
        newIdx = Math.min(siblings.length - 1, idx + 1);
        break;
      case "first":
        newIdx = 0;
        break;
      case "last":
        newIdx = siblings.length - 1;
        break;
      case "to_position": {
        if (targetPosition === null) {
          return data({ error: "position 값이 필요합니다" }, { status: 400 });
        }
        const clamped = Math.max(
          1,
          Math.min(siblings.length, targetPosition),
        );
        newIdx = clamped - 1;
        break;
      }
      default:
        return data({ error: "Unknown direction" }, { status: 400 });
    }

    if (newIdx === idx) {
      return data({ ok: true, noop: true });
    }

    // 4) 재정렬 + 1..N renumber
    const reordered = [...siblings];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(newIdx, 0, moved);

    const updates: { case_id: string; source_seq: number }[] = [];
    for (let i = 0; i < reordered.length; i++) {
      const newSeq = i + 1;
      if (reordered[i].source_seq !== newSeq) {
        updates.push({ case_id: reordered[i].case_id, source_seq: newSeq });
      }
    }
    // 병렬 update — 형제 set 는 작아 (보통 < 20) 부담 없음.
    const results = await Promise.all(
      updates.map((u) =>
        client
          .from("cases")
          .update({ source_seq: u.source_seq })
          .eq("case_id", u.case_id),
      ),
    );
    const firstErr = results.find((r) => r.error);
    if (firstErr?.error) {
      return data({ error: firstErr.error.message }, { status: 400 });
    }

    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "case.move_source_seq",
      entityType: "case",
      entityId: caseId,
      metadata: {
        caseNumber: me.case_number,
        placementKind: useNode ? "node" : "article",
        placementId,
        from: idx + 1,
        to: newIdx + 1,
      },
    });
    return data({ ok: true, from: idx + 1, to: newIdx + 1 });
  }

  // ── 판례 본문 이미지 (feat-7-005 후속) ──────────────────────────────
  if (
    intent === "upload_image" ||
    intent === "remove_image" ||
    intent === "update_image_meta"
  ) {
    const caseId = String(fd.get("caseId") ?? "");
    if (!z.string().uuid().safeParse(caseId).success) {
      return data({ error: "Invalid caseId" }, { status: 400 });
    }

    const { data: existing } = await client
      .from("cases")
      .select("images, case_number")
      .eq("case_id", caseId)
      .maybeSingle();
    const existingImages = parseCaseImages(existing?.images ?? []);

    // ── 업로드 ──
    if (intent === "upload_image") {
      const file = fd.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return data({ error: "파일이 없습니다." }, { status: 400 });
      }
      if (!CASE_IMAGE_ALLOWED.has(file.type)) {
        return data(
          { error: "지원 형식: JPG / PNG / WEBP / GIF / BMP." },
          { status: 400 },
        );
      }
      if (file.size > CASE_IMAGE_MAX_BYTES) {
        return data({ error: "파일이 10MB 를 초과합니다." }, { status: 400 });
      }

      const positionRaw = String(fd.get("position") ?? "pending");
      const position: CaseImagePosition = (
        CASE_IMAGE_POSITIONS as readonly string[]
      ).includes(positionRaw)
        ? (positionRaw as CaseImagePosition)
        : "pending";
      const altRaw = String(fd.get("alt") ?? "").trim().slice(0, 200);

      const ts = Date.now();
      const ext = (file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? "img").toLowerCase();
      const safeBase = (file.name || `image.${ext}`)
        .replace(/\\/g, "/")
        .split("/")
        .pop()!
        .replace(/[^\w.-]+/g, "_")
        .slice(-80);
      const objectPath = `${caseId}/${ts}-${safeBase}`;

      const { error: upErr } = await client.storage
        .from(CASE_IMAGES_BUCKET)
        .upload(objectPath, file, {
          contentType: file.type,
          upsert: false,
        });
      if (upErr) return data({ error: upErr.message }, { status: 400 });

      const { data: pub } = client.storage
        .from(CASE_IMAGES_BUCKET)
        .getPublicUrl(objectPath);

      const newImage: CaseImage = {
        id: crypto.randomUUID(),
        url: pub.publicUrl,
        storagePath: objectPath,
        mimeType: file.type,
        width: null,
        height: null,
        alt: altRaw,
        position,
        sortOrder:
          (existingImages
            .filter((i) => i.position === position)
            .reduce((m, i) => Math.max(m, i.sortOrder), -1) ?? -1) + 1,
      };
      const nextImages = [...existingImages, newImage];

      const { error: updErr } = await client
        .from("cases")
        .update({ images: imagesToJson(nextImages) })
        .eq("case_id", caseId);
      if (updErr) return data({ error: updErr.message }, { status: 400 });

      void logAuditEvent({
        actorId: user.id,
        actorRole: role,
        action: "case.upload_image",
        entityType: "case",
        entityId: caseId,
        metadata: {
          caseNumber: existing?.case_number ?? null,
          imageId: newImage.id,
          bytes: file.size,
          position,
        },
      });
      return data({ ok: true, image: newImage });
    }

    // ── 제거 ──
    if (intent === "remove_image") {
      const imageId = String(fd.get("imageId") ?? "");
      const target = existingImages.find((i) => i.id === imageId);
      if (!target) {
        return data({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
      }
      // storage 객체 삭제 — best-effort. storagePath 우선, 없으면 URL 에서 추출.
      let path = target.storagePath;
      if (!path) {
        const m = target.url.match(CASE_IMAGE_URL_RE);
        if (m) path = m[1];
      }
      if (path) {
        await client.storage.from(CASE_IMAGES_BUCKET).remove([path]);
      }
      const nextImages = existingImages.filter((i) => i.id !== imageId);
      const { error: updErr } = await client
        .from("cases")
        .update({ images: imagesToJson(nextImages) })
        .eq("case_id", caseId);
      if (updErr) return data({ error: updErr.message }, { status: 400 });
      void logAuditEvent({
        actorId: user.id,
        actorRole: role,
        action: "case.remove_image",
        entityType: "case",
        entityId: caseId,
        metadata: { caseNumber: existing?.case_number ?? null, imageId },
      });
      return data({ ok: true });
    }

    // ── 메타 수정 (position, alt, sortOrder) ──
    const imageId = String(fd.get("imageId") ?? "");
    const target = existingImages.find((i) => i.id === imageId);
    if (!target) {
      return data({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
    }
    const positionRaw = fd.get("position");
    const altRaw = fd.get("alt");
    const sortOrderRaw = fd.get("sortOrder");
    const next: CaseImage = { ...target };
    if (typeof positionRaw === "string") {
      next.position = (CASE_IMAGE_POSITIONS as readonly string[]).includes(
        positionRaw,
      )
        ? (positionRaw as CaseImagePosition)
        : target.position;
    }
    if (typeof altRaw === "string") next.alt = altRaw.trim().slice(0, 200);
    if (typeof sortOrderRaw === "string") {
      const n = Number(sortOrderRaw);
      if (Number.isFinite(n)) next.sortOrder = n;
    }
    const nextImages = existingImages.map((i) =>
      i.id === imageId ? next : i,
    );
    const { error: updErr } = await client
      .from("cases")
      .update({ images: imagesToJson(nextImages) })
      .eq("case_id", caseId);
    if (updErr) return data({ error: updErr.message }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "case.update_image_meta",
      entityType: "case",
      entityId: caseId,
      metadata: {
        caseNumber: existing?.case_number ?? null,
        imageId,
        position: next.position,
      },
    });
    return data({ ok: true, image: next });
  }

  if (intent !== "create" && intent !== "update") {
    return data({ error: "Unknown intent" }, { status: 400 });
  }

  const subjectLaws = parseStringArray(fd.get("subjectLaws")).filter((s) =>
    (LAW_SUBJECT_SLUGS as readonly string[]).includes(s),
  );
  let summaryItemsRaw: unknown;
  try {
    summaryItemsRaw = JSON.parse(String(fd.get("summaryItems") ?? "[]"));
  } catch {
    return data(
      { error: "요지 항목 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  let relatedCasesRaw: unknown;
  try {
    relatedCasesRaw = JSON.parse(String(fd.get("relatedCases") ?? "[]"));
  } catch {
    return data(
      { error: "관련 판례 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  const parsed = upsertSchema.safeParse({
    subjectLaws,
    court: fd.get("court"),
    decidedAt: fd.get("decidedAt"),
    caseNumber: fd.get("caseNumber"),
    caseTitle: fd.get("caseTitle"),
    nickname: emptyToNull(fd.get("nickname")),
    isEnBanc: fd.get("isEnBanc") === "1",
    caseType: emptyToNull(fd.get("caseType")),
    summaryItems: summaryItemsRaw,
    reasoningMd: emptyToNull(fd.get("reasoningMd")),
    commentBodyMd: emptyToNull(fd.get("commentBodyMd")),
    commentLabel: emptyToNull(fd.get("commentLabel")) ?? "remark",
    relatedMd: emptyToNull(fd.get("relatedMd")),
    relatedCases: relatedCasesRaw,
    exam1stYears: parseIntList(fd.get("exam1stYears")),
    exam2ndYears: parseIntList(fd.get("exam2ndYears")),
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // 다항목 요지 — 제목·본문·비고 모두 공백인 항목은 제거.
  // summary_title / summary_body_md (목록·검색 컬럼) 는 첫 항목에서 파생.
  // commentMd 는 trim 후 비어 있으면 key 제거(jsonb 깔끔하게).
  const summaryItems = input.summaryItems
    .map((it) => {
      const comment = (it.commentMd ?? "").trim();
      return {
        title: it.title.trim(),
        body: it.body,
        ...(comment !== "" ? { commentMd: comment } : {}),
      };
    })
    .filter(
      (it) =>
        it.title !== "" ||
        it.body.trim() !== "" ||
        (it.commentMd !== undefined && it.commentMd !== ""),
    );

  // 관련 판례 — 인용(citation) 이 빈 항목은 제거. 사건명은 trim, 요지/내용은 원문 보존
  // (내부 줄바꿈·공백 유지, 앞뒤 공백만 정리).
  const relatedCases = input.relatedCases
    .map((rc) => ({
      citation: rc.citation.trim(),
      caseTitle: (rc.caseTitle ?? "").trim() || null,
      content: (rc.content ?? "").trim() !== "" ? rc.content! : null,
    }))
    .filter((rc) => rc.citation !== "");

  // book_sections — 폼에 필드가 있을 때만 반영. 빈 문단·빈 섹션 정리 후 0개면 null.
  // 섹션이 있으면 목록 제목·검색용 필드(summary_items/reasoning_md/comment_body_md)를
  // 교재 구조에서 자동 파생 — 신규 상표 판례를 교재 구조만으로 등록해도 목록·검색 동기화.
  let bookSectionsPatch:
    | {
        book_sections: Json;
        summary_title?: string | null;
        summary_body_md?: string | null;
        summary_items?: Json;
        reasoning_md?: string | null;
        comment_body_md?: string | null;
      }
    | Record<string, never> = {};
  const bookSectionsRaw = fd.get("bookSections");
  if (bookSectionsRaw !== null) {
    let parsedSections: unknown;
    try {
      parsedSections = JSON.parse(String(bookSectionsRaw));
    } catch {
      return data({ error: "교재 구조 본문 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const secParsed = bookSectionsSchema.safeParse(parsedSections);
    if (!secParsed.success) {
      return data(
        { error: `교재 구조 본문: ${secParsed.error.issues[0]?.message ?? "Invalid"}` },
        { status: 400 },
      );
    }
    const cleaned = secParsed.data
      .map((s) => ({
        ...s,
        source: (s.source ?? "").trim() === "" ? null : s.source!.trim(),
        title: (s.title ?? "").trim() === "" ? null : s.title!.trim(),
        blocks: s.blocks.filter((b) =>
          b.type === "p"
            ? b.text.trim() !== ""
            : b.rows.some((row) => row.some((c) => c.text.trim() !== "" || c.images.length > 0)),
        ),
      }))
      .filter((s) => s.blocks.length > 0);
    if (cleaned.length > 0) {
      // 검색·목록 미러 파생 — 사안의 쟁점 → 요지 항목, 사실관계~본심 → 판시이유,
      // 평석+인덱스 → 비고. 표는 셀 텍스트를 이어붙여 검색 인덱스에 포함.
      const paraTexts = (key: string): string[] => {
        const sec = cleaned.find((s) => s.key === key);
        if (!sec) return [];
        return sec.blocks.flatMap((b) =>
          b.type === "p"
            ? [b.text]
            : b.rows.map((row) => row.map((c) => c.text).filter(Boolean).join(" | ")).filter(Boolean),
        );
      };
      const issueItems = paraTexts("issues").map((t) => ({
        title: t.replace(/^\[\d+\]\s*/, "").trim().slice(0, 500),
        body: "",
      }));
      const reasoningParts: string[] = [];
      for (const [key, label] of [
        ["mark", "쟁점상표"],
        ["facts", "사실관계"],
        ["lower", "전심의 판단"],
        ["doctrine", "관련 법리"],
        ["holding", "본심의 판단"],
      ] as const) {
        const texts = paraTexts(key);
        if (texts.length) reasoningParts.push(`### ${label}\n\n${texts.join("\n\n")}`);
      }
      const commentParts = paraTexts("comment");
      const commentSource = cleaned.find((s) => s.key === "comment")?.source;
      if (commentSource) commentParts.push(commentSource);
      const indexTexts = paraTexts("index");
      if (indexTexts.length) commentParts.push(`**[Index]** ${indexTexts.join(" / ")}`);
      bookSectionsPatch = {
        book_sections: JSON.parse(
          JSON.stringify({ kind: "tm-book", sections: cleaned }),
        ) as Json,
        ...(issueItems.length > 0
          ? {
              summary_items: JSON.parse(JSON.stringify(issueItems)) as Json,
              summary_title: issueItems[0].title || null,
              summary_body_md: null,
            }
          : {}),
        reasoning_md: reasoningParts.length ? reasoningParts.join("\n\n") : null,
        comment_body_md: commentParts.length ? commentParts.join("\n\n") : null,
      };
    } else {
      bookSectionsPatch = { book_sections: null };
    }
  }

  // full_text_pdf 컬럼은 별도 intent(upload/remove)로만 변경 — 메타 폼은 건드리지 않는다.
  // ★bookSectionsPatch 를 마지막에 spread — 교재 구조가 있으면 파생 미러(summary_items/
  //   reasoning_md/comment_body_md)가 폼의 generic 필드 값을 덮어쓴다(교재 구조 = SSOT).
  const payload = {
    subject_laws: input.subjectLaws,
    court: input.court,
    decided_at: input.decidedAt,
    case_number: input.caseNumber,
    case_title: input.caseTitle,
    nickname: input.nickname,
    is_en_banc: input.isEnBanc,
    case_type: input.caseType,
    summary_title: summaryItems[0]?.title || null,
    summary_body_md: summaryItems[0]?.body || null,
    reasoning_md: input.reasoningMd,
    comment_body_md: input.commentBodyMd,
    comment_label: input.commentLabel,
    related_md: input.relatedMd,
    related_cases: relatedCases as unknown as Json,
    exam_1st_years: input.exam1stYears,
    exam_2nd_years: input.exam2ndYears,
    summary_items: summaryItems,
    ...bookSectionsPatch,
  };

  if (intent === "create") {
    const { data: row, error } = await client
      .from("cases")
      .insert(payload)
      .select("case_id")
      .single();
    if (error) return data({ error: error.message }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "case.create",
      entityType: "case",
      entityId: row.case_id,
      metadata: {
        caseNumber: input.caseNumber,
        caseTitle: input.caseTitle,
        court: input.court,
      },
    });
    // feat-9-001 RAG dirty hook — 신규 판례 청크 생성.
    runAfterResponse(reindexCases([row.case_id]));
    // 신규 등록 후 편집 화면으로 — 진입 시의 returnTo 를 이어받아 이후 저장 복귀 유지.
    const createdReturnTo = fd.get("returnTo");
    throw redirect(
      `/admin/cases/edit/${row.case_id}` +
        (typeof createdReturnTo === "string" && createdReturnTo
          ? `?returnTo=${encodeURIComponent(createdReturnTo)}`
          : ""),
    );
  }

  // update
  const caseId = String(fd.get("caseId") ?? "");
  if (!z.string().uuid().safeParse(caseId).success) {
    return data({ error: "Invalid caseId" }, { status: 400 });
  }
  const { error } = await client
    .from("cases")
    .update(payload)
    .eq("case_id", caseId);
  if (error) return data({ error: error.message }, { status: 400 });
  void logAuditEvent({
    actorId: user.id,
    actorRole: role,
    action: "case.update",
    entityType: "case",
    entityId: caseId,
    metadata: {
      caseNumber: input.caseNumber,
      caseTitle: input.caseTitle,
    },
  });
  // feat-9-001 RAG dirty hook — 판례 본문 변경 청크 재생성.
  runAfterResponse(reindexCases([caseId]));
  // 저장 후 본래 화면(returnTo)으로 복귀 — case-viewer 의 "수정" 버튼으로 진입한
  // 경우 그 case-viewer 로, admin-cases 목록에서 진입한 경우 그 목록으로 복귀.
  // resource route(/api/admin/case)는 컴포넌트가 없어 data() 만 돌리면 non-JS
  // 환경에서 raw JSON 이 노출되므로 redirect 형태 유지.
  return redirect(safeReturnTo(fd.get("returnTo")));
}
