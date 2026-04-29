import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { updateBlankAnswer } from "~/features/blanks/queries.server";

import type { Route } from "./+types/admin-answer";

const schema = z.object({
  setId: z.string().uuid(),
  blankIdx: z.coerce.number().int().min(1),
  answer: z.string().max(500),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data("Method Not Allowed", { status: 405 });
  }
  const fd = await request.formData();
  const parsed = schema.safeParse({
    setId: fd.get("setId"),
    blankIdx: fd.get("blankIdx"),
    answer: fd.get("answer"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid input" } as const;
  }

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return { ok: false, error: "Unauthorized" } as const;
  }
  // 권한 — RLS 가 update 차단하므로 별도 가드 없이 시도. 실패 시 에러 반환.

  try {
    await updateBlankAnswer(
      client,
      parsed.data.setId,
      parsed.data.blankIdx,
      parsed.data.answer.trim(),
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Update failed",
    } as const;
  }
  return { ok: true } as const;
}
