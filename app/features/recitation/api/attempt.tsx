// 암기 모드 시도 batch 저장. articleId + (blockIndex, userInput, expectedText) 배열을 받아
// 서버에서 similarity 를 재계산해 저장 (클라이언트 점수 신뢰 X).

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import {
  computeSimilarity,
  isRecitationComplete,
} from "../lib/similarity";

import type { Route } from "./+types/attempt";

const attemptSchema = z.object({
  blockIndex: z.number().int().min(0),
  userInput: z.string().min(1).max(10000),
  expectedText: z.string().max(10000),
});

const schema = z.object({
  articleId: z.string().uuid(),
  attempts: z.array(attemptSchema).min(1).max(50),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data("Method Not Allowed", { status: 405 });
  }
  const fd = await request.formData();
  const attemptsRaw = fd.get("attempts");
  if (typeof attemptsRaw !== "string") {
    return { ok: false, error: "Invalid input" } as const;
  }
  let parsedAttempts: unknown;
  try {
    parsedAttempts = JSON.parse(attemptsRaw);
  } catch {
    return { ok: false, error: "Invalid attempts JSON" } as const;
  }
  const parsed = schema.safeParse({
    articleId: fd.get("articleId"),
    attempts: parsedAttempts,
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid input" } as const;
  }

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;

  // 서버에서 similarity 재계산 (클라이언트 값 신뢰 X).
  const rows = parsed.data.attempts.map((a) => {
    const sim = computeSimilarity(a.userInput, a.expectedText);
    return {
      user_id: user.id,
      article_id: parsed.data.articleId,
      block_index: a.blockIndex,
      user_input: a.userInput,
      expected_text: a.expectedText,
      similarity: sim,
      is_complete: isRecitationComplete(sim),
    };
  });

  const { error } = await client.from("user_recitation_attempts").insert(rows);
  if (error) return { ok: false, error: error.message } as const;
  return { ok: true, saved: rows.length } as const;
}
