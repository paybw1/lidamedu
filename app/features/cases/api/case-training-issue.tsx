// 강사 — case_training_issues 행 단위 CRUD.
// intent: create | update | approve | unapprove | delete.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  approveCaseTrainingIssue,
  bulkInsertCaseTrainingIssues,
  softDeleteCaseTrainingIssue,
  unapproveCaseTrainingIssue,
  updateCaseTrainingIssue,
  updateCaseTrainingIssueConclusion,
} from "~/features/cases/queries-case-training.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/case-training-issue";

const schema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    itemId: z.string().uuid(),
    label: z.string().min(1).max(120),
    descriptionMd: z.string().max(2000).optional(),
    importance: z.enum(["core", "side"]),
    refHint: z.string().max(200).optional(),
  }),
  z.object({
    intent: z.literal("update"),
    issueId: z.string().uuid(),
    label: z.string().min(1).max(120).optional(),
    descriptionMd: z.string().max(2000).optional(),
    importance: z.enum(["core", "side"]).optional(),
    refHint: z.string().max(200).optional(),
    orderIndex: z.coerce.number().int().optional(),
  }),
  z.object({
    intent: z.literal("approve"),
    issueId: z.string().uuid(),
  }),
  z.object({
    intent: z.literal("unapprove"),
    issueId: z.string().uuid(),
  }),
  z.object({
    intent: z.literal("delete"),
    issueId: z.string().uuid(),
  }),
  z.object({
    intent: z.literal("update_conclusion"),
    issueId: z.string().uuid(),
    weight: z.coerce.number().int().min(0).max(100).nullable().optional(),
    modelConclusionDirection: z.string().max(120).optional(),
    modelConclusionMd: z.string().max(2000).optional(),
  }),
]);

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const raw: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) raw[k] = v;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  switch (input.intent) {
    case "create": {
      await bulkInsertCaseTrainingIssues(
        client,
        input.itemId,
        [
          {
            label: input.label,
            descriptionMd: input.descriptionMd ?? "",
            importance: input.importance,
            refHint: input.refHint,
          },
        ],
        "staff",
        user.id,
      );
      return data({ ok: true as const });
    }
    case "update": {
      await updateCaseTrainingIssue(client, input.issueId, {
        label: input.label,
        descriptionMd: input.descriptionMd,
        importance: input.importance,
        refHint: input.refHint ?? null,
        orderIndex: input.orderIndex,
      });
      return data({ ok: true as const });
    }
    case "approve": {
      await approveCaseTrainingIssue(client, input.issueId, user.id);
      return data({ ok: true as const });
    }
    case "unapprove": {
      await unapproveCaseTrainingIssue(client, input.issueId);
      return data({ ok: true as const });
    }
    case "delete": {
      await softDeleteCaseTrainingIssue(client, input.issueId);
      return data({ ok: true as const });
    }
    case "update_conclusion": {
      await updateCaseTrainingIssueConclusion(client, input.issueId, {
        weight: input.weight,
        modelConclusionDirection: input.modelConclusionDirection,
        modelConclusionMd: input.modelConclusionMd,
      });
      return data({ ok: true as const });
    }
  }
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
