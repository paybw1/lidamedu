// 미결제 주문 정리 cron — 무통장 입금 기한 초과(feat-11-004 4b) + 결제시도 만료(feat-11-011 P1).
// 관리자 주문 화면 로드 시 lazy 만료 처리도 있으므로 이 cron 은 이중 안전망.
// ★둘을 한 슬롯에서 돈다 — 같은 관심사(끝나지 않은 결제 정리)라 크론을 나눌 이유가 없다.

import { data } from "react-router";

import { expireOverdueBankTransfers } from "~/features/orders/bank-transfer.server";
import { expireStaleCheckoutOrders } from "~/features/orders/orders.server";

import type { Route } from "./+types/bank-transfer-expire";

function checkAuth(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === expected) return true;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

async function run(request: Request) {
  if (!checkAuth(request)) return data({ error: "Forbidden" }, { status: 403 });
  const cancelled = await expireOverdueBankTransfers();
  const expired = await expireStaleCheckoutOrders();
  return data({ ok: true, cancelled, expired });
}

export async function loader({ request }: Route.LoaderArgs) {
  return run(request);
}
export async function action({ request }: Route.ActionArgs) {
  return run(request);
}
