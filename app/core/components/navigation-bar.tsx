import { CogIcon, HomeIcon, LogOutIcon, MenuIcon } from "lucide-react";
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

const latestItems: SimpleLink[] = [
  { label: "법 개정", to: "/latest/laws" },
  { label: "최근 판례", to: "/latest/cases" },
  { label: "객관식 문제", to: "/latest/mcq" },
  { label: "주관식 문제", to: "/latest/essay" },
  { label: "논문", to: "/latest/papers" },
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

const flatMenus: SimpleLink[] = [
  { label: "대시보드", to: "/dashboard" },
  { label: "학습목표 및 과목별 진도", to: "/goals" },
];

const trailingMenus: SimpleLink[] = [
  { label: "온라인 GS", to: "/gs" },
  { label: "커뮤니티", to: "/community" },
  { label: "Q&A", to: "/qna" },
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

function FlatLink({ to, label }: SimpleLink) {
  return (
    <NavigationMenuItem>
      <Link className={navigationMenuTriggerStyle()} to={to} viewTransition>
        {label}
      </Link>
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
            className="h-7 w-auto dark:[filter:invert(1)_hue-rotate(180deg)]"
          />
        </Link>

        <div className="hidden h-full items-center gap-3 md:flex">
          <NavigationMenu>
            <NavigationMenuList>
              {flatMenus.map((m) => (
                <FlatLink key={m.to} {...m} />
              ))}

              {/* 최신 정보 dropdown */}
              <NavigationMenuItem>
                <NavigationMenuTrigger>최신 정보</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[260px] gap-1 p-2">
                    {latestItems.map((item) => (
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

              {/* 과목별 학습 dropdown */}
              <NavigationMenuItem>
                <NavigationMenuTrigger>과목별 학습</NavigationMenuTrigger>
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

              {trailingMenus.map((m) => (
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
              {flatMenus.map((m) => (
                <SheetClose key={m.to} asChild>
                  <Link
                    to={m.to}
                    className="hover:bg-accent rounded-md px-3 py-2"
                  >
                    {m.label}
                  </Link>
                </SheetClose>
              ))}

              <p className="text-muted-foreground mt-3 px-3 text-xs font-semibold tracking-wide uppercase">
                최신 정보
              </p>
              {latestItems.map((m) => (
                <SheetClose key={m.to} asChild>
                  <Link
                    to={m.to}
                    className="hover:bg-accent rounded-md px-3 py-2 pl-5"
                  >
                    {m.label}
                  </Link>
                </SheetClose>
              ))}

              <p className="text-muted-foreground mt-3 px-3 text-xs font-semibold tracking-wide uppercase">
                과목별 학습
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

              {trailingMenus.map((m) => (
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
