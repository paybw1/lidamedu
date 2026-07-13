// 강의 플랫폼 전용 레이아웃(feat-11) — 학습 플랫폼(navigation.layout)과 별개 화면.
//   자체 상단 바: 브랜드 + 플랫폼 스위처(강의 활성) + 강의 네비 + 계정.
//   학습 nav(사이드바·하단탭·드롭다운)를 재사용하지 않아 서로 간섭 없음.
// 인증: 이 레이아웃은 하드 게이트하지 않는다(카탈로그 등 공개 가능). 보호가 필요한
//   화면(내 강의실)은 각 loader 가 자체 redirect 로 게이트한다(my-courses 참조).
import type { Route } from "./+types/lecture.layout";

import { BellIcon, SearchIcon } from "lucide-react";
import { Link, Outlet, data } from "react-router";

import {
  CommandPalette,
  openCommandPalette,
} from "../components/command-palette";
import Footer from "../components/footer";
import { LectureNav, LectureNavMobile } from "../components/lecture-nav";
import { PlatformSwitch } from "../components/platform-switch";
import ThemeSwitcher from "../components/theme-switcher";
import { CartClearOnPurchase } from "~/features/lms/components/cart-clear-on-purchase";
import { CartLink } from "~/features/lms/components/cart-link";
import { UserMenu } from "../components/navigation-bar";
import { Button } from "../components/ui/button";
import makeServerClient from "../lib/supa-client.server";
import { getUnreadCount } from "~/features/notifications/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return data(
      { user: null, inboxUnread: 0, inboxHref: "/inbox", isStaff: false },
      { headers },
    );
  }
  const role = await getStaffRole(client, user.id);
  const unread = await getUnreadCount(
    client,
    user.id,
    role ? "staff" : "student",
  );
  return data(
    {
      user: {
        name: (user.user_metadata.name as string) || "학습자",
        email: user.email,
        avatarUrl: (user.user_metadata.avatar_url as string | undefined) ?? null,
      },
      inboxUnread: unread,
      inboxHref: role ? "/admin/inbox" : "/inbox",
      isStaff: role !== null,
    },
    { headers },
  );
}

export default function LectureLayout({ loaderData }: Route.ComponentProps) {
  const { user, inboxUnread, inboxHref, isStaff } = loaderData;
  return (
    <div className="flex min-h-screen flex-col justify-between">
      <header className="dark:bg-background/85 dark:border-border sticky top-0 z-50 border-b border-black/[0.06] bg-white/80 backdrop-blur-lg backdrop-saturate-150">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-2 px-4 md:px-6">
          <Link
            to="/lecture/home"
            aria-label="리담변리사학원 — 강의 플랫폼"
            className="flex shrink-0 items-center gap-3"
          >
            <img
              src="/lidam-logo.png"
              alt="리담변리사학원"
              className="h-7 w-auto max-w-none dark:[filter:invert(1)_hue-rotate(180deg)]"
            />
          </Link>
          <PlatformSwitch />

          {/* 강의 플랫폼 네비 — 데스크톱(마이페이지 드롭다운) */}
          <LectureNav isStaff={isStaff} />

          <div className="ml-auto flex items-center gap-2">
            <ThemeSwitcher />
            <CartLink />
            {user ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  onClick={() => openCommandPalette()}
                  aria-label="전역 검색 (조문·판례·문제)"
                  title="검색 (⌘K / Ctrl+K)"
                >
                  <SearchIcon className="size-5" />
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="relative size-9"
                >
                  <Link to={inboxHref} aria-label="알림">
                    <BellIcon className="size-5" />
                    {inboxUnread > 0 ? (
                      <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold">
                        {inboxUnread > 9 ? "9+" : inboxUnread}
                      </span>
                    ) : null}
                  </Link>
                </Button>
                <UserMenu
                  name={user.name}
                  email={user.email}
                  avatarUrl={user.avatarUrl}
                />
              </>
            ) : (
              <Button asChild size="sm">
                <Link to="/login">로그인</Link>
              </Button>
            )}
          </div>
        </div>

        {/* 모바일 강의 네비 — 상단 바 아래 가로 스크롤 탭(자식 노드 평탄화) */}
        <LectureNavMobile isStaff={isStaff} />
      </header>

      <CartClearOnPurchase />
      {user ? <CommandPalette /> : null}
      <main className="mx-auto w-full flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
