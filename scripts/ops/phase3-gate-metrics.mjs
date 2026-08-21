// Phase 3 운영 게이트 — 측정 스크립트 (읽기 전용 SELECT).
// 지표 정의 SSOT: docs/plans/phase3-ops-gate.md §2 — 정의를 바꾸면 문서와 함께 바꾼다.
//
//   node scripts/ops/phase3-gate-metrics.mjs                  # 이번 달 · 기본 코호트
//   node scripts/ops/phase3-gate-metrics.mjs --month 2026-09
//   node scripts/ops/phase3-gate-metrics.mjs --cohort <uuid>
import 'dotenv/config';

const REF = 'mcgdoplovrjgklbxmozi'; // 운영 DB
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) {
  console.error('SUPABASE_ACCESS_TOKEN 미설정 (.env)');
  process.exit(1);
}
async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
}

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};

// KST 기준 이번 달.
const kstNow = new Date(Date.now() + 9 * 3_600_000);
const month = opt('month') ?? kstNow.toISOString().slice(0, 7);
const periodStart = `${month}-01`;
const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
  .getUTCDate();
const periodEnd = `${month}-${String(lastDay).padStart(2, '0')}`;
const todayISO = kstNow.toISOString().slice(0, 10);
// 관찰 상한 — 오늘 이전까지(오늘은 아직 기록 중일 수 있어 분모에서 제외).
const obsEnd = todayISO > periodEnd ? periodEnd : addDays(todayISO, -1);

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function isWeekend(iso) {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}
// app/features/study-plans/lib/expected-items.ts 와 동일 규칙 (미러 — 변경 시 동기).
function scopeMatches(scope, weekend) {
  return scope === 'all' || (scope === 'weekend') === weekend;
}

// 코호트 — 기본: 27년대비 1차 종합반.
const cohortId =
  opt('cohort') ??
  (await q(`select cohort_id from cohorts where name = '27년대비 1차 종합반' and deleted_at is null limit 1`))[0]
    ?.cohort_id;
if (!cohortId) throw new Error('코호트를 찾을 수 없습니다 (--cohort <uuid>)');

const students = await q(`
  select cm.profile_id, p.name
  from cohort_members cm join profiles p on p.profile_id = cm.profile_id
  where cm.cohort_id = '${cohortId}' and p.role = 'student'
  order by p.name`);
const ids = students.map((s) => `'${s.profile_id}'`).join(',') || `'00000000-0000-0000-0000-000000000000'`;

console.log(`# Phase 3 운영 게이트 — ${month} (${periodStart}~${obsEnd} 관찰) · 학생 ${students.length}명\n`);

// ── ① 계획 제출률 — submitted 이상(제출 이력 보유) 학생 / 반 학생 ────────────
const plans = await q(`
  select user_id, plan_id, status, version, submitted_at, reviewed_at, authored_by
  from study_plans
  where user_id in (${ids}) and period_start = '${periodStart}'
  order by user_id, version`);
const submittedUsers = new Set(
  plans
    .filter((p) => p.submitted_at !== null || ['submitted', 'approved', 'superseded'].includes(p.status))
    .map((p) => p.user_id),
);
const approvedByUser = new Map(
  plans.filter((p) => p.status === 'approved').map((p) => [p.user_id, p.plan_id]),
);
// ★feat-7-048 — 상담자가 대신 쓴 계획(authored_by)은 학생 제출이 아니다.
//   합쳐 세면 게이트 수치의 의미가 측정 도중에 조용히 바뀐다.
const staffAuthoredUsers = new Set(plans.filter((p) => p.authored_by !== null).map((p) => p.user_id));
const selfSubmittedUsers = new Set([...submittedUsers].filter((u) => !staffAuthoredUsers.has(u)));
console.log(`## ① 계획 제출률(학생 자력): ${selfSubmittedUsers.size}/${students.length} = ${pct(selfSubmittedUsers.size, students.length)} (목표 70%)`);
console.log(`   · 상담자 대필 포함 전체: ${submittedUsers.size}/${students.length} = ${pct(submittedUsers.size, students.length)} · 대필 ${staffAuthoredUsers.size}명`);

// ── ② 일일 기록률 — 기대 항목≥1 인 (학생×날)만 분모. 계획 없는 학생 제외 ────
const planIds = [...approvedByUser.values()];
const items = planIds.length
  ? await q(`select plan_id, day_scope, start_date, end_date from study_plan_items
       where plan_id in (${planIds.map((v) => `'${v}'`).join(',')})`)
  : [];
const itemsByPlan = new Map();
for (const it of items) {
  const arr = itemsByPlan.get(it.plan_id) ?? [];
  arr.push(it);
  itemsByPlan.set(it.plan_id, arr);
}
const logs = await q(`
  select user_id, log_date, minutes, node_id
  from study_logs
  where user_id in (${ids}) and log_date between '${periodStart}' and '${periodEnd}'`);
const logDatesByUser = new Map();
for (const l of logs) {
  if (l.minutes <= 0) continue; // 역방향(취소)은 기록으로 안 침
  const set = logDatesByUser.get(l.user_id) ?? new Set();
  set.add(l.log_date);
  logDatesByUser.set(l.user_id, set);
}
let denom = 0;
let numer = 0;
for (const [userId, planId] of approvedByUser) {
  const planItems = itemsByPlan.get(planId) ?? [];
  const logged = logDatesByUser.get(userId) ?? new Set();
  for (let d = periodStart; d <= obsEnd; d = addDays(d, 1)) {
    const wk = isWeekend(d);
    const expected = planItems.some(
      (i) => i.start_date <= d && d <= i.end_date && scopeMatches(i.day_scope, wk),
    );
    if (!expected) continue; // 기대 항목 0 인 날 제외
    denom += 1;
    if (logged.has(d)) numer += 1;
  }
}
console.log(`## ② 일일 기록률: ${numer}/${denom} = ${pct(numer, denom)} (목표 60% · 승인 계획 보유 ${approvedByUser.size}명 기준)`);

// ── ③ 미분류 시간 비율 ────────────────────────────────────────────────────────
const total = logs.reduce((s, l) => s + l.minutes, 0);
const unclassified = logs.filter((l) => !l.node_id).reduce((s, l) => s + l.minutes, 0);
console.log(`## ③ 미분류 비율: ${unclassified}/${total}분 = ${pct(unclassified, total)} (목표 20% 이하)`);

// ── ④ 승인 소요시간 — 중앙값 (최종 제출 시각 기준: submitted_at 은 재제출 시 갱신) ──
const durations = plans
  .filter((p) => p.reviewed_at && p.submitted_at && ['approved', 'superseded'].includes(p.status))
  .map((p) => (new Date(p.reviewed_at) - new Date(p.submitted_at)) / 60000)
  .sort((a, b) => a - b);
const median = durations.length
  ? durations.length % 2
    ? durations[(durations.length - 1) / 2]
    : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2
  : null;
console.log(`## ④ 승인 소요 중앙값: ${median === null ? '표본 없음' : `${median.toFixed(1)}분`} (목표 2분 이하 · 표본 ${durations.length})`);

// ── ⑤ 붕괴 시점 관찰 — 학생별 첫/마지막 기록일 · 마지막 이후 경과 ────────────
console.log(`\n## ⑤ 학생별 상태 (붕괴 시점 관찰 — §4-1)\n`);
console.log(`| 학생 | 계획 | 첫 기록 | 마지막 기록 | 경과일 | 기록일수 |`);
console.log(`|---|---|---|---|---|---|`);
for (const s of students) {
  const plan = plans.filter((p) => p.user_id === s.profile_id).at(-1);
  const dates = [...(logDatesByUser.get(s.profile_id) ?? [])].sort();
  const last = dates.at(-1) ?? null;
  const gap = last ? Math.round((new Date(todayISO) - new Date(last)) / 86400000) : null;
  console.log(
    `| ${s.name} | ${plan ? `${plan.status} v${plan.version}` : '미작성'} | ${dates[0] ?? '—'} | ${last ?? '—'} | ${gap ?? '—'} | ${dates.length} |`,
  );
}
console.log(`\n해석: 첫 기록 없음=시작 안 함(가치 전달) · 1주 후 끊김=입력 마찰 · 2~3주 후 끊김=보상 부재`);

function pct(n, d) {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : '—';
}
