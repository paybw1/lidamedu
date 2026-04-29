import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { removeBlankFromSet } from "~/features/blanks/queries.server";

import type { Route } from "./+types/admin-remove-blank";

const schema = z.object({
  setId: z.string().uuid(),
  blankIdx: z.coerce.number().int().min(1),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data("Method Not Allowed", { status: 405 });
  }
  const fd = await request.formData();
  const parsed = schema.safeParse({
    setId: fd.get("setId"),
    blankIdx: fd.get("blankIdx"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;

  const result = await removeBlankFromSet(
    client,
    parsed.data.setId,
    parsed.data.blankIdx,
  );
  if (!result.ok) return { ok: false, error: result.reason } as const;
  return { ok: true } as const;
}
