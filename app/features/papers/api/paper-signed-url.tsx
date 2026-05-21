// feat-3-504 — papers 버킷 signed URL 발급. 인증 사용자 모두.
// 호출: GET /api/papers/signed-url?paperId=<uuid>
// 응답: { url, expiresAt } 또는 { error }

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/paper-signed-url";

const EXPIRES_SEC = 5 * 60;

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const paperId = (url.searchParams.get("paperId") ?? "").trim();
  if (!paperId)
    return data({ error: "paperId 필수" }, { status: 400 });

  const { data: paper } = await adminClient
    .from("papers")
    .select("paper_id, pdf_path, deleted_at")
    .eq("paper_id", paperId)
    .maybeSingle();
  if (!paper || paper.deleted_at)
    return data({ error: "not found" }, { status: 404 });
  if (!paper.pdf_path)
    return data({ error: "PDF 없음" }, { status: 404 });

  const { data: signed, error } = await adminClient.storage
    .from("papers")
    .createSignedUrl(paper.pdf_path, EXPIRES_SEC);
  if (error || !signed)
    return data({ error: error?.message ?? "URL 생성 실패" }, { status: 500 });

  return data({
    url: signed.signedUrl,
    expiresAt: new Date(Date.now() + EXPIRES_SEC * 1000).toISOString(),
  });
}
