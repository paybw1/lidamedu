import {
  BellIcon,
  HomeIcon,
  LockIcon,
  LogOutIcon,
  MenuIcon,
  PanelLeftOpenIcon,
  PanelTopOpenIcon,
  SearchIcon,
  UserIcon,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router";

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

import { openCommandPalette } from "./command-palette";
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
  Sheet,
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
// 대시보드(flat) · 학습관리▾ · 학습과목▾ · 학습지원▾ · 학습정보▾ · 모의고사▾ · 커뮤니티▾ · 운영자(flat)

const leadingFlats: SimpleLink[] = [{ label: "대시보드", to: "/dashboard" }];

// 학습관리 항목 — SRS/플래시카드 같은 학원 용어 대신 학생이 바로 이해할 수 있는 라벨로.
// (URL slug 는 보존 — 북마크/공유 링크 호환성.)
// "알림" 은 상단 우측 종모양 벨(읽지 않은 수 배지 포함) 로 단일화 — 본 dropdown 에서 제거.
const studyItems: SimpleLink[] = [
  { label: "오늘 할 일", to: "/study/today" },
  { label: "복습", to: "/study/srs" },
  { label: "카드 암기", to: "/srs" },
  { label: "학습 목표 · 진도", to: "/goals" },
  { label: "학습 통계", to: "/study/stats" },
  { label: "과제", to: "/assignments" },
  // feat-10-006 — 정오문제(OX) 이력은 오답·복습 결과 성격이라 학습관리에 둠.
  { label: "정오문제 응시 이력", to: "/me/ox-sessions" },
];

const latestItems: SimpleLink[] = [
  { label: "법 개정", to: "/latest/laws" },
  { label: "최근 판례", to: "/latest/cases" },
  { label: "1차 기출문제", to: "/latest/mcq?kind=past_exam" },
  { label: "2차 기출문제", to: "/latest/essay" },
  { label: "논문", to: "/latest/papers" },
  { label: "추록·정오표", to: "/latest/book-updates" },
];

const studyAidItems: SimpleLink[] = [
  { label: "오답노트", to: "/study/wrong-note" },
  { label: "하이라이트", to: "/study/highlights" },
  { label: "즐겨찾기", to: "/study/bookmarks" },
  { label: "포스트잇", to: "/study/notes" },
  { label: "메모", to: "/study/comments" },
  // feat-9-004 — 생성형 AI Q&A. 베타.
  { label: "AI Q&A (베타)", to: "/ai" },
];

// 1차 통합(3교시)·진도별은 /latest/mcq?kind=mock 한 색인에 함께 노출 — 한 항목으로 통합.
const mockExamItems: SimpleLink[] = [
  { label: "1차 모의고사", to: "/latest/mcq?kind=mock" },
  { label: "2차 모의고사 (온라인 GS)", to: "/gs" },
  { label: "응시 결과", to: "/me/exam-results" },
];

const communityItems: SimpleLink[] = [
  { label: "공지사항", to: "/announcements" },
  { label: "자유게시판", to: "/community/free" },
  { label: "스터디 모집", to: "/community/study" },
  { label: "Q&A", to: "/qna" },
  { label: "합격 후기", to: "/community/review" },
];

const trailingFlats: SimpleLink[] = [{ label: "운영관리", to: "/admin" }];

export function UserMenu({
  hideName = false,
  name,
  email,
  avatarUrl,
}: {
  hideName?: boolean;
  name: string;
  email?: string;
  avatarUrl?: string | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-2 rounded-lg outline-none"
        >
          <Avatar className="size-8 rounded-lg">
            <AvatarImage src={avatarUrl ?? undefined} />
            <AvatarFallback>
              <UserIcon className="size-4" />
            </AvatarFallback>
          </Avatar>
          {!hideName && (
            <span className="hidden max-w-[12rem] truncate text-sm font-medium sm:inline">
              {name}
            </span>
          )}
        </button>
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
  orientation = "horizontal",
}: {
  inboxUnread: number | null;
  inboxHref: string | null;
  /** sidebar 안에선 수직(아이콘 stack), topbar 에선 수평. */
  orientation?: "horizontal" | "vertical";
}) {
  const isVertical = orientation === "vertical";
  return (
    <div
      className={cn(
        "flex items-center",
        isVertical ? "flex-col gap-1" : "gap-1",
      )}
    >
      <Button
        variant="ghost"
        size={isVertical ? "icon" : "sm"}
        className={cn(
          "text-muted-foreground",
          isVertical ? "size-9" : "inline-flex h-8 items-center gap-1.5 px-2",
        )}
        onClick={() => openCommandPalette()}
        aria-label="전역 검색 (⌘K)"
        data-testid="open-command-palette"
        title="전역 검색"
      >
        <SearchIcon className="size-4" />
        {!isVertical && (
          <>
            <span className="hidden text-xs sm:inline">검색</span>
            <kbd className="bg-muted hidden rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline">
              ⌘K
            </kbd>
          </>
        )}
      </Button>
      {inboxUnread !== null && inboxHref ? (
        <Button
          asChild
          variant="ghost"
          size="icon"
          className={cn("relative", isVertical ? "size-9" : "")}
          aria-label={`알림 인박스 (미읽음 ${inboxUnread})`}
          data-testid="open-inbox"
          title="알림 인박스"
        >
          <Link to={inboxHref}>
            <BellIcon className="size-4" />
            {inboxUnread > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white tabular-nums">
                {inboxUnread > 99 ? "99+" : inboxUnread}
              </span>
            ) : null}
          </Link>
        </Button>
      ) : null}
      <ThemeSwitcher />
      <NavModeIconButton isVertical={isVertical} />
    </div>
  );
}

/** nav 모드 전환 아이콘 — RightTools 안. 밝기 옆. 항상 노출(상단 nav · 사이드바 양쪽). */
function NavModeIconButton({ isVertical }: { isVertical: boolean }) {
  const [mode, setMode] = useState<"topbar" | "sidebar">("topbar");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("studentNavMode");
    if (stored === "sidebar" || stored === "topbar") setMode(stored);
  }, []);
  const flip = () => {
    const next = mode === "topbar" ? "sidebar" : "topbar";
    if (typeof window === "undefined") return;
    window.localStorage.setItem("studentNavMode", next);
    if (next === "sidebar") {
      window.localStorage.setItem("studentSidebarCollapsed", "1");
    }
    document.cookie = `studentNavMode=${next}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    window.location.reload();
  };
  const title = mode === "topbar" ? "사이드바로 전환" : "상단 메뉴로 전환";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={flip}
      title={title}
      aria-label={title}
      className={cn(isVertical ? "size-9" : "")}
    >
      {mode === "topbar" ? (
        <PanelLeftOpenIcon className="size-4" />
      ) : (
        <PanelTopOpenIcon className="size-4" />
      )}
    </Button>
  );
}

// 사이드바·외부에서도 도구 그룹 재사용.
export { Actions as RightTools };

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
  locked = false,
}: {
  label: string;
  items: SimpleLink[];
  /** feat-8-008 — true 면 트리거 라벨에 🔒 표시 (서버 게이트가 권위, 시각 힌트). */
  locked?: boolean;
}) {
  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger>
        {locked ? (
          <LockIcon className="mr-1 size-3 opacity-60" aria-label="잠김" />
        ) : null}
        {label}
      </NavigationMenuTrigger>
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
  isStaff = false,
  features,
  hideMenus = false,
  hideAll = false,
}: {
  name?: string;
  email?: string;
  avatarUrl?: string | null;
  loading: boolean;
  // 로그인 사용자의 미읽음 알림 카운트. 비로그인 / 미산정 시 null.
  inboxUnread?: number | null;
  // 클릭 시 진입할 인박스 경로 — staff 는 /admin/inbox, 학생은 /inbox.
  inboxHref?: string | null;
  // staff(강사·관리자·원장) 여부 — 운영관리 메뉴는 staff 에게만 노출.
  isStaff?: boolean;
  // feat-8-008 — 사용자의 구독/cohort 기반 영역 플래그. undefined = 미산정(로딩) → 잠금 미표시.
  features?: string[];
  // 새 nav 검증용 — 학생 사이드바 병존 시 기존 메뉴 dropdown 들 숨김. 로고·알림·유저메뉴는 유지.
  hideMenus?: boolean;
  // 사이드바 모드 — 상단 nav 전체 숨김(로고·도구·유저메뉴 포함). 사이드바가 모든 역할 흡수.
  hideAll?: boolean;
}) {
  // 사이드바 모드 — 상단 nav 전체 미렌더. 사이드바가 로고·도구·유저메뉴 흡수.
  if (hideAll) return null;
  // feat-8-008 — 영역 잠금. staff 면제. 미산정 상태에선 잠금 미표시(로딩 깜빡임 방지).
  const isLocked = (area: string) =>
    !isStaff && features !== undefined && !features.includes(area);
  const lockSubjects = isLocked("area_subjects");
  const lockStudyAids = isLocked("area_study_aids");
  const lockStudyMgmt = isLocked("area_study_mgmt");
  const lockMockExams = isLocked("area_mock_exams");
  return (
    <nav className="dark:bg-background/85 dark:border-border sticky top-0 z-50 mx-auto flex h-14 w-full items-center justify-between border-b border-black/[0.06] bg-white/80 px-4 backdrop-blur-lg backdrop-saturate-150 transition-opacity md:px-6">
      <div className="mx-auto flex h-full w-full max-w-[1200px] items-center gap-4">
        <Link to="/" aria-label="리담변리사학원 홈" className="shrink-0">
          {/* 로고 PNG 의 텍스트 부분이 검정이라 dark 모드에서 안 보임. invert + hue-rotate(180)
              조합으로 검정→흰색 변환하면서 심볼 브랜드 컬러는 그대로 보존. */}
          {/* shrink-0(Link) + max-w-none(img): 네비가 좁아져도 Tailwind preflight 의
              max-width:100% 가 로고를 가로로 압축하지 못하게 막는다. */}
          <img
            src="/lidam-logo.png"
            alt="리담변리사학원"
            className="h-7 w-auto max-w-none dark:[filter:invert(1)_hue-rotate(180deg)]"
          />
        </Link>

        {/* 데스크톱 네비게이션 — 로고 바로 오른쪽, '운영자'까지 왼쪽 정렬 */}
        <div
          className={cn(
            "hidden h-full items-center md:flex",
            hideMenus && "md:hidden",
          )}
        >
          <NavigationMenu viewport={false}>
            <NavigationMenuList>
              {leadingFlats.map((m) => (
                <FlatLink key={m.to} {...m} />
              ))}

              <SimpleDropdown
                label="학습관리"
                items={studyItems}
                locked={lockStudyMgmt}
              />

              {/* 학습과목 dropdown — V5 (카테고리 row + chip) */}
              <NavigationMenuItem>
                <NavigationMenuTrigger>
                  {lockSubjects ? (
                    <LockIcon
                      className="mr-1 size-3 opacity-60"
                      aria-label="잠김"
                    />
                  ) : null}
                  학습과목
                </NavigationMenuTrigger>
                <NavigationMenuContent className="left-1/2 -translate-x-1/2">
                  <div className="flex w-[720px] flex-col gap-3 px-5 py-[18px]">
                    {SUBJECT_SECTIONS.map((section, si) => (
                      <div
                        key={section.exam}
                        className={cn(
                          si > 0 &&
                            "dark:border-border border-t border-black/[0.06] pt-3",
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

              <SimpleDropdown
                label="학습지원"
                items={studyAidItems}
                locked={lockStudyAids}
              />
              <SimpleDropdown label="학습정보" items={latestItems} />
              <SimpleDropdown
                label="모의고사"
                items={mockExamItems}
                locked={lockMockExams}
              />
              <SimpleDropdown label="커뮤니티" items={communityItems} />

              {isStaff
                ? trailingFlats.map((m) => <FlatLink key={m.to} {...m} />)
                : null}
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

        {/* Mobile 우측 — 인증 사용자는 하단 탭바가 nav 를 담당하므로 상단엔
            도구(검색·알림·테마)+계정만 노출(중복 메뉴 제거). 비인증은 하단 탭바가
            없으므로 햄버거 시트로 전체 nav 제공. */}
        {name ? (
          <div className="ml-auto flex items-center gap-0.5 md:hidden">
            <Actions inboxUnread={inboxUnread} inboxHref={inboxHref} />
            <UserMenu
              hideName
              name={name}
              email={email}
              avatarUrl={avatarUrl}
            />
          </div>
        ) : (
          <Sheet>
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
                          <SheetClose
                            key={`${section.exam}-${item.href}`}
                            asChild
                          >
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

                  <MobileGroup label="학습지원" items={studyAidItems} />
                  <MobileGroup label="학습정보" items={latestItems} />
                  <MobileGroup label="모의고사" items={mockExamItems} />
                  <MobileGroup label="커뮤니티" items={communityItems} />

                  {isStaff
                    ? trailingFlats.map((m) => (
                        <SheetClose key={m.to} asChild>
                          <Link
                            to={m.to}
                            className="hover:bg-accent mt-1 rounded-md px-3 py-2"
                          >
                            {m.label}
                          </Link>
                        </SheetClose>
                      ))
                    : null}
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
                        <Actions
                          inboxUnread={inboxUnread}
                          inboxHref={inboxHref}
                        />
                      </div>
                      <div className="flex justify-end">
                        <UserMenu
                          name={name}
                          email={email}
                          avatarUrl={avatarUrl}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-5">
                      <div className="flex justify-between">
                        <Actions
                          inboxUnread={inboxUnread}
                          inboxHref={inboxHref}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <AuthButtons />
                      </div>
                    </div>
                  )}
                </SheetFooter>
              )}
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
}
