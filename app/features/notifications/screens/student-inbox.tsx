// 학생용 알림 인박스 — /inbox. 첨삭 완료, Q&A 답변, 공지 등.

import {
  ArrowRightIcon,
  BellIcon,
  CalendarClockIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  ClipboardCheckIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  MessageSquareTextIcon,
  TicketIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";
import { useState } from "react";
import { Form, Link, data, useFetcher, useNavigate } from "react-router";

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
  trial_ended: "체험 종료",
  cohort_upgrade_processed: "종합반 등업",
  bug_report_resolved: "오류신고 처리",
  staff_message: "강사 쪽지",
  coupon_granted: "쿠폰 발급",
};

// 답변/쪽지 내용이 알림 본문에만 있는 종류 — 클릭 시 이동 대신 제자리에서 펼쳐
// 전체 내용을 읽게 한다(목록은 2줄로 잘려 긴 답변을 볼 방법이 없던 문제).
const EXPAND_IN_PLACE_KINDS: ReadonlySet<NotificationKind> = new Set([
  "bug_report_resolved",
  "staff_message",
] as NotificationKind[]);

const KIND_ICON: Partial<Record<NotificationKind, typeof BellIcon>> = {
  subjective_review_completed: ClipboardCheckIcon,
  qna_new_answer: MessageCircleIcon,
  announcement: MegaphoneIcon,
  student_note_shared: MessageSquareTextIcon,
  exam_result_reminder: CalendarClockIcon,
  trial_expiry_warning: TriangleAlertIcon,
  trial_ended: TriangleAlertIcon,
  bug_report_resolved: WrenchIcon,
  staff_message: MessageSquareTextIcon,
  coupon_granted: TicketIcon,
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
  // 리소스 라우트(action-only)로의 일반 Form 내비게이션은 제출 후 화면 없는
  // /api/... 로 이동해 오류가 되므로 fetcher 로 제출(완료 시 loader 자동 재검증).
  const markAll = useFetcher();
  const navigate = useNavigate();

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <BellIcon className="size-3.5" /> 학습관리
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">알림</h1>
          {unreadCount > 0 ? (
            <markAll.Form method="post" action="/api/notifications/mark-read">
              <input type="hidden" name="audience" value="student" />
              <input type="hidden" name="all" value="1" />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={markAll.state !== "idle"}
              >
                <CheckCheckIcon className="size-3.5" /> 모두 읽음 처리
              </Button>
            </markAll.Form>
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
            안 읽음 {unreadCount > 0 ? `(${unreadCount})` : ""}
          </Link>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            {onlyUnread ? "안 읽은 알림이 없습니다." : "알림이 없습니다."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="student-inbox-list">
          {items.map((it) =>
            EXPAND_IN_PLACE_KINDS.has(it.kind) ? (
              <li key={it.notificationId}>
                <ExpandableNotificationCard item={it} />
              </li>
            ) : (
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
                    void fetch("/api/notifications/mark-read", {
                      method: "POST",
                      body: fd,
                      keepalive: true,
                    });
                    // 전체 리로드 대신 클라이언트 내비게이션 — 읽음 POST 절단·모바일
                    // '탭했는데 안 열림' 방지 (staff-inbox 와 동일 수정).
                    if (/^https?:\/\//.test(it.href)) window.location.href = it.href;
                    else void navigate(it.href);
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
            ),
          )}
        </ul>
      )}
    </div>
  );
}

// 펼침형 카드 — 클릭하면 이동 대신 본문 전체를 펼치고 읽음 처리(답변·쪽지가
// 알림 본문에만 있는 종류). 펼친 상태에서 관련 화면 링크를 따로 노출한다.
// 읽음 처리는 raw fetch + 로컬 상태 — fetcher revalidation 을 쓰면 '안 읽음'
// 필터에서 카드가 읽는 도중 목록에서 사라진다.
function ExpandableNotificationCard({ item }: { item: NotificationItem }) {
  const [expanded, setExpanded] = useState(false);
  const [readAt, setReadAt] = useState(item.readAt);

  function handleToggle() {
    if (!expanded && readAt === null) {
      const fd = new FormData();
      fd.set("notificationId", item.notificationId);
      void fetch("/api/notifications/mark-read", { method: "POST", body: fd });
      setReadAt(new Date().toISOString());
    }
    setExpanded((v) => !v);
  }

  return (
    <Card
      className={cn(
        "hover:border-primary transition-colors",
        readAt === null && "border-primary/40 bg-primary/5",
      )}
    >
      <button
        type="button"
        onClick={handleToggle}
        className="w-full text-left"
        data-testid="inbox-item"
        aria-expanded={expanded}
      >
        <NotificationBody
          item={{ ...item, readAt }}
          expanded={expanded}
          expandable
        />
      </button>
      {expanded && item.href ? (
        <div className="px-4 pb-3">
          <Link
            to={item.href}
            className="text-link inline-flex items-center gap-1 text-xs font-semibold hover:underline"
          >
            {item.kind === "bug_report_resolved"
              ? "신고했던 화면 열기"
              : "관련 화면 열기"}{" "}
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      ) : null}
    </Card>
  );
}

function NotificationBody({
  item,
  expanded = false,
  expandable = false,
}: {
  item: NotificationItem;
  expanded?: boolean;
  expandable?: boolean;
}) {
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
          {expandable ? (
            <ChevronDownIcon
              className={cn(
                "text-muted-foreground size-4 shrink-0 transition-transform",
                expanded && "rotate-180",
              )}
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <p className="text-sm font-medium leading-snug">{item.title}</p>
        {item.body ? (
          <p
            className={cn(
              "text-muted-foreground mt-1 text-xs leading-relaxed",
              expanded ? "whitespace-pre-line" : "line-clamp-2",
            )}
          >
            {item.body}
          </p>
        ) : null}
        {item.kind === "trial_ended" || item.kind === "trial_expiry_warning" ? (
          // 카드 전체가 href(/pricing)로 이동하는 submit 버튼 안이라, 명시적 CTA 는 중첩
          //   <button> 대신 버튼처럼 보이는 span 으로 둔다(클릭 시 동일하게 구독 페이지 이동).
          <span className="bg-primary text-primary-foreground mt-2 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold">
            구독하기 <ArrowRightIcon className="size-3.5" />
          </span>
        ) : null}
      </CardContent>
    </>
  );
}
