// 운영자 — 논점 승인/반려/수정/삭제/일괄. staff only.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  approveIssue,
  rejectIssue,
  softDeleteIssue,
  updateIssue,
} from "~/features/gs/queries-issues.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/issue-review";

const approveSchema = z.object({
  intent: z.literal("approve"),
  issueId: z.string().uuid(),
});
const rejectSchema = z.object({
  intent: z.literal("reject"),
  issueId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});
const updateSchema = z.object({
  intent: z.literal("update"),
  issueId: z.string().uuid(),
  label: z.string().min(2).max(60).optional(),
  descriptionMd: z.string().max(600).optional(),
  importance: z.enum(["core", "side"]).optional(),
  refArticleId: z.string().uuid().nullable().optional(),
  refCaseId: z.string().uuid().nullable().optional(),
  refHint: z.string().max(100).nullable().optional(),
  orderIndex: z.coerce.number().int().min(0).optional(),
});
const deleteSchema = z.object({
  intent: z.literal("delete"),
  issueId: z.string().uuid(),
});
const bulkApproveSchema = z.object({
  intent: z.literal("bulk_approve"),
  issueIds: z.string(),
});
const bulkRejectSchema = z.object({
  intent: z.literal("bulk_reject"),
  issueIds: z.string(),
  reason: z.string().min(1).max(500),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = fd.get("intent");

  if (intent === "approve") {
    const parsed = approveSchema.safeParse({
      intent,
      issueId: fd.get("issueId"),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    await approveIssue(client, parsed.data.issueId, user.id);
    return data({ ok: true });
  }

  if (intent === "reject") {
    const parsed = rejectSchema.safeParse({
      intent,
      issueId: fd.get("issueId"),
      reason: fd.get("reason"),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    await rejectIssue(client, parsed.data.issueId, parsed.data.reason);
    return data({ ok: true });
  }

  if (intent === "update") {
    const refArticleRaw = fd.get("refArticleId");
    const refCaseRaw = fd.get("refCaseId");
    const refHintRaw = fd.get("refHint");
    const parsed = updateSchema.safeParse({
      intent,
      issueId: fd.get("issueId"),
      label: fd.get("label") ?? undefined,
      descriptionMd: fd.get("descriptionMd") ?? undefined,
      importance: fd.get("importance") ?? undefined,
      refArticleId:
        refArticleRaw === "" ? null : (refArticleRaw ?? undefined),
      refCaseId: refCaseRaw === "" ? null : (refCaseRaw ?? undefined),
      refHint: refHintRaw === "" ? null : (refHintRaw ?? undefined),
      orderIndex: fd.get("orderIndex") ?? undefined,
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    await updateIssue(client, parsed.data.issueId, {
      label: parsed.data.label,
      descriptionMd: parsed.data.descriptionMd,
      importance: parsed.data.importance,
      refArticleId: parsed.data.refArticleId,
      refCaseId: parsed.data.refCaseId,
      refHint: parsed.data.refHint,
      orderIndex: parsed.data.orderIndex,
    });
    return data({ ok: true });
  }

  if (intent === "delete") {
    const parsed = deleteSchema.safeParse({
      intent,
      issueId: fd.get("issueId"),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    await softDeleteIssue(client, parsed.data.issueId);
    return data({ ok: true });
  }

  if (intent === "bulk_approve") {
    const parsed = bulkApproveSchema.safeParse({
      intent,
      issueIds: fd.get("issueIds"),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const ids = JSON.parse(parsed.data.issueIds);
    if (!Array.isArray(ids))
      return data({ error: "issueIds must be array" }, { status: 400 });
    let count = 0;
    for (const id of ids) {
      if (typeof id !== "string") continue;
      await approveIssue(client, id, user.id);
      count++;
    }
    return data({ ok: true, count });
  }

  if (intent === "bulk_reject") {
    const parsed = bulkRejectSchema.safeParse({
      intent,
      issueIds: fd.get("issueIds"),
      reason: fd.get("reason"),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const ids = JSON.parse(parsed.data.issueIds);
    if (!Array.isArray(ids))
      return data({ error: "issueIds must be array" }, { status: 400 });
    let count = 0;
    for (const id of ids) {
      if (typeof id !== "string") continue;
      await rejectIssue(client, id, parsed.data.reason);
      count++;
    }
    return data({ ok: true, count });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
