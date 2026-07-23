// feat-2-030 — 빈칸 난이도 단계 통과 기록(서버 재검증). 클라가 활성 빈칸 정답을 보내면
//   서버가 세트 정답과 대조해 100% 일치할 때만 통과로 기록(하위→상위 게이트 해금).
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import { normalizeAnswer } from "../lib/normalize";
import {
  activeBlankIdxsForTier,
  type BlankTier,
  tiersCoveredBy,
} from "../lib/tiers";
import { parseBlanks } from "../queries.server";
import { recordTierCompletions } from "../tiers.server";

import type { Route } from "./+types/tier-complete";

const schema = z.object({
  setId: z.string().uuid(),
  tier: z.coerce.number().int().min(1).max(3),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data("Method Not Allowed", { status: 405 });
  }
  const fd = await request.formData();
  const parsed = schema.safeParse({
    setId: fd.get("setId"),
    tier: fd.get("tier"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid input" } as const;
  }
  // answers = {blankIdx: userInput} JSON. 검증은 세트 정답과 대조로.
  let answers: Record<string, string> = {};
  try {
    const raw = JSON.parse(String(fd.get("answers") ?? "{}"));
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "string") answers[k] = v;
      }
    }
  } catch {
    return { ok: false, error: "Invalid answers" } as const;
  }

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;

  const { data: setRow, error } = await client
    .from("article_blank_sets")
    .select("blanks")
    .eq("set_id", parsed.data.setId)
    .maybeSingle();
  if (error || !setRow) return { ok: false, error: "Set not found" } as const;

  const blanks = parseBlanks(setRow.blanks);
  const tier = parsed.data.tier as BlankTier;
  const activeIdxs = activeBlankIdxsForTier(blanks, tier);
  if (activeIdxs.size === 0) {
    return { ok: false, error: "No blanks" } as const;
  }

  // 서버 재검증 — 활성 빈칸 전부 정답이어야 통과(100%).
  const byIdx = new Map(blanks.map((b) => [b.idx, b]));
  for (const idx of activeIdxs) {
    const answer = byIdx.get(idx)?.answer ?? "";
    const input = answers[String(idx)] ?? "";
    if (
      answer.length === 0 ||
      normalizeAnswer(input) !== normalizeAnswer(answer)
    ) {
      return { ok: true, passed: false } as const;
    }
  }

  const covered = tiersCoveredBy(blanks, tier);
  await recordTierCompletions(client, user.id, parsed.data.setId, covered);
  return { ok: true, passed: true, completedTiers: covered } as const;
}

export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
