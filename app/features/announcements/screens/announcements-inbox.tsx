// 공지사항 수신함 (feat-7-011). 인증 사용자라면 누구나.
// RLS 가 자기에게 발송된 published 만 노출. 카드 클릭으로 본문 펼침 + 읽음 처리.
// 디자인 키트 lidam-community/AnnouncementsScreen.

import {
  CheckCircle2Icon,
  ChevronDownIcon,
  EyeOffIcon,
  MegaphoneIcon,
  PinIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Form, data, useFetcher } from "react-router";

import { cn } from "~/core/lib/utils";
import { Chip, EmptyState } from "~/features/community/components/community-ui";
import { CommunityShell } from "~/features/community/components/community-shell";
import makeServerClient from "~/core/lib/supa-client.server";
import type {
  AnnouncementAudienceKind,
  AnnouncementListItem,
} from "~/features/announcements/labels";
import { listInboxAnnouncements } from "~/features/announcements/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";

import type { Route } from "./+types/announcements-inbox";

export const meta: Route.MetaFunction = () => [
  { title: "공지사항 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "1";

  const items = await listInboxAnnouncements(client, user.id, { unreadOnly });
  return { items, unreadOnly };
}

export default function AnnouncementsInbox({
  loaderData,
}: Route.ComponentProps) {
  const { items, unreadOnly } = loaderData;
  const unreadCount = items.filter((i) => i.isUnread).length;

  const descParts = [`총 ${items.length}건`];
  if (unreadCount > 0) descParts.push(`미읽음 ${unreadCount}건`);

  return (
    <CommunityShell
      category="announce"
      title="공지사항"
      desc={descParts.join(" · ")}
      headerRight={
        <Form method="get">
          <label className="border-border bg-muted/50 flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold">
            <input
              type="checkbox"
              name="unread"
              value="1"
              defaultChecked={unreadOnly}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="accent-primary size-3.5"
            />
            안 읽음만
          </label>
        </Form>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={MegaphoneIcon}
          tone="subdued"
          title={
            unreadOnly ? "안 읽은 공지가 없습니다" : "수신한 공지가 없습니다"
          }
          body={
            unreadOnly
              ? "모든 공지를 확인했습니다. 새 공지가 도착하면 이곳에 표시됩니다."
              : "원장·강사가 발송한 공지가 이곳에 모입니다."
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((item) => (
            <InboxCard key={item.announcementId} item={item} />
          ))}
        </div>
      )}
    </CommunityShell>
  );
}

function InboxCard({ item }: { item: AnnouncementListItem }) {
  const [expanded, setExpanded] = useState(false);
  const [optimisticRead, setOptimisticRead] = useState(false);
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const isUnread = (item.isUnread ?? false) && !optimisticRead;

  useEffect(() => {
    if (expanded && isUnread && fetcher.state === "idle") {
      const fd = new FormData();
      fd.set("announcementId", item.announcementId);
      fetcher.submit(fd, {
        method: "post",
        action: "/api/announcements/read",
      });
      setOptimisticRead(true);
    }
  }, [expanded, isUnread, fetcher, item.announcementId]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border shadow-sm transition-colors",
        isUnread
          ? "border-primary/60 bg-primary/[0.05] hover:border-primary"
          : "border-border bg-card hover:border-primary/30",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center gap-2 p-4 text-left"
      >
        {item.isPinned ? (
          <PinIcon className="size-3 text-amber-500" aria-label="고정" />
        ) : null}
        <Chip tone={item.audienceKind === "all" ? "primary" : "violet"}>
          <AudienceLabel kind={item.audienceKind} />
        </Chip>
        {isUnread ? (
          <Chip tone="coral">
            <EyeOffIcon className="size-2.5" /> 미읽음
          </Chip>
        ) : (
          <Chip tone="outline">
            <CheckCircle2Icon className="size-2.5" /> 읽음
          </Chip>
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[14.5px] leading-snug tracking-tight",
            isUnread ? "font-bold" : "font-semibold",
          )}
        >
          {item.title}
        </span>
        <span className="text-muted-foreground text-[11px] font-medium tabular-nums">
          {item.publishedAt
            ? item.publishedAt.slice(0, 16).replace("T", " ")
            : ""}
        </span>
        <ChevronDownIcon
          className={cn(
            "text-muted-foreground size-3.5 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded ? (
        <div className="border-border/60 border-t px-4 pt-3.5 pb-4">
          {item.bodyMd ? (
            <MarkdownView text={item.bodyMd} className="text-sm" />
          ) : (
            <p className="text-muted-foreground text-xs">(본문 없음)</p>
          )}
          {item.authorName ? (
            <p className="text-muted-foreground mt-3 text-[11px]">
              작성자 {item.authorName}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AudienceLabel({ kind }: { kind: AnnouncementAudienceKind }) {
  if (kind === "all") {
    return (
      <>
        <UsersIcon className="size-2.5" /> 전체 공지
      </>
    );
  }
  if (kind === "cohort") {
    return (
      <>
        <UsersIcon className="size-2.5" /> 반 공지
      </>
    );
  }
  return (
    <>
      <UserIcon className="size-2.5" /> 개인 공지
    </>
  );
}
