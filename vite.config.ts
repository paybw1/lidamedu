import { reactRouter } from "@react-router/dev/vite";
import {
  type SentryReactRouterBuildOptions,
  sentryReactRouter,
} from "@sentry/react-router";
import tailwindcss from "@tailwindcss/vite";
import { type PluginOption, defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig((config) => {
  const sentryConfig: SentryReactRouterBuildOptions = {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
  };
  let plugins: PluginOption[] = [tailwindcss(), reactRouter(), tsconfigPaths()];
  if (
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT &&
    process.env.SENTRY_AUTH_TOKEN
  ) {
    plugins = [...plugins, sentryReactRouter(sentryConfig, config)];
  }
  return {
    server: {
      // 0.0.0.0 으로 IPv4 bind — 기본 'localhost' 는 Node 18+ 에서 IPv6 (::1) 만 listen 하는
      // 케이스가 있어 브라우저(IPv4 우선) 에서 ERR_CONNECTION_REFUSED 발생.
      host: true,
      allowedHosts: true,
      watch: {
        ignored: [
          "**/*.spec.ts",
          "**/*.test.ts",
          "**/tests/**",
          "**/playwright-report/**",
          "**/test-results/**",
        ],
      },
    },
    build: {
      sourcemap: Boolean(process.env.SENTRY_DSN),
    },
    plugins,
    sentryConfig,
  };
});
