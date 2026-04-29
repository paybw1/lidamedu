import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { forkBlankSet } from "~/features/blanks/queries.server";

import type { Route } from "./+types/fork";

const schema = z.object({ setId: z.string().uuid() });

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data("Method Not Allowed", { status: 405 });
  }
  const fd = await request.formData();
  const parsed = schema.safeParse({ setId: fd.get("setId") });
  if (!parsed.success) {
    return { ok: false, error: "Invalid input" } as const;
  }

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;

  const { data: profile } = await client
    .from("profiles")
    .select("role, name")
    .eq("profile_id", user.id)
    .maybeSingle();
  const role = profile?.role ?? "student";
  if (role !== "instructor" && role !== "admin") {
    return { ok: false, error: "Forbidden" } as const;
  }

  try {
    const newSetId = await forkBlankSet(
      client,
      parsed.data.setId,
      user.id,
      `${profile?.name ?? "내"} 버전`,
    );
    return redirect(`/admin/blanks/${newSetId}`);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Fork failed",
    } as const;
  }
}
