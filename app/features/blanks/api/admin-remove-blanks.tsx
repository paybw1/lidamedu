// 여러 빈칸을 한 번의 호출로 삭제. "본문에 미매칭된 빈칸 일괄 삭제" UX 에서 사용.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { removeBlanksFromSet } from "~/features/blanks/queries.server";

import type { Route } from "./+types/admin-remove-blanks";

const schema = z.object({
  setId: z.string().uuid(),
  // CSV (comma-separated) of blank idx integers — FormData 친화 (배열 전송보다 단순).
  blankIdxs: z.string(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data("Method Not Allowed", { status: 405 });
  }
  const fd = await request.formData();
  const parsed = schema.safeParse({
    setId: fd.get("setId"),
    blankIdxs: fd.get("blankIdxs"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const idxs = parsed.data.blankIdxs
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (idxs.length === 0) {
    return { ok: false, error: "삭제할 빈칸 idx 가 없습니다." } as const;
  }

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;

  const result = await removeBlanksFromSet(client, parsed.data.setId, idxs);
  if (!result.ok) return { ok: false, error: result.reason } as const;
  return { ok: true, removed: result.removed } as const;
}
