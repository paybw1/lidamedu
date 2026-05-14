// 시험 결과 입력 알림 cron (feat-8-005).
// 외부 cron (시험 시즌 동안 주 1-2회) 호출. CRON_SECRET 보호.
//
// 동작:
//  - profiles.next_exam_year/round 가 설정된 사용자 중,
//    해당 연도의 시험이 이미 지났을 만큼 시간이 흘렀는데(next_exam_year <= currentYear)
//    exam_results 에 해당 (year, round) 결과가 없는 학생을 찾는다.
//  - 14일 throttle — 같은 (year, round) 에 대해 같은 사용자에게 너무 자주 푸시하지 않음.
//  - 인박스 알림 + 이메일(notify_channels='email' 활성 사용자만) 발송.
//
// Phase A 핵심 — 합격 데이터 회수율을 끌어올리는 인프라.

import { render } from "@react-email/render";
import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import resendClient from "~/core/lib/resend-client.server";
import { createUserNotifications } from "~/features/notifications/queries.server";

import ExamResultReminder from "../../../../transactional-emails/emails/exam-result-reminder";

import type { Route } from "./+types/exam-result-reminder";

const THROTTLE_DAYS = 14;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@lidamedu.com";
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

function checkAuth(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === expected) return true;
  const header = request.headers.get("authorization") ?? "";
  if (header === `Bearer ${expected}`) return true;
  return false;
}

interface ProcessedUser {
  userId: string;
  examYear: number;
  examRound: "first" | "second";
  status: "notified" | "skipped_throttled" | "skipped_already_recorded";
  emailStatus?: "ok" | "skipped" | "failed";
  emailReason?: string;
}

async function getEmailById(userId: string): Promise<string | null> {
  try {
    const { data, error } = await adminClient.auth.admin.getUserById(userId);
    if (error) return null;
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

async function sendReminderEmail(input: {
  userId: string;
  studentName: string;
  examYear: number;
  examRound: "first" | "second";
  channels: string[];
}): Promise<{ status: "ok" | "skipped" | "failed"; reason?: string }> {
  if (!input.channels.includes("email"))
    return { status: "skipped", reason: "email 채널 비활성" };
  const email = await getEmailById(input.userId);
  if (!email) return { status: "skipped", reason: "이메일 없음" };
  const roundLabel = input.examRound === "first" ? "1차" : "2차";
  try {
    const html = await render(
      ExamResultReminder({
        link: `${APP_URL}/me/exam-results`,
        studentName: input.studentName || "학습자",
        examYear: input.examYear,
        examRoundLabel: roundLabel,
      }),
    );
    const res = await resendClient.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `[리담에듀] ${input.examYear}년 ${roundLabel} 시험 결과를 입력해 주세요`,
      html,
    });
    if (res.error) return { status: "failed", reason: res.error.message };
    return { status: "ok" };
  } catch (e) {
    return {
      status: "failed",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

async function run(request: Request) {
  if (!checkAuth(request)) {
    return data({ error: "Forbidden" }, { status: 403 });
  }
  const currentYear = new Date().getFullYear();
  const url = new URL(request.url);
  // ?year=2026 로 명시적 지정 가능 — 그 외엔 current year 이하 모두.
  const yearFilter = url.searchParams.get("year");
  const yearMax = yearFilter ? Number(yearFilter) : currentYear;

  // 1) 후보 사용자 — next_exam_year/round 보유 + 연도 도래
  const { data: candidates, error } = await adminClient
    .from("profiles")
    .select("profile_id, name, next_exam_year, next_exam_round, notify_channels")
    .not("next_exam_year", "is", null)
    .not("next_exam_round", "is", null)
    .lte("next_exam_year", yearMax);
  if (error) return data({ error: error.message }, { status: 500 });
  const list = (candidates ?? []).filter(
    (c): c is {
      profile_id: string;
      name: string;
      next_exam_year: number;
      next_exam_round: "first" | "second";
      notify_channels: string[];
    } =>
      c.next_exam_year !== null &&
      (c.next_exam_round === "first" || c.next_exam_round === "second"),
  );
  if (list.length === 0) {
    return data({ ok: true, summary: { candidates: 0, notified: 0 }, processed: [] });
  }

  // 2) 이미 결과 입력한 사용자 set
  const userIds = list.map((c) => c.profile_id);
  const { data: existing } = await adminClient
    .from("exam_results")
    .select("user_id, exam_year, exam_round")
    .in("user_id", userIds);
  const hasResult = new Set<string>();
  for (const r of existing ?? []) {
    hasResult.add(`${r.user_id}|${r.exam_year}|${r.exam_round}`);
  }

  // 3) 최근 throttle 알림 set
  const throttleCutoff = new Date(
    Date.now() - THROTTLE_DAYS * 86_400_000,
  ).toISOString();
  const { data: recentNotifs } = await adminClient
    .from("user_notifications")
    .select("recipient_id, entity_id, created_at")
    .eq("kind", "exam_result_reminder")
    .gte("created_at", throttleCutoff);
  const recentSet = new Set<string>();
  for (const n of recentNotifs ?? []) {
    recentSet.add(`${n.recipient_id}|${n.entity_id}`);
  }

  // 4) 알림 fanout
  const processed: ProcessedUser[] = [];
  const toNotify: Array<{
    userId: string;
    name: string;
    examYear: number;
    examRound: "first" | "second";
    entityId: string;
    channels: string[];
  }> = [];

  for (const c of list) {
    const key = `${c.profile_id}|${c.next_exam_year}|${c.next_exam_round}`;
    if (hasResult.has(key)) {
      processed.push({
        userId: c.profile_id,
        examYear: c.next_exam_year,
        examRound: c.next_exam_round,
        status: "skipped_already_recorded",
      });
      continue;
    }
    const entityId = `${c.next_exam_year}-${c.next_exam_round}`;
    if (recentSet.has(`${c.profile_id}|${entityId}`)) {
      processed.push({
        userId: c.profile_id,
        examYear: c.next_exam_year,
        examRound: c.next_exam_round,
        status: "skipped_throttled",
      });
      continue;
    }
    toNotify.push({
      userId: c.profile_id,
      name: c.name,
      examYear: c.next_exam_year,
      examRound: c.next_exam_round,
      entityId,
      channels: Array.isArray(c.notify_channels) ? c.notify_channels : [],
    });
  }

  // 사용자별 1건씩 insert + 이메일 best-effort.
  for (const n of toNotify) {
    const roundLabel = n.examRound === "first" ? "1차" : "2차";
    await createUserNotifications({
      recipientIds: [n.userId],
      kind: "exam_result_reminder",
      entityType: "exam_result",
      entityId: n.entityId,
      title: `${n.examYear}년 ${roundLabel} 시험 결과를 입력해 주세요`,
      body: "결과를 등록하면 합격자 패턴 기반 진단·컨설팅을 더 정확하게 받을 수 있습니다.",
      href: "/me/exam-results",
      payload: { examYear: n.examYear, examRound: n.examRound },
    });
    const emailRes = await sendReminderEmail({
      userId: n.userId,
      studentName: n.name,
      examYear: n.examYear,
      examRound: n.examRound,
      channels: n.channels,
    });
    processed.push({
      userId: n.userId,
      examYear: n.examYear,
      examRound: n.examRound,
      status: "notified",
      emailStatus: emailRes.status,
      emailReason: emailRes.reason,
    });
  }

  return data({
    ok: true,
    summary: {
      candidates: list.length,
      notified: toNotify.length,
      emailsSent: processed.filter((p) => p.emailStatus === "ok").length,
      emailsSkipped: processed.filter((p) => p.emailStatus === "skipped").length,
      emailsFailed: processed.filter((p) => p.emailStatus === "failed").length,
      skippedThrottled: processed.filter((p) => p.status === "skipped_throttled").length,
      skippedAlreadyRecorded: processed.filter((p) => p.status === "skipped_already_recorded").length,
    },
    processed,
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  return run(request);
}
export async function action({ request }: Route.ActionArgs) {
  return run(request);
}
