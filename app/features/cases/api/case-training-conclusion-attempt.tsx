// 학생 — ③④ 결론·강약 attempt CRUD.
// intent: autosave / submit / self_check / reset. case_conclusion_attempts.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  isConclusionTrainingReady,
  resetConclusionAttempt,
  selfCheckConclusionAttempt,
  submitConclusionAttempt,
  upsertConclusionAttemptDraft,
} from "~/features/cases/queries-case-training.server";
import type {
  ConclusionMatch,
  ConclusionsMap,
  EmphasisMap,
  EmphasisMatch,
  IssueEmphasis,
} from "~/features/issue-extraction/lib/types";

import type { Route } from "./+types/case-training-conclusion-attempt";

const writeSchema = z.object({
  intent: z.enum(["autosave", "submit"]),
  itemId: z.string().uuid(),
  conclusions: z.string().max(40000),
  emphasisMap: z.string().max(20000),
  outlineMd: z.string().max(20000),
});
const selfCheckSchema = z.object({
  intent: z.literal("self_check"),
  itemId: z.string().uuid(),
  conclusionMatches: z.string().max(20000),
  emphasisMatches: z.string().max(20000),
});
const resetSchema = z.object({
  intent: z.literal("reset"),
  itemId: z.string().uuid(),
});

function parseConclusionsMap(raw: unknown): ConclusionsMap {
  if (typeof raw !== "string") return {};
  try {
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return {};
    const out: ConclusionsMap = {};
    for (const [k, v] of Object.entries(j)) {
      if (!v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      const direction = typeof o.direction === "string" ? o.direction : "";
      const rationaleMd =
        typeof o.rationaleMd === "string" ? o.rationaleMd : undefined;
      out[k] = { direction, ...(rationaleMd !== undefined ? { rationaleMd } : {}) };
    }
    return out;
  } catch {
    return {};
  }
}
function parseEmphasisMap(raw: unknown): EmphasisMap {
  if (typeof raw !== "string") return {};
  try {
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return {};
    const out: EmphasisMap = {};
    const allowed: IssueEmphasis[] = ["strong", "medium", "weak"];
    for (const [k, v] of Object.entries(j)) {
      if (typeof v === "string" && (allowed as string[]).includes(v))
        out[k] = v as IssueEmphasis;
    }
    return out;
  } catch {
    return {};
  }
}
function parseStringMap<T extends string>(
  raw: unknown,
  allowed: T[],
): Record<string, T> {
  if (typeof raw !== "string") return {};
  try {
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return {};
    const out: Record<string, T> = {};
    for (const [k, v] of Object.entries(j)) {
      if (typeof v === "string" && (allowed as string[]).includes(v))
        out[k] = v as T;
    }
    return out;
  } catch {
    return {};
  }
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const fd = await request.formData();
  const intent = fd.get("intent");

  if (intent === "autosave" || intent === "submit") {
    const parsed = writeSchema.safeParse({
      intent,
      itemId: fd.get("itemId"),
      conclusions: fd.get("conclusions") ?? "{}",
      emphasisMap: fd.get("emphasisMap") ?? "{}",
      outlineMd: fd.get("outlineMd") ?? "",
    });
    if (!parsed.success)
      return data({ error: "Invalid input" }, { status: 400 });
    if (!(await isConclusionTrainingReady(client, parsed.data.itemId)))
      return data({ error: "Item not ready" }, { status: 403 });
    const patch = {
      conclusions: parseConclusionsMap(parsed.data.conclusions),
      emphasisMap: parseEmphasisMap(parsed.data.emphasisMap),
      outlineMd: parsed.data.outlineMd,
    };
    if (intent === "submit") {
      await submitConclusionAttempt(client, user.id, parsed.data.itemId, patch);
    } else {
      await upsertConclusionAttemptDraft(client, user.id, parsed.data.itemId, patch);
    }
    return data({ ok: true as const });
  }

  if (intent === "self_check") {
    const parsed = selfCheckSchema.safeParse({
      intent,
      itemId: fd.get("itemId"),
      conclusionMatches: fd.get("conclusionMatches") ?? "{}",
      emphasisMatches: fd.get("emphasisMatches") ?? "{}",
    });
    if (!parsed.success)
      return data({ error: "Invalid input" }, { status: 400 });
    await selfCheckConclusionAttempt(client, user.id, parsed.data.itemId, {
      conclusionMatches: parseStringMap<ConclusionMatch>(
        parsed.data.conclusionMatches,
        ["match", "partial", "wrong", "skip"],
      ),
      emphasisMatches: parseStringMap<EmphasisMatch>(
        parsed.data.emphasisMatches,
        ["aligned", "under", "over"],
      ),
    });
    return data({ ok: true as const });
  }

  if (intent === "reset") {
    const parsed = resetSchema.safeParse({
      intent,
      itemId: fd.get("itemId"),
    });
    if (!parsed.success)
      return data({ error: "Invalid input" }, { status: 400 });
    await resetConclusionAttempt(client, user.id, parsed.data.itemId);
    return data({ ok: true as const });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
