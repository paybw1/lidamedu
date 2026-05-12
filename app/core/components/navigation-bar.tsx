import { CogIcon, HomeIcon, LogOutIcon, MenuIcon, SearchIcon } from "lucide-react";
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
type Section = { label: string; items: SimpleLink[] };

// 상단 네비게이션 7개 top-level (좌→우):
// 대시보드(flat) · 학습관리▾ · 최신정보▾ · 학습과목▾ · 학습보조▾ · 커뮤니티▾ · 운영자(flat)

const leadingFlats: SimpleLink[] = [
  { label: "대시보드", to: "/dashboard" },
];

const studyItems: SimpleLink[] = [
  { label: "학습목표 및 과목별 진도", to: "/goals" },
  { label: "빈칸 학습 통계", to: "/study/blanks" },
];

const latestItems: SimpleLink[] = [
  { label: "법 개정", to: "/latest/laws" },
  { label: "최근 판례", to: "/latest/cases" },
  { label: "객관식 문제", to: "/latest/mcq" },
  { label: "주관식 문제", to: "/latest/essay" },
  { label: "논문", to: "/latest/papers" },
  { label: "도서 추록·정오표", to: "/latest/book-updates" },
];

const subjectSections: Section[] = [
  {
    label: "민법",
    items: [{ label: "민법", to: "/subjects/civil" }],
  },
  {
    label: "산업재산권법",
    items: [
      { label: "특허법", to: "/subjects/patent" },
      { label: "상표법", to: "/subjects/trademark" },
      { label: "디자인보호법", to: "/subjects/design" },
    ],
  },
  {
    label: "민사소송법",
    items: [{ label: "민사소송법", to: "/subjects/civil-procedure" }],
  },
  {
    label: "자연과학",
    items: [
      { label: "물리", to: "/subjects/science/physics" },
      { label: "화학", to: "/subjects/science/chemistry" },
      { label: "생물", to: "/subjects/science/biology" },
      { label: "지구과학", to: "/subjects/science/earth-science" },
    ],
  },
];

const studyAidItems: SimpleLink[] = [
  { label: "오답노트", to: "/study/wrong-note" },
  { label: "즐겨찾기", to: "/study/bookmarks" },
  { label: "내 메모", to: "/study/notes" },
  { label: "내 하이라이트", to: "/study/highlights" },
];

const communityItems: SimpleLink[] = [
  { label: "온라인 GS", to: "/gs" },
  { label: "커뮤니티", to: "/community" },
  { label: "Q&A", to: "/qna" },
  { label: "공지사항", to: "/announcements" },
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
      <Button variant="default" asChild>
        <SheetClose asChild>
          <Link to="/join" viewTransition>
            회원가입
          </Link>
        </SheetClose>
      </Button>
    </>
  );
}

function Actions() {
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
      <NavigationMenuContent>
        <ul className="grid w-[240px] gap-1 p-2">
          {items.map((item) => (
            <li key={item.to}>
              <NavigationMenuLink asChild>
                <Link
                  to={item.to}
                  className="hover:bg-accent focus:bg-accent block rounded-md px-3 py-2 text-sm leading-none no-underline transition-colors outline-none"
                >
                  {item.label}
                </Link>
              </NavigationMenuLink>
            </li>
          ))}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}

export function NavigationBar({
  name,
  email,
  avatarUrl,
  loading,
}: {
  name?: string;
  email?: string;
  avatarUrl?: string | null;
  loading: boolean;
}) {
  return (
    <nav className="bg-background relative z-50 mx-auto flex h-16 w-full items-center justify-between border-b px-5 shadow-xs backdrop-blur-lg transition-opacity md:px-10">
      <div className="mx-auto flex h-full w-full max-w-screen-2xl items-center justify-between py-3">
        <Link to="/" aria-label="리담변리사학원 홈">
          {/* 로고 PNG 의 텍스트 부분이 검정이라 dark 모드에서 안 보임. invert + hue-rotate(180)
              조합으로 검정→흰색 변환하면서 심볼 브랜드 컬러는 그대로 보존. */}
          <img
            src="/lidam-logo.png"
            alt="리담변리사학원"
            className="h-10 w-auto shrink-0 dark:[filter:invert(1)_hue-rotate(180deg)]"
          />
        </Link>

        <div className="hidden h-full items-center gap-3 md:flex">
          <NavigationMenu>
            <NavigationMenuList>
              {leadingFlats.map((m) => (
                <FlatLink key={m.to} {...m} />
              ))}

              <SimpleDropdown label="학습관리" items={studyItems} />
              <SimpleDropdown label="최신정보" items={latestItems} />

              {/* 학습과목 dropdown (2칼럼 sections) */}
              <NavigationMenuItem>
                <NavigationMenuTrigger>학습과목</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="grid w-[520px] grid-cols-2 gap-x-4 gap-y-3 p-3">
                    {subjectSections.map((section) => (
                      <div key={section.label}>
                        <p className="text-muted-foreground px-2 pb-1 text-xs font-semibold tracking-wide uppercase">
                          {section.label}
                        </p>
                        <ul className="space-y-1">
                          {section.items.map((item) => (
                            <li key={item.to}>
                              <NavigationMenuLink asChild>
                                <Link
                                  to={item.to}
                                  className="hover:bg-accent focus:bg-accent block rounded-md px-2 py-1.5 text-sm leading-none no-underline transition-colors outline-none"
                                >
                                  {item.label}
                                </Link>
                              </NavigationMenuLink>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>

              <SimpleDropdown label="학습보조" items={studyAidItems} />
              <SimpleDropdown label="커뮤니티" items={communityItems} />

              {trailingFlats.map((m) => (
                <FlatLink key={m.to} {...m} />
              ))}
            </NavigationMenuList>
          </NavigationMenu>

          <Separator orientation="vertical" />
          <Actions />
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
        <SheetTrigger className="size-6 md:hidden">
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
              <MobileGroup label="최신정보" items={latestItems} />

              <p className="text-muted-foreground mt-3 px-3 text-xs font-semibold tracking-wide uppercase">
                학습과목
              </p>
              {subjectSections.flatMap((section) =>
                section.items.map((item) => (
                  <SheetClose key={item.to} asChild>
                    <Link
                      to={item.to}
                      className="hover:bg-accent rounded-md px-3 py-2 pl-5"
                    >
                      {section.label === item.label
                        ? item.label
                        : `${section.label} · ${item.label}`}
                    </Link>
                  </SheetClose>
                )),
              )}

              <MobileGroup label="학습보조" items={studyAidItems} />
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
                    <Actions />
                  </div>
                  <div className="flex justify-end">
                    <UserMenu name={name} email={email} avatarUrl={avatarUrl} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="flex justify-between">
                    <Actions />
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
