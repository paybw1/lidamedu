// feat-6-010 ③b 반별 게시판 첨부 upload/delete (multipart).
// DB(insert/delete)는 RLS client 로 권한 강제(cbpa_insert/delete), storage 블롭만 adminClient.
//   intent="upload": postId + file → 권한 RPC 가드 → storage 업로드 → RLS insert(실패 시 블롭 롤백)
//   intent="delete": attachmentId → RLS delete(권한 0행=차단) → storage 제거
import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";

import { canAttachPost } from "../queries.server";

import type { Route } from "./+types/attachment";

const BUCKET = "cohort-board-attachments";
const MAX_SIZE = 10 * 1024 * 1024;
const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const PDF_MIME = "application/pdf";

function classifyKind(mime: string): "image" | "pdf" | "file" | null {
  if (IMAGE_MIMES.has(mime)) return "image";
  if (mime === PDF_MIME) return "pdf";
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "upload") {
    const postId = String(fd.get("postId") ?? "");
    if (!postId) return data({ error: "postId 필수" }, { status: 400 });

    // 권한 가드(= cbpa_insert RLS 와 동일 함수). 실차단은 아래 RLS insert 가 재수행.
    if (!(await canAttachPost(client, postId, user.id)))
      return data({ error: "Forbidden" }, { status: 403 });

    const file = fd.get("file");
    if (!(file instanceof File))
      return data({ error: "file 필수" }, { status: 400 });
    if (file.size > MAX_SIZE)
      return data({ error: "10MB 이하" }, { status: 400 });
    const kind = classifyKind(file.type);
    if (!kind)
      return data(
        { error: "이미지(jpg/png/webp/gif) 또는 PDF 만 허용" },
        { status: 400 },
      );

    // 정렬 순서 — 현재 첨부 max + 1 (RLS read 로 본인이 보는 범위).
    const { data: maxRow } = await client
      .from("cohort_board_post_attachments")
      .select("sort_order")
      .eq("post_id", postId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (maxRow?.sort_order ?? -1) + 1;

    const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const path = `${postId}/${Date.now()}-${nextOrder}.${ext}`;
    const { error: upErr } = await adminClient.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) return data({ error: upErr.message }, { status: 400 });

    // DB insert 는 RLS client — cbpa_insert(uploaded_by=auth.uid() AND can_attach) 가 최종 차단.
    const { data: row, error: insErr } = await client
      .from("cohort_board_post_attachments")
      .insert({
        post_id: postId,
        kind,
        path,
        original_filename: file.name.slice(0, 200),
        size_bytes: file.size,
        mime: file.type,
        sort_order: nextOrder,
        uploaded_by: user.id,
      })
      .select("attachment_id")
      .single();
    if (insErr || !row) {
      void adminClient.storage.from(BUCKET).remove([path]);
      return data(
        { error: insErr?.message ?? "DB insert 실패" },
        { status: 400 },
      );
    }
    return data({ ok: true, attachmentId: row.attachment_id });
  }

  if (intent === "delete") {
    const attachmentId = String(fd.get("attachmentId") ?? "");
    if (!attachmentId)
      return data({ error: "attachmentId 필수" }, { status: 400 });

    // RLS delete — cbpa_delete(can_attach) 가 권한 차단. 0행이면 권한 없음/없는 첨부.
    const { data: deleted, error: delErr } = await client
      .from("cohort_board_post_attachments")
      .delete()
      .eq("attachment_id", attachmentId)
      .select("path")
      .maybeSingle();
    if (delErr) return data({ error: delErr.message }, { status: 400 });
    if (!deleted) return data({ error: "Forbidden" }, { status: 403 });

    void adminClient.storage.from(BUCKET).remove([deleted.path]);
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}
