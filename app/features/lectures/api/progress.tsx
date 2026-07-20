// 강의 시청 진행 update API (feat-7-029).
// 학생 본인만. intent: view / complete / position.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  markCompleted,
  recordView,
  updateLastPosition,
} from "~/features/lectures/queries.server";

import type { Route } from "./+types/progress";

const baseSchema = z.object({
  itemId: z.string().uuid(),
});

const positionSchema = baseSchema.extend({
  positionSec: z.coerce.number().int().min(0).max(72000),
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
  const intent = String(fd.get("intent") ?? "");

  if (intent === "view") {
    const parsed = baseSchema.safeParse({ itemId: fd.get("itemId") });
    if (!parsed.success)
      return data({ error: "itemId 형식 오류" }, { status: 400 });
    const res = await recordView(parsed.data.itemId, user.id);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "complete") {
    const parsed = baseSchema.safeParse({ itemId: fd.get("itemId") });
    if (!parsed.success)
      return data({ error: "itemId 형식 오류" }, { status: 400 });
    const res = await markCompleted(parsed.data.itemId, user.id);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "position") {
    const parsed = positionSchema.safeParse({
      itemId: fd.get("itemId"),
      positionSec: fd.get("positionSec"),
    });
    if (!parsed.success)
      return data({ error: "positionSec 형식 오류" }, { status: 400 });
    const res = await updateLastPosition(
      parsed.data.itemId,
      user.id,
      parsed.data.positionSec,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  return data({ error: `알 수 없는 intent: ${intent}` }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
