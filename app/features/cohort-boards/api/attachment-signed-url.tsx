// feat-6-010 ③b 반별 게시판 첨부 signed URL 발급.
// RLS client 로 첨부 row 를 읽어(cbpa_read = 글 읽기권) 접근권을 DB 에서 확인 → 통과 시 adminClient 서명.
// (community 의 "인증되면 누구나" 와 달리 read 권한을 RLS 로 강제)
import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/attachment-signed-url";

const EXPIRES_SEC = 5 * 60;

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const attachmentId = (url.searchParams.get("attachmentId") ?? "").trim();
  if (!attachmentId) return data({ error: "attachmentId 필수" }, { status: 400 });

  // RLS read 게이트 — 접근권 없으면 null → 404 (storage path 노출 안 함).
  const { data: attach } = await client
    .from("cohort_board_post_attachments")
    .select("attachment_id, path")
    .eq("attachment_id", attachmentId)
    .maybeSingle();
  if (!attach) return data({ error: "not found" }, { status: 404 });

  const { data: signed, error } = await adminClient.storage
    .from("cohort-board-attachments")
    .createSignedUrl(attach.path, EXPIRES_SEC);
  if (error || !signed)
    return data({ error: error?.message ?? "URL 생성 실패" }, { status: 500 });

  return data({
    url: signed.signedUrl,
    expiresAt: new Date(Date.now() + EXPIRES_SEC * 1000).toISOString(),
  });
}
