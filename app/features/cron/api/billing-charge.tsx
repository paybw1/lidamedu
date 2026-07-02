// 자동결제 갱신 청구 cron (feat-8-028 Stage 5).
// 만료 24h 이내인 auto_renew 구독을 빌링키로 청구·연장. CRON_SECRET 인증.
// 청구 성공 시 expires_at 이 +기간 되어 다음 실행에서 재선택되지 않음(중복청구 방지).

import { data } from "react-router";

import { chargeDueRenewals } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/billing-charge";

function checkAuth(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === expected) return true;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

async function run(request: Request) {
  if (!checkAuth(request)) {
    return data({ error: "Forbidden" }, { status: 403 });
  }
  const summary = await chargeDueRenewals();
  return data({ ok: true, summary });
}

export async function loader({ request }: Route.LoaderArgs) {
  return run(request);
}
export async function action({ request }: Route.ActionArgs) {
  return run(request);
}
