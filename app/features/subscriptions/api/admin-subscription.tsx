// feat-7-014 — 운영자 수강권 액션 endpoint. manager+ 권한.
// intent: grant / extend / cancel / find_user. 조정은 사유(note) 필수 — 감사 로그 기록.

import { data } from "react-router";
import { z } from "zod";

import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  cancelSubscriptionAdmin,
  extendSubscription,
  grantManualSubscription,
  searchStudentsForGrant,
} from "~/features/subscriptions/admin-queries.server";
import {
  SUBSCRIPTION_DURATION_MAX_DAYS,
  SUBSCRIPTION_NOTE_MAX_LENGTH,
  SUBSCRIPTION_NOTE_MIN_LENGTH,
} from "~/features/subscriptions/labels";

import type { Route } from "./+types/admin-subscription";

const noteSchema = z
  .string()
  .trim()
  .min(
    SUBSCRIPTION_NOTE_MIN_LENGTH,
    `조정 사유를 입력하세요 (${SUBSCRIPTION_NOTE_MIN_LENGTH}자 이상)`,
  )
  .max(SUBSCRIPTION_NOTE_MAX_LENGTH);
const grantSchema = z.object({
  userId: z.string().uuid(),
  planCode: z.string().min(1).max(64),
  durationDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(SUBSCRIPTION_DURATION_MAX_DAYS),
  note: noteSchema,
});
const extendSchema = z.object({
  subscriptionId: z.string().uuid(),
  addDays: z.coerce.number().int().min(1).max(SUBSCRIPTION_DURATION_MAX_DAYS),
  note: noteSchema,
});
const cancelSchema = z.object({
  subscriptionId: z.string().uuid(),
  note: noteSchema,
});
const findUserSchema = z.object({
  q: z.string().trim().min(1).max(60),
});

// zod 기본 메시지("Required", "Expected number, received nan",
// "Number must be less than or equal to 3650")가 화면에 새지 않도록 첫 issue 를 한국어로 매핑.
// 학생 상세 패널은 fetcher.submit(FormData) 프로그램 제출이라 브라우저 제약검증(max)이
// 돌지 않아 too_big 이 서버까지 도달한다. 스키마 메시지가 이미 한국어인 경우(note.min 의
// string too_small)는 그대로 통과 — 그래서 string too_small 은 매핑하지 않는다.
const FIELD_LABEL: Record<string, string> = {
  durationDays: "기간은",
  addDays: "연장 기간은",
  note: "사유는",
};

function issueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "입력 오류";
  const field = String(issue.path[0] ?? "");
  const label = FIELD_LABEL[field] ?? "입력값은";
  if (issue.code === "invalid_type")
    return field === "note"
      ? "사유를 입력하세요."
      : "입력값이 올바르지 않습니다.";
  if (issue.code === "too_big")
    return issue.type === "string"
      ? `${label} ${issue.maximum}자 이내로 입력하세요.`
      : `${label} ${issue.maximum} 이하로 입력하세요.`;
  if (issue.code === "too_small" && issue.type === "number")
    return `${label} ${issue.minimum} 이상으로 입력하세요.`;
  return issue.message;
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const { data: prof } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!roleAtLeast(prof?.role, "manager")) {
    return data({ error: "Forbidden — manager+" }, { status: 403 });
  }

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "find_user") {
    const parsed = findUserSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data({ error: "검색어를 입력하세요.", candidates: [] });
    const candidates = await searchStudentsForGrant(parsed.data.q);
    return data({ candidates });
  }
  if (intent === "grant") {
    const parsed = grantSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data({ error: issueMessage(parsed.error) }, { status: 400 });
    const res = await grantManualSubscription({
      ...parsed.data,
      actorId: user.id,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data(res);
  }
  if (intent === "extend") {
    const parsed = extendSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data({ error: issueMessage(parsed.error) }, { status: 400 });
    const res = await extendSubscription(
      parsed.data.subscriptionId,
      parsed.data.addDays,
      parsed.data.note,
      user.id,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data(res);
  }
  if (intent === "cancel") {
    const parsed = cancelSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data({ error: issueMessage(parsed.error) }, { status: 400 });
    const res = await cancelSubscriptionAdmin(
      parsed.data.subscriptionId,
      parsed.data.note,
      user.id,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data(res);
  }
  return data({ error: "Unknown intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
