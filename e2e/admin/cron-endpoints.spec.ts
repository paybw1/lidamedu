// cron 엔드포인트 인증·정상 흐름 스모크 (feat-7-021/022/023).
// CRON_SECRET 환경변수 필요. 외부 시드 없이 endpoint 보호 + JSON shape 만 검증.

import { expect, test } from "@playwright/test";

const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  throw new Error("CRON_SECRET env required for cron e2e");
}

const PATHS = [
  "/api/cron/curriculum-weekly",
  "/api/cron/weekly-reports",
  "/api/cron/inactive-alert",
] as const;

test.describe("cron 엔드포인트 인증", () => {
  for (const path of PATHS) {
    test(`${path} — secret 없으면 403`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/forbidden/i);
    });

    test(`${path} — 잘못된 secret 도 403`, async ({ request }) => {
      const res = await request.get(`${path}?secret=invalid-${Date.now()}`);
      expect(res.status()).toBe(403);
    });
  }
});

test.describe("cron 정상 흐름 (secret 인증)", () => {
  test("/api/cron/curriculum-weekly — 정상 응답 shape", async ({ request }) => {
    const res = await request.get(
      `/api/cron/curriculum-weekly?secret=${CRON_SECRET}`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.summary).toMatchObject({
      activeCohortCurricula: expect.any(Number),
      created: expect.any(Number),
      skipped: expect.any(Number),
      errors: expect.any(Number),
    });
    expect(Array.isArray(body.processed)).toBe(true);
  });

  test("/api/cron/inactive-alert — 정상 응답 shape", async ({ request }) => {
    const res = await request.get(
      `/api/cron/inactive-alert?secret=${CRON_SECRET}&inactiveDays=999`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.summary).toMatchObject({
      activeCohorts: expect.any(Number),
      cohortsWithInactive: expect.any(Number),
      totalInactiveStudents: expect.any(Number),
    });
    // inactiveDays=999 면 모두 활성 — 알림 fanout 0
    expect(body.summary.cohortsWithInactive).toBe(0);
  });

  // weekly-reports 는 실제 이메일 발송이라 prod 에서만. 여기는 인증만 검증.
  test("/api/cron/weekly-reports — 정상 응답 shape (실제 이메일 발송 가능)", async ({
    request,
  }) => {
    test.skip(
      !process.env.RUN_WEEKLY_REPORT_E2E,
      "RUN_WEEKLY_REPORT_E2E=1 을 명시적으로 설정한 경우만 실행 (실제 이메일 발송).",
    );
    const res = await request.get(
      `/api/cron/weekly-reports?secret=${CRON_SECRET}`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.student).toMatchObject({
      ok: expect.any(Number),
      failed: expect.any(Number),
      skipped: expect.any(Number),
    });
    expect(body.staff).toMatchObject({
      ok: expect.any(Number),
      failed: expect.any(Number),
      skipped: expect.any(Number),
    });
  });
});
