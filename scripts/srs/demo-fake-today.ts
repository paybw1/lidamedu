/**
 * SRS v2 E2E 시연 — SRS_FAKE_TODAY 시간 시뮬레이션 + 실제 RPC 호출.
 *
 * 시나리오:
 *   Day 1 (2026-06-01): 신규 카드 3개 노출 → grade [Good=4, Easy=5, Again=0] 채점
 *     - 모두 interval=1 → 다음 due = Day 2
 *   Day 2 (2026-06-02): 위 3개 모두 due 상태로 다시 노출 → grade [Good=4, Good=4, Good=4]
 *     - 첫 카드 (rep=1) → interval=6 → due Day 8
 *     - 두 번째 (rep=1) → interval=6 → due Day 8
 *     - 세 번째 (rep=0 직전 lapse) → interval=1 → due Day 3
 *   Day 8 (2026-06-08): 1·2 due → grade [Good=4, Good=4]
 *     - 둘 다 rep=2 → interval=round(6 * 2.5) = 15 → due Day 23
 *   Day 23: 1·2 모두 다시 due
 *
 * 사용:
 *   npx dotenv -e .env -- npx tsx scripts/srs/demo-fake-today.ts
 *
 * 학생용 테스트 계정은 @test.local 도메인으로 생성 — 끝에서 delete_test_user 로 정리.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../database.types";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
  throw new Error(
    "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY 필요",
  );
}

const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_EMAIL = `srs-demo-${Date.now()}@test.local`;
const TEST_PASSWORD = "Demo1234!";

// ── 헬퍼 ──────────────────────────────────────────────────────────

function setFakeToday(yyyymmdd: string) {
  process.env.SRS_FAKE_TODAY = yyyymmdd;
}

async function loadServerHelpers() {
  // 동적 import — 매 호출마다 srsNow() 가 최신 process.env 를 읽음 (모듈은 한 번만 로드).
  return await import("../../app/features/srs/srs.server");
}

async function userClient(): Promise<SupabaseClient<Database>> {
  const c = createClient<Database>(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error) throw new Error(`로그인 실패: ${error.message}`);
  return c;
}

function header(s: string) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ${s}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

function row(label: string, value: unknown) {
  console.log(`  ${label.padEnd(28)} ${String(value)}`);
}

// ── 1) 사전 준비 ──────────────────────────────────────────────────

async function setupUser(): Promise<string> {
  header(`테스트 사용자 생성: ${TEST_EMAIL}`);
  const { data, error } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { name: "SRS Demo User" },
  });
  if (error || !data.user) throw new Error(error?.message ?? "createUser fail");
  row("user_id", data.user.id);
  return data.user.id;
}

async function ensureSeed() {
  header("srs_items 시드 확인");
  const { count } = await admin
    .from("srs_items")
    .select("item_id", { head: true, count: "exact" })
    .is("deleted_at", null);
  if ((count ?? 0) < 10) {
    console.log("  시드 부족 — seed-items.ts 를 먼저 실행하세요.");
    throw new Error("srs_items 시드 부족");
  }
  row("총 srs_items", count);
}

async function cleanup(userId: string) {
  header("정리");
  // delete_test_user RPC (e2e/test-helpers 와 동일 경로) 로 cascade.
  const { error } = await admin.rpc("delete_test_user", {
    p_email: TEST_EMAIL,
  });
  if (error) {
    console.warn("  cleanup 실패:", error.message);
  } else {
    row("delete_test_user", `${TEST_EMAIL} OK`);
  }
  void userId;
}

// ── 2) 시뮬레이션 ─────────────────────────────────────────────────

interface DayPlan {
  date: string;
  grades: Array<0 | 3 | 4 | 5>; // 큐 순서대로 N개 grade
  label: string;
}

const PLAN: DayPlan[] = [
  {
    date: "2026-06-01",
    grades: [4, 5, 0],
    label: "Day 1 — 신규 3개 [Good, Easy, Again]",
  },
  {
    date: "2026-06-02",
    grades: [4, 4, 4],
    label: "Day 2 — 어제 3개 다시 due [Good, Good, Good]",
  },
  {
    date: "2026-06-08",
    grades: [4, 4],
    label: "Day 8 — 첫·둘째 rep=1+6일 interval 도래",
  },
];

async function submitGrades(
  day: DayPlan,
  client: SupabaseClient<Database>,
  userId: string,
) {
  setFakeToday(day.date);
  const helpers = await loadServerHelpers();

  const queue = await helpers.getReviewQueue(client, userId);
  for (let i = 0; i < day.grades.length && i < queue.items.length; i++) {
    const it = queue.items[i];
    const g = day.grades[i];
    const r = await helpers.submitReview(client, userId, {
      itemId: it.itemId,
      grade: g,
      elapsedMs: 2500 + Math.floor(Math.random() * 2000),
    });
    console.log(
      `    grade ${g} → state=${r.newState} interval=${r.newInterval}d due=${r.newDueDate}`,
    );
  }
}

// ── 3) 통계 + CSV ─────────────────────────────────────────────────

async function showStats(client: SupabaseClient<Database>, userId: string) {
  setFakeToday("2026-06-23"); // forecast 가 보이도록 약간 지난 시점
  const helpers = await loadServerHelpers();

  header("최종 통계 (SRS_FAKE_TODAY=2026-06-23)");
  const stats = await helpers.getStats(client, userId);
  row("총 보유 항목", stats.totalItems);
  row("누적 복습", stats.totalReviewed);
  row("성공 (q≥3)", stats.totalSuccess);
  row("유지율 %", stats.retentionPct);
  console.log("  최근 7일 byDay:");
  for (const d of stats.byDay.slice(-7)) {
    console.log(
      `    ${d.date}  reviewed ${d.reviewed.toString().padStart(2)}  success ${d.success.toString().padStart(2)}`,
    );
  }
  console.log("  향후 7일 forecast:");
  for (const d of stats.forecast7d) {
    console.log(`    ${d.date}  due ${d.dueCount}`);
  }

  header("CSV export (앞 5행)");
  const csv = await helpers.exportLogsCsv(client, userId, null, null);
  csv
    .split("\n")
    .slice(0, 6)
    .forEach((line) => console.log(`  ${line}`));
  const totalLines = csv.split("\n").filter((l) => l.length > 0).length;
  row("총 CSV 행 수", totalLines);
}

// ── 메인 ──────────────────────────────────────────────────────────

async function main() {
  const userId = await setupUser();
  try {
    await ensureSeed();
    const client = await userClient();

    for (const day of PLAN) {
      setFakeToday(day.date);
      const helpers = await loadServerHelpers();
      header(day.label);
      row("SRS_FAKE_TODAY", day.date);
      row("srsToday()", helpers.srsToday());
      const queue = await helpers.getReviewQueue(client, userId);
      row("큐 — due", queue.dueCount);
      row("큐 — new", queue.newCount);
      row("큐 — 오늘 신규 도입", queue.newIntroducedToday);
      row("큐 — 총 항목", queue.items.length);
      for (let i = 0; i < Math.min(queue.items.length, 5); i++) {
        const it = queue.items[i];
        console.log(
          `    [${i}] ${it.kind.padEnd(3)} ${it.subject.padEnd(10)} ${it.front.slice(0, 40)}${
            it.dueDate
              ? ` (due ${it.dueDate}, interval ${it.intervalDays}d, rep ${it.repetitions})`
              : ""
          }`,
        );
      }
      console.log("  채점:");
      await submitGrades(day, client, userId);
    }

    await showStats(client, userId);
  } finally {
    await cleanup(userId);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[demo] failed:", err);
    process.exit(1);
  });
