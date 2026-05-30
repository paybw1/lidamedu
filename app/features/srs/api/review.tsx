// SRS v2 ③ — POST /api/srs/review
// 복습 제출. body: item_id, grade, elapsed_ms.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { submitReview } from "~/features/srs/srs.server";

import type { Route } from "./+types/review";

const Schema = z.object({
  itemId: z.string().uuid(),
  grade: z.coerce.number().int().min(0).max(5),
  elapsedMs: z.coerce.number().int().nonnegative().optional().nullable(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "method-not-allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "unauthorized" }, { status: 401 });

  // JSON body 또는 form data 둘 다 허용.
  let body: unknown;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await request.json();
  } else {
    body = Object.fromEntries(await request.formData());
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return data(
      { error: "invalid-input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await submitReview(client, user.id, {
      itemId: parsed.data.itemId,
      grade: parsed.data.grade as 0 | 1 | 2 | 3 | 4 | 5,
      elapsedMs: parsed.data.elapsedMs ?? null,
    });
    return data({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return data({ error: msg }, { status: 500 });
  }
}
