// 공지 읽음 표시 API — 인증 사용자라면 누구나 본인 read 기록 가능.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { markAnnouncementRead } from "~/features/announcements/queries.server";

import type { Route } from "./+types/read";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const fd = await request.formData();
  const announcementId = String(fd.get("announcementId") ?? "");
  if (!z.string().uuid().safeParse(announcementId).success) {
    return data({ error: "Invalid id" }, { status: 400 });
  }
  const res = await markAnnouncementRead(client, announcementId, user.id);
  if (!res.ok) return data({ error: res.error }, { status: 400 });
  return data({ ok: true });
}
