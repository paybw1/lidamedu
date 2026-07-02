// 할인 생성·수정 — feat-8-028 Stage D. manager+ 전용.
import { data } from "react-router";
import { z } from "zod";

import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  deleteDiscount,
  upsertDiscount,
} from "~/features/subscriptions/discounts.server";

import type { Route } from "./+types/admin-discount";

const toIso = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const toNum = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.floor(n) : null;
};

const schema = z.object({
  intent: z.enum(["create", "update"]),
  discountId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().max(40).nullable(),
  kind: z.enum(["percent", "fixed"]),
  value: z.number().int().min(0),
  targetKind: z.enum(["all", "subject", "bundle", "plan"]),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  renewalUntil: z.string().datetime().nullable(),
  minAmountKrw: z.number().int().min(0).nullable(),
  maxUses: z.number().int().min(1).nullable(),
  perUserLimit: z.number().int().min(1).nullable(),
  isActive: z.boolean(),
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
  if (!role || !roleAtLeast(role, "manager")) {
    return data({ error: "Forbidden — manager 이상" }, { status: 403 });
  }

  const fd = await request.formData();

  // 삭제 — discountId 만 필요. (schema 는 create/update 전용)
  if (String(fd.get("intent") ?? "") === "delete") {
    const discountId = String(fd.get("discountId") ?? "");
    if (!z.string().uuid().safeParse(discountId).success) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    const del = await deleteDiscount(discountId);
    if (!del.ok) return data({ error: del.error }, { status: 400 });
    await logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "discount.delete",
      entityType: "discount",
      entityId: discountId,
    });
    return data({ ok: true });
  }

  const codeRaw = String(fd.get("code") ?? "").trim();
  const parsed = schema.safeParse({
    intent: fd.get("intent"),
    discountId: (() => {
      const s = String(fd.get("discountId") ?? "").trim();
      return s === "" ? null : s;
    })(),
    name: fd.get("name"),
    code: codeRaw === "" ? null : codeRaw,
    kind: fd.get("kind"),
    value: toNum(fd.get("value")) ?? 0,
    targetKind: fd.get("targetKind"),
    startsAt: toIso(fd.get("startsAt")),
    endsAt: toIso(fd.get("endsAt")),
    renewalUntil: toIso(fd.get("renewalUntil")),
    minAmountKrw: toNum(fd.get("minAmountKrw")),
    maxUses: toNum(fd.get("maxUses")),
    perUserLimit: toNum(fd.get("perUserLimit")),
    isActive: fd.get("isActive") === "1",
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "입력 오류" },
      { status: 400 },
    );
  }
  if (parsed.data.kind === "percent" && parsed.data.value > 100) {
    return data({ error: "% 할인은 100 이하" }, { status: 400 });
  }

  const targetPlanCodes = fd.getAll("targetPlanCodes").map(String);

  const res = await upsertDiscount(
    {
      discountId: parsed.data.discountId ?? undefined,
      name: parsed.data.name,
      code: parsed.data.code,
      kind: parsed.data.kind,
      value: parsed.data.value,
      targetKind: parsed.data.targetKind,
      targetPlanCodes:
        parsed.data.targetKind === "plan" ? targetPlanCodes : [],
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      renewalUntil: parsed.data.renewalUntil,
      minAmountKrw: parsed.data.minAmountKrw,
      maxUses: parsed.data.maxUses,
      perUserLimit: parsed.data.perUserLimit,
      isActive: parsed.data.isActive,
    },
    parsed.data.intent,
  );
  if (!res.ok) return data({ error: res.error }, { status: 400 });

  await logAuditEvent({
    actorId: user.id,
    actorRole: role,
    action: `discount.${parsed.data.intent}`,
    entityType: "discount",
    entityId: res.discountId,
    metadata: {
      name: parsed.data.name,
      code: parsed.data.code,
      kind: parsed.data.kind,
      value: parsed.data.value,
      isActive: parsed.data.isActive,
    },
  });

  return data({ ok: true, discountId: res.discountId });
}
