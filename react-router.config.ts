import type { Config } from "@react-router/dev/config";

import { sentryOnBuildEnd } from "@sentry/react-router";
import { vercelPreset } from "@vercel/react-router/vite";

declare module "react-router" {
  interface Future {
    unstable_middleware: true;
  }
}

export default {
  ssr: true,
  async prerender() {
    return [
      "/legal/terms-of-service",
      "/legal/privacy-policy",
      // ★/sitemap.xml 은 프리렌더하지 않는다 — DB(강의·도서·소식)에서 만들기 때문에
      //   빌드 시점에 고정되면 새 강의·소식이 다음 배포 전까지 색인되지 않는다.
      //   대신 화면 쪽에서 CDN 캐시(s-maxage)를 붙여 매 요청 DB 왕복을 막는다.
      //   robots.txt 는 상수만 쓰므로 프리렌더 유지.
      "/robots.txt",
    ];
  },
  presets: [
    ...(process.env.VERCEL_ENV === "production" ? [vercelPreset()] : []),
  ],
  buildEnd: async ({ viteConfig, reactRouterConfig, buildManifest }) => {
    if (
      process.env.SENTRY_ORG &&
      process.env.SENTRY_PROJECT &&
      process.env.SENTRY_AUTH_TOKEN
    ) {
      await sentryOnBuildEnd({
        viteConfig,
        reactRouterConfig,
        buildManifest,
      });
    }
  },
} satisfies Config;
