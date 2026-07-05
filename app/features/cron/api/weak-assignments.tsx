// feat-7-045 — 약점 개인 보충 과제 주간 cron.
// 호출: 외부 cron (Vercel Cron / GitHub Actions / 수동) → GET 또는 POST, 주 1회 권장.
// 보호: ?secret=<CRON_SECRET> 또는 Authorization: Bearer <CRON_SECRET>.
//
// 정책:
//  - cohorts.weak_assignment_auto = true + 미아카이브 반만 (opt-in)
//  - 생성기 내부 가드: 학생별 주 1회 · 최근 4주 출제 문제 제외 · 약점 데이터 부족 skip
//  - created_by = 반 소유자(owner)

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import { generateWeakAssignmentsForCohort } from "~/features/assignments/weak-personal.server";

import type { Route } from "./+types/weak-assignments";

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
  const url = new URL(request.url);
  const n = Math.max(1, Math.min(30, Number(url.searchParams.get("n")) || 10));
  const dueDays = Math.max(
    1,
    Math.min(30, Number(url.searchParams.get("dueDays")) || 7),
  );

  const { data: cohorts, error } = await adminClient
    .from("cohorts")
    .select("cohort_id, name, owner_id")
    .eq("weak_assignment_auto", true)
    .eq("is_archived", false)
    .is("deleted_at", null);
  if (error) return data({ error: error.message }, { status: 500 });

  const results = [];
  for (const c of cohorts ?? []) {
    try {
      const summary = await generateWeakAssignmentsForCohort(c.cohort_id, {
        n,
        dueDays,
        createdBy: c.owner_id,
      });
      results.push({ cohortId: c.cohort_id, cohortName: c.name, ...summary });
    } catch (e) {
      results.push({
        cohortId: c.cohort_id,
        cohortName: c.name,
        error: String((e as Error)?.message ?? e),
      });
    }
  }

  return data({
    ok: true,
    cohorts: results.length,
    createdTotal: results.reduce(
      (s, r) => s + ("created" in r ? (r.created ?? 0) : 0),
      0,
    ),
    results,
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  return run(request);
}

export async function action({ request }: Route.ActionArgs) {
  return run(request);
}
