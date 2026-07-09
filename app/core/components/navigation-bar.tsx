import {
  BellIcon,
  LogOutIcon,
  MenuIcon,
  PanelLeftOpenIcon,
  PanelTopOpenIcon,
  UserIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { PlatformSwitch } from "./platform-switch";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "~/core/components/ui/navigation-menu";
import {
  LOCKED_DIM_CLASS,
  LOCKED_HINT,
  TOPBAR_DROPDOWNS,
  isAreaLocked,
  isSubjectLocked,
  subjectLockedHint,
  topbarDropdownItems,
} from "~/core/lib/nav-groups";
import {
  SUBJECT_NAV_ITEMS,
  subjectSlugFromHref,
} from "~/core/lib/subject-groups";
import { cn } from "~/core/lib/utils";

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

// 세로 드롭다운 항목 — 사각형 박스(테두리·배경 pill) 없이 평문 링크. hover 시에만 글자색 강조.
const DROPDOWN_ITEM_CLASS =
  "block w-full rounded-md px-3 py-2 text-[13px] font-medium text-foreground no-underline outline-none transition-colors hover:text-[#2D5BA8] focus-visible:text-[#2D5BA8]";

// 상단 네비게이션 8개 top-level (좌→우):
// 대시보드(flat) · 학습관리▾ · 학습과목▾ · 학습지원▾ · 학습정보▾ · 모의고사▾ · 커뮤니티▾ · 운영자(flat)

const leadingFlats: SimpleLink[] = [{ label: "대시보드", to: "/dashboard" }];

// 그룹 항목 정의는 SSOT(nav-groups.ts: NAV_GROUP_POOL + TOPBAR_DROPDOWNS)에서 파생 —
// 상단바·사이드바·하단탭 단일 소스. 상단바 6 드롭다운 = 풀 그룹 조합(학습관리=today+review+manage 등).
// "알림" 은 상단 우측 종모양 벨로 단일화(드롭다운에서 제거). URL slug 는 보존.

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
  showNavModeToggle = true,
}: {
  inboxUnread: number | null;
  inboxHref: string | null;
  /** sidebar 안에선 수직(아이콘 stack), topbar 에선 수평. */
  orientation?: "horizontal" | "vertical";
  /** 사이드바 전환 토글 — 사이드바는 인증 전용이라 비로그인에선 숨김. */
  showNavModeToggle?: boolean;
}) {
  const isVertical = orientation === "vertical";
  return (
    <div
      className={cn(
        "flex items-center",
        isVertical ? "flex-col gap-1" : "gap-1",
      )}
    >
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
      {showNavModeToggle ? <NavModeIconButton isVertical={isVertical} /> : null}
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
  /** feat-8-008 — true 면 트리거를 흐림(dim) 처리 (서버 게이트가 권위, 시각 힌트). */
  locked?: boolean;
}) {
  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger
        className={cn(locked && LOCKED_DIM_CLASS)}
        title={locked ? LOCKED_HINT : undefined}
      >
        {label}
      </NavigationMenuTrigger>
      <NavigationMenuContent>
        {/* 세로 목록 — 좌측 정렬, 항목 많으면 세로 스크롤. */}
        <div className="flex max-h-[calc(100vh-7rem)] w-max max-w-[calc(100vw-2rem)] flex-col items-start gap-1 overflow-y-auto p-3">
          {items.map((item) => (
            <NavigationMenuLink asChild key={item.to}>
              <Link
                to={item.to}
                className={cn(DROPDOWN_ITEM_CLASS, "whitespace-nowrap")}
              >
                {item.label}
              </Link>
            </NavigationMenuLink>
          ))}
        </div>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}

// 학습과목 드롭다운 — chip 세로 목록. 항목 = SUBJECT_NAV_ITEMS (SSOT).
// feat-8-027 — 열람 권한 없는 과목은 비활성(클릭 불가·회색) 표시.
function SubjectsDropdown({
  locked,
  isStaff = false,
  subjects,
  staffPreparing,
}: {
  locked: boolean;
  isStaff?: boolean;
  subjects?: "all" | string[];
  staffPreparing?: "all" | string[];
}) {
  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger
        className={cn(locked && LOCKED_DIM_CLASS)}
        title={locked ? LOCKED_HINT : undefined}
      >
        학습과목
      </NavigationMenuTrigger>
      <NavigationMenuContent>
        {/* 1/2차 구분 없는 평면 6과목 — 세로 목록(좌측 정렬) */}
        <div className="flex max-h-[calc(100vh-7rem)] w-max max-w-[calc(100vw-2rem)] flex-col items-start gap-1 overflow-y-auto p-3">
          {SUBJECT_NAV_ITEMS.map((item) => {
            const slug = subjectSlugFromHref(item.href);
            const subjLocked = isSubjectLocked(
              slug,
              isStaff,
              subjects,
              staffPreparing,
            );
            if (subjLocked) {
              return (
                <span
                  key={item.href}
                  className={cn(
                    DROPDOWN_ITEM_CLASS,
                    "whitespace-nowrap",
                    LOCKED_DIM_CLASS,
                  )}
                  title={subjectLockedHint(slug, isStaff)}
                  aria-disabled="true"
                >
                  {item.name}
                </span>
              );
            }
            return (
              <NavigationMenuLink asChild key={item.href}>
                <Link
                  to={item.href}
                  className={cn(DROPDOWN_ITEM_CLASS, "whitespace-nowrap")}
                >
                  {item.name}
                </Link>
              </NavigationMenuLink>
            );
          })}
        </div>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}

// 모바일 시트 — 학습과목 그룹(SUBJECT_NAV_ITEMS).
function MobileSubjects() {
  return (
    <>
      <p className="text-muted-foreground mt-3 px-3 text-xs font-semibold tracking-wide uppercase">
        학습과목
      </p>
      {SUBJECT_NAV_ITEMS.map((item) => (
        <SheetClose key={item.href} asChild>
          <Link
            to={item.href}
            className="hover:bg-accent rounded-md px-3 py-2 pl-5"
          >
            {item.name}
          </Link>
        </SheetClose>
      ))}
    </>
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
  gradeStaff,
  features,
  subjects,
  staffPreparing,
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
  // 잠금(dim) 판정용 staff 여부 — 등급 리졸버 기준(access.grade === 'staff').
  // 원장 등급 체험 중에는 false 가 되어 학생과 동일한 잠금 표시를 재현한다.
  // 미전달 시 isStaff 폴백. 메뉴 노출(운영관리 등)은 여전히 isStaff(역할) 기준.
  gradeStaff?: boolean;
  // feat-8-008 — 사용자의 구독/cohort 기반 영역 플래그. undefined = 미산정(로딩) → 잠금 미표시.
  features?: string[];
  // feat-8-027 — 학습과목 열람 가능 과목('all' | slug[]). 미허용 과목은 드롭다운서 비활성.
  subjects?: "all" | string[];
  // feat-7-041 — 준비 중 과목의 staff 접근 목록. admin/manager='all', instructor=담당 과목만.
  staffPreparing?: "all" | string[];
  // 새 nav 검증용 — 학생 사이드바 병존 시 기존 메뉴 dropdown 들 숨김. 로고·알림·유저메뉴는 유지.
  hideMenus?: boolean;
  // 사이드바 모드 — 상단 nav 전체 숨김(로고·도구·유저메뉴 포함). 사이드바가 모든 역할 흡수.
  hideAll?: boolean;
}) {
  // 사이드바 모드 — 상단 nav 전체 미렌더. 사이드바가 로고·도구·유저메뉴 흡수.
  if (hideAll) return null;
  // 잠금 판정은 등급 기준(체험 모드 반영), 미전달 시 역할 기준 폴백.
  const lockStaff = gradeStaff ?? isStaff;
  // feat-8-008 — 영역 잠금은 TOPBAR_DROPDOWNS 의 area 로 드롭다운별 판정(isAreaLocked) →
  //   흐림(dim) 처리. staff 면제·미산정 시 미표시. 서버 영역 게이트가 권위(시각 힌트만).
  return (
    <nav
      className={cn(
        "dark:bg-background/85 dark:border-border sticky top-0 z-50 mx-auto flex h-14 w-full items-center justify-between border-b border-black/[0.06] bg-white/80 px-4 backdrop-blur-lg backdrop-saturate-150 transition-opacity md:px-6 print:hidden",
        // 인증 사용자는 모바일에서 하단 탭바가 모든 nav·도구를 담당하므로 상단 바를
        // 숨겨 학습 콘텐츠 영역을 넓힌다. 비인증은 하단바가 없어 상단 햄버거 유지.
        name && "hidden md:flex",
      )}
    >
      <div className="mx-auto flex h-full w-full max-w-[1200px] items-center gap-4">
        <Link
          to="/"
          aria-label="리담변리사학원 홈 — Study Platform"
          className="flex shrink-0 items-center gap-3"
        >
          {/* 로고 PNG 의 텍스트 부분이 검정이라 dark 모드에서 안 보임. invert + hue-rotate(180)
              조합으로 검정→흰색 변환하면서 심볼 브랜드 컬러는 그대로 보존. */}
          {/* shrink-0(Link) + max-w-none(img): 네비가 좁아져도 Tailwind preflight 의
              max-width:100% 가 로고를 가로로 압축하지 못하게 막는다. */}
          <img
            src="/lidam-logo.png"
            alt="리담변리사학원"
            className="h-7 w-auto max-w-none dark:[filter:invert(1)_hue-rotate(180deg)]"
          />
          {/* 학습 플랫폼 태그라인(lidamipedu ↔ lidamedu 구분) — 메뉴가 붐비는
              md~lg 폭에서는 숨겨 로고만 유지. */}
        </Link>

        {/* 플랫폼 스위처 — 학습 ↔ 강의. 강의 플랫폼 오픈 전까지 staff 에게만 노출(IA 검증). */}
        {isStaff ? <PlatformSwitch className="shrink-0" /> : null}

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
              {/* SSOT 파생 — 현행 6 드롭다운 순서·구성 동일. 학습과목만 chip 렌더. */}
              {TOPBAR_DROPDOWNS.map((d) =>
                d.subjects ? (
                  <SubjectsDropdown
                    key={d.label}
                    locked={isAreaLocked(d.area, lockStaff, features)}
                    isStaff={lockStaff}
                    subjects={subjects}
                    staffPreparing={staffPreparing}
                  />
                ) : (
                  <SimpleDropdown
                    key={d.label}
                    label={d.label}
                    items={topbarDropdownItems(
                      d.groupIds ?? [],
                      lockStaff,
                      features,
                    )}
                    locked={isAreaLocked(d.area, lockStaff, features)}
                  />
                ),
              )}

              {isStaff
                ? trailingFlats.map((m) => <FlatLink key={m.to} {...m} />)
                : null}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* '운영자' 이후 — 오른쪽 정렬 */}
        <div className="ml-auto hidden h-full items-center gap-3 md:flex">
          <Actions
            inboxUnread={inboxUnread}
            inboxHref={inboxHref}
            showNavModeToggle={Boolean(name)}
          />
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

                  {/* SSOT 파생 — 로그아웃 햄버거(잠금 N/A: 비인증=구독 없음). */}
                  {TOPBAR_DROPDOWNS.map((d) =>
                    d.subjects ? (
                      <MobileSubjects key={d.label} />
                    ) : (
                      <MobileGroup
                        key={d.label}
                        label={d.label}
                        items={topbarDropdownItems(d.groupIds ?? [], lockStaff)}
                      />
                    ),
                  )}

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
                          showNavModeToggle={false}
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
