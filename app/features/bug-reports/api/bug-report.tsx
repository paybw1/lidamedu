import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { createBugReport } from "~/features/bug-reports/queries.server";

import type { Route } from "./+types/bug-report";

const schema = z.object({
  intent: z.literal("create"),
  url: z.string().min(1).max(2000),
  message: z.string().min(1).max(5000),
  userAgent: z.string().max(1000).optional(),
});

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
  const parsed = schema.safeParse(
    Object.fromEntries(await request.formData()),
  );
  if (!parsed.success) {
    return data({ ok: false, error: "invalid-input" }, { status: 400, headers });
  }
  const res = await createBugReport(client, user.id, {
    url: parsed.data.url,
    message: parsed.data.message,
    userAgent: parsed.data.userAgent ?? null,
  });
  if (!res.ok) {
    return data({ ok: false, error: res.error }, { status: 500, headers });
  }
  return data({ ok: true }, { headers });
}
