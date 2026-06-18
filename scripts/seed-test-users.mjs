// 통합 학습 통계 페이지(/study/stats) 검증용 dummy user 30명 시드.
// 상급 10 · 중급 10 · 하급 10. 모두 특허법 기준 (현재 시드된 유일한 풀빌드 과목).
//
// 멱등성: 이메일 prefix "test-stats-" 사용자를 전부 삭제 후 재생성.
// auth.users 의 on_auth_user_created 트리거가 profiles row 를 자동 생성.
//
// 실행:
//   node scripts/seed-test-users.mjs
//
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env)

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TEST_EMAIL_PREFIX = "test-stats-";
const PASSWORD = "Test1234!";
const COHORT_NAME = "테스트 통계 30명 (상10·중10·하10)";
const COHORT_DESCRIPTION =
  "통합 학습 통계 화면(/study/stats, /admin/cohorts/:id/progress) 검증용 dummy.";
const NOW = new Date();
const MS_3MONTHS = 90 * 24 * 3600 * 1000;
const CHUNK = 500;

// 결정적 PRNG (mulberry32) — tier·n 시드로 재현 가능.
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = (rng, [min, max]) => min + rng() * (max - min);
const randInt = (rng, [min, max]) => Math.floor(rand(rng, [min, max + 1]));
function pickN(rng, arr, n) {
  if (n <= 0 || arr.length === 0) return [];
  const copy = arr.slice();
  const out = [];
  const take = Math.min(n, copy.length);
  for (let i = 0; i < take; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

// ─── tier 정의 ───
const TIERS = [
  {
    tier: "a",
    label: "상",
    articlePct: [0.88, 0.98],
    casePct: [0.55, 0.8],
    problemPct: [0.78, 0.95],
    accuracy: [0.8, 0.92],
    bookmarks: [30, 50],
    memos: [20, 40],
    highlights: [40, 60],
    examMonthsAway: 2,
    weeklyHours: 35,
    targetScore: 90,
  },
  {
    tier: "b",
    label: "중",
    articlePct: [0.4, 0.6],
    casePct: [0.25, 0.45],
    problemPct: [0.3, 0.6],
    accuracy: [0.55, 0.72],
    bookmarks: [10, 25],
    memos: [8, 20],
    highlights: [15, 30],
    examMonthsAway: 6,
    weeklyHours: 20,
    targetScore: 75,
  },
  {
    tier: "c",
    label: "하",
    articlePct: [0.05, 0.25],
    casePct: [0.03, 0.15],
    problemPct: [0.05, 0.25],
    accuracy: [0.25, 0.45],
    bookmarks: [0, 5],
    memos: [0, 3],
    highlights: [0, 5],
    examMonthsAway: 10,
    weeklyHours: 10,
    targetScore: 60,
  },
];

// ─── 1) 기존 test cohort cleanup (FK 정합성 위해 user 삭제 전) ───
console.log("[1/6] 기존 테스트 cohort 정리");
{
  const { data: existing } = await supa
    .from("cohorts")
    .select("cohort_id")
    .eq("name", COHORT_NAME);
  for (const c of existing ?? []) {
    await supa.from("cohort_members").delete().eq("cohort_id", c.cohort_id);
    await supa.from("cohorts").delete().eq("cohort_id", c.cohort_id);
  }
  console.log(`  → ${(existing ?? []).length}개 cohort 삭제`);
}

// ─── 2) 기존 test user cleanup ───
console.log("[2/6] 기존 test-stats-* 사용자 정리");
let cleanedCount = 0;
let page = 1;
while (true) {
  const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error("listUsers 실패", error.message);
    break;
  }
  const users = data?.users ?? [];
  if (users.length === 0) break;
  for (const u of users) {
    if (u.email?.startsWith(TEST_EMAIL_PREFIX)) {
      const { error: dErr } = await supa.auth.admin.deleteUser(u.id);
      if (dErr) console.error(`deleteUser 실패: ${u.email}`, dErr.message);
      else cleanedCount += 1;
    }
  }
  if (users.length < 200) break;
  page += 1;
}
console.log(`  → ${cleanedCount}명 삭제`);

// ─── 3) 콘텐츠 풀 fetch (특허법) ───
console.log("[3/6] 특허법 콘텐츠 풀 로드");
const { data: law } = await supa
  .from("laws")
  .select("law_id")
  .eq("law_code", "patent")
  .single();
if (!law) {
  console.error("patent law 없음");
  process.exit(1);
}
const { data: articleRows } = await supa
  .from("articles")
  .select("article_id")
  .eq("law_id", law.law_id)
  .eq("level", "article");
const { data: problemRows } = await supa
  .from("problems")
  .select("problem_id")
  .eq("law_id", law.law_id)
  .eq("subject_type", "law")
  .is("deleted_at", null);
const { data: caseRows } = await supa
  .from("cases")
  .select("case_id")
  .contains("subject_laws", ["patent"])
  .is("deleted_at", null);

const articleIds = (articleRows ?? []).map((a) => a.article_id);
const problemIds = (problemRows ?? []).map((p) => p.problem_id);
const caseIds = (caseRows ?? []).map((c) => c.case_id);
console.log(
  `  → 조문 ${articleIds.length} · 문제 ${problemIds.length} · 판례 ${caseIds.length}`,
);

// ─── 4) 30명 생성 ───
console.log("[4/6] 30명 사용자 생성 + 학습 데이터 시드");
const createdProfileIds = [];
let totalSessions = 0;
let totalAttempts = 0;
let totalBookmarks = 0;
let totalMemos = 0;
let totalHighlights = 0;

async function insertChunked(table, rows) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supa.from(table).insert(chunk);
    if (error) {
      console.error(`insert ${table} 실패 (chunk ${i})`, error.message);
      throw error;
    }
  }
}

for (const tierMeta of TIERS) {
  for (let n = 1; n <= 10; n++) {
    const idx = String(n).padStart(2, "0");
    const email = `${TEST_EMAIL_PREFIX}${tierMeta.tier}-${idx}@lidamedu.test`;
    const rng = mulberry32(
      tierMeta.tier.charCodeAt(0) * 1000 + n * 7 + 31337,
    );
    const displayName = `테스트 ${tierMeta.label}급 ${idx}`;

    // 3a. createUser (트리거가 profile 자동 생성)
    const { data: created, error: cErr } = await supa.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: displayName },
    });
    let userId;
    let isNewUser = true;
    if (cErr || !created?.user) {
      // 이미 존재하는 경우 — displayName 매칭으로 기존 profile_id 회수.
      // (auth.users 를 SDK 로 직접 select 못해서 profile.name 으로 매칭)
      const isDuplicate = (cErr?.message ?? "")
        .toLowerCase()
        .includes("already");
      if (!isDuplicate) {
        console.error(`createUser 실패: ${email}`, cErr?.message);
        continue;
      }
      const { data: existing } = await supa
        .from("profiles")
        .select("profile_id")
        .eq("name", displayName)
        .limit(1)
        .maybeSingle();
      if (!existing) {
        console.error(
          `기존 user 회수 실패: ${email} (displayName=${displayName})`,
        );
        continue;
      }
      userId = existing.profile_id;
      isNewUser = false;
    } else {
      userId = created.user.id;
    }
    createdProfileIds.push(userId);

    // 3b. profile name 보정 (트리거가 이메일 prefix 를 채웠을 수 있음)
    await supa
      .from("profiles")
      .update({ name: displayName })
      .eq("profile_id", userId);

    // 3c. study_goals — upsert 라 매번 안전
    const examDate = new Date(
      NOW.getTime() + tierMeta.examMonthsAway * 30 * 24 * 3600 * 1000,
    );
    await supa.from("study_goals").upsert(
      {
        user_id: userId,
        exam_date: examDate.toISOString().slice(0, 10),
        weekly_goal_hours: tierMeta.weeklyHours,
        // 차수는 profiles.next_exam_round 가 SSOT (feat-2-025) — study_goals 미사용.
        target_score: tierMeta.targetScore,
        notes: `(테스트) ${tierMeta.label}급 학습자 — ${idx}번`,
      },
      { onConflict: "user_id" },
    );

    // 기존 user 면 학습 데이터는 이미 시드되어 있으므로 skip (중복 INSERT 방지).
    if (!isNewUser) {
      console.log(
        `  [${tierMeta.tier}-${idx}] ${email} (기존) — cohort 멤버로만 등록`,
      );
      continue;
    }

    // 3d. 조문 열람 sessions
    const visitedArticleCount = Math.floor(
      articleIds.length * rand(rng, tierMeta.articlePct),
    );
    const visitedArticles = pickN(rng, articleIds, visitedArticleCount);
    const articleSessions = visitedArticles.map((aid) => ({
      user_id: userId,
      scope: {
        subject: "patent",
        target_type: "article",
        target_id: aid,
      },
      started_at: new Date(
        NOW.getTime() - rng() * MS_3MONTHS,
      ).toISOString(),
    }));

    // 3e. 판례 열람 sessions
    const visitedCaseCount = Math.floor(
      caseIds.length * rand(rng, tierMeta.casePct),
    );
    const visitedCases = pickN(rng, caseIds, visitedCaseCount);
    const caseSessions = visitedCases.map((cid) => ({
      user_id: userId,
      scope: {
        subject: "patent",
        target_type: "case",
        target_id: cid,
      },
      started_at: new Date(
        NOW.getTime() - rng() * MS_3MONTHS,
      ).toISOString(),
    }));

    await insertChunked("study_sessions", [
      ...articleSessions,
      ...caseSessions,
    ]);
    totalSessions += articleSessions.length + caseSessions.length;

    // 3f. 객관식 시도
    const attemptCount = Math.floor(
      problemIds.length * rand(rng, tierMeta.problemPct),
    );
    const attemptedProblems = pickN(rng, problemIds, attemptCount);
    const accuracy = rand(rng, tierMeta.accuracy);
    const attempts = attemptedProblems.map((pid) => ({
      user_id: userId,
      problem_id: pid,
      is_correct: rng() < accuracy,
      mode: "study",
      time_spent_ms: randInt(rng, [10000, 90000]),
      attempted_at: new Date(
        NOW.getTime() - rng() * MS_3MONTHS,
      ).toISOString(),
    }));
    await insertChunked("user_problem_attempts", attempts);
    totalAttempts += attempts.length;

    // 3g. 즐겨찾기 (열람한 article + case 중)
    const bookmarkPool = [
      ...visitedArticles.map((a) => ["article", a]),
      ...visitedCases.map((c) => ["case", c]),
    ];
    const bookmarkCount = randInt(rng, tierMeta.bookmarks);
    const bookmarkPicks = pickN(rng, bookmarkPool, bookmarkCount);
    const bookmarks = bookmarkPicks.map(([t, id]) => ({
      user_id: userId,
      target_type: t,
      target_id: id,
      star_level: randInt(rng, [1, 3]),
    }));
    await insertChunked("user_bookmarks", bookmarks);
    totalBookmarks += bookmarks.length;

    // 3h. 메모 (article 만)
    const memoCount = Math.min(
      randInt(rng, tierMeta.memos),
      visitedArticles.length,
    );
    const memoTargets = pickN(rng, visitedArticles, memoCount);
    const memos = memoTargets.map((aid, i) => ({
      user_id: userId,
      target_type: "article",
      target_id: aid,
      body_md: `(테스트 메모 #${i + 1}) ${tierMeta.label}급 학습자가 작성.`,
    }));
    await insertChunked("user_memos", memos);
    totalMemos += memos.length;

    // 3i. 하이라이트 (article 만)
    const hlCount = Math.min(
      randInt(rng, tierMeta.highlights),
      visitedArticles.length,
    );
    const hlTargets = pickN(rng, visitedArticles, hlCount);
    const highlights = hlTargets.map((aid, i) => ({
      user_id: userId,
      target_type: "article",
      target_id: aid,
      field_path: "content",
      start_offset: i * 10,
      end_offset: i * 10 + 20,
      content_hash: `dummy-${userId.slice(0, 6)}-${i}`,
      color: "yellow",
    }));
    await insertChunked("user_highlights", highlights);
    totalHighlights += highlights.length;

    console.log(
      `  [${tierMeta.tier}-${idx}] ${email} — art ${visitedArticles.length} · case ${visitedCases.length} · prob ${attempts.length} (acc ${Math.round(accuracy * 100)}%) · bm ${bookmarks.length} · memo ${memos.length} · hl ${highlights.length}`,
    );
  }
}

// ─── 5) cohort 생성 + 30명 멤버 추가 ───
console.log("[5/6] cohort 생성 + 멤버 등록");
let cohortId = null;
{
  const { data: adminProfile } = await supa
    .from("profiles")
    .select("profile_id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (!adminProfile) {
    console.warn("  → admin 사용자 없음 — cohort 생성 skip");
  } else if (createdProfileIds.length === 0) {
    console.warn("  → 생성된 사용자 없음 — cohort skip");
  } else {
    const { data: cohort, error: cErr } = await supa
      .from("cohorts")
      .insert({
        name: COHORT_NAME,
        description: COHORT_DESCRIPTION,
        owner_id: adminProfile.profile_id,
      })
      .select("cohort_id")
      .single();
    if (cErr || !cohort) {
      console.error("  → cohort 생성 실패", cErr?.message);
    } else {
      cohortId = cohort.cohort_id;
      const members = createdProfileIds.map((pid) => ({
        cohort_id: cohortId,
        profile_id: pid,
        added_by: adminProfile.profile_id,
      }));
      const { error: mErr } = await supa
        .from("cohort_members")
        .insert(members);
      if (mErr) console.error("  → cohort_members 추가 실패", mErr.message);
      else
        console.log(
          `  → cohort "${COHORT_NAME}" 생성 + 멤버 ${members.length}명 등록 (cohort_id=${cohortId})`,
        );
    }
  }
}

// ─── 6) 검증 ───
console.log("[6/6] 검증 카운트");
console.log(`  → 생성된 사용자 ${createdProfileIds.length}/30`);
console.log(
  `  → 누적 — sessions ${totalSessions}, attempts ${totalAttempts}, bookmarks ${totalBookmarks}, memos ${totalMemos}, highlights ${totalHighlights}`,
);

console.log("\n완료. 로그인 비밀번호: Test1234!");
console.log(`  상급: ${TEST_EMAIL_PREFIX}a-01~a-10@lidamedu.test`);
console.log(`  중급: ${TEST_EMAIL_PREFIX}b-01~b-10@lidamedu.test`);
console.log(`  하급: ${TEST_EMAIL_PREFIX}c-01~c-10@lidamedu.test`);
if (cohortId) {
  console.log(
    `\n운영자 모니터링: /admin/cohorts/${cohortId}/progress (admin 로그인)`,
  );
}
