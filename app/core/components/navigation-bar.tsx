/**
 * Navigation Bar Component
 *
 * A responsive navigation header that adapts to different screen sizes and user authentication states.
 * This component provides the main navigation interface for the application, including:
 *
 * - Responsive design with desktop and mobile layouts
 * - User authentication state awareness (logged in vs. logged out)
 * - User profile menu with avatar and dropdown options
 * - Theme switching functionality
 * - Language switching functionality
 * - Mobile-friendly navigation drawer
 *
 * The component handles different states:
 * - Loading state with skeleton placeholders
 * - Authenticated state with user profile information
 * - Unauthenticated state with sign in/sign up buttons
 */
import { CogIcon, HomeIcon, LogOutIcon, MenuIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, Links } from "react-router";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
} from "~/core/components/ui/navigation-menu";

import LangSwitcher from "./lang-switcher";
import ThemeSwitcher from "./theme-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
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

/**
 * UserMenu Component
 *
 * Displays the authenticated user's profile menu with avatar and dropdown options.
 * This component is shown in the navigation bar when a user is logged in and provides
 * quick access to user-specific actions and information.
 *
 * Features:
 * - Avatar display with image or fallback initials
 * - User name and email display
 * - Quick navigation to dashboard
 * - Logout functionality
 *
 * @param name - The user's display name
 * @param email - The user's email address (optional)
 * @param avatarUrl - URL to the user's avatar image (optional)
 * @returns A dropdown menu component with user information and actions
 */
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
      {/* Avatar as the dropdown trigger */}
      <DropdownMenuTrigger asChild>
        <Avatar className="size-8 cursor-pointer rounded-lg">
          <AvatarImage src={avatarUrl ?? undefined} />
          <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      {/* Dropdown content with user info and actions */}
      <DropdownMenuContent className="w-56">
        {/* User information display */}
        <DropdownMenuLabel className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-semibold">{name}</span>
          <span className="truncate text-xs">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Dashboard link */}
        <DropdownMenuItem asChild>
          <SheetClose asChild>
            <Link to="/dashboard" viewTransition>
              <HomeIcon className="size-4" />
              Dashboard
            </Link>
          </SheetClose>
        </DropdownMenuItem>

        {/* Logout link */}
        <DropdownMenuItem asChild>
          <SheetClose asChild>
            <Link to="/logout" viewTransition>
              <LogOutIcon className="size-4" />
              Log out
            </Link>
          </SheetClose>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * AuthButtons Component
 *
 * Displays authentication buttons (Sign in and Sign up) for unauthenticated users.
 * This component is shown in the navigation bar when no user is logged in and provides
 * quick access to authentication screens.
 *
 * Features:
 * - Sign in button with ghost styling (less prominent)
 * - Sign up button with default styling (more prominent)
 * - View transitions for smooth navigation to auth screens
 * - Compatible with mobile navigation drawer (SheetClose integration)
 *
 * @returns Fragment containing sign in and sign up buttons
 */
function AuthButtons() {
  return (
    <>
      {/* Sign in button (less prominent) */}
      <Button variant="ghost" asChild>
        <SheetClose asChild>
          <Link to="/login" viewTransition>
            Sign in
          </Link>
        </SheetClose>
      </Button>

      {/* Sign up button (more prominent) */}
      <Button variant="default" asChild>
        <SheetClose asChild>
          <Link to="/join" viewTransition>
            Sign up
          </Link>
        </SheetClose>
      </Button>
    </>
  );
}

/**
 * Actions Component
 *
 * Displays utility actions and settings in the navigation bar, including:
 * - Debug/settings dropdown menu with links to monitoring tools
 * - Theme switcher for toggling between light and dark mode
 * - Language switcher for changing the application language
 *
 * This component is shown in the navigation bar for all users regardless of
 * authentication state and provides access to application-wide settings and tools.
 *
 * @returns Fragment containing settings dropdown, theme switcher, and language switcher
 */
function Actions() {
  return (
    <>
      {/* Settings/debug dropdown menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild className="cursor-pointer">
          <Button variant="ghost" size="icon">
            <CogIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Sentry monitoring link */}
          <DropdownMenuItem asChild>
            <SheetClose asChild>
              <Link to="/debug/sentry" viewTransition>
                Sentry
              </Link>
            </SheetClose>
          </DropdownMenuItem>
          {/* Google Analytics link */}
          <DropdownMenuItem asChild>
            <SheetClose asChild>
              <Link to="/debug/analytics" viewTransition>
                Google Tag
              </Link>
            </SheetClose>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Theme switcher component (light/dark mode) */}
      <ThemeSwitcher />

      {/* Language switcher component */}
      <LangSwitcher />
    </>
  );
}

/**
 * NavigationBar Component
 *
 * The main navigation header for the application that adapts to different screen sizes
 * and user authentication states. This component serves as the primary navigation
 * interface and combines several sub-components to create a complete navigation experience.
 *
 * Features:
 * - Responsive design with desktop navigation and mobile drawer
 * - Application branding with localized title
 * - Main navigation links (Blog, Contact, Payments)
 * - User authentication state handling (loading, authenticated, unauthenticated)
 * - User profile menu with avatar for authenticated users
 * - Sign in/sign up buttons for unauthenticated users
 * - Theme and language switching options
 *
 * @param name - The authenticated user's name (if available)
 * @param email - The authenticated user's email (if available)
 * @param avatarUrl - The authenticated user's avatar URL (if available)
 * @param loading - Boolean indicating if the auth state is still loading
 * @returns The complete navigation bar component
 */

const menus = [
  // {
  //   name: "applications",
  //   to: "/applications",
  //   items: [
  //     {
  //       name: "Patent application",
  //       description: "File a patent application in Korea",
  //       to: "/applications/patent-application",
  //     },
  //     {
  //       name: "Trademark application",
  //       description: "File a trademark application in Korea",
  //       to: "/applications/trademark-application",
  //     },
  //     {
  //       name: "Design application",
  //       description: "File a design application in Korea",
  //       to: "/applications/design-application",
  //     },
  //   ],
  // },
  {
    name: "Pricing",
    to: "/pricing",
  },
  {
    name: "Consulting",
    to: "/consulting",
  },
  {
    name: "Maintenance",
    to: "/maintenance",
    items: [
      {
        name: "Annuity management",
        description:
          "Keep your patents and designs in force. We handle all annuity payments and deadline tracking for you.",
        to: "/maintenance/annuity-management",
      },
      {
        name: "Trademark renewal",
        description:
          "Never miss a renewal again. Our smart system tracks your trademark deadlines and handles the paperwork for you.",
        to: "/maintenance/trademark-renewal",
      },
      {
        name: "Transfer In",
        description:
          "Already using another agent? Move your cases to our platform for unified management and clear visibility.",
        to: "/maintenance/transfer-in",
      },
    ],
  },
  {
    name: "Blog",
    to: "/blog",
  },
];

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
  // Get translation function for internationalization
  const { t } = useTranslation();

  return (
    <nav
      className={
        "bg-background mx-auto flex h-16 w-full items-center justify-between border-b px-5 shadow-xs backdrop-blur-lg transition-opacity md:px-10"
      }
    >
      <div className="mx-auto flex h-full w-full max-w-screen-2xl items-center justify-between py-3">
        {/* Application logo/title with link to home */}
        <Link to="/">
          <h1 className="text-primary text-lg font-extrabold">
            {t("home.title")}
          </h1>
        </Link>

        {/* Desktop navigation menu (hidden on mobile) */}
        <div className="hidden h-full items-center gap-5 md:flex">
          {/* Main navigation links */}
          {/* <Link
            to="/blog"
            viewTransition
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            Blog
          </Link>
          <Link
            to="/contact"
            viewTransition
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            Contact
          </Link>
          <Link
            to="/payments/checkout"
            viewTransition
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            Payments
          </Link> */}
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <Link to="/applications" viewTransition>
                  <NavigationMenuTrigger>Applications</NavigationMenuTrigger>
                </Link>
                <NavigationMenuContent className="p-3">
                  <ul className="grid gap-x-2 gap-y-2 md:w-[400px] lg:w-[600px] lg:grid-cols-[.65fr_1fr]">
                    <li className="row-span-3">
                      <NavigationMenuLink asChild>
                        <Link
                          to="/applications/provisional-application"
                          className="from-muted/50 to-muted flex h-full w-full flex-col justify-center rounded-md bg-linear-to-b p-6 no-underline outline-hidden select-none focus:shadow-md"
                        >
                          <Badge
                            variant="outline"
                            className="bg-background text-primary border-primary dark:bg-blue-600"
                          >
                            Provisional Application
                          </Badge>
                          <div className="mt-4 mb-2 text-lg font-medium">
                            <span>
                              Same effect as a U.S. provisional — for a fraction
                              of the price
                            </span>
                          </div>
                          <p className="text-muted-foreground text-sm leading-tight">
                            File a Korean provisional application to secure your
                            priority date under the Paris Convention, without
                            the high cost of a U.S. patent attorney.
                          </p>
                        </Link>
                      </NavigationMenuLink>
                    </li>
                    <ListItem
                      href="/applications/national-phase"
                      title="PCT National Phase in Korea"
                      className="py-1"
                    >
                      Enter the Korean national phase for your PCT application
                      with ease. We handle all required translations, filings,
                      and official communication with KIPO — fast, affordable,
                      and compliant.
                    </ListItem>
                    <ListItem
                      href="/applications/trademark-application"
                      title="Trademark application"
                      className="py-1"
                    >
                      Start your Korean trademark application with ease. Our
                      AI-powered process guides you every step of the way — no
                      legal jargon needed.
                    </ListItem>
                    <ListItem
                      href="/applications/design-application"
                      title="Design application"
                      className="py-1"
                    >
                      Simple and structured — we make your Korean design
                      application effortless.
                    </ListItem>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
              {menus.map((menu) => (
                <NavigationMenuItem key={menu.name}>
                  {menu.items ? (
                    <>
                      <Link to={menu.to} viewTransition>
                        <NavigationMenuTrigger>
                          {menu.name}
                        </NavigationMenuTrigger>
                      </Link>
                      <NavigationMenuContent>
                        <ul className="grid w-[600px] grid-cols-2 gap-3 p-4 font-light">
                          {menu.items?.map((item) => (
                            <NavigationMenuItem
                              key={item.name}
                              className="rounded-md transition-colors select-none"
                            >
                              <NavigationMenuLink asChild>
                                <Link
                                  className="hover:bg-accent/50 focus:bg-accent/50 block space-y-1 p-3 leading-none no-underline outline-none"
                                  to={item.to}
                                >
                                  <span className="text-sm leading-none font-medium">
                                    {item.name}
                                  </span>
                                  <p className="text-muted-foreground text-sm">
                                    {item.description}
                                  </p>
                                </Link>
                              </NavigationMenuLink>
                            </NavigationMenuItem>
                          ))}
                        </ul>
                      </NavigationMenuContent>
                    </>
                  ) : (
                    <Link
                      className={navigationMenuTriggerStyle()}
                      to={menu.to}
                      viewTransition
                    >
                      {menu.name}
                    </Link>
                  )}
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
          <Separator orientation="vertical" />

          {/* Settings, theme switcher, and language switcher */}
          <Actions />

          <Separator orientation="vertical" />

          {/* Conditional rendering based on authentication state */}
          {loading ? (
            // Loading state with skeleton placeholder
            <div className="flex items-center">
              <div className="bg-muted-foreground/20 size-8 animate-pulse rounded-lg" />
            </div>
          ) : (
            <>
              {name ? (
                // Authenticated state with user menu
                <UserMenu name={name} email={email} avatarUrl={avatarUrl} />
              ) : (
                // Unauthenticated state with auth buttons
                <AuthButtons />
              )}
            </>
          )}
        </div>

        {/* Mobile menu trigger (hidden on desktop) */}
        <SheetTrigger className="size-6 md:hidden">
          <MenuIcon />
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetClose asChild>
              <Link to="/blog">Blog</Link>
            </SheetClose>
            <SheetClose asChild>
              <Link to="/contact">Contact</Link>
            </SheetClose>
            <SheetClose asChild>
              <Link to="/payments/checkout">Payments</Link>
            </SheetClose>
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

function ListItem({
  title,
  children,
  href,
  ...props
}: React.ComponentPropsWithoutRef<"li"> & { href: string }) {
  return (
    <li {...props}>
      <NavigationMenuLink asChild>
        <Link to={href}>
          <div className="text-sm leading-none font-medium">{title}</div>
          <p className="text-muted-foreground text-sm leading-snug">
            {children}
          </p>
        </Link>
      </NavigationMenuLink>
    </li>
  );
}
