// 공지 수신함 카드 목록 — 학습(/announcements)·강의(/lecture/announcements) 두 화면이 공유.
// 바깥 껍데기(플랫폼별 헤더·탭)만 각 화면이 소유하고, 카드 렌더·읽음 처리는 여기 한 곳.

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
import { useFetcher } from "react-router";

import { cn } from "~/core/lib/utils";
import { Chip, EmptyState } from "~/features/community/components/community-ui";
import { MarkdownView } from "~/features/problems/components/markdown-view";

import type {
  AnnouncementAudienceKind,
  AnnouncementListItem,
} from "../labels";

export function AnnouncementInboxList({
  items,
  unreadOnly,
}: {
  items: AnnouncementListItem[];
  unreadOnly: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={MegaphoneIcon}
        tone="subdued"
        title={unreadOnly ? "안 읽은 공지가 없습니다" : "수신한 공지가 없습니다"}
        body={
          unreadOnly
            ? "모든 공지를 확인했습니다. 새 공지가 도착하면 이곳에 표시됩니다."
            : "원장·강사가 발송한 공지가 이곳에 모입니다."
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => (
        <InboxCard key={item.announcementId} item={item} />
      ))}
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
        <Chip
          tone={
            item.audienceKind === "all"
              ? "primary"
              : item.audienceKind === "staff"
                ? "amber"
                : "violet"
          }
        >
          <AudienceLabel kind={item.audienceKind} />
        </Chip>
        {isUnread ? (
          <Chip tone="coral">
            <EyeOffIcon className="size-2.5" /> 안 읽음
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
          {item.bodyHtml ? (
            // 운영자 작성(신뢰) HTML — 통합 에디터 저장분. 레거시는 마크다운 폴백.
            <div
              className="lecture-detail-html text-sm"
              dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
            />
          ) : item.bodyMd ? (
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
  if (kind === "staff") {
    return (
      <>
        <UsersIcon className="size-2.5" /> 강사·운영자 공지
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
