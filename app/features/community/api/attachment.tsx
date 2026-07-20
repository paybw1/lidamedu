// feat-6 v2.2 — 게시글 첨부 upload/delete API.
// multipart/form-data.
//   intent="upload": postId + file → storage 업로드 + DB insert
//   intent="delete": attachmentId → storage 제거 + DB delete

import { data } from "react-router";

import { roleAtLeast } from "~/core/lib/roles";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/attachment";

const BUCKET = "community-attachments";
const MAX_SIZE = 10 * 1024 * 1024;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
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

  // role 조회 — manager 이상은 모든 게시글 첨부 가능.
  const { data: prof } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  const isManager = roleAtLeast(prof?.role, "manager");

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "upload") {
    const postId = String(fd.get("postId") ?? "");
    if (!postId) return data({ error: "postId 필수" }, { status: 400 });

    // 작성자 검증.
    const { data: post } = await adminClient
      .from("community_posts")
      .select("post_id, author_id, deleted_at")
      .eq("post_id", postId)
      .maybeSingle();
    if (!post || post.deleted_at)
      return data({ error: "글을 찾을 수 없습니다" }, { status: 404 });
    if (post.author_id !== user.id && !isManager)
      return data({ error: "Forbidden" }, { status: 403 });

    const file = fd.get("file");
    if (!(file instanceof File))
      return data({ error: "file 필수" }, { status: 400 });
    if (file.size > MAX_SIZE)
      return data({ error: "파일은 10MB 이하만 첨부할 수 있습니다." }, { status: 400 });
    const kind = classifyKind(file.type);
    if (!kind)
      return data(
        { error: "이미지(jpg·png·webp·gif) 또는 PDF만 첨부할 수 있습니다." },
        { status: 400 },
      );

    // 정렬 순서 — 현재 첨부 max + 1.
    const { data: maxRow } = await adminClient
      .from("community_post_attachments")
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

    const { data: row, error: insErr } = await adminClient
      .from("community_post_attachments")
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
      .select("attachment_id, path")
      .single();
    if (insErr || !row) {
      void adminClient.storage.from(BUCKET).remove([path]);
      return data({ error: insErr?.message ?? "DB insert 실패" }, { status: 400 });
    }
    return data({ ok: true, attachmentId: row.attachment_id, path: row.path });
  }

  if (intent === "delete") {
    const attachmentId = String(fd.get("attachmentId") ?? "");
    if (!attachmentId)
      return data({ error: "attachmentId 필수" }, { status: 400 });
    const { data: attach } = await adminClient
      .from("community_post_attachments")
      .select(
        "attachment_id, post_id, path, community_posts!inner(author_id)",
      )
      .eq("attachment_id", attachmentId)
      .maybeSingle();
    if (!attach)
      return data({ error: "not found" }, { status: 404 });
    if (attach.community_posts.author_id !== user.id && !isManager)
      return data({ error: "Forbidden" }, { status: 403 });
    void adminClient.storage.from(BUCKET).remove([attach.path]);
    const { error: delErr } = await adminClient
      .from("community_post_attachments")
      .delete()
      .eq("attachment_id", attachmentId);
    if (delErr) return data({ error: delErr.message }, { status: 400 });
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
