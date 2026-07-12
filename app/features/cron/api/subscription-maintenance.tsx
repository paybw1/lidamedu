// 구독 유지보수 cron (feat-8-028).
//  #4 — 만료 지난 활성 구독을 expired 로 강등(접근은 expires_at 로 이미 차단되지만
//       status='active' 잔존이 운영자 화면·집계와 모순되던 것을 정리).
//       ★단, dunning 유예 중(grace_until 미래)인 구독은 제외 — 재시도·접근을 위해
//       active 를 유지해야 한다(feat-8-030). 유예까지 지나면 그때 expired.
//  #3 — 1시간 넘게 미완료(pending)인 결제를 failed 로 마킹(결제 중단 고아 정리).
// 외부 cron 일별 호출. CRON_SECRET 인증. adminClient(RLS 우회).

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";

import type { Route } from "./+types/subscription-maintenance";

// 미완료 결제를 실패 처리하기까지의 유예(분). 결제창 이동·확인 지연 대비 넉넉히.
const STALE_PENDING_MINUTES = 60;

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
  const nowIso = new Date().toISOString();
  const staleIso = new Date(
    Date.now() - STALE_PENDING_MINUTES * 60_000,
  ).toISOString();

  // #4 — 만료 지난 활성 구독 → expired. (dunning 유예 중인 건은 제외 — grace_until 미래면 유지)
  const { data: expired, error: expErr } = await adminClient
    .from("user_subscriptions")
    .update({ status: "expired", updated_at: nowIso })
    .eq("status", "active")
    .lt("expires_at", nowIso)
    .or(`grace_until.is.null,grace_until.lt.${nowIso}`)
    .select("subscription_id");
  if (expErr) return data({ error: expErr.message }, { status: 500 });

  // #3 — 유예 초과 pending 결제 → failed.
  const { data: failedPayments, error: payErr } = await adminClient
    .from("payments")
    .update({
      status: "failed",
      failure_reason: "미결제 자동 만료",
      updated_at: nowIso,
    })
    .eq("status", "pending")
    .lt("created_at", staleIso)
    .select("payment_id");
  if (payErr) return data({ error: payErr.message }, { status: 500 });

  return data({
    ok: true,
    summary: {
      expiredSubscriptions: expired?.length ?? 0,
      failedStalePayments: failedPayments?.length ?? 0,
    },
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  return run(request);
}
export async function action({ request }: Route.ActionArgs) {
  return run(request);
}
