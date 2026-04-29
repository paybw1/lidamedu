import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { addBlankToSet } from "~/features/blanks/queries.server";

import type { Route } from "./+types/admin-add-blank";

const schema = z.object({
  setId: z.string().uuid(),
  selectionText: z.string().min(1).max(500),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data("Method Not Allowed", { status: 405 });
  }
  const fd = await request.formData();
  const parsed = schema.safeParse({
    setId: fd.get("setId"),
    selectionText: fd.get("selectionText"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;

  const result = await addBlankToSet(
    client,
    parsed.data.setId,
    parsed.data.selectionText,
  );
  if (!result.ok) return { ok: false, error: result.reason } as const;
  return { ok: true, newIdx: result.newIdx } as const;
}
