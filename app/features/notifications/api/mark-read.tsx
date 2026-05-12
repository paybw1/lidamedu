// staff_notifications read 처리 — 개별 / 전체.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "~/features/notifications/queries.server";

import type { Route } from "./+types/mark-read";

const schema = z.object({
  notificationId: z.string().uuid().optional(),
  all: z.literal("1").optional(),
  audience: z.enum(["staff", "student"]).optional(),
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
  });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }
  if (parsed.data.all === "1") {
    await markAllNotificationsRead(client, user.id, parsed.data.audience);
  } else if (parsed.data.notificationId) {
    await markNotificationRead(client, user.id, parsed.data.notificationId);
  } else {
    return data({ error: "Missing target" }, { status: 400 });
  }
  return data({ ok: true });
}
