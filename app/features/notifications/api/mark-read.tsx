// staff_notifications read 처리 — 개별 / 전체.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  isStaffKind,
  isStudentKind,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationKind,
} from "~/features/notifications/queries.server";

import type { Route } from "./+types/mark-read";

const schema = z.object({
  notificationId: z.string().uuid().optional(),
  all: z.literal("1").optional(),
  audience: z.enum(["staff", "student"]).optional(),
  // all=1 과 함께 쓰면 해당 종류만 일괄 읽음 처리 (인박스 종류 탭).
  kind: z.string().optional(),
});

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
  const parsed = schema.safeParse({
    notificationId: fd.get("notificationId") || undefined,
    all: fd.get("all") || undefined,
    audience: fd.get("audience") || undefined,
    kind: fd.get("kind") || undefined,
  });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }
  let kind: NotificationKind | undefined;
  if (parsed.data.kind) {
    const k = parsed.data.kind as NotificationKind;
    if (!isStaffKind(k) && !isStudentKind(k)) {
      return data({ error: "Invalid kind" }, { status: 400 });
    }
    kind = k;
  }
  if (parsed.data.all === "1") {
    await markAllNotificationsRead(client, user.id, parsed.data.audience, kind);
  } else if (parsed.data.notificationId) {
    await markNotificationRead(client, user.id, parsed.data.notificationId);
  } else {
    return data({ error: "Missing target" }, { status: 400 });
  }
  return data({ ok: true });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
