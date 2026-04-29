import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import { normalizeAnswer } from "../lib/normalize";

import type { Route } from "./+types/attempt";

const schema = z.object({
  setId: z.string().uuid(),
  blankIdx: z.coerce.number().int().min(1),
  userInput: z.string().max(500),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data("Method Not Allowed", { status: 405 });
  }
  const fd = await request.formData();
  const parsed = schema.safeParse({
    setId: fd.get("setId"),
    blankIdx: fd.get("blankIdx"),
    userInput: fd.get("userInput"),
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

  // 정답 비교 — set 의 blanks JSON 에서 해당 idx 의 answer 가져오기
  const { data: setRow, error } = await client
    .from("article_blank_sets")
    .select("blanks")
    .eq("set_id", parsed.data.setId)
    .maybeSingle();
  if (error || !setRow) {
    return { ok: false, error: "Set not found" } as const;
  }
  const blanks = Array.isArray(setRow.blanks) ? setRow.blanks : [];
  const target = blanks.find(
    (b: unknown) =>
      b != null &&
      typeof b === "object" &&
      (b as { idx?: number }).idx === parsed.data.blankIdx,
  ) as { answer?: string } | undefined;
  const answer = target?.answer ?? "";
  const isCorrect =
    answer.length > 0 &&
    normalizeAnswer(answer) === normalizeAnswer(parsed.data.userInput);

  const { error: insErr } = await client.from("user_blank_attempts").insert({
    user_id: user.id,
    set_id: parsed.data.setId,
    blank_idx: parsed.data.blankIdx,
    user_input: parsed.data.userInput,
    is_correct: isCorrect,
  });
  if (insErr) {
    return { ok: false, error: insErr.message } as const;
  }

  return { ok: true, isCorrect, answer: isCorrect ? answer : undefined } as const;
}
