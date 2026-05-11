// 공지사항 수신함 (feat-7-011). 인증 사용자라면 누구나.
// RLS 가 자기에게 발송된 published 만 노출. 카드 클릭으로 본문 펼침 + 읽음 처리.

import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  MegaphoneIcon,
  PinIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Form, Link, data, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import type {
  AnnouncementAudienceKind,
  AnnouncementListItem,
} from "~/features/announcements/labels";
import { listInboxAnnouncements } from "~/features/announcements/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";

import type { Route } from "./+types/announcements-inbox";

export const meta: Route.MetaFunction = () => [
  { title: "공지사항 | Lidam Edu" },
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

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/dashboard"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 대시보드
      </Link>
      <header className="mb-6 space-y-2">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
          <MegaphoneIcon className="text-primary size-6" /> 공지사항
        </h1>
        <p className="text-muted-foreground text-sm">
          {items.length}건{unreadCount > 0 ? ` · 안 읽음 ${unreadCount}건` : ""}
        </p>
      </header>

      <Form method="get" className="mb-4">
        <label className="border-input inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs">
          <input
            type="checkbox"
            name="unread"
            value="1"
            defaultChecked={unreadOnly}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="size-3.5"
          />
          안 읽음만
        </label>
      </Form>

      {items.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            {unreadOnly
              ? "안 읽은 공지가 없습니다."
              : "수신한 공지가 없습니다."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <InboxCard key={item.announcementId} item={item} />
          ))}
        </div>
      )}
    </div>
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
    <Card
      className={
        isUnread
          ? "border-primary/60 bg-primary/[0.03] hover:border-primary"
          : "hover:border-primary/40 transition-colors"
      }
    >
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.isPinned ? (
            <Badge variant="secondary" className="gap-0.5 text-[10px]">
              <PinIcon className="size-2.5" /> 고정
            </Badge>
          ) : null}
          <AudienceBadge kind={item.audienceKind} />
          {isUnread ? (
            <Badge className="gap-0.5 text-[10px]">
              <EyeOffIcon className="size-2.5" /> 안 읽음
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-0.5 text-[10px]">
              <CheckCircle2Icon className="size-2.5" /> 읽음
            </Badge>
          )}
          <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
            {item.publishedAt
              ? item.publishedAt.slice(0, 16).replace("T", " ")
              : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left"
        >
          <h3 className="text-sm leading-snug font-semibold">{item.title}</h3>
        </button>
        {expanded ? (
          <>
            {item.bodyMd ? (
              <MarkdownView text={item.bodyMd} className="text-sm" />
            ) : (
              <p className="text-muted-foreground text-xs">(본문 없음)</p>
            )}
            <p className="text-muted-foreground text-[11px]">
              {item.authorName ? `작성자 ${item.authorName}` : ""}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground line-clamp-2 text-xs whitespace-pre-line">
            {item.bodyMd ? item.bodyMd.slice(0, 240) : ""}
          </p>
        )}
        <div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setExpanded((v) => !v)}
          >
            <EyeIcon className="size-3" /> {expanded ? "접기" : "본문 보기"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AudienceBadge({ kind }: { kind: AnnouncementAudienceKind }) {
  if (kind === "all") {
    return (
      <Badge variant="outline" className="gap-0.5 text-[10px]">
        <UsersIcon className="size-2.5" /> 전체 공지
      </Badge>
    );
  }
  if (kind === "cohort") {
    return (
      <Badge variant="outline" className="gap-0.5 text-[10px]">
        <UsersIcon className="size-2.5" /> 반 공지
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-0.5 text-[10px]">
      <UserIcon className="size-2.5" /> 개인 공지
    </Badge>
  );
}
