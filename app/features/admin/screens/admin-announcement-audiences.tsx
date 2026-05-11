// 공지 audiences 조회 전용 라우트 — 수정 폼이 기존 대상을 채워넣을 때 fetch.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getAnnouncementById } from "~/features/announcements/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-announcement-audiences";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!z.string().uuid().safeParse(id).success) {
    return { audiences: [] };
  }
  const ann = await getAnnouncementById(client, id);
  if (!ann) return { audiences: [] };
  if (role !== "admin" && ann.authorId !== user.id) {
    throw data("Forbidden", { status: 403 });
  }
  return { audiences: ann.audiences };
}
