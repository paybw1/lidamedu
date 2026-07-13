// 도서 미리보기(look-inside) 페이지 관리 API — /api/admin/book-preview.
//   op=add   : 이미지 파일 여러 장 업로드(공개 book-covers 버킷 previews/) → book_preview_pages insert
//   op=delete: previewId 행 삭제(+스토리지 객체 제거)
//   PDF 는 브라우저에서 페이지 이미지로 변환 후 업로드하므로 서버는 이미지만 받는다.
import { randomUUID } from "node:crypto";

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/book-preview";

const BUCKET = "book-covers"; // 공개 버킷 재사용(미리보기는 공개 look-inside)
const MAX_PAGES = 20; // 도서당 미리보기 총 페이지 상한

async function requireStaffUser(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  if (!(await hasDutyAccess("lms_video_admin", user.id, role)))
    throw data("Forbidden", { status: 403 });
  return user;
}

export async function action({ request }: Route.ActionArgs) {
  await requireStaffUser(request);
  const fd = await request.formData();
  const op = String(fd.get("op") ?? "");
  const bookId = String(fd.get("bookId") ?? "");
  if (!bookId) return data({ error: "bookId 누락" }, { status: 400 });

  if (op === "delete") {
    const previewId = String(fd.get("previewId") ?? "");
    if (!previewId) return data({ error: "previewId 누락" }, { status: 400 });
    const { data: row } = await adminClient
      .from("book_preview_pages")
      .select("image_url")
      .eq("preview_id", previewId)
      .eq("book_id", bookId)
      .maybeSingle();
    await adminClient
      .from("book_preview_pages")
      .delete()
      .eq("preview_id", previewId)
      .eq("book_id", bookId);
    // 스토리지 객체 제거(공개 URL → 버킷 내 경로 추출).
    const path = storagePathFromPublicUrl(row?.image_url ?? null);
    if (path) await adminClient.storage.from(BUCKET).remove([path]);
    return data({ ok: true });
  }

  if (op === "add") {
    const files = fd
      .getAll("images")
      .filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0)
      return data({ error: "업로드할 이미지가 없습니다." }, { status: 400 });

    // 현재 페이지 수 + 다음 정렬값 계산.
    const { data: existing } = await adminClient
      .from("book_preview_pages")
      .select("sort_order")
      .eq("book_id", bookId)
      .order("sort_order", { ascending: false })
      .limit(1);
    let sort = (existing?.[0]?.sort_order ?? 0) + 1;
    const { count } = await adminClient
      .from("book_preview_pages")
      .select("preview_id", { count: "exact", head: true })
      .eq("book_id", bookId);
    const room = MAX_PAGES - (count ?? 0);
    if (room <= 0)
      return data(
        { error: `미리보기는 최대 ${MAX_PAGES}페이지까지 등록할 수 있습니다.` },
        { status: 400 },
      );

    const rows: Array<{ book_id: string; image_url: string; sort_order: number }> =
      [];
    for (const file of files.slice(0, room)) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `previews/${bookId}/${randomUUID()}.${ext}`;
      const { error } = await adminClient.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || "image/jpeg" });
      if (error) continue;
      const url = adminClient.storage.from(BUCKET).getPublicUrl(path).data
        .publicUrl;
      rows.push({ book_id: bookId, image_url: url, sort_order: sort++ });
    }
    if (rows.length === 0)
      return data({ error: "업로드에 실패했습니다." }, { status: 500 });
    const { error } = await adminClient.from("book_preview_pages").insert(rows);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true, added: rows.length });
  }

  return data({ error: "알 수 없는 요청" }, { status: 400 });
}

// 공개 URL(…/object/public/book-covers/previews/xxx) → 'previews/xxx' 경로.
function storagePathFromPublicUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}
