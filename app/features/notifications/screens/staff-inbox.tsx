// 강사용 알림 인박스. /admin/inbox
// staff (instructor/admin) 만 접근. 미읽음 우선, 클릭 시 navigate + read 처리.

import {
  BellIcon,
  BugIcon,
  CheckCheckIcon,
  ClipboardCheckIcon,
  MessageCircleQuestionIcon,
} from "lucide-react";
import { Form, Link, data, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  listStaffNotifications,
  type StaffNotificationItem,
  type StaffNotificationKind,
} from "~/features/notifications/queries.server";

import type { Route } from "./+types/staff-inbox";

export const meta: Route.MetaFunction = () => [
  { title: "강사 알림 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const onlyUnread = url.searchParams.get("filter") === "unread";
  const { items, unreadCount } = await listStaffNotifications(
    client,
    user.id,
    { onlyUnread, limit: 100 },
  );
  return { items, unreadCount, onlyUnread, role };
}

const KIND_LABEL: Partial<Record<StaffNotificationKind, string>> = {
  subjective_review_request: "주관식 첨삭",
  qna_new_question: "Q&A 질문",
  bug_report_created: "오류 신고",
};

const KIND_ICON: Partial<
  Record<StaffNotificationKind, typeof ClipboardCheckIcon>
> = {
  subjective_review_request: ClipboardCheckIcon,
  qna_new_question: MessageCircleQuestionIcon,
  bug_report_created: BugIcon,
};

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return iso.slice(0, 10);
}

export default function StaffInbox({ loaderData }: Route.ComponentProps) {
  const { items, unreadCount, onlyUnread, role } = loaderData;

  return (
    <AdminShell
      cluster="comms"
      role={role}
      title="알림 인박스"
      desc="운영진 수신 알림. 미읽음 항목을 우선으로 표시합니다."
      headerRight={
        unreadCount > 0 ? (
          <Form method="post" action="/api/notifications/mark-read">
            <input type="hidden" name="all" value="1" />
            <Button type="submit" size="sm" variant="outline" className="h-8">
              <CheckCheckIcon className="size-3.5" /> 모두 읽음 처리
            </Button>
          </Form>
        ) : undefined
      }
    >
      {/* 읽음 필터 탭 */}
      <div className="mb-3 flex items-center gap-1.5">
        <Link
          to="/admin/inbox"
          className={cn(
            "inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-semibold transition-colors",
            !onlyUnread
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border hover:bg-muted/40",
          )}
        >
          전체
        </Link>
        <Link
          to="/admin/inbox?filter=unread"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors",
            onlyUnread
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border hover:bg-muted/40",
          )}
        >
          미읽음
          {unreadCount > 0 ? (
            <span
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-full text-[11px] tabular-nums",
                onlyUnread ? "bg-white/20" : "bg-rose-500 text-white",
              )}
            >
              {unreadCount}
            </span>
          ) : null}
        </Link>
      </div>

      {/* 빈 상태 */}
      {items.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-xl border py-16 text-center shadow-sm">
          <BellIcon className="size-8 opacity-30" />
          <p className="text-sm font-medium">
            {onlyUnread ? "미읽음 알림이 없습니다." : "알림이 없습니다."}
          </p>
        </div>
      ) : (
        <IndexTable
          minWidth={560}
          testid="staff-inbox-list"
          headers={[
            { label: "종류", width: "9rem" },
            { label: "내용" },
            { label: "시각", align: "right", width: "7rem" },
            { label: "", width: "3rem" },
          ]}
          footer={
            <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
              총 {items.length}건
              {unreadCount > 0 ? ` · 미읽음 ${unreadCount}건` : ""}
            </div>
          }
        >
          {items.map((it) => (
            <InboxRow key={it.notificationId} item={it} />
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

/* ── 알림 행 ─────────────────────────────────────────────────────────── */

function InboxRow({ item }: { item: StaffNotificationItem }) {
  const Icon = KIND_ICON[item.kind] ?? ClipboardCheckIcon;
  const isUnread = item.readAt === null;
  const kindLabel = KIND_LABEL[item.kind] ?? item.kind;
  const fetcher = useFetcher();

  const handleClick = () => {
    const fd = new FormData();
    fd.set("notificationId", item.notificationId);
    fetcher.submit(fd, { method: "post", action: "/api/notifications/mark-read" });
    window.location.href = item.href;
  };

  return (
    <TR active={isUnread} onClick={handleClick} testid="inbox-item">
      <TD>
        <div className="flex items-center gap-1.5">
          <Icon
            className={cn(
              "size-3.5 shrink-0",
              isUnread ? "text-link" : "text-muted-foreground",
            )}
          />
          <Chip tone={isUnread ? "blue" : "neutral"}>{kindLabel}</Chip>
        </div>
      </TD>
      <TD>
        <p
          className={cn(
            "line-clamp-1 text-[13px]",
            isUnread ? "font-semibold" : "font-medium",
          )}
        >
          {item.title}
        </p>
        {item.body ? (
          <p className="text-muted-foreground line-clamp-1 text-[11px]">
            {item.body}
          </p>
        ) : null}
      </TD>
      <TD align="right" mono soft>
        <span title={item.createdAt}>{formatRelative(item.createdAt)}</span>
      </TD>
      <TD align="center">
        {isUnread ? (
          <span
            aria-label="미읽음"
            className="inline-block size-2 rounded-full bg-rose-500"
          />
        ) : null}
      </TD>
    </TR>
  );
}
