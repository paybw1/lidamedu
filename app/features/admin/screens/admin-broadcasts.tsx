// 세그먼트 대량 메시징 — 대상군에 인앱+이메일 안내 발송 + 발송 이력. manager+.
// 카카오 알림톡은 템플릿 승인 종속이라 이 버전은 인앱+이메일만.

import { MegaphoneIcon, SendIcon } from "lucide-react";
import { Form, data, redirect, useSearchParams } from "react-router";
import { z } from "zod";

import { requireManager } from "~/core/lib/admin-guard.server";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { cn } from "~/core/lib/utils";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import {
  BROADCAST_SEGMENTS,
  type BroadcastSegmentKey,
  getSegmentCounts,
  listBroadcasts,
  sendBroadcast,
  sendBroadcastEmails,
} from "~/features/admin/queries/broadcasts.server";

import type { Route } from "./+types/admin-broadcasts";

export const meta: Route.MetaFunction = () => [
  { title: "대량 안내 발송 | 운영자" },
];

const SEGMENT_KEYS = BROADCAST_SEGMENTS.map((s) => s.key) as [
  BroadcastSegmentKey,
  ...BroadcastSegmentKey[],
];

const sendSchema = z.object({
  segmentKey: z.enum(SEGMENT_KEYS),
  title: z.string().trim().min(2).max(200),
  bodyMd: z.string().trim().min(2).max(5000),
  email: z.boolean().default(false),
});

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
function fmtDateTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireManager(request);
  const [counts, history] = await Promise.all([
    getSegmentCounts(),
    listBroadcasts(30),
  ]);
  const url = new URL(request.url);
  const raw = url.searchParams.get("segment");
  const presetSegment = SEGMENT_KEYS.includes(raw as BroadcastSegmentKey)
    ? (raw as BroadcastSegmentKey)
    : null;
  return { counts, history, presetSegment, sent: url.searchParams.get("sent") === "1" };
}

export async function action({ request }: Route.ActionArgs) {
  const { user } = await requireManager(request);
  const fd = await request.formData();
  const parsed = sendSchema.safeParse({
    segmentKey: fd.get("segmentKey"),
    title: fd.get("title"),
    bodyMd: fd.get("bodyMd"),
    email: fd.get("email") === "1",
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." },
      { status: 400 },
    );
  }
  const channels: Array<"in_app" | "email"> = parsed.data.email
    ? ["in_app", "email"]
    : ["in_app"];
  const res = await sendBroadcast({
    senderId: user.id,
    segmentKey: parsed.data.segmentKey,
    title: parsed.data.title,
    bodyMd: parsed.data.bodyMd,
    channels,
  });
  if (!res.ok) return data({ error: res.error }, { status: 400 });

  // 이메일 fanout 은 응답 후 백그라운드(서버리스 freeze 대응).
  if (parsed.data.email) {
    runAfterResponse(
      sendBroadcastEmails(
        res.broadcastId,
        res.recipientIds,
        parsed.data.title,
        parsed.data.bodyMd,
      ),
    );
  }
  void logAuditEvent({
    actorId: user.id,
    action: "broadcast.send",
    entityType: "broadcast",
    entityId: res.broadcastId,
    metadata: {
      segmentKey: parsed.data.segmentKey,
      recipientCount: res.recipientIds.length,
      channels,
    },
  });
  return redirect("/admin/broadcasts?sent=1");
}

export default function AdminBroadcasts({ loaderData }: Route.ComponentProps) {
  const { counts, history, presetSegment, sent } = loaderData;
  const [searchParams] = useSearchParams();
  const initial =
    presetSegment ?? (searchParams.get("segment") as BroadcastSegmentKey | null);

  return (
    <AdminShell
      cluster="comms"
      title="대량 안내 발송"
      desc="특정 대상군(체험 만료·미승인·전체 학생 등)에게 인앱 알림과 이메일로 안내를 발송합니다. 카카오 알림톡은 템플릿 승인 후 제공됩니다."
    >
      {sent ? (
        <div className="mb-4 rounded-lg border border-emerald-300/60 bg-emerald-50/60 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-300">
          발송이 접수되었습니다. 인앱 알림은 즉시, 이메일은 잠시 후 전송됩니다.
        </div>
      ) : null}

      <Form
        method="post"
        className="border-border bg-card mb-8 rounded-xl border p-4 shadow-sm"
        onSubmit={(e) => {
          const fd = new FormData(e.currentTarget);
          const seg = String(fd.get("segmentKey") ?? "");
          const n = counts[seg as BroadcastSegmentKey] ?? 0;
          if (n === 0) {
            e.preventDefault();
            alert("대상이 0명입니다.");
            return;
          }
          if (
            !confirm(
              `‘${BROADCAST_SEGMENTS.find((s) => s.key === seg)?.label}’ ${n}명에게 발송합니다. 계속할까요?`,
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <fieldset className="mb-4">
          <legend className="mb-2 text-[13px] font-bold">발송 대상</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {BROADCAST_SEGMENTS.map((s) => {
              const n = counts[s.key] ?? 0;
              return (
                <label
                  key={s.key}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors",
                    "border-border hover:border-primary has-[:checked]:border-primary has-[:checked]:bg-primary/[0.04]",
                  )}
                >
                  <input
                    type="radio"
                    name="segmentKey"
                    value={s.key}
                    defaultChecked={initial ? initial === s.key : undefined}
                    required
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold">{s.label}</span>
                      <span className="text-foreground font-mono text-xs font-bold tabular-nums">
                        {n.toLocaleString("ko-KR")}명
                      </span>
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-[11px] leading-snug">
                      {s.desc}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="mb-3 block">
          <span className="mb-1 block text-[13px] font-semibold">제목</span>
          <Input
            name="title"
            required
            maxLength={200}
            placeholder="예) 체험 기간이 곧 종료됩니다"
          />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-[13px] font-semibold">내용</span>
          <Textarea
            name="bodyMd"
            required
            rows={6}
            maxLength={5000}
            placeholder="안내 내용을 입력하세요."
          />
        </label>

        <label className="mb-4 flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="email" value="1" />
          이메일도 함께 발송 (수신 동의한 회원에 한함)
        </label>

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm">
            <SendIcon className="size-3.5" /> 발송
          </Button>
          <span className="text-muted-foreground text-[11px]">
            인앱 알림은 전원에게, 이메일은 수신 동의자에게만 전송됩니다.
          </span>
        </div>
      </Form>

      <div className="mb-2 flex items-center gap-1.5">
        <MegaphoneIcon className="text-muted-foreground size-3.5" />
        <h2 className="text-sm font-bold tracking-tight">발송 이력</h2>
      </div>
      {history.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border px-4 py-6 text-center text-sm shadow-sm">
          발송 이력 없음
        </div>
      ) : (
        <IndexTable
          headers={[
            { label: "일시" },
            { label: "대상" },
            { label: "제목" },
            { label: "인원", align: "right" },
            { label: "이메일", align: "right" },
            { label: "보낸 사람" },
          ]}
        >
          {history.map((b) => (
            <TR key={b.broadcastId}>
              <TD mono soft>
                {fmtDateTime(b.createdAt)}
              </TD>
              <TD>{b.segmentLabel}</TD>
              <TD>{b.title}</TD>
              <TD align="right" mono>
                {b.recipientCount.toLocaleString("ko-KR")}
              </TD>
              <TD align="right" mono soft>
                {b.channels.includes("email")
                  ? b.emailSent.toLocaleString("ko-KR")
                  : "—"}
              </TD>
              <TD soft>{b.senderName ?? "—"}</TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}
