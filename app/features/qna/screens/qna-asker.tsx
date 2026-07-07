// 질문자 프로필 — 강사·관리자 전용 (원장 지시 2026-07-08).
// 회원정보 + 질문 이력(질문 수준 포함) + 평균 수준 + 쪽지 보내기(알림 인박스).
// 타 사용자 profiles 조회는 RLS 가 본인만 허용 → adminClient 필수(메모: profiles-rls-staff-cross-read).
import {
  CalendarIcon,
  MailIcon,
  MessageCircleQuestionIcon,
  SendIcon,
  UserIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, data, useFetcher } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { Chip } from "~/features/community/components/community-ui";
import { CommunityShell } from "~/features/community/components/community-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import { createUserNotifications } from "~/features/notifications/queries.server";

import {
  QNA_QUALITY_LABEL,
  QNA_STATUS_LABEL,
  QNA_TARGET_LABEL,
  type QnaQualityGrade,
  type QnaStatus,
  type QnaTargetType,
  subjectLabel,
} from "../labels";

import type { Route } from "./+types/qna-asker";

const GRADE_SCORE: Record<QnaQualityGrade, number> = {
  very_low: 1,
  low: 2,
  mid: 3,
  high: 4,
  very_high: 5,
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401, headers });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403, headers });

  const profileId = params.profileId;
  if (!profileId) throw data("Not Found", { status: 404, headers });
  const { data: profile } = await adminClient
    .from("profiles")
    .select("profile_id, name, nickname, role, member_no, created_at, phone_e164")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!profile) throw data("Not Found", { status: 404, headers });
  // 이메일 — auth.users (adminClient)
  let email: string | null = null;
  try {
    const { data: au } = await adminClient.auth.admin.getUserById(profileId);
    email = au.user?.email ?? null;
  } catch {
    email = null;
  }

  const { data: threadRows } = await client
    .from("qna_threads")
    .select(
      "thread_id, title, target_type, subject, status, quality_grade, created_at, answered_at",
    )
    .eq("asker_id", profileId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);
  const threads = (threadRows ?? []).map((t) => ({
    threadId: t.thread_id,
    title: t.title,
    targetType: t.target_type as QnaTargetType,
    subject: t.subject,
    status: t.status as QnaStatus,
    qualityGrade: (t.quality_grade ?? null) as QnaQualityGrade | null,
    createdAt: t.created_at,
  }));
  const graded = threads.filter((t) => t.qualityGrade !== null);
  const avgScore =
    graded.length > 0
      ? graded.reduce((a, t) => a + GRADE_SCORE[t.qualityGrade!], 0) /
        graded.length
      : null;
  // 수준 분포 (배지용)
  const gradeDist: Partial<Record<QnaQualityGrade, number>> = {};
  for (const t of graded)
    gradeDist[t.qualityGrade!] = (gradeDist[t.qualityGrade!] ?? 0) + 1;

  return data(
    {
      profile: {
        profileId: profile.profile_id,
        name: profile.name,
        nickname: profile.nickname,
        role: profile.role,
        memberNo: profile.member_no,
        createdAt: profile.created_at,
        email,
      },
      threads,
      avgScore,
      gradedCount: graded.length,
      gradeDist,
    },
    { headers },
  );
}

const messageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ ok: false, error: "method-not-allowed" }, { status: 405 });
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user)
    return data({ ok: false, error: "unauthorized" }, { status: 401, headers });
  const role = await getStaffRole(client, user.id);
  if (!role)
    return data({ ok: false, error: "forbidden" }, { status: 403, headers });
  const fd = await request.formData();
  const parsed = messageSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success || !params.profileId)
    return data({ ok: false, error: "쪽지 내용을 입력하세요." }, { status: 400, headers });
  const recipientId = params.profileId;
  // 발신자 이름 — 본인 프로필 (요청 클라이언트, 본인 행이라 RLS 통과)
  const { data: me } = await client
    .from("profiles")
    .select("name")
    .eq("profile_id", user.id)
    .maybeSingle();
  await createUserNotifications({
    recipientIds: [recipientId],
    kind: "staff_message",
    entityType: "profile",
    entityId: user.id,
    title: `${me?.name ?? "강사"} 님의 쪽지`,
    body: parsed.data.message,
    href: "/qna",
  });
  return data({ ok: true }, { headers });
}

export default function QnaAsker({ loaderData }: Route.ComponentProps) {
  const { profile, threads, avgScore, gradedCount, gradeDist } = loaderData;
  return (
    <CommunityShell
      category="qna"
      title="질문자 정보"
      backLink={{ to: "/qna", label: "Q&A 목록" }}
      width="narrow"
    >
      {/* 회원정보 */}
      <article className="border-border bg-card mb-3.5 rounded-2xl border p-5 shadow-sm md:p-6">
        <div className="flex items-center gap-3">
          <span className="bg-primary text-primary-foreground inline-flex size-10 items-center justify-center rounded-full text-base font-bold">
            {(profile.name ?? "?").slice(0, 1)}
          </span>
          <div>
            <p className="text-[17px] font-extrabold tracking-tight">
              {profile.name ?? "이름 없음"}
              {profile.nickname ? (
                <span className="text-muted-foreground ml-1.5 text-[12px] font-medium">
                  ({profile.nickname})
                </span>
              ) : null}
            </p>
            <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
              <span className="inline-flex items-center gap-1">
                <UserIcon className="size-3" />
                {profile.role === "student" ? "수험생" : profile.role}
                {profile.memberNo ? ` · 회원번호 ${profile.memberNo}` : ""}
              </span>
              {profile.email ? (
                <span className="inline-flex items-center gap-1">
                  <MailIcon className="size-3" /> {profile.email}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <CalendarIcon className="size-3" /> 가입{" "}
                {new Date(profile.createdAt).toLocaleDateString("ko-KR")}
              </span>
            </p>
          </div>
        </div>

        {/* 질문 수준 요약 */}
        <div className="border-border/60 mt-4 flex flex-wrap items-center gap-2 border-t pt-3.5">
          <span className="text-muted-foreground text-[11px] font-bold">
            질문 {threads.length}건
          </span>
          {avgScore !== null ? (
            <Chip tone="amber">
              ★ 평균 수준 {avgScore.toFixed(1)} / 5 (평가 {gradedCount}건)
            </Chip>
          ) : (
            <span className="text-muted-foreground text-[11px]">
              수준 평가된 질문 없음
            </span>
          )}
          {(Object.keys(gradeDist) as QnaQualityGrade[]).map((g) => (
            <span
              key={g}
              className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium"
            >
              {QNA_QUALITY_LABEL[g]} {gradeDist[g]}
            </span>
          ))}
        </div>

        {/* 쪽지 보내기 — 알림 인박스로 발송 */}
        <SendMessageForm />
      </article>

      {/* 질문 목록 */}
      <article className="border-border bg-card rounded-2xl border p-5 shadow-sm md:p-6">
        <p className="text-muted-foreground mb-3 inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-[0.08em] uppercase">
          <MessageCircleQuestionIcon className="size-3.5" /> 작성한 질문
        </p>
        {threads.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-xs">
            작성한 질문이 없습니다.
          </p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {threads.map((t) => (
              <li key={t.threadId} className="py-2.5">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <Chip tone="neutral">{QNA_TARGET_LABEL[t.targetType]}</Chip>
                  {t.subject ? (
                    <Chip tone="neutral">{subjectLabel(t.subject)}</Chip>
                  ) : null}
                  <Chip tone={t.status === "open" ? "coral" : "emerald"}>
                    {QNA_STATUS_LABEL[t.status]}
                  </Chip>
                  {t.qualityGrade ? (
                    <Chip tone="amber">
                      ★ {QNA_QUALITY_LABEL[t.qualityGrade]}
                    </Chip>
                  ) : null}
                  <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
                    {new Date(t.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                </div>
                <Link
                  to={`/qna/${t.threadId}`}
                  viewTransition
                  className="hover:text-link block text-[13.5px] font-medium break-words"
                >
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </article>
    </CommunityShell>
  );
}

function SendMessageForm() {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (fetcher.data?.ok) formRef.current?.reset();
  }, [fetcher.data]);
  return (
    <fetcher.Form ref={formRef} method="post" className="mt-3.5">
      <p className="text-muted-foreground mb-1.5 text-[11px] font-bold">
        쪽지 보내기 <span className="font-normal">(학생 알림 인박스로 전달)</span>
      </p>
      <div className="flex items-end gap-2">
        <Textarea
          name="message"
          rows={2}
          required
          maxLength={2000}
          placeholder="전달할 내용을 입력하세요"
          className="text-[13px]"
        />
        <Button
          type="submit"
          size="sm"
          disabled={fetcher.state !== "idle"}
          className="h-9 gap-1"
        >
          <SendIcon className="size-3.5" />
          {fetcher.state !== "idle" ? "발송 중…" : "보내기"}
        </Button>
      </div>
      {fetcher.data?.ok ? (
        <p className="mt-1.5 text-[11px] text-emerald-600">쪽지를 보냈습니다.</p>
      ) : fetcher.data?.ok === false ? (
        <p className="mt-1.5 text-[11px] text-rose-600">{fetcher.data.error}</p>
      ) : null}
    </fetcher.Form>
  );
}
