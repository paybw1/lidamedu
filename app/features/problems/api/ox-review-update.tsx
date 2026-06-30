// 운영자 OX 검토 화면에서 한 항목(choice 또는 box-item) 의 ox_truth / ox_ineligible 을 인라인 수정.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { updateOxReviewItem } from "~/features/problems/queries.server";

import type { Route } from "./+types/ox-review-update";

const schema = z.object({
  refType: z.enum(["choice", "box"]),
  refId: z.string().uuid(),
  oxTruth: z.union([z.literal("O"), z.literal("X"), z.literal("")]).optional(),
  oxIneligible: z.union([z.literal("true"), z.literal("false")]).optional(),
  // 스태프 수동 숨김 토글(OX 패널·검수 공용). "true"=숨김, "false"=복원.
  oxHidden: z.union([z.literal("true"), z.literal("false")]).optional(),
});

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
  const parsed = schema.safeParse({
    refType: fd.get("refType"),
    refId: fd.get("refId"),
    oxTruth: fd.get("oxTruth") == null ? undefined : String(fd.get("oxTruth")),
    oxIneligible:
      fd.get("oxIneligible") == null ? undefined : String(fd.get("oxIneligible")),
    oxHidden:
      fd.get("oxHidden") == null ? undefined : String(fd.get("oxHidden")),
  });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }

  const truth =
    parsed.data.oxTruth === undefined
      ? undefined
      : parsed.data.oxTruth === ""
        ? null
        : parsed.data.oxTruth;
  const ineligible =
    parsed.data.oxIneligible === undefined
      ? undefined
      : parsed.data.oxIneligible === "true";
  const hidden =
    parsed.data.oxHidden === undefined
      ? undefined
      : parsed.data.oxHidden === "true";

  await updateOxReviewItem(client, parsed.data.refType, parsed.data.refId, {
    oxTruth: truth,
    oxIneligible: ineligible,
    hidden,
    hiddenBy: hidden ? user.id : null,
  });

  return data({ ok: true });
}
