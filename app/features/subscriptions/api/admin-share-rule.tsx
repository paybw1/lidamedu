// feat-8-029 Stage 2 — 강사 배분 규칙 액션 (manager+): create / toggle.

import { data, redirect } from "react-router";
import { z } from "zod";

import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  setPgFeeRate,
  upsertTaxProfile,
} from "~/features/subscriptions/settlement-params.server";
import {
  createShareRule,
  setShareRuleActive,
} from "~/features/subscriptions/settlements-admin.server";

import type { Route } from "./+types/admin-share-rule";

const createSchema = z.object({
  intent: z.literal("create"),
  instructorId: z.string().uuid(),
  targetKind: z.enum(["plan", "subject", "all"]),
  targetPlanId: z.string().uuid().optional().or(z.literal("")),
  targetSubjectCode: z.string().optional().or(z.literal("")),
  shareKind: z.enum(["percent", "fixed"]),
  shareValue: z.coerce.number().int().positive(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: z.string().max(300).optional().or(z.literal("")),
});

const toggleSchema = z.object({
  intent: z.literal("toggle"),
  ruleId: z.string().uuid(),
  isActive: z.enum(["true", "false"]),
});

// feat-8-031 — 정산 파라미터. 퍼센트로 입력받아 bp(1% = 100bp)로 저장한다(정수 보존).
const feeRateSchema = z.object({
  intent: z.literal("set_fee_rate"),
  feeRatePercent: z.coerce.number().min(0).max(100),
});

const taxProfileSchema = z.object({
  intent: z.literal("set_tax_profile"),
  instructorId: z.string().uuid(),
  taxType: z.enum(["withholding", "invoice", "none"]),
  taxRatePercent: z.coerce.number().min(0).max(100),
});

const toBp = (percent: number): number => Math.round(percent * 100);

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const { data: prof } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!roleAtLeast(prof?.role, "manager"))
    throw data("Forbidden", { status: 403 });

  const form = Object.fromEntries(await request.formData());
  const intent = form.intent;

  if (intent === "create") {
    const parsed = createSchema.safeParse(form);
    if (!parsed.success)
      return data({ error: "입력값을 확인해 주세요." }, { status: 400 });
    const v = parsed.data;
    if (v.targetKind === "plan" && !v.targetPlanId)
      return data({ error: "대상 상품을 선택해 주세요." }, { status: 400 });
    if (v.targetKind === "subject" && !v.targetSubjectCode)
      return data({ error: "대상 과목을 선택해 주세요." }, { status: 400 });
    const res = await createShareRule({
      instructorId: v.instructorId,
      targetKind: v.targetKind,
      targetPlanId: v.targetPlanId || null,
      targetSubjectCode: v.targetSubjectCode || null,
      shareKind: v.shareKind,
      shareValue: v.shareValue,
      effectiveFrom: v.effectiveFrom,
      memo: v.memo || null,
      createdBy: user.id,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return redirect("/admin/settlements/rules");
  }

  if (intent === "toggle") {
    const parsed = toggleSchema.safeParse(form);
    if (!parsed.success)
      return data({ error: "입력값을 확인해 주세요." }, { status: 400 });
    const res = await setShareRuleActive(
      parsed.data.ruleId,
      parsed.data.isActive === "true",
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return redirect("/admin/settlements/rules");
  }

  if (intent === "set_fee_rate") {
    const parsed = feeRateSchema.safeParse(form);
    if (!parsed.success)
      return data({ error: "수수료율은 0~100% 범위로 입력해 주세요." }, { status: 400 });
    const res = await setPgFeeRate(toBp(parsed.data.feeRatePercent), user.id);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return redirect("/admin/settlements/rules");
  }

  if (intent === "set_tax_profile") {
    const parsed = taxProfileSchema.safeParse(form);
    if (!parsed.success)
      return data({ error: "세금 유형·세율을 확인해 주세요." }, { status: 400 });
    const v = parsed.data;
    const res = await upsertTaxProfile({
      instructorId: v.instructorId,
      taxType: v.taxType,
      // 사업자(세금계산서)·없음은 원천징수가 없다 — 입력값과 무관하게 0.
      taxRateBp: v.taxType === "withholding" ? toBp(v.taxRatePercent) : 0,
      memo: null,
      actorId: user.id,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return redirect("/admin/settlements/rules");
  }

  return data({ error: "알 수 없는 intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
