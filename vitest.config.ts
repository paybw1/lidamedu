import { defineConfig } from "vitest/config";
import path from "node:path";

// 순수 함수 단위 테스트 — 현재 SRS scheduler (Stage 2 신규).
// 브라우저·DB 종속이 없는 src 모듈만 대상으로 한다.
export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "app"),
    },
  },
  test: {
    include: ["app/**/*.test.ts"],
    environment: "node",
  },
});
