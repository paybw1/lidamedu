// 시험 공고 운영자 액션 — 메타 저장 · 파일 업로드/삭제 · 공고 삭제(soft).
//   staff 게이트. DB 쓰기는 요청 클라이언트(RLS staff 백스톱), storage 블롭은 adminClient.
import { data, redirect } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import { EXAM_NOTICES_BUCKET } from "../queries.server";

import type { Route } from "./+types/admin-exam-notice";

const LIST = "/admin/exam-notices";
const MAX_SIZE = 20 * 1024 * 1024;
// 공고 문서 확장자 화이트리스트(HWP 는 MIME 이 비어있는 경우가 많아 확장자로 검증).
const ALLOWED_EXT = new Set([
  "pdf", "hwp", "hwpx", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip",
  "png", "jpg", "jpeg", "gif",
]);

type Attachment = { name: string; path: string; size: number };

function parseAtt(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((it) => {
    if (!it || typeof it !== "object") return [];
    const a = it as Record<string, unknown>;
    return typeof a.name === "string" && typeof a.path === "string"
      ? [{ name: a.name, path: a.path, size: typeof a.size === "number" ? a.size : 0 }]
      : [];
  });
}

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v.length ? v : null;
};
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  if (!(await getStaffRole(client, user.id)))
    return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");
  const id = String(fd.get("id") ?? "");

  // ── 공고 삭제(soft) + 첨부 블롭 정리 ──
  if (intent === "delete") {
    if (id) {
      const { data: row } = await client
        .from("exam_notices")
        .select("attachments")
        .eq("notice_id", id)
        .maybeSingle();
      const paths = parseAtt(row?.attachments).map((a) => a.path);
      if (paths.length)
        void adminClient.storage.from(EXAM_NOTICES_BUCKET).remove(paths);
      await client
        .from("exam_notices")
        .update({ deleted_at: new Date().toISOString() })
        .eq("notice_id", id);
    }
    return redirect(LIST);
  }

  // ── 첨부 삭제(개별 파일) ──
  if (intent === "removeFile") {
    const path = String(fd.get("path") ?? "");
    if (!id || !path) return data({ error: "잘못된 요청" }, { status: 400 });
    const { data: row } = await client
      .from("exam_notices")
      .select("attachments")
      .eq("notice_id", id)
      .maybeSingle();
    const next = parseAtt(row?.attachments).filter((a) => a.path !== path);
    const { error } = await client
      .from("exam_notices")
      .update({ attachments: next })
      .eq("notice_id", id);
    if (error) return data({ error: error.message }, { status: 400 });
    void adminClient.storage.from(EXAM_NOTICES_BUCKET).remove([path]);
    return redirect(`${LIST}/${id}/edit`);
  }

  // ── 첨부 업로드(멀티파트) ──
  if (intent === "upload") {
    if (!id) return data({ error: "먼저 공고를 저장하세요" }, { status: 400 });
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0)
      return data({ error: "파일을 선택하세요" }, { status: 400 });
    if (file.size > MAX_SIZE)
      return data({ error: "파일이 20MB 를 초과합니다" }, { status: 400 });
    const ext = file.name.includes(".")
      ? (file.name.split(".").pop() ?? "").toLowerCase()
      : "";
    if (!ALLOWED_EXT.has(ext))
      return data(
        { error: `허용되지 않는 형식(.${ext || "?"})` },
        { status: 400 },
      );

    const path = `${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await adminClient.storage
      .from(EXAM_NOTICES_BUCKET)
      .upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) return data({ error: upErr.message }, { status: 400 });

    const { data: row } = await client
      .from("exam_notices")
      .select("attachments")
      .eq("notice_id", id)
      .maybeSingle();
    const next: Attachment[] = [
      ...parseAtt(row?.attachments),
      { name: file.name, path, size: file.size },
    ];
    const { error: updErr } = await client
      .from("exam_notices")
      .update({ attachments: next })
      .eq("notice_id", id);
    if (updErr) {
      void adminClient.storage.from(EXAM_NOTICES_BUCKET).remove([path]);
      return data({ error: updErr.message }, { status: 400 });
    }
    return redirect(`${LIST}/${id}/edit`);
  }

  // ── 메타 저장(생성/수정) ──
  if (intent !== "save") return data({ error: "bad intent" }, { status: 400 });
  const title = str(fd, "title");
  if (!title) return data({ error: "제목을 입력하세요" }, { status: 400 });
  const publishedAtRaw = str(fd, "published_at");
  const row = {
    title,
    body_md: str(fd, "body_md"),
    is_pinned: bool(fd, "is_pinned"),
    published: bool(fd, "published"),
    published_at: publishedAtRaw ?? new Date().toISOString(),
  };

  if (id) {
    const { error } = await client
      .from("exam_notices")
      .update(row)
      .eq("notice_id", id);
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect(LIST);
  }
  // 신규 — 생성 후 편집 페이지로(첨부 추가 가능하도록).
  const { data: created, error } = await client
    .from("exam_notices")
    .insert({ ...row, created_by: user.id })
    .select("notice_id")
    .single();
  if (error) return data({ error: error.message }, { status: 400 });
  return redirect(`${LIST}/${created.notice_id}/edit`);
}
