// 동료 채점 자동 배정 cron — 응시 종료된 회차에 대해 자동 배정.
// 호출: 외부 cron (Vercel Cron / GitHub Actions / 운영자 수동) → GET 또는 POST.
// 보호: ?secret=<CRON_SECRET> 또는 Authorization: Bearer <CRON_SECRET>.
//
// 정책:
//  - 회차 status='published' AND end_at < now()
//  - 제출자(submitted_at NOT NULL) 가 2명 이상
//  - 그 회차에 동료 채점 배정이 단 1건도 없을 때만 (이미 운영자가 수동 배정한 회차는 건드리지 않음)
//  - 답안당 default 3명 reviewer (?perSubmission= 으로 조정 가능)

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import { notifyPeerAssignments } from "~/features/gs/notify.server";
import { assignPeerReviewers } from "~/features/gs/queries-peer.server";

import type { Route } from "./+types/cron-auto-assign";

function checkAuth(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("secret");
  if (queryToken === expected) return true;
  const header = request.headers.get("authorization") ?? "";
  if (header === `Bearer ${expected}`) return true;
  return false;
}

async function run(request: Request) {
  if (!checkAuth(request)) {
    return data({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const perSubmissionParam = Number(url.searchParams.get("perSubmission") ?? 3);
  const perSubmission =
    Number.isFinite(perSubmissionParam) && perSubmissionParam > 0
      ? Math.min(10, Math.floor(perSubmissionParam))
      : 3;

  // admin client 로 수행 — RLS 와 무관하게 회차 + 배정 조회/생성.
  const nowIso = new Date().toISOString();
  const { data: rounds, error: rErr } = await adminClient
    .from("gs_rounds")
    .select("round_id, title, subject, end_at, status")
    .eq("status", "published")
    .lt("end_at", nowIso);
  if (rErr) {
    return data({ error: rErr.message }, { status: 500 });
  }

  const result = {
    inspected: rounds?.length ?? 0,
    autoAssigned: 0,
    totalAssignmentsCreated: 0,
    rounds: [] as { roundId: string; title: string; created: number; reason?: string }[],
  };

  for (const r of rounds ?? []) {
    // 이미 배정 있는지 확인.
    const { count: existingCount } = await adminClient
      .from("gs_peer_assignments")
      .select("assignment_id", { count: "exact", head: true })
      .eq("round_id", r.round_id);
    if ((existingCount ?? 0) > 0) {
      result.rounds.push({
        roundId: r.round_id,
        title: r.title,
        created: 0,
        reason: "already-assigned",
      });
      continue;
    }
    // 제출자 ≥ 2 검사.
    const { count: submittedCount } = await adminClient
      .from("gs_submissions")
      .select("submission_id", { count: "exact", head: true })
      .eq("round_id", r.round_id)
      .not("submitted_at", "is", null);
    if ((submittedCount ?? 0) < 2) {
      result.rounds.push({
        roundId: r.round_id,
        title: r.title,
        created: 0,
        reason: "insufficient-submissions",
      });
      continue;
    }

    const ar = await assignPeerReviewers(adminClient, r.round_id, perSubmission);
    result.autoAssigned += 1;
    result.totalAssignmentsCreated += ar.created;
    result.rounds.push({
      roundId: r.round_id,
      title: r.title,
      created: ar.created,
    });

    if (ar.newAssignments.length > 0) {
      // 알림은 fire-and-forget. cron 응답 시간에 영향 적게.
      notifyPeerAssignments(ar.newAssignments, [
        {
          roundId: r.round_id,
          title: r.title,
          subject: r.subject,
          endAt: r.end_at,
        },
      ]).catch((err) => {
        console.error("[cron:gs-auto-assign] notify failed:", err);
      });
    }
  }

  return data({ ok: true, ...result });
}

export async function loader({ request }: Route.LoaderArgs) {
  return run(request);
}

export async function action({ request }: Route.ActionArgs) {
  return run(request);
}
