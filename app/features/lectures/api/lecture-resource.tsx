// feat-4-A-117 — 관련자료 CRUD API.
// intent=create  : multipart (file + 메타) → Storage upload + lecture_resources insert
// intent=delete  : staff soft delete
// intent=signed-url : 학생/staff 모두 — Storage signed URL (5 분) 발급
//
// staff 권한 검사는 lecture_resources / storage.objects 의 RLS 가 강제한다.
// docs/features/feat-4-A-117-lecture-resources.md §5.2
import type { Route } from "./+types/lecture-resource";

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LECTURE_NOTES_BUCKET,
  type LectureResourceListItem,
  createLectureResource,
  getLectureResourceSignedUrl,
  softDeleteLectureResource,
} from "~/features/lectures/queries.server";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB — Storage 버킷 file_size_limit 과 일치

const createSchema = z.object({
  targetType: z.enum(["article", "case", "problem", "science_section"]),
  targetId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  sourcePageStart: z.coerce.number().int().positive().optional(),
  sourcePageEnd: z.coerce.number().int().positive().optional(),
  sourcePdfId: z.string().uuid().optional(),
});

const deleteSchema = z.object({
  resourceId: z.string().uuid(),
});

const signedUrlSchema = z.object({
  pdfPath: z.string().min(1).max(500),
  // 저장 시 파일명(한글 제목). 미지정이면 storage 키 basename 사용.
  downloadName: z.string().trim().min(1).max(200).optional(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return data({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  // ── signed URL (staff 전용 — 유출방지 ①: 학생은 인앱 이미지 뷰어만) ──
  if (intent === "signed-url") {
    const staffRole = await getStaffRole(client, user.id);
    if (staffRole === null) {
      return data({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const parsed = signedUrlSchema.safeParse({
      pdfPath: fd.get("pdfPath"),
      downloadName: fd.get("downloadName") || undefined,
    });
    if (!parsed.success) {
      return data(
        { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    try {
      const signedUrl = await getLectureResourceSignedUrl(
        client,
        parsed.data.pdfPath,
        parsed.data.downloadName,
      );
      return data({ ok: true, intent: "signed-url" as const, signedUrl });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "서명된 URL 생성 실패";
      return data({ ok: false, error: msg }, { status: 400 });
    }
  }

  // ── soft delete (staff only — RLS 가 강제) ──
  if (intent === "delete") {
    const parsed = deleteSchema.safeParse({ resourceId: fd.get("resourceId") });
    if (!parsed.success) {
      return data(
        { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    try {
      await softDeleteLectureResource(client, parsed.data.resourceId);
      return data({
        ok: true,
        intent: "delete" as const,
        resourceId: parsed.data.resourceId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "삭제 실패";
      return data({ ok: false, error: msg }, { status: 400 });
    }
  }

  // ── create (multipart file upload, staff only — RLS 가 강제) ──
  if (intent === "create") {
    const fileEntry = fd.get("file");
    if (!(fileEntry instanceof File) || fileEntry.size === 0) {
      return data(
        { ok: false, error: "PDF 파일을 선택하세요." },
        { status: 400 },
      );
    }
    if (fileEntry.type !== "application/pdf") {
      return data(
        { ok: false, error: "PDF 파일만 업로드할 수 있습니다." },
        { status: 400 },
      );
    }
    if (fileEntry.size > MAX_FILE_BYTES) {
      return data(
        { ok: false, error: "파일 크기는 50 MB 이하여야 합니다." },
        { status: 400 },
      );
    }

    const parsedMeta = createSchema.safeParse({
      targetType: fd.get("targetType"),
      targetId: fd.get("targetId"),
      title: fd.get("title"),
      sourcePageStart: fd.get("sourcePageStart") || undefined,
      sourcePageEnd: fd.get("sourcePageEnd") || undefined,
      sourcePdfId: fd.get("sourcePdfId") || undefined,
    });
    if (!parsedMeta.success) {
      return data(
        {
          ok: false,
          error: parsedMeta.error.issues[0]?.message ?? "입력 오류",
        },
        { status: 400 },
      );
    }
    const meta = parsedMeta.data;

    if (
      meta.sourcePageStart !== undefined &&
      meta.sourcePageEnd !== undefined &&
      meta.sourcePageEnd < meta.sourcePageStart
    ) {
      return data(
        { ok: false, error: "끝 페이지가 시작 페이지보다 작습니다." },
        { status: 400 },
      );
    }

    // 수동 업로드는 `manual/<uuid>.pdf` 경로. Phase 3 import 스크립트는 별도 규칙 사용.
    const objectKey = `manual/${crypto.randomUUID()}.pdf`;
    const uploadRes = await client.storage
      .from(LECTURE_NOTES_BUCKET)
      .upload(objectKey, fileEntry, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadRes.error) {
      return data(
        { ok: false, error: uploadRes.error.message },
        { status: 400 },
      );
    }

    try {
      const { resourceId } = await createLectureResource(
        client,
        {
          targetType: meta.targetType,
          targetId: meta.targetId,
          kind: "lecture_note",
          title: meta.title,
          pdfUrl: objectKey,
          sourcePageStart: meta.sourcePageStart ?? null,
          sourcePageEnd: meta.sourcePageEnd ?? null,
          sourcePdfId: meta.sourcePdfId ?? null,
        },
        user.id,
      );

      const resource: LectureResourceListItem = {
        resourceId,
        kind: "lecture_note",
        title: meta.title,
        pdfUrl: objectKey,
        url: null,
        sourcePdfId: meta.sourcePdfId ?? null,
        sourcePageStart: meta.sourcePageStart ?? null,
        sourcePageEnd: meta.sourcePageEnd ?? null,
        ord: 0,
        createdAt: new Date().toISOString(),
      };

      return data({ ok: true, intent: "create" as const, resource });
    } catch (e) {
      // DB insert 실패 → 업로드된 객체 정리.
      await client.storage
        .from(LECTURE_NOTES_BUCKET)
        .remove([objectKey])
        .catch(() => {});
      const msg = e instanceof Error ? e.message : "DB insert 실패";
      return data({ ok: false, error: msg }, { status: 400 });
    }
  }

  return data({ ok: false, error: "Invalid intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
