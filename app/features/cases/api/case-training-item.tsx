// 강사 — case_training_items CRUD.
// intent: create | update_facts | approve | unapprove | reject | delete.

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  approveCaseTrainingItem,
  createCaseTrainingItem,
  softDeleteCaseTrainingItem,
  unapproveCaseTrainingItem,
  updateCaseTrainingItemFacts,
} from "~/features/cases/queries-case-training.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/case-training-item";

const schema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    caseId: z.string().uuid(),
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
  }
}
