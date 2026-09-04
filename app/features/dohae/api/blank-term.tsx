// POST /api/dohae/blank-term — feat-2-037. 운영자가 빈칸 낱말을 빼거나 되돌린다.
//
// ★쓰기는 **요청 클라이언트**로. adminClient 를 쓰면 RLS(`dohae_blank_terms_staff_write`)
//   가 무력해지고 누가 뺐는지도 남지 않는다. action 의 역할 확인과 RLS 가 두 겹이다.
// ★낱말을 **지우지 않는다** — `excluded_at` 을 켤 뿐이다. 왜 뺐는지 되볼 수 있어야 하고,
//   추출 스크립트를 다시 돌려도 이 판단은 보존된다(gen-blank-terms).

import type { Route } from "./+types/blank-term";

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

const schema = z.object({
  termId: z.string().uuid(),
  excluded: z.enum(["1", "0"]),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") throw data("Method not allowed", { status: 405 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  if ((await getStaffRole(client, user.id)) === null)
    throw data("Forbidden", { status: 403 });

  const parsed = schema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) throw data("Bad request", { status: 400 });
  const excluded = parsed.data.excluded === "1";

  const { error } = await client
    .from("dohae_blank_terms")
    .update({
      excluded_at: excluded ? new Date().toISOString() : null,
      excluded_by: excluded ? user.id : null,
      updated_at: new Date().toISOString(),
    })
    .eq("term_id", parsed.data.termId);
  if (error) throw error;

  return { ok: true };
}
