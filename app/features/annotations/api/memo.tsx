import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import {
  annotationTargetTypeSchema,
  createMemo,
  softDeleteMemo,
} from "../queries.server";

import type { Route } from "./+types/memo";

const createSchema = z.object({
  intent: z.literal("create"),
  targetType: annotationTargetTypeSchema,
  targetId: z.string().uuid(),
  bodyMd: z.string().min(1).max(4000),
  // 사용자가 본문에서 paste 한 단어/구문 — 메모 카드에 인용 표시. 빈 문자열은 null 로 저장.
  snippet: z.string().max(500).optional(),
  // 본문 위 정확 위치 — walkBlocks pre-order block 인덱스 + 그 block 안 cumulative offset.
  // selection 으로 메모 추가 시 자동 캡처. 같은 단어가 여러 곳에 등장해도 그 자리에만 마크.
  blockIndex: z.coerce.number().int().min(0).optional(),
  cumOffset: z.coerce.number().int().min(0).optional(),
});

const deleteSchema = z.object({
  intent: z.literal("delete"),
  memoId: z.string().uuid(),
});

const schema = z.discriminatedUnion("intent", [createSchema, deleteSchema]);

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ ok: false, error: "method-not-allowed" }, { status: 405 });
  }

  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return data({ ok: false, error: "unauthorized" }, { status: 401, headers });
  }

  const formData = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return data(
      { ok: false, error: "invalid-input", issues: parsed.error.issues },
      { status: 400, headers },
    );
  }

  if (parsed.data.intent === "create") {
    const { targetType, targetId, bodyMd, snippet, blockIndex, cumOffset } =
      parsed.data;
    const position =
      typeof blockIndex === "number" && typeof cumOffset === "number"
        ? { blockIndex, cumOffset }
        : null;
    const memo = await createMemo(
      client,
      user.id,
      targetType,
      targetId,
      bodyMd,
      snippet,
      position,
    );
    return data({ ok: true, memo }, { headers });
  }

  await softDeleteMemo(client, user.id, parsed.data.memoId);
  return data({ ok: true }, { headers });
}
