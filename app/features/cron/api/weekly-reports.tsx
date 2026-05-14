// 주간 학습 리포트 발송 cron (feat-7-022).
// 호출: 외부 cron 매주 월요일 새벽. CRON_SECRET 보호.
//
// 동작:
//  - 전체 cohort 멤버에게 학생 리포트 발송 (notify_channels.email 활성자만)
//  - 활성 cohort 의 owner(강사/원장) 에게 cohort 별 운영 리포트 발송
//  - 각 발송은 best-effort — 실패해도 다음 수신자 진행

import { data } from "react-router";

import { dispatchWeeklyReports } from "~/features/reports/notify.server";

import type { Route } from "./+types/weekly-reports";

function checkAuth(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === expected) return true;
  const header = request.headers.get("authorization") ?? "";
  if (header === `Bearer ${expected}`) return true;
  return false;
}

async function run(request: Request) {
  if (!checkAuth(request)) {
    return data({ error: "Forbidden" }, { status: 403 });
  }
  const result = await dispatchWeeklyReports();
  return data({ ok: true, ...result });
}

export async function loader({ request }: Route.LoaderArgs) {
  return run(request);
}
export async function action({ request }: Route.ActionArgs) {
  return run(request);
}
