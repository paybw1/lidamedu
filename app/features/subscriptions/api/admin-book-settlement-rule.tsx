// feat-8-029 P6 — 도서 배분규칙 액션 (manager+): create / toggle.

import { data, redirect } from "react-router";
import { z } from "zod";

import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  createBookSettlementRule,
  toggleBookSettlementRule,
} from "~/features/subscriptions/book-settlements-admin.server";

import type { Route } from "./+types/admin-book-settlement-rule";

const createSchema = z.object({
  intent: z.literal("create"),
  bookId: z.string().uuid().optional().or(z.literal("")),
  payeeName: z.string().min(1).max(200),
  shareKind: z.enum(["percent", "fixed"]),
  shareValue: z.coerce.number().int().nonnegative(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: z.string().max(300).optional().or(z.literal("")),
});

const toggleSchema = z.object({
  intent: z.literal("toggle"),
  ruleId: z.string().uuid(),
  isActive: z.enum(["true", "false"]),
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
  const intent = form.intent;

  if (intent === "create") {
    const parsed = createSchema.safeParse(form);
    if (!parsed.success) return data({ error: "입력값을 확인해 주세요." }, { status: 400 });
    const v = parsed.data;
    const res = await createBookSettlementRule({
      bookId: v.bookId || null,
      payeeName: v.payeeName,
      shareKind: v.shareKind,
      shareValue: v.shareValue,
      effectiveFrom: v.effectiveFrom,
      memo: v.memo || null,
      createdBy: user.id,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return redirect("/admin/settlements/books");
  }

  if (intent === "toggle") {
    const parsed = toggleSchema.safeParse(form);
    if (!parsed.success) return data({ error: "입력값을 확인해 주세요." }, { status: 400 });
    const res = await toggleBookSettlementRule(
      parsed.data.ruleId,
      parsed.data.isActive === "true",
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return redirect("/admin/settlements/books");
  }

  return data({ error: "알 수 없는 intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
