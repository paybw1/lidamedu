// 학생 — 판례 기반 쟁점추출 attempt CRUD.
// intent: autosave / submit / self_check / reset.
// 서버 게이트: item.review_status='approved' 만 응시 가능 (RLS 도 동일하지만 명시).

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  resetCaseAttempt,
  selfCheckCaseAttempt,
  submitCaseAttempt,
  upsertCaseAttemptDraft,
} from "~/features/cases/queries-case-training.server";

import type { Route } from "./+types/case-training-attempt";

const autosaveSchema = z.object({
  intent: z.literal("autosave"),
  itemId: z.string().uuid(),
  studentIssuesMd: z.string().max(20000),
});
const submitSchema = z.object({
  intent: z.literal("submit"),
  itemId: z.string().uuid(),
  studentIssuesMd: z.string().max(20000),
});
const selfCheckSchema = z.object({
  intent: z.literal("self_check"),
  itemId: z.string().uuid(),
  hits: z.string(),
  missed: z.string(),
  wrong: z.string(),
});
const resetSchema = z.object({
  intent: z.literal("reset"),
  itemId: z.string().uuid(),
});

function parseStringArray(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  try {
    const j = JSON.parse(raw);
    if (!Array.isArray(j)) return [];
    return j.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

async function ensureItemApproved(
  client: ReturnType<typeof makeServerClient>[0],
  itemId: string,
): Promise<boolean> {
  const { data: row } = await client
    .from("case_training_items")
    .select("review_status, deleted_at")
    .eq("item_id", itemId)
    .maybeSingle();
  return row?.review_status === "approved" && row.deleted_at === null;
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

  if (intent === "autosave") {
    const parsed = autosaveSchema.safeParse({
      intent,
      itemId: fd.get("itemId"),
      studentIssuesMd: fd.get("studentIssuesMd") ?? "",
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    if (!(await ensureItemApproved(client, parsed.data.itemId)))
      return data({ error: "Item not available" }, { status: 403 });
    await upsertCaseAttemptDraft(
      client,
      user.id,
      parsed.data.itemId,
      parsed.data.studentIssuesMd,
    );
    return data({ ok: true as const });
  }

  if (intent === "submit") {
    const parsed = submitSchema.safeParse({
      intent,
      itemId: fd.get("itemId"),
      studentIssuesMd: fd.get("studentIssuesMd") ?? "",
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    if (!(await ensureItemApproved(client, parsed.data.itemId)))
      return data({ error: "Item not available" }, { status: 403 });
    await submitCaseAttempt(
      client,
      user.id,
      parsed.data.itemId,
      parsed.data.studentIssuesMd,
    );
    return data({ ok: true as const });
  }

  if (intent === "self_check") {
    const parsed = selfCheckSchema.safeParse({
      intent,
      itemId: fd.get("itemId"),
      hits: fd.get("hits") ?? "[]",
      missed: fd.get("missed") ?? "[]",
      wrong: fd.get("wrong") ?? "[]",
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    await selfCheckCaseAttempt(client, user.id, parsed.data.itemId, {
      hits: parseStringArray(parsed.data.hits),
      missed: parseStringArray(parsed.data.missed),
      wrong: parseStringArray(parsed.data.wrong),
    });
    return data({ ok: true as const });
  }

  if (intent === "reset") {
    const parsed = resetSchema.safeParse({
      intent,
      itemId: fd.get("itemId"),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    await resetCaseAttempt(client, user.id, parsed.data.itemId);
    return data({ ok: true as const });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}
