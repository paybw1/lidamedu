// 자동 주간 cron — 활성 cohort_curricula 별로 "현재 주차"에 해당하는 과제를 자동 생성.
// 호출: 외부 cron (Cloudflare Cron Triggers / GitHub Actions / pg_cron / 수동) → GET 또는 POST.
// 보호: ?secret=<CRON_SECRET> 또는 Authorization: Bearer <CRON_SECRET>.
//
// 정책:
//  - cohort_curricula.is_active = true
//  - 현재 주차 = floor((today - start_date) / 7) + 1 (1-based, KST)
//  - 그 주차의 curriculum_week 가 존재해야 함
//  - 같은 cohort + source_week_id 로 이미 만든 assignment 가 없을 때만 변환
//  - 마감: now + ?dueDaysFromNow=N (기본 7일)
//  - lecture 항목은 자동 채점 불가 — convertWeekToAssignment 에서 제외

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import { convertWeekToAssignment } from "~/features/assignments/queries.server";

import type { Route } from "./+types/curriculum-weekly";

function checkAuth(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === expected) return true;
  const header = request.headers.get("authorization") ?? "";
  if (header === `Bearer ${expected}`) return true;
  return false;
}

function ymdKst(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}

function daysBetweenKst(from: string /* YYYY-MM-DD */, today: Date): number {
  // KST midnight 기준 일수.
  const start = new Date(`${from}T00:00:00+09:00`).getTime();
  const todayKst = new Date(`${ymdKst(today)}T00:00:00+09:00`).getTime();
  return Math.floor((todayKst - start) / 86_400_000);
}

interface ProcessedItem {
  cohortId: string;
  cohortName: string;
  curriculumId: string;
  curriculumName: string;
  weekNumber: number;
  status: "created" | "skipped_already_assigned" | "skipped_no_week" | "skipped_pre_start" | "error";
  assignmentId?: string;
  error?: string;
}

async function run(request: Request) {
  if (!checkAuth(request)) {
    return data({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const dueDaysParam = Number(url.searchParams.get("dueDaysFromNow") ?? 7);
  const dueDays = Number.isFinite(dueDaysParam) && dueDaysParam > 0
    ? Math.min(60, Math.floor(dueDaysParam))
    : 7;
  // 자동 생성 시 created_by — 운영자 계정. cohort owner_id 를 사용.
  const dueIso = new Date(Date.now() + dueDays * 86_400_000).toISOString();
  const today = new Date();

  // 활성 cohort_curricula + 부모 cohort owner + 커리큘럼 정보
  const { data: rows, error } = await adminClient
    .from("cohort_curricula")
    .select(
      "cohort_id, curriculum_id, start_date, is_active, cohorts!inner(name, owner_id, is_archived, deleted_at), curricula!inner(name, duration_weeks, is_published, deleted_at)",
    )
    .eq("is_active", true);
  if (error) {
    return data({ error: error.message }, { status: 500 });
  }
  const active = (rows ?? []).filter(
    (r) =>
      r.cohorts &&
      !r.cohorts.is_archived &&
      r.cohorts.deleted_at === null &&
      r.curricula &&
      r.curricula.is_published &&
      r.curricula.deleted_at === null,
  );

  const processed: ProcessedItem[] = [];
  for (const r of active) {
    const days = daysBetweenKst(r.start_date, today);
    if (days < 0) {
      processed.push({
        cohortId: r.cohort_id,
        cohortName: r.cohorts!.name,
        curriculumId: r.curriculum_id,
        curriculumName: r.curricula!.name,
        weekNumber: 0,
        status: "skipped_pre_start",
      });
      continue;
    }
    const weekNumber = Math.floor(days / 7) + 1;
    if (weekNumber > r.curricula!.duration_weeks) {
      // 종료된 트랙 — 건너뜀
      continue;
    }

    // 해당 주차 fetch
    const { data: week } = await adminClient
      .from("curriculum_weeks")
      .select("week_id")
      .eq("curriculum_id", r.curriculum_id)
      .eq("week_number", weekNumber)
      .maybeSingle();
    if (!week) {
      processed.push({
        cohortId: r.cohort_id,
        cohortName: r.cohorts!.name,
        curriculumId: r.curriculum_id,
        curriculumName: r.curricula!.name,
        weekNumber,
        status: "skipped_no_week",
      });
      continue;
    }

    // 이미 같은 source_week_id 로 만든 assignment 있는지
    const { data: existing } = await adminClient
      .from("assignments")
      .select("assignment_id")
      .eq("cohort_id", r.cohort_id)
      .eq("source_week_id", week.week_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) {
      processed.push({
        cohortId: r.cohort_id,
        cohortName: r.cohorts!.name,
        curriculumId: r.curriculum_id,
        curriculumName: r.curricula!.name,
        weekNumber,
        status: "skipped_already_assigned",
        assignmentId: existing.assignment_id,
      });
      continue;
    }

    // 변환 실행 — owner_id 가 created_by
    const res = await convertWeekToAssignment({
      weekId: week.week_id,
      cohortId: r.cohort_id,
      dueAt: dueIso,
      createdBy: r.cohorts!.owner_id,
    });
    if (res.ok) {
      processed.push({
        cohortId: r.cohort_id,
        cohortName: r.cohorts!.name,
        curriculumId: r.curriculum_id,
        curriculumName: r.curricula!.name,
        weekNumber,
        status: "created",
        assignmentId: res.assignmentId,
      });
    } else {
      processed.push({
        cohortId: r.cohort_id,
        cohortName: r.cohorts!.name,
        curriculumId: r.curriculum_id,
        curriculumName: r.curricula!.name,
        weekNumber,
        status: "error",
        error: res.error,
      });
    }
  }

  const summary = {
    activeCohortCurricula: active.length,
    created: processed.filter((p) => p.status === "created").length,
    skipped: processed.filter((p) => p.status.startsWith("skipped")).length,
    errors: processed.filter((p) => p.status === "error").length,
  };
  return data({ ok: true, summary, processed });
}

export async function loader({ request }: Route.LoaderArgs) {
  return run(request);
}
export async function action({ request }: Route.ActionArgs) {
  return run(request);
}
