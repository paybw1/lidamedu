// feat-6 v2.2 — community-attachments 버킷 signed URL 발급. 인증 사용자 누구나.

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
  if (!attachmentId)
    return data({ error: "attachmentId 필수" }, { status: 400 });

  const { data: attach } = await adminClient
    .from("community_post_attachments")
    .select("attachment_id, path")
    .eq("attachment_id", attachmentId)
    .maybeSingle();
  if (!attach)
    return data({ error: "not found" }, { status: 404 });

  const { data: signed, error } = await adminClient.storage
    .from("community-attachments")
    .createSignedUrl(attach.path, EXPIRES_SEC);
  if (error || !signed)
    return data({ error: error?.message ?? "URL 생성 실패" }, { status: 500 });

  return data({
    url: signed.signedUrl,
    expiresAt: new Date(Date.now() + EXPIRES_SEC * 1000).toISOString(),
  });
}
