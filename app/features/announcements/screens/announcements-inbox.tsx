// 공지사항 수신함 — **학습 플랫폼**(/announcements). 인증 사용자라면 누구나.
// RLS 가 자기에게 발송된 published 만 노출. 카드 클릭으로 본문 펼침 + 읽음 처리.
// 디자인 키트 lidam-community/AnnouncementsScreen.
// ★강의 플랫폼 쪽 같은 화면은 screens/lecture-announcements.tsx — 카드 목록만 공유하고
//   껍데기(커뮤니티 탭 vs 강의 랜딩 스타일)는 각자 소유한다.

import { Form, data } from "react-router";

import { CommunityShell } from "~/features/community/components/community-shell";
import makeServerClient from "~/core/lib/supa-client.server";
import { AnnouncementInboxList } from "~/features/announcements/components/inbox-list";
import { listInboxAnnouncements } from "~/features/announcements/queries.server";

import type { Route } from "./+types/announcements-inbox";

export const meta: Route.MetaFunction = () => [
  { title: "공지사항 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "1";

  const items = await listInboxAnnouncements(client, user.id, {
    unreadOnly,
    platform: "study",
  });
  return { items, unreadOnly };
}

export default function AnnouncementsInbox({
  loaderData,
}: Route.ComponentProps) {
  const { items, unreadOnly } = loaderData;
  const unreadCount = items.filter((i) => i.isUnread).length;

  const descParts = [`총 ${items.length}건`];
  if (unreadCount > 0) descParts.push(`안 읽음 ${unreadCount}건`);

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
      <AnnouncementInboxList items={items} unreadOnly={unreadOnly} />
    </CommunityShell>
  );
}
