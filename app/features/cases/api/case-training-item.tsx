// 강사 — case_training_items CRUD.
// intent: create | update_facts | approve | unapprove | reject | delete.

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  approveCaseTrainingItem,
  createCaseTrainingItem,
  createProblemTrainingItem,
  softDeleteCaseTrainingItem,
  unapproveCaseTrainingItem,
  updateCaseTrainingItemFacts,
  updateCaseTrainingItemLinkedGs,
} from "~/features/cases/queries-case-training.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/case-training-item";

const schema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    caseId: z.string().uuid(),
  }),
  // feat-2-028 — 2차 기출 문항 소스.
  z.object({
    intent: z.literal("create_problem"),
    problemId: z.string().uuid(),
  }),
  z.object({
    intent: z.literal("update_facts"),
    itemId: z.string().uuid(),
    factsMd: z.string().max(8000),
  }),
  z.object({
    intent: z.literal("approve"),
    itemId: z.string().uuid(),
  }),
  z.object({
    intent: z.literal("unapprove"),
    itemId: z.string().uuid(),
  }),
  z.object({
    intent: z.literal("delete"),
    itemId: z.string().uuid(),
  }),
  z.object({
    intent: z.literal("update_linked_gs"),
    itemId: z.string().uuid(),
    roundId: z.string().uuid().or(z.literal("")).optional(),
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
      const itemId = await createCaseTrainingItem(client, input.caseId, user.id);
      return redirect(`/admin/case-training/${itemId}`);
    }
    case "create_problem": {
      const itemId = await createProblemTrainingItem(
        client,
        input.problemId,
        user.id,
      );
      return redirect(`/admin/case-training/${itemId}`);
    }
    case "update_facts": {
      await updateCaseTrainingItemFacts(client, input.itemId, input.factsMd, "staff");
      return data({ ok: true as const });
    }
    case "approve": {
      await approveCaseTrainingItem(client, input.itemId, user.id);
      return data({ ok: true as const });
    }
    case "unapprove": {
      await unapproveCaseTrainingItem(client, input.itemId);
      return data({ ok: true as const });
    }
    case "delete": {
      await softDeleteCaseTrainingItem(client, input.itemId);
      return redirect("/admin/case-training");
    }
    case "update_linked_gs": {
      await updateCaseTrainingItemLinkedGs(
        client,
        input.itemId,
        input.roundId && input.roundId.length > 0 ? input.roundId : null,
      );
      return data({ ok: true as const });
    }
  }
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
