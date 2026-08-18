// 강사용 알림 인박스. /admin/inbox
// staff (instructor/admin) 만 접근. 미읽음 우선, 클릭 시 navigate + read 처리.
// 종류 탭 필터 + 행별 읽음 처리 + (필터 스코프) 일괄 읽음 처리.

import type { MouseEvent } from "react";
import {
  BellIcon,
  BugIcon,
  CheckCheckIcon,
  CheckIcon,
  ClipboardCheckIcon,
  GaugeIcon,
  GraduationCapIcon,
  MessageCircleQuestionIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { Link, data, useFetcher, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import { STAFF_KINDS } from "~/features/notifications/kinds";
import {
  getUnreadCountsByKind,
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
  const kindRaw = url.searchParams.get("kind");
  const kind = STAFF_KINDS.includes(kindRaw as StaffNotificationKind)
    ? (kindRaw as StaffNotificationKind)
    : undefined;
  const [{ items, unreadCount }, kindCounts] = await Promise.all([
    listStaffNotifications(client, user.id, { onlyUnread, kind, limit: 100 }),
    getUnreadCountsByKind(client, user.id, "staff"),
  ]);
  return { items, unreadCount, onlyUnread, kind: kind ?? null, kindCounts, role };
}

const KIND_LABEL: Partial<Record<StaffNotificationKind, string>> = {
  qna_new_question: "Q&A 질문",
  bug_report_created: "오류 신고",
  cohort_upgrade_requested: "등업 신청",
  lecture_note_abuse: "강의노트 이상 열람",
  cohort_inactive_alert: "무접속 경보",
  exam_certificate_submitted: "합격증 제출",
  gs_cap_reached: "AI 한도 경보",
};

const KIND_ICON: Partial<
  Record<StaffNotificationKind, typeof ClipboardCheckIcon>
> = {
  qna_new_question: MessageCircleQuestionIcon,
  bug_report_created: BugIcon,
  lecture_note_abuse: ShieldAlertIcon,
  cohort_upgrade_requested: GraduationCapIcon,
  gs_cap_reached: GaugeIcon,
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

function inboxHref(opts: { kind?: string | null; unread?: boolean }): string {
  const params = new URLSearchParams();
  if (opts.kind) params.set("kind", opts.kind);
  if (opts.unread) params.set("filter", "unread");
  const qs = params.toString();
  return qs ? `/admin/inbox?${qs}` : "/admin/inbox";
}

export default function StaffInbox({ loaderData }: Route.ComponentProps) {
  const { items, unreadCount, onlyUnread, kind, kindCounts, role } = loaderData;
  // 리소스 라우트(action-only)로의 일반 Form 내비게이션은 제출 후 화면 없는
  // /api/... 로 이동해 오류가 되므로 fetcher 로 제출(완료 시 loader 자동 재검증).
  const markAll = useFetcher();
  const scopedUnread = kind ? (kindCounts[kind] ?? 0) : unreadCount;

  return (
    <AdminShell
      cluster="ops"
      role={role}
      title="알림 인박스"
      desc="운영진 수신 알림. 미읽음 항목을 우선으로 표시합니다."
      headerRight={
        scopedUnread > 0 ? (
          <markAll.Form method="post" action="/api/notifications/mark-read">
            <input type="hidden" name="all" value="1" />
            <input type="hidden" name="audience" value="staff" />
            {kind ? <input type="hidden" name="kind" value={kind} /> : null}
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={markAll.state !== "idle"}
            >
              <CheckCheckIcon className="size-3.5" />
              {kind
                ? `'${KIND_LABEL[kind] ?? kind}' 모두 읽음 처리`
                : "모두 읽음 처리"}
            </Button>
          </markAll.Form>
        ) : undefined
      }
    >
      {/* 읽음 필터 탭 */}
      <div className="mb-2 flex items-center gap-1.5">
        <Link
          to={inboxHref({ kind })}
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
          to={inboxHref({ kind, unread: true })}
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

      {/* 종류 필터 탭 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Link
          to={inboxHref({ unread: onlyUnread })}
          className={cn(
            "inline-flex h-7 items-center rounded-full border px-2.5 text-[12px] font-semibold transition-colors",
            !kind
              ? "bg-foreground text-background border-foreground"
              : "border-border hover:bg-muted/40",
          )}
        >
          모든 종류
        </Link>
        {STAFF_KINDS.map((k) => {
          const cnt = kindCounts[k] ?? 0;
          return (
            <Link
              key={k}
              to={inboxHref({ kind: k, unread: onlyUnread })}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] font-semibold transition-colors",
                kind === k
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:bg-muted/40",
              )}
            >
              {KIND_LABEL[k] ?? k}
              {cnt > 0 ? (
                <span
                  className={cn(
                    "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] tabular-nums",
                    kind === k ? "bg-white/20" : "bg-rose-500 text-white",
                  )}
                >
                  {cnt}
                </span>
              ) : null}
            </Link>
          );
        })}
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
            { label: "", width: "5rem" },
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
  const navigate = useNavigate();
  // 낙관적 표시 — 읽음 버튼 제출 즉시 읽음 상태로.
  const optimisticRead = fetcher.state !== "idle";
  const showUnread = isUnread && !optimisticRead;

  const handleClick = () => {
    const fd = new FormData();
    fd.set("notificationId", item.notificationId);
    fetcher.submit(fd, { method: "post", action: "/api/notifications/mark-read" });
    // ★window.location.href(전체 리로드)를 쓰면 위 읽음 POST 가 언로드에 잘리고,
    //   모바일에서 리로드 지연이 '탭했는데 안 열림'으로 보인다 — 클라이언트 내비게이션으로.
    if (/^https?:\/\//.test(item.href)) window.location.href = item.href;
    else void navigate(item.href);
  };

  const handleMarkRead = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const fd = new FormData();
    fd.set("notificationId", item.notificationId);
    fetcher.submit(fd, { method: "post", action: "/api/notifications/mark-read" });
  };

  return (
    <TR active={showUnread} onClick={handleClick} testid="inbox-item">
      <TD>
        <div className="flex items-center gap-1.5">
          <Icon
            className={cn(
              "size-3.5 shrink-0",
              showUnread ? "text-link" : "text-muted-foreground",
            )}
          />
          <Chip tone={showUnread ? "blue" : "neutral"}>{kindLabel}</Chip>
        </div>
      </TD>
      <TD>
        <p
          className={cn(
            "line-clamp-1 text-[13px]",
            showUnread ? "font-semibold" : "font-medium",
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
        {showUnread ? (
          <button
            type="button"
            onClick={handleMarkRead}
            title="열지 않고 읽음 처리"
            className="border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium transition-colors"
          >
            <CheckIcon className="size-3" /> 읽음
          </button>
        ) : null}
      </TD>
    </TR>
  );
}
