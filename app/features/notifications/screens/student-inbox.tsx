// 학생용 알림 인박스 — /inbox. 첨삭 완료, Q&A 답변, 공지 등.

import {
  BellIcon,
  CalendarClockIcon,
  CheckCheckIcon,
  ClipboardCheckIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  MessageSquareTextIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Form, Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  listUserNotifications,
  type NotificationItem,
  type NotificationKind,
} from "~/features/notifications/queries.server";

import type { Route } from "./+types/student-inbox";

export const meta: Route.MetaFunction = () => [
  { title: "알림 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const onlyUnread = url.searchParams.get("filter") === "unread";
  const { items, unreadCount } = await listUserNotifications(client, user.id, {
    audience: "student",
    onlyUnread,
    limit: 100,
  });
  return { items, unreadCount, onlyUnread };
}

const KIND_LABEL: Partial<Record<NotificationKind, string>> = {
  subjective_review_completed: "첨삭 완료",
  qna_new_answer: "Q&A 답변",
  announcement: "공지",
  student_note_shared: "상담 코멘트",
  exam_result_reminder: "응시 결과",
  trial_expiry_warning: "체험 만료 임박",
  cohort_upgrade_processed: "종합반 등업",
};

const KIND_ICON: Partial<Record<NotificationKind, typeof BellIcon>> = {
  subjective_review_completed: ClipboardCheckIcon,
  qna_new_answer: MessageCircleIcon,
  announcement: MegaphoneIcon,
  student_note_shared: MessageSquareTextIcon,
  exam_result_reminder: CalendarClockIcon,
  trial_expiry_warning: TriangleAlertIcon,
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

export default function StudentInbox({ loaderData }: Route.ComponentProps) {
  const { items, unreadCount, onlyUnread } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <BellIcon className="size-3.5" /> 학습관리
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">알림</h1>
          {unreadCount > 0 ? (
            <Form method="post" action="/api/notifications/mark-read">
              <input type="hidden" name="audience" value="student" />
              <input type="hidden" name="all" value="1" />
              <Button type="submit" size="sm" variant="outline" className="h-8">
                <CheckCheckIcon className="size-3.5" /> 모두 읽음 처리
              </Button>
            </Form>
          ) : null}
        </div>
        <div className="flex gap-2 text-xs">
          <Link
            to="/inbox"
            className={cn(
              "rounded-full border px-3 py-1",
              !onlyUnread
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent",
            )}
          >
            전체
          </Link>
          <Link
            to="/inbox?filter=unread"
            className={cn(
              "rounded-full border px-3 py-1",
              onlyUnread
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent",
            )}
          >
            미읽음 {unreadCount > 0 ? `(${unreadCount})` : ""}
          </Link>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            {onlyUnread ? "미읽음 알림이 없습니다." : "알림이 없습니다."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="student-inbox-list">
          {items.map((it) => (
            <li key={it.notificationId}>
              <Card
                className={cn(
                  "hover:border-primary transition-colors",
                  it.readAt === null && "border-primary/40 bg-primary/5",
                )}
              >
                <Form
                  method="post"
                  action="/api/notifications/mark-read"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    fetch("/api/notifications/mark-read", {
                      method: "POST",
                      body: fd,
                    });
                    window.location.href = it.href;
                  }}
                >
                  <input
                    type="hidden"
                    name="notificationId"
                    value={it.notificationId}
                  />
                  <button
                    type="submit"
                    className="w-full text-left"
                    data-testid="inbox-item"
                  >
                    <NotificationBody item={it} />
                  </button>
                </Form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationBody({ item }: { item: NotificationItem }) {
  const Icon = KIND_ICON[item.kind] ?? BellIcon;
  const label = KIND_LABEL[item.kind] ?? item.kind;
  const isUnread = item.readAt === null;
  return (
    <>
      <CardHeader className="px-4 pb-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Icon className="text-link size-4 shrink-0" />
          <Badge variant={isUnread ? "default" : "outline"}>{label}</Badge>
          {isUnread ? (
            <Badge variant="destructive" className="text-[10px]">
              NEW
            </Badge>
          ) : null}
          <span className="text-muted-foreground ml-auto tabular-nums">
            {formatRelative(item.createdAt)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <p className="text-sm font-medium leading-snug">{item.title}</p>
        {item.body ? (
          <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
            {item.body}
          </p>
        ) : null}
      </CardContent>
    </>
  );
}
