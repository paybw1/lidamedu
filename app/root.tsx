/**
 * Root Application Component
 *
 * This is the top-level component of the application that sets up:
 * - Theme management with dark/light mode support
 * - Internationalization (i18n) configuration
 * - Global UI components like dialogs and sheets
 * - Error boundaries and 404 handling
 * - Analytics integrations (Google Tag Manager)
 * - Customer support integration (Channel.io)
 * - Progress indicators for navigation
 */
import "./app.css";

import type { Route } from "./+types/root";

import * as Sentry from "@sentry/react-router";
import NProgress from "nprogress";
import nProgressStyles from "nprogress/nprogress.css?url";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLocation,
  useNavigate,
  useNavigation,
  useRouteLoaderData,
  useSearchParams,
} from "react-router";
import { useChangeLanguage } from "remix-i18next/react";
import {
  PreventFlashOnWrongTheme,
  ThemeProvider,
  useTheme,
} from "remix-themes";
import { Toaster } from "sonner";

import { Dialog } from "./core/components/ui/dialog";
import { Sheet } from "./core/components/ui/sheet";
import { GEO_BLOCKED_CODE } from "./core/lib/geo-gate";
import { requireAllowedCountry } from "./core/lib/geo-gate.server";
import { isLightOnlySurface } from "./core/lib/platforms";
import i18next from "./core/lib/i18next.server";
import { themeSessionResolver } from "./core/lib/theme-session.server";
import { cn } from "./core/lib/utils";
import NotFound from "./core/screens/404";

export const links: Route.LinksFunction = () => [
  { rel: "icon", type: "image/png", href: "/favicon.png" },
  { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
  { rel: "apple-touch-icon", href: "/favicon.png" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Caveat:wght@400;600&display=swap",
  },
  {
    rel: "stylesheet",
    href: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css",
  },
  { rel: "stylesheet", href: nProgressStyles },
];

/**
 * Root loader function
 *
 * This server-side function runs on every request and is responsible for:
 * 1. Validating that all required environment variables are present
 * 2. Loading the user's theme preference from the session
 * 3. Detecting the user's preferred locale
 *
 * The data returned from this loader is available throughout the application
 * via the useRouteLoaderData hook with the 'root' ID.
 *
 * @param request - The incoming HTTP request
 * @returns Object containing theme and locale preferences
 */
export async function loader({ request }: Route.LoaderArgs) {
  // 한국 외 IP 문서 요청 차단 (Vercel 헤더 기반, 로컬은 통과).
  requireAllowedCountry(request);

  // Validate that all required Supabase environment variables are present
  // This prevents the application from starting with incomplete configuration
  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_URL === "" ||
    process.env.SUPABASE_ANON_KEY === "" ||
    process.env.SUPABASE_SERVICE_ROLE_KEY === ""
  ) {
    throw new Error("Missing Supabase environment variables");
  }

  // Concurrently load theme and locale preferences for better performance
  const [{ getTheme }, locale] = await Promise.all([
    themeSessionResolver(request),
    i18next.getLocale(request),
  ]);

  return {
    theme: getTheme(),
    locale,
  };
}

/**
 * i18n handle for the root route
 * Specifies that this route uses the 'common' translation namespace
 */
export const handle = {
  i18n: "common",
};

/**
 * Primary Layout Component
 *
 * This component wraps the entire application with the ThemeProvider
 * to enable dark/light mode functionality. It retrieves theme preferences
 * from the root loader data and provides a theme switching API endpoint.
 *
 * @param children - Child components to render within the layout
 */
export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData("root");
  return (
    <ThemeProvider
      specifiedTheme={data?.theme ?? "dark"} // Default to dark theme if none is specified
      themeAction="/api/settings/theme" // API endpoint for changing theme
    >
      <InnerLayout>{children}</InnerLayout>
    </ThemeProvider>
  );
}

/**
 * Inner Layout Component
 *
 * This component handles the HTML structure of the application and applies:
 * - Language direction (RTL/LTR) based on the current locale
 * - Theme class to the HTML element
 * - Special handling for pre-rendered routes (blog, legal pages)
 * - Loading of analytics and customer support scripts
 *
 * @param children - Child components to render within the layout
 */
function InnerLayout({ children }: { children: React.ReactNode }) {
  const [theme] = useTheme();
  const data = useRouteLoaderData<typeof loader>("root");
  const { i18n } = useTranslation();
  const { pathname } = useLocation();

  // Set the i18next language based on the locale from the loader
  useChangeLanguage(data?.locale ?? "en");

  // Detect if the current route is a pre-rendered page (blog or legal)
  // These pages require special theme handling
  const isPreRendered =
    pathname.includes("/legal") || pathname.includes("/blog");

  // 강의 플랫폼은 라이트 단일 테마(원장 2026-08-19) — 커머스 화면이라 상품 이미지·가격표가
  // 어두운 배경에서 깨진다. 학습 플랫폼의 테마 설정과 무관하게 고정하며, 다크로 되돌리는
  // 스크립트(PreventFlashOnWrongTheme)도 이 경로에서는 싣지 않는다.
  // ★판별은 platforms.ts 단일 소스 — lecture.layout 아래에는 /lecture 말고도 /about·/location
  //   이 있어 경로 접두사로는 새고, 반대로 커뮤니티·공지·이용가이드는 강의 레이아웃이지만
  //   다크를 유지한다(원장 지시).
  const isLecture = isLightOnlySurface(pathname);

  return (
    <html
      lang={data?.locale ?? "en"}
      className={cn(isLecture ? "light" : (theme ?? ""), "h-full")}
      dir={i18n.dir()}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        {isLecture ? null : isPreRendered ? (
          <script src="/scripts/prerendered-theme.js" />
        ) : (
          <PreventFlashOnWrongTheme ssrTheme={Boolean(data?.theme)} />
        )}
      </head>
      <body className="h-full">
        {children}
        <Toaster richColors position="top-center" />
        <ScrollRestoration />
        <Scripts />
        {import.meta.env.VITE_GOOGLE_TAG_ID &&
          import.meta.env.VITE_GOOGLE_TAG_ID !== "" && (
            <>
              <script
                async
                src={`https://www.googletagmanager.com/gtag/js?id=${import.meta.env.VITE_GOOGLE_TAG_ID}`}
              ></script>
              <script
                dangerouslySetInnerHTML={{
                  __html: `window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${import.meta.env.VITE_GOOGLE_TAG_ID}');`,
                }}
              />
            </>
          )}
        {import.meta.env.VITE_CHANNEL_PLUGIN_KEY &&
          import.meta.env.VITE_CHANNEL_PLUGIN_KEY !== "" && (
            <script
              dangerouslySetInnerHTML={{
                __html: `(function(){var w=window;if(w.ChannelIO){return w.console.error("ChannelIO script included twice.");}var ch=function(){ch.c(arguments);};ch.q=[];ch.c=function(args){ch.q.push(args);};w.ChannelIO=ch;function l(){if(w.ChannelIOInitialized){return;}w.ChannelIOInitialized=true;var s=document.createElement("script");s.type="text/javascript";s.async=true;s.src="https://cdn.channel.io/plugin/ch-plugin-web.js";var x=document.getElementsByTagName("script")[0];if(x.parentNode){x.parentNode.insertBefore(s,x);}}if(document.readyState==="complete"){l();}else{w.addEventListener("DOMContentLoaded",l);w.addEventListener("load",l);}})();
            ChannelIO('boot', {
              "pluginKey": "${import.meta.env.VITE_CHANNEL_PLUGIN_KEY}"
            });
`,
              }}
            ></script>
          )}
      </body>
    </html>
  );
}

/**
 * Main Application Component
 *
 * This is the primary component rendered by React Router.
 * It handles global UI elements, progress indicators, and navigation.
 *
 * Key responsibilities:
 * 1. Setting up progress indicators for navigation (NProgress)
 * 2. Handling Supabase authentication redirects
 * 3. Providing global UI context (Sheet and Dialog components)
 */
export default function App() {
  const navigation = useNavigation();

  // NProgress — 상단 진행 바만 사용. 우상단 스피너는 끔(로딩 표시는 커서 progress 로,
  // 사용자 지시 2026-07-19).
  useEffect(() => {
    NProgress.configure({ showSpinner: false });
  }, []);

  // Show/hide progress bar based on navigation state
  useEffect(() => {
    if (navigation.state === "loading") {
      NProgress.start();
    } else if (navigation.state === "idle") {
      NProgress.done();
    }
  }, [navigation.state]);

  // 내비게이션/제출 중 전역 로딩 커서 — 클릭이 접수됐음을 즉시 보여줘
  // "눌린 건가?" 하고 다시 클릭하는 문제를 줄인다(서버 loader 가 DB 를 읽는 동안).
  useEffect(() => {
    const busy = navigation.state !== "idle";
    document.documentElement.classList.toggle("nav-busy", busy);
    return () => document.documentElement.classList.remove("nav-busy");
  }, [navigation.state]);

  // Handle Supabase authentication redirects
  // This is a workaround for a Supabase auth issue: https://github.com/supabase/auth/issues/1927
  // TODO: Remove this once the issue is fixed
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (location.pathname === "/") {
      const error = searchParams.get("error");
      const code = searchParams.get("code");
      if (error) {
        // Redirect to error page if authentication failed
        navigate(`/error?${searchParams.toString()}`);
      } else if (code) {
        // Redirect to dashboard if authentication succeeded
        navigate(`/dashboard/account`);
      }
    }
  }, [searchParams]);

  return (
    <Sheet>
      <Dialog>
        <Outlet />
      </Dialog>
    </Sheet>
  );
}

/**
 * 404 화면 — stale 번들(배포 직후 열려 있던 탭) 자가복구 가드 포함.
 *
 * 배포로 클라이언트 청크 해시가 바뀌면, 그 전에 로드된 탭의 라우트 매니페스트는
 * 새 라우트(특히 신규 action route)를 모르거나 옛 청크 URL 을 가리킨다 → 서버엔
 * 존재하는 경로를 클라이언트 네비게이션이 404 처리할 수 있다(서버는 정상 매칭).
 * 경로별 1회에 한해 하드 리로드 → 최신 HTML/번들을 받아 서버 라우팅으로 해결한다.
 * 진짜 없는 페이지는 1회 리로드 후 그대로 404 (sessionStorage 가드로 루프 방지).
 */
function NotFoundWithReloadGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `lidam-404-reload:${window.location.pathname}${window.location.search}`;
    try {
      if (sessionStorage.getItem(key)) return; // 이미 1회 시도 — 실제 404 로 확정.
      sessionStorage.setItem(key, "1");
      window.location.reload();
    } catch {
      // sessionStorage 불가(프라이빗 모드 등) — 리로드 생략, 404 그대로 표시.
    }
  }, []);
  return <NotFound />;
}

/**
 * Global Error Boundary Component
 *
 * This component catches and displays errors that occur during rendering
 * anywhere in the application. It provides different behavior based on:
 * - Error type (route error vs. JavaScript error)
 * - Environment (development vs. production)
 *
 * Key features:
 * - Special handling for 404 errors with a custom NotFound component
 * - Error reporting to Sentry in production
 * - Detailed stack traces in development mode
 * - User-friendly error messages in production
 *
 * @param error - The error that was caught by React Router
 */
// feat-11-011 P0 — 권한 부족 전용 화면. 무엇이 막았는지·무엇을 하면 되는지를 말한다.
// throw data("…", { status: 403 }) 의 본문이 문자열이면 그대로 안내로 쓴다.
function AccessDeniedScreen({
  status,
  detail,
}: {
  status: number;
  detail: unknown;
}) {
  const hint = typeof detail === "string" && detail.trim() ? detail.trim() : null;
  const signIn = status === 401;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-bold">
        {signIn ? "로그인이 필요합니다" : "접근 권한이 없습니다"}
      </h1>
      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        {signIn
          ? "이 화면은 로그인 후에 이용할 수 있습니다."
          : "계정에 이 화면을 열 권한이 없습니다. 오류가 아니라 권한 설정 때문입니다."}
      </p>
      {!signIn ? (
        <p className="text-muted-foreground max-w-md text-xs leading-relaxed">
          {hint && !/^forbidden$/i.test(hint)
            ? hint
            : "원장에게 「관리자 관리」 화면에서 담당 업무를 배정해 달라고 요청하세요."}
        </p>
      ) : null}
      <a
        href={signIn ? "/login" : "/"}
        className="bg-primary text-primary-foreground mt-2 flex h-10 items-center rounded-lg px-5 text-sm font-bold"
      >
        {signIn ? "로그인" : "홈으로"}
      </a>
    </main>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "문제가 발생했습니다";
  let details =
    "일시적인 오류일 수 있습니다. 잠시 후 새로고침하거나 다시 시도해 주세요.";
  let stack: string | undefined;
  let traceId: string | undefined;

  // DEV: 진단 가능하게 message + stack 명시적으로 분리해 출력.
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] raw:", error);
    if (error instanceof Error) {
      // eslint-disable-next-line no-console
      console.error("[ErrorBoundary] message:", error.message);
      // eslint-disable-next-line no-console
      console.error("[ErrorBoundary] stack:", error.stack);
    } else if (isRouteErrorResponse(error)) {
      // eslint-disable-next-line no-console
      console.error(
        "[ErrorBoundary] route error:",
        error.status,
        error.statusText,
        error.data,
      );
    }
  }

  if (isRouteErrorResponse(error)) {
    // Handle route errors (404, 500, etc.)
    if (error.status === 404) {
      // Show custom 404 page for "not found" errors (stale-bundle 자가복구 가드 포함).
      return <NotFoundWithReloadGuard />;
    }
    // 국가 게이트 차단 (root loader 의 requireAllowedCountry) — 전용 안내 화면.
    if (
      error.status === 403 &&
      (error.data as { code?: string } | null)?.code === GEO_BLOCKED_CODE
    ) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-2xl font-bold">해외에서는 접속할 수 없습니다</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            리담변리사학원 학습 플랫폼은 대한민국 내에서만 이용하실 수 있습니다.
            <br />
            국내에서 접속 중인데 이 화면이 보인다면 VPN·프록시를 끄고 다시 시도해
            주세요.
          </p>
        </main>
      );
    }
    // feat-11-011 P0 — 권한 차단(401·403)은 장애가 아니다. 같은 "문제가 발생했습니다"
    // 화면으로 보내면 운영자가 오류로 신고하게 된다(접근불가 6화면 신고의 실제 원인).
    if (error.status === 401 || error.status === 403) {
      return <AccessDeniedScreen status={error.status} detail={error.data} />;
    }
    message = "오류가 발생했습니다";
    details = error.statusText || details;
    if (import.meta.env.DEV) {
      stack = JSON.stringify(
        {
          status: error.status,
          data: error.data,
          statusText: error.statusText,
        },
        null,
        2,
      );
    }
  } else if (error && error instanceof Error) {
    // Handle JavaScript errors
    if (
      import.meta.env.VITE_SENTRY_DSN &&
      import.meta.env.MODE === "production"
    ) {
      // Report error to Sentry in production
      // feat-11-011 P0 — 요청서 §1.4: 빈 화면 대신 추적번호를 보여 준다.
      // 이 번호로 Sentry 에서 같은 사건을 바로 찾는다("그때 그 오류" 대조가 끝난다).
      traceId = Sentry.captureException(error);
    }
    if (import.meta.env.DEV) {
      // Show detailed error information in development
      details = error.message;
      stack = error.stack;
    }
  }

  // Render a simple error page with available information
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-bold">{message}</h1>
      <p className="text-muted-foreground text-sm leading-relaxed">{details}</p>
      {traceId ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          문의하실 때 이 번호를 알려 주세요 —{" "}
          <code className="bg-muted rounded px-1.5 py-0.5 font-mono">{traceId}</code>
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="bg-primary text-primary-foreground mt-2 h-10 rounded-lg px-5 text-sm font-bold"
      >
        새로고침
      </button>
      {stack && (
        <pre className="w-full max-w-3xl overflow-x-auto p-4 text-left">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
