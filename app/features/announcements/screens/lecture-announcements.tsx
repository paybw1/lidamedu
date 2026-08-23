// 공지사항 — **강의 플랫폼**(/lecture/announcements). 상단 리담안내 드롭다운에서 진입.
// 학습 플랫폼(/announcements)과 같은 데이터·같은 카드를 쓰되 노출 범위만 다르다:
//   학습 = platform_scope in (study, both) / 강의 = (lecture, both).
// ★강의 플랫폼은 현재 개발 중이라 lecture.layout 이 비-staff 를 전부 lidamedu.com 으로
//   보낸다 — 게이트가 열리기 전까지 이 화면은 사실상 staff 전용이다.

import { Form, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { AnnouncementInboxList } from "~/features/announcements/components/inbox-list";
import { listInboxAnnouncements } from "~/features/announcements/queries.server";
import { LandingStyle } from "~/features/landing/components/landing-style";

import type { Route } from "./+types/lecture-announcements";

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
    platform: "lecture",
  });
  return { items, unreadOnly };
}

export default function LectureAnnouncements({
  loaderData,
}: Route.ComponentProps) {
  const { items, unreadOnly } = loaderData;
  const unreadCount = items.filter((i) => i.isUnread).length;

  return (
    <div className="llx">
      <LandingStyle />
      <section className="band">
        <div className="wrap" style={{ maxWidth: 820 }}>
          <div className="shead">
            <div>
              <p className="eyebrow">공지사항</p>
              <h2>학원 공지</h2>
            </div>
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
          </div>
          <p className="mb-3 text-[12px] font-medium text-[var(--soft)]">
            총 {items.length}건
            {unreadCount > 0 ? ` · 안 읽음 ${unreadCount}건` : ""}
          </p>
          <AnnouncementInboxList items={items} unreadOnly={unreadOnly} />
        </div>
      </section>
    </div>
  );
}
