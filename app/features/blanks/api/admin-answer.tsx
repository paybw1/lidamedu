import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { updateBlankAnswer } from "~/features/blanks/queries.server";

import type { Route } from "./+types/admin-answer";

// hints (옵션): "→ #N" 버튼처럼 운영자가 본문에서 드래그한 위치를 같이 전달할 때 사용.
// 주어지면 슬롯의 위치를 그 드래그 위치로 이동시킨다 (정답 + 위치 동시 갱신).
// 미지정이면 기존 슬롯 컨텍스트를 보존 (단순 정답 paste/타이핑).
const schema = z.object({
  setId: z.string().uuid(),
  blankIdx: z.coerce.number().int().min(1),
  answer: z.string().max(500),
  beforeHint: z.string().max(500).optional(),
  afterHint: z.string().max(500).optional(),
  blockHint: z
    .string()
    .max(64)
    .regex(/^(clause|item|sub)-/)
    .optional(),
  blockIndex: z.coerce.number().int().min(0).optional(),
  cumOffset: z.coerce.number().int().min(0).optional(),
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
    beforeHint: fd.get("beforeHint") ?? undefined,
    afterHint: fd.get("afterHint") ?? undefined,
    blockHint: fd.get("blockHint") || undefined,
    blockIndex: fd.get("blockIndex") ?? undefined,
    cumOffset: fd.get("cumOffset") ?? undefined,
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
      {
        beforeHint: parsed.data.beforeHint,
        afterHint: parsed.data.afterHint,
        blockHint: parsed.data.blockHint,
        blockIndex: parsed.data.blockIndex,
        cumOffset: parsed.data.cumOffset,
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Update failed",
    } as const;
  }
  return { ok: true } as const;
}
