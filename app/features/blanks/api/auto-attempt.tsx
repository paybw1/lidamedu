// 주체/시기 빈칸 정답 시도 저장 — content blank 와 달리 set_id 가 없고 article body 위에서
// ad-hoc 생성되므로 (article_id, blank_type, block_index, cum_offset) 로 빈칸을 식별한다.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import { normalizeAnswer } from "../lib/normalize";

import type { Route } from "./+types/auto-attempt";

const schema = z.object({
  articleId: z.string().uuid(),
  blankType: z.enum(["subject", "period"]),
  blockIndex: z.coerce.number().int().min(0),
  cumOffset: z.coerce.number().int().min(0),
  answer: z.string().min(1).max(500),
  userInput: z.string().max(500),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data("Method Not Allowed", { status: 405 });
  }
  const fd = await request.formData();
  const parsed = schema.safeParse({
    articleId: fd.get("articleId"),
    blankType: fd.get("blankType"),
    blockIndex: fd.get("blockIndex"),
    cumOffset: fd.get("cumOffset"),
    answer: fd.get("answer"),
    userInput: fd.get("userInput"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid input" } as const;
  }

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;

  const isCorrect =
    normalizeAnswer(parsed.data.userInput) ===
    normalizeAnswer(parsed.data.answer);

  const { error } = await client.from("user_auto_blank_attempts").insert({
    user_id: user.id,
    article_id: parsed.data.articleId,
    blank_type: parsed.data.blankType,
    block_index: parsed.data.blockIndex,
    cum_offset: parsed.data.cumOffset,
    answer: parsed.data.answer,
    user_input: parsed.data.userInput,
    is_correct: isCorrect,
  });
  if (error) return { ok: false, error: error.message } as const;
  return { ok: true, isCorrect } as const;
}
