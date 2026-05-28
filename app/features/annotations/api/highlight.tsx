import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import {
  annotationTargetTypeSchema,
  createHighlight,
  highlightColorSchema,
  softDeleteHighlight,
} from "../queries.server";

import type { Route } from "./+types/highlight";

const createSchema = z.object({
  intent: z.literal("create"),
  targetType: annotationTargetTypeSchema,
  targetId: z.string().uuid(),
  fieldPath: z.string().max(200),
  startOffset: z.coerce.number().int().min(0),
  endOffset: z.coerce.number().int().positive(),
  contentHash: z.string().max(128),
  color: highlightColorSchema,
  // 입력 한도는 paragraph 한 단락(보통 1~2 KB) 보다 충분히 크게.
  // DB 저장(`label` 컬럼) 은 createHighlight 에서 500 자 slice 로 truncate 됨.
  excerpt: z.string().min(1).max(10000),
  // 자동 재앵커링용 컨텍스트(Phase 2). snippet 은 발췌 원문 풀(label 은 500자 truncate).
  // before/after 는 30자. 본문 수정 시 단일 매치 탐색으로 위치를 자동 추종.
  snippet: z.string().min(1).max(10000).optional(),
  beforeCtx: z.string().max(200).optional(),
  afterCtx: z.string().max(200).optional(),
});

const deleteSchema = z.object({
  intent: z.literal("delete"),
  highlightId: z.string().uuid(),
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
    const {
      targetType,
      targetId,
      fieldPath,
      startOffset,
      endOffset,
      contentHash,
      color,
      excerpt,
      snippet,
      beforeCtx,
      afterCtx,
    } = parsed.data;

    if (endOffset <= startOffset) {
      return data(
        { ok: false, error: "invalid-range" },
        { status: 400, headers },
      );
    }

    const highlight = await createHighlight(
      client,
      user.id,
      targetType,
      targetId,
      {
        fieldPath,
        startOffset,
        endOffset,
        contentHash,
        color,
        label: null,
        excerpt,
        snippet: snippet ?? excerpt,
        beforeCtx: beforeCtx ?? null,
        afterCtx: afterCtx ?? null,
      },
    );
    return data({ ok: true, highlight }, { headers });
  }

  await softDeleteHighlight(client, user.id, parsed.data.highlightId);
  return data({ ok: true }, { headers });
}
