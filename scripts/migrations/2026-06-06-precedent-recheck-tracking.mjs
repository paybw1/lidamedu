// feat-7-037 마이그레이션 — cases 재확인 추적 컬럼 + 부분 인덱스 + 하급심 unavailable 백필.
// 운영(mcgdoplo) 직접 호스트는 IPv6 미해결 → Supavisor 풀러로 DDL 적용.
//   node scripts/migrations/2026-06-06-precedent-recheck-tracking.mjs          # dry-run (분포 보고)
//   node scripts/migrations/2026-06-06-precedent-recheck-tracking.mjs --apply  # 적용
import { config as loadEnv } from "dotenv";
import pg from "pg";
loadEnv();
const APPLY = process.argv.includes("--apply");
const du = new URL(process.env.DATABASE_URL);
const ref = du.hostname.split(".")[1];
const pwd = decodeURIComponent(du.password);
const client = new pg.Client({
  connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(pwd)}@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

// 미적재 판례 court 분포 (백필 정확도 확인)
const dist = await client.query(`
  select coalesce(court::text,'(null)') court, count(*)::int n,
         count(*) filter (where decided_at >= current_date - interval '5 years')::int recent5y
  from public.cases
  where official_text_md is null and deleted_at is null
  group by court order by n desc`);
console.log("미적재 판례 court 분포 (recent5y=최근5년 선고):");
for (const r of dist.rows) console.log(`  ${r.court.padEnd(16)} ${String(r.n).padStart(3)}  (최근5년 ${r.recent5y})`);

const supremeRecent = dist.rows.find((r) => r.court === "supreme")?.recent5y ?? 0;
const lower = dist.rows.filter((r) => r.court !== "supreme").reduce((s, r) => s + r.n, 0);
console.log(`\n→ 자동 재확인 대상(대법원·최근5년): ${supremeRecent}건 / unavailable 백필(하급심): ${lower}건`);

if (!APPLY) { console.log("\n(dry-run — --apply 로 적용)"); await client.end(); process.exit(0); }

await client.query("BEGIN");
try {
  await client.query(`
    alter table public.cases
      add column if not exists official_text_checked_at timestamptz,
      add column if not exists official_text_check_count int not null default 0,
      add column if not exists official_text_unavailable boolean not null default false`);
  await client.query(`
    create index if not exists cases_recheck_due_idx on public.cases (official_text_checked_at nulls first)
    where official_text_md is null and deleted_at is null and official_text_unavailable = false`);
  // 사전 백필 없음 — 하급심 제외는 cron 의 "1회 시도 후 실패 시 unavailable" 정책으로 처리(사용자 결정 2026-06-06).
  // (초기 1회 적용 시 잘못 선마킹한 하급심을 되돌리는 reset 포함 — 멱등)
  const reset = await client.query(`
    update public.cases set official_text_unavailable = false
    where official_text_unavailable = true and official_text_md is null`);
  await client.query("COMMIT");
  console.log(`\n=== 적용 완료 === 컬럼+인덱스 생성, 사전마킹 reset ${reset.rowCount}건 (제외는 cron 1회시도 정책)`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error("ROLLBACK:", e.message);
  process.exitCode = 1;
}
await client.end();
