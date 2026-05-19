import {
  BellIcon,
  CogIcon,
  HomeIcon,
  LogOutIcon,
  MenuIcon,
  SearchIcon,
} from "lucide-react";
import { Fragment } from "react";
import { Link } from "react-router";

import { openCommandPalette } from "./command-palette";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "~/core/components/ui/navigation-menu";

import { SUBJECT_SECTIONS } from "~/core/lib/subject-groups";
import { cn } from "~/core/lib/utils";

import LangSwitcher from "./lang-switcher";
import ThemeSwitcher from "./theme-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Separator } from "./ui/separator";
import {
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTrigger,
} from "./ui/sheet";

type SimpleLink = { label: string; to: string };

// V5 nav dropdown chip — rest 는 #FAFAFA pill, hover/focus 시 brand blue.
const CHIP_CLASS =
  "inline-flex items-center rounded-full border border-black/[0.06] bg-[#FAFAFA] px-[13px] py-[7px] text-[13px] font-semibold leading-none tracking-[-0.01em] text-foreground no-underline outline-none transition-all duration-150 hover:border-transparent hover:bg-[#2D5BA8] hover:text-white focus-visible:border-transparent focus-visible:bg-[#2D5BA8] focus-visible:text-white dark:border-border dark:bg-muted";

// 상단 네비게이션 8개 top-level (좌→우):
// 대시보드(flat) · 학습관리▾ · 학습과목▾ · 학습보조▾ · 학습정보▾ · 모의고사▾ · 커뮤니티▾ · 운영자(flat)

const leadingFlats: SimpleLink[] = [
  { label: "대시보드", to: "/dashboard" },
];

const studyItems: SimpleLink[] = [
  { label: "학습목표 및 과목별 진도", to: "/goals" },
  { label: "학습 통계", to: "/study/stats" },
  { label: "내 과제", to: "/assignments" },
  { label: "알림", to: "/inbox" },
];

const latestItems: SimpleLink[] = [
  { label: "법 개정", to: "/latest/laws" },
  { label: "최근 판례", to: "/latest/cases" },
  { label: "객관식 기출문제", to: "/latest/mcq?kind=past_exam" },
  { label: "주관식 기출문제", to: "/latest/essay" },
  { label: "논문", to: "/latest/papers" },
  { label: "추록·정오표", to: "/latest/book-updates" },
];

const studyAidItems: SimpleLink[] = [
  { label: "오답노트", to: "/study/wrong-note" },
  { label: "즐겨찾기", to: "/study/bookmarks" },
  { label: "메모", to: "/study/notes" },
  { label: "하이라이트", to: "/study/highlights" },
];

// 1차는 종합/진도별로 분리 — mcq_packs.kind 가 이미 구분, 색인 loader 의 ?kind= 활용.
const mockExamItems: SimpleLink[] = [
  { label: "1차 종합 모의고사", to: "/latest/mcq?kind=mock_full" },
  { label: "1차 진도별 모의고사", to: "/latest/mcq?kind=mock_progressive" },
  { label: "2차 모의고사 (온라인 GS)", to: "/gs" },
];

const communityItems: SimpleLink[] = [
  { label: "공지사항", to: "/announcements" },
  { label: "자유게시판", to: "/community/free" },
  { label: "스터디 모집", to: "/community/study" },
  { label: "Q&A", to: "/qna" },
  { label: "합격 후기", to: "/community/review" },
];

const trailingFlats: SimpleLink[] = [
  { label: "운영자", to: "/admin" },
];

function UserMenu({
  name,
  email,
  avatarUrl,
}: {
  name: string;
  email?: string;
  avatarUrl?: string | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="size-8 cursor-pointer rounded-lg">
          <AvatarImage src={avatarUrl ?? undefined} />
          <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-semibold">{name}</span>
          <span className="truncate text-xs">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <SheetClose asChild>
            <Link to="/dashboard" viewTransition>
              <HomeIcon className="size-4" />
              대시보드
            </Link>
          </SheetClose>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <SheetClose asChild>
            <Link to="/account/edit" viewTransition>
              내 계정
            </Link>
          </SheetClose>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <SheetClose asChild>
            <Link to="/logout" viewTransition>
              <LogOutIcon className="size-4" />
              로그아웃
            </Link>
          </SheetClose>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AuthButtons() {
  return (
    <>
      <Button variant="ghost" asChild>
        <SheetClose asChild>
          <Link to="/login" viewTransition>
            로그인
          </Link>
        </SheetClose>
      </Button>
      <Button
        variant="default"
        asChild
        className="bg-[#2D5BA8] text-white shadow-[0_6px_16px_rgba(45,91,168,0.18)] hover:bg-[#1E4789]"
      >
        <SheetClose asChild>
          <Link to="/join" viewTransition>
            회원가입
          </Link>
        </SheetClose>
      </Button>
    </>
  );
}

function Actions({
  inboxUnread,
  inboxHref,
}: {
  inboxUnread: number | null;
  inboxHref: string | null;
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground inline-flex h-8 items-center gap-1.5 px-2"
        onClick={() => openCommandPalette()}
        aria-label="전역 검색 (⌘K)"
        data-testid="open-command-palette"
      >
        <SearchIcon className="size-3.5" />
        <span className="hidden text-xs sm:inline">검색</span>
        <kbd className="bg-muted hidden rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </Button>
      {inboxUnread !== null && inboxHref ? (
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`알림 인박스 (미읽음 ${inboxUnread})`}
          data-testid="open-inbox"
        >
          <Link to={inboxHref}>
            <BellIcon className="size-4" />
            {inboxUnread > 0 ? (
              <span className="bg-rose-600 text-white absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums">
                {inboxUnread > 99 ? "99+" : inboxUnread}
              </span>
            ) : null}
          </Link>
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild className="cursor-pointer">
          <Button variant="ghost" size="icon">
            <CogIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <SheetClose asChild>
              <Link to="/debug/sentry" viewTransition>
                Sentry
              </Link>
            </SheetClose>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <SheetClose asChild>
              <Link to="/debug/analytics" viewTransition>
                Google Tag
              </Link>
            </SheetClose>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ThemeSwitcher />
      <LangSwitcher />
    </>
  );
}

// 모바일 sheet 안에서 그룹 헤더 + 들여쓴 링크들.
function MobileGroup({ label, items }: { label: string; items: SimpleLink[] }) {
  return (
    <>
      <p className="text-muted-foreground mt-3 px-3 text-xs font-semibold tracking-wide uppercase">
        {label}
      </p>
      {items.map((m) => (
        <SheetClose key={m.to} asChild>
          <Link to={m.to} className="hover:bg-accent rounded-md px-3 py-2 pl-5">
            {m.label}
          </Link>
        </SheetClose>
      ))}
    </>
  );
}

function FlatLink({ to, label }: SimpleLink) {
  return (
    <NavigationMenuItem>
      <Link className={navigationMenuTriggerStyle()} to={to} viewTransition>
        {label}
      </Link>
    </NavigationMenuItem>
  );
}

// 단순 SimpleLink 목록 드롭다운 (한 컬럼). 학습/학습 보조/커뮤니티/최신 정보 공용.
function SimpleDropdown({
  label,
  items,
}: {
  label: string;
  items: SimpleLink[];
}) {
  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger>{label}</NavigationMenuTrigger>
      <NavigationMenuContent className="left-1/2 -translate-x-1/2">
        <div className="flex w-[340px] flex-wrap gap-1.5 p-3">
          {items.map((item) => (
            <NavigationMenuLink asChild key={item.to}>
              <Link to={item.to} className={CHIP_CLASS}>
                {item.label}
              </Link>
            </NavigationMenuLink>
          ))}
        </div>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}

export function NavigationBar({
  name,
  email,
  avatarUrl,
  loading,
  inboxUnread = null,
  inboxHref = null,
}: {
  name?: string;
  email?: string;
  avatarUrl?: string | null;
  loading: boolean;
  // 로그인 사용자의 미읽음 알림 카운트. 비로그인 / 미산정 시 null.
  inboxUnread?: number | null;
  // 클릭 시 진입할 인박스 경로 — staff 는 /admin/inbox, 학생은 /inbox.
  inboxHref?: string | null;
}) {
  return (
    <nav className="dark:bg-background/85 sticky top-0 z-50 mx-auto flex h-14 w-full items-center justify-between border-b border-black/[0.06] bg-white/80 px-4 backdrop-blur-lg backdrop-saturate-150 transition-opacity md:px-6 dark:border-border">
      <div className="mx-auto flex h-full w-full max-w-[1200px] items-center gap-4">
        <Link to="/" aria-label="리담변리사학원 홈">
          {/* 로고 PNG 의 텍스트 부분이 검정이라 dark 모드에서 안 보임. invert + hue-rotate(180)
              조합으로 검정→흰색 변환하면서 심볼 브랜드 컬러는 그대로 보존. */}
          <img
            src="/lidam-logo.png"
            alt="리담변리사학원"
            className="h-7 w-auto shrink-0 dark:[filter:invert(1)_hue-rotate(180deg)]"
          />
        </Link>

        {/* 데스크톱 네비게이션 — 로고 바로 오른쪽, '운영자'까지 왼쪽 정렬 */}
        <div className="hidden h-full items-center md:flex">
          <NavigationMenu viewport={false}>
            <NavigationMenuList>
              {leadingFlats.map((m) => (
                <FlatLink key={m.to} {...m} />
              ))}

              <SimpleDropdown label="학습관리" items={studyItems} />

              {/* 학습과목 dropdown — V5 (카테고리 row + chip) */}
              <NavigationMenuItem>
                <NavigationMenuTrigger>학습과목</NavigationMenuTrigger>
                <NavigationMenuContent className="left-1/2 -translate-x-1/2">
                  <div className="flex w-[720px] flex-col gap-3 px-5 py-[18px]">
                    {SUBJECT_SECTIONS.map((section, si) => (
                      <div
                        key={section.exam}
                        className={cn(
                          si > 0 &&
                            "border-t border-black/[0.06] pt-3 dark:border-border",
                        )}
                      >
                        {/* 1차 / 2차 섹션 헤더 */}
                        <div className="text-primary mb-2 font-mono text-[11px] font-bold tracking-[0.08em] uppercase">
                          {section.label}
                        </div>
                        <div className="flex flex-col gap-2.5">
                          {section.groups.map((group) => (
                            <div
                              key={group.id}
                              className="grid grid-cols-[160px_1fr] items-baseline gap-[18px]"
                            >
                              <div>
                                <div className="text-foreground mb-0.5 text-[14px] leading-[1.3] font-bold tracking-[-0.012em]">
                                  {group.label}
                                </div>
                                <div className="dark:text-muted-foreground text-[11px] leading-[1.4] tracking-[-0.005em] text-black/40">
                                  {group.sub}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {group.items.map((item) => (
                                  <NavigationMenuLink
                                    asChild
                                    key={`${section.exam}-${item.href}`}
                                  >
                                    <Link to={item.href} className={CHIP_CLASS}>
                                      {item.name}
                                    </Link>
                                  </NavigationMenuLink>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>

              <SimpleDropdown label="학습보조" items={studyAidItems} />
              <SimpleDropdown label="학습정보" items={latestItems} />
              <SimpleDropdown label="모의고사" items={mockExamItems} />
              <SimpleDropdown label="커뮤니티" items={communityItems} />

              {trailingFlats.map((m) => (
                <FlatLink key={m.to} {...m} />
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* '운영자' 이후 — 오른쪽 정렬 */}
        <div className="ml-auto hidden h-full items-center gap-3 md:flex">
          <Actions inboxUnread={inboxUnread} inboxHref={inboxHref} />
          <Separator orientation="vertical" />

          {loading ? (
            <div className="flex items-center">
              <div className="bg-muted-foreground/20 size-8 animate-pulse rounded-lg" />
            </div>
          ) : name ? (
            <UserMenu name={name} email={email} avatarUrl={avatarUrl} />
          ) : (
            <AuthButtons />
          )}
        </div>

        {/* Mobile */}
        <SheetTrigger className="ml-auto size-6 md:hidden">
          <MenuIcon />
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <nav className="flex flex-col gap-1 text-sm">
              {leadingFlats.map((m) => (
                <SheetClose key={m.to} asChild>
                  <Link
                    to={m.to}
                    className="hover:bg-accent rounded-md px-3 py-2"
                  >
                    {m.label}
                  </Link>
                </SheetClose>
              ))}

              <MobileGroup label="학습관리" items={studyItems} />

              <p className="text-muted-foreground mt-3 px-3 text-xs font-semibold tracking-wide uppercase">
                학습과목
              </p>
              {SUBJECT_SECTIONS.map((section) => (
                <Fragment key={section.exam}>
                  <p className="text-primary px-3 pt-1.5 font-mono text-[11px] font-bold tracking-wide uppercase">
                    {section.label}
                  </p>
                  {section.groups.flatMap((group) =>
                    group.items.map((item) => (
                      <SheetClose key={`${section.exam}-${item.href}`} asChild>
                        <Link
                          to={item.href}
                          className="hover:bg-accent rounded-md px-3 py-2 pl-5"
                        >
                          {group.label === item.name
                            ? item.name
                            : `${group.label} · ${item.name}`}
                        </Link>
                      </SheetClose>
                    )),
                  )}
                </Fragment>
              ))}

              <MobileGroup label="학습보조" items={studyAidItems} />
              <MobileGroup label="학습정보" items={latestItems} />
              <MobileGroup label="모의고사" items={mockExamItems} />
              <MobileGroup label="커뮤니티" items={communityItems} />

              {trailingFlats.map((m) => (
                <SheetClose key={m.to} asChild>
                  <Link
                    to={m.to}
                    className="hover:bg-accent mt-1 rounded-md px-3 py-2"
                  >
                    {m.label}
                  </Link>
                </SheetClose>
              ))}
            </nav>
          </SheetHeader>
          {loading ? (
            <div className="flex items-center">
              <div className="bg-muted-foreground h-4 w-24 animate-pulse rounded-full" />
            </div>
          ) : (
            <SheetFooter>
              {name ? (
                <div className="grid grid-cols-3">
                  <div className="col-span-2 flex w-full justify-between">
                    <Actions inboxUnread={inboxUnread} inboxHref={inboxHref} />
                  </div>
                  <div className="flex justify-end">
                    <UserMenu name={name} email={email} avatarUrl={avatarUrl} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="flex justify-between">
                    <Actions inboxUnread={inboxUnread} inboxHref={inboxHref} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AuthButtons />
                  </div>
                </div>
              )}
            </SheetFooter>
          )}
        </SheetContent>
      </div>
    </nav>
  );
}
