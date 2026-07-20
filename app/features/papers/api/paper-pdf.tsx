// feat-3-504 — 논문 PDF Supabase Storage 업로드 + 삭제.
// staff(instructor+) 만. multipart/form-data.
//   intent="upload": paperId + file (PDF) → storage 업로드 + papers.pdf_path update
//   intent="delete": paperId → storage 삭제 + papers.pdf_path NULL

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/paper-pdf";

const BUCKET = "papers";
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");
  const paperId = String(fd.get("paperId") ?? "");
  if (!paperId)
    return data({ error: "paperId 필수" }, { status: 400 });

  // paper 존재 확인 + 기존 pdf_path 조회.
  const { data: paper, error: pErr } = await adminClient
    .from("papers")
    .select("paper_id, pdf_path")
    .eq("paper_id", paperId)
    .maybeSingle();
  if (pErr) return data({ error: pErr.message }, { status: 400 });
  if (!paper) return data({ error: "paper not found" }, { status: 404 });

  if (intent === "upload") {
    const file = fd.get("file");
    if (!(file instanceof File))
      return data({ error: "file 필수" }, { status: 400 });
    if (file.type !== "application/pdf")
      return data({ error: "PDF 만 업로드 가능" }, { status: 400 });
    if (file.size > MAX_SIZE)
      return data({ error: "20MB 이하" }, { status: 400 });

    const path = `${paperId}/${Date.now()}.pdf`;
    const { error: upErr } = await adminClient.storage
      .from(BUCKET)
      .upload(path, file, { contentType: "application/pdf", upsert: false });
    if (upErr) return data({ error: upErr.message }, { status: 400 });

    // 기존 path 있으면 storage 에서 제거 (best-effort).
    if (paper.pdf_path) {
      void adminClient.storage.from(BUCKET).remove([paper.pdf_path]);
    }
    const { error: udErr } = await adminClient
      .from("papers")
      .update({ pdf_path: path })
      .eq("paper_id", paperId);
    if (udErr) return data({ error: udErr.message }, { status: 400 });
    return data({ ok: true, pdfPath: path });
  }

  if (intent === "delete") {
    if (paper.pdf_path) {
      void adminClient.storage.from(BUCKET).remove([paper.pdf_path]);
    }
    const { error: udErr } = await adminClient
      .from("papers")
      .update({ pdf_path: null })
      .eq("paper_id", paperId);
    if (udErr) return data({ error: udErr.message }, { status: 400 });
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
