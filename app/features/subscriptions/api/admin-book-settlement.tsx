// feat-8-029 P6 — 도서 정산 액션 (manager+): generate / confirm / mark_paid / revert_draft.

import { data, redirect } from "react-router";
import { z } from "zod";

import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  generateBookSettlements,
  transitionBookSettlement,
} from "~/features/subscriptions/book-settlements-admin.server";

import type { Route } from "./+types/admin-book-settlement";

const generateSchema = z.object({
  intent: z.literal("generate"),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

const transitionSchema = z.object({
  intent: z.enum(["confirm", "mark_paid", "revert_draft"]),
  settlementId: z.string().uuid(),
  backTo: z.string().startsWith("/admin/").optional(),
});

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
  if (!roleAtLeast(prof?.role, "manager")) throw data("Forbidden", { status: 403 });

  const form = Object.fromEntries(await request.formData());

  if (form.intent === "generate") {
    const parsed = generateSchema.safeParse(form);
    if (!parsed.success) {
      return data({ error: "month 형식(YYYY-MM)을 확인해 주세요." }, { status: 400 });
    }
    const res = await generateBookSettlements(parsed.data.month, user.id);
    if (!res.ok) return data({ error: res.error ?? "생성 실패" }, { status: 400 });
    const msg =
      res.created.length === 0
        ? "생성된 정산이 없습니다 (해당 월 도서 판매 또는 배분규칙 없음)."
        : `${res.created.length}건 정산 생성/재생성` +
          (res.skippedConfirmed.length
            ? ` · 확정/지급 상태라 건너뜀: ${res.skippedConfirmed.join(", ")}`
            : "");
    return redirect(
      `/admin/settlements/book-runs?month=${parsed.data.month}&msg=${encodeURIComponent(msg)}`,
    );
  }

  const parsed = transitionSchema.safeParse(form);
  if (!parsed.success) return data({ error: "입력값을 확인해 주세요." }, { status: 400 });
  const to =
    parsed.data.intent === "confirm"
      ? "confirmed"
      : parsed.data.intent === "mark_paid"
        ? "paid"
        : "draft";
  const res = await transitionBookSettlement(parsed.data.settlementId, to, user.id);
  if (!res.ok) return data({ error: res.error }, { status: 400 });
  return redirect(parsed.data.backTo ?? "/admin/settlements/book-runs");
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
