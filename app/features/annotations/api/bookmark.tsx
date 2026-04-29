import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import {
  annotationTargetTypeSchema,
  upsertBookmarkRating,
  upsertBookmarkStepNote,
} from "../queries.server";

import type { Route } from "./+types/bookmark";

const ratingSchema = z.object({
  intent: z.literal("rating"),
  targetType: annotationTargetTypeSchema,
  targetId: z.string().uuid(),
  starLevel: z.coerce.number().int().min(0).max(5),
});

const stepSchema = z.object({
  intent: z.literal("step"),
  targetType: annotationTargetTypeSchema,
  targetId: z.string().uuid(),
  stepLevel: z.coerce.number().int().min(1).max(5),
  stepNote: z
    .string()
    .max(2000)
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v : null)),
});

const schema = z.discriminatedUnion("intent", [ratingSchema, stepSchema]);

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ ok: false, error: "method-not-allowed" }, { status: 405 });
  }

  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return data({ ok: false, error: "unauthorized" }, { status: 401, headers });
  }

  const formData = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return data(
      { ok: false, error: "invalid-input", issues: parsed.error.issues },
      { status: 400, headers },
    );
  }

  if (parsed.data.intent === "rating") {
    const { targetType, targetId, starLevel } = parsed.data;
    const bookmark = await upsertBookmarkRating(
      client,
      user.id,
      targetType,
      targetId,
      starLevel,
    );
    return data({ ok: true, bookmark }, { headers });
  }

  const { targetType, targetId, stepLevel, stepNote } = parsed.data;
  const bookmark = await upsertBookmarkStepNote(
    client,
    user.id,
    targetType,
    targetId,
    stepLevel,
    stepNote,
  );
  return data({ ok: true, bookmark }, { headers });
}
