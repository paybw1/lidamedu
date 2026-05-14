// 시연·QA 용 합격자 시드 데이터.
// admin 전용. service_role 로 auth.user 생성 + profile 마킹 + exam_results + 학습 활동 합성.
// 합성 데이터는 profiles.is_synthetic=true 로 표식. 실제 분석에서 옵션 필터링 가능.

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

import type { ExamRound } from "./labels";

interface SyntheticProfile {
  userId: string;
  email: string;
  displayName: string;
  examYear: number;
  examRound: ExamRound;
  score: number;
  studySummary: string;
  scienceSubject: string | null;
  problemAttempts: number;
  accuracyPct: number;
  studyHours: number;
  activeDays: number;
}

const STUDY_SUMMARIES = [
  "기출 회독을 핵심으로 잡았고, 약점 단원은 OX 문제까지 별도로 돌렸어요. 매일 아침 1시간씩 조문 통독 → 점심 후 문제 → 저녁 약점 복습 루틴이 흔들리지 않게 유지한 게 가장 컸습니다.",
  "특허법은 조문 빈칸 학습으로 핵심 키워드를 외우고, 상표법은 판례 위주로 갔어요. 매주 토요일에 한 주 학습 내용을 노트에 다시 정리하니 장기 기억에 도움이 됐습니다.",
  "마지막 3개월은 모의고사를 일주일에 2~3회 풀고, 오답 노트로만 복습했어요. 새 인풋을 줄이고 익숙한 자료를 반복한 게 컨디션 유지에 좋았습니다.",
  "디자인보호법 출제 비중이 낮다고 무시하지 말고, 짧고 자주 회독하세요. 조문 자체가 적어서 1~2주에 한 번씩 통독하면 안정적입니다.",
  "민법은 판례 위주로, 사례형 문제 풀이를 많이 했어요. 사례 → 쟁점 → 조문 → 판례 → 결론 순서를 머릿속에 굳히고 나서 정답률이 안정됐습니다.",
  "자연과학 선택은 본인이 강한 과목으로 — 저는 화학이 자신 있어서 화학을 선택했고, 기출 8회독 정도로 마무리했습니다. 새 문제집을 추가로 풀기보다 기출을 깊이 파는 게 효과적이었어요.",
  "암기 도구를 적극 활용했습니다. 조문 단답형은 빈칸 모드로, 판례 키워드는 플래시카드 앱으로. 매일 30분이지만 누적되면 큰 차이를 만들어요.",
  "2차 답안은 형식이 중요해요. 쟁점 도출 → 조문 적시 → 판례 인용 → 사안 적용 → 결론 — 이 순서를 절대 흔들지 않도록 GS 답안을 매주 작성해 강사 첨삭을 받았습니다.",
  "처음 6개월은 인풋(강의·조문 통독), 다음 6개월은 아웃풋(문제·기출·모의)으로 페이스를 나눴어요. 아웃풋 단계로 넘어가니 효율이 확실히 올라갑니다.",
  "건강 관리가 의외로 큰 변수였습니다. 새벽 공부 그만두고 7시간 수면 + 주 3회 운동 시작하니 집중력이 다른 차원으로 올라왔어요. 무리해서 시간 늘리는 것보다 회복이 우선입니다.",
];

const SCIENCE_SUBJECTS = ["physics", "chemistry", "biology", "earth_science"];

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateProfileSpec(idx: number): SyntheticProfile {
  // 합격자 분포 (대략 실측 추정):
  //  - 점수: 평균 73점, 표준편차 7 (60~95 사이)
  //  - 학습 시간 누적: 1년 기준 800~2500h (평균 ~1500)
  //  - 정답률: 60~85% (평균 70%)
  //  - 문제 풀이수: 1500~6000 (평균 3500)
  //  - 활동일수: 200~340 (1년+ 준비 가정)
  const score = Math.round(rand(63, 92) * 10) / 10;
  const studyHours = Math.round(rand(800, 2400));
  const accuracy = Math.round(rand(60, 85));
  const attempts = randInt(1500, 6000);
  const activeDays = randInt(180, 340);
  const examYear = 2026;
  const examRound: ExamRound = Math.random() < 0.55 ? "first" : "second";
  return {
    userId: "", // filled later
    email: `seed-passer-${idx}-${randomUUID().slice(0, 8)}@lidam-seed.invalid`,
    displayName: `[SEED] 가상 합격자 ${idx + 1}`,
    examYear,
    examRound,
    score,
    studySummary: pick(STUDY_SUMMARIES),
    scienceSubject:
      examRound === "first" ? pick(SCIENCE_SUBJECTS) : null,
    problemAttempts: attempts,
    accuracyPct: accuracy,
    studyHours,
    activeDays,
  };
}

async function createSyntheticAuthUser(
  spec: SyntheticProfile,
): Promise<string | null> {
  const { data, error } = await adminClient.auth.admin.createUser({
    email: spec.email,
    email_confirm: true,
    user_metadata: { name: spec.displayName, marketing_consent: false },
    app_metadata: { provider: "email" },
    password: randomUUID(), // 로그인 불가, 데이터 시드 전용
  });
  if (error || !data.user) {
    console.warn("[seed] auth.admin.createUser failed", error?.message);
    return null;
  }
  return data.user.id;
}

async function markProfile(
  admin: SupabaseClient<Database>,
  userId: string,
  spec: SyntheticProfile,
): Promise<void> {
  await admin
    .from("profiles")
    .update({
      name: spec.displayName,
      is_synthetic: true,
      analytics_consent_at: new Date().toISOString(),
      next_exam_year: spec.examYear,
      next_exam_round: spec.examRound,
      selected_science_subject: spec.scienceSubject,
    })
    .eq("profile_id", userId);
}

async function insertExamResult(
  admin: SupabaseClient<Database>,
  userId: string,
  spec: SyntheticProfile,
): Promise<void> {
  await admin.from("exam_results").insert({
    user_id: userId,
    exam_year: spec.examYear,
    exam_round: spec.examRound,
    status: "passed",
    self_reported_total_score: spec.score,
    selected_science_subject: spec.scienceSubject,
    verification_status: Math.random() < 0.6 ? "verified" : "self_reported",
    study_summary_md: spec.studySummary,
  });
}

// 학습 활동 합성 — 응시 전년도+해당 연도 구간에 분산.
async function insertSyntheticActivity(
  admin: SupabaseClient<Database>,
  userId: string,
  spec: SyntheticProfile,
): Promise<void> {
  const startMs = new Date(`${spec.examYear - 1}-01-01T00:00:00+09:00`).getTime();
  const endMs = new Date(`${spec.examYear}-07-01T00:00:00+09:00`).getTime();
  const span = endMs - startMs;

  // 1) 문제 풀이 — 실제 problem id 가 필요. 샘플 문제 fetch.
  const { data: problems } = await admin
    .from("problems")
    .select("problem_id")
    .is("deleted_at", null)
    .limit(500);
  const problemIds = (problems ?? []).map((p) => p.problem_id);
  if (problemIds.length === 0) return;

  const attempts = Math.min(spec.problemAttempts, 4000); // 안전 상한
  const correctCount = Math.round((attempts * spec.accuracyPct) / 100);
  const correctSet = new Set<number>();
  while (correctSet.size < correctCount) {
    correctSet.add(Math.floor(Math.random() * attempts));
  }
  const problemRows = Array.from({ length: attempts }, (_, i) => {
    const pid = pick(problemIds);
    const at = new Date(startMs + Math.random() * span).toISOString();
    return {
      user_id: userId,
      problem_id: pid,
      is_correct: correctSet.has(i),
      time_spent_ms: randInt(15_000, 90_000),
      attempted_at: at,
    };
  });
  // 배치 insert — Postgres parameter limit 회피 위해 1000개씩
  for (let i = 0; i < problemRows.length; i += 1000) {
    await admin.from("user_problem_attempts").insert(problemRows.slice(i, i + 1000));
  }

  // 2) study_sessions — 활동일수만큼 분산 (하루 1~3 세션)
  const sessionRows: Array<{
    user_id: string;
    started_at: string;
    ended_at: string;
    duration_ms: number;
    scope: { target_type: string; target_id: string | null } | null;
  }> = [];
  // 활동 일자 set
  const dayKeys = new Set<string>();
  while (dayKeys.size < spec.activeDays) {
    const ts = startMs + Math.random() * span;
    dayKeys.add(new Date(ts).toISOString().slice(0, 10));
  }
  // 하루 평균 시간
  const dailyAvgMs = (spec.studyHours * 3_600_000) / Math.max(spec.activeDays, 1);
  for (const day of dayKeys) {
    const sessionsPerDay = randInt(1, 3);
    const dayStart = new Date(`${day}T00:00:00+09:00`).getTime();
    for (let i = 0; i < sessionsPerDay; i++) {
      const startedAt = new Date(dayStart + rand(6, 22) * 3_600_000).toISOString();
      const dur = Math.round(
        (dailyAvgMs / sessionsPerDay) * rand(0.5, 1.5),
      );
      const endedAt = new Date(
        new Date(startedAt).getTime() + dur,
      ).toISOString();
      sessionRows.push({
        user_id: userId,
        started_at: startedAt,
        ended_at: endedAt,
        duration_ms: dur,
        scope: null,
      });
    }
  }
  for (let i = 0; i < sessionRows.length; i += 1000) {
    await admin.from("study_sessions").insert(sessionRows.slice(i, i + 1000));
  }
}

export interface SeedResult {
  created: number;
  errors: string[];
  userIds: string[];
}

export async function seedPasserData(count: number): Promise<SeedResult> {
  const admin = adminClient as SupabaseClient<Database>;
  const safeCount = Math.max(1, Math.min(20, Math.floor(count)));
  const errors: string[] = [];
  const userIds: string[] = [];

  for (let i = 0; i < safeCount; i++) {
    const spec = generateProfileSpec(i);
    const uid = await createSyntheticAuthUser(spec);
    if (!uid) {
      errors.push(`#${i + 1}: auth user 생성 실패`);
      continue;
    }
    try {
      spec.userId = uid;
      await markProfile(admin, uid, spec);
      await insertExamResult(admin, uid, spec);
      await insertSyntheticActivity(admin, uid, spec);
      userIds.push(uid);
    } catch (e) {
      errors.push(
        `#${i + 1}: ${e instanceof Error ? e.message : String(e)}`,
      );
      // cleanup partial
      try {
        await adminClient.auth.admin.deleteUser(uid);
      } catch {
        /* ignore */
      }
    }
  }
  return { created: userIds.length, errors, userIds };
}

export interface CleanupResult {
  deleted: number;
  errors: string[];
}

export async function cleanupSeedPassers(): Promise<CleanupResult> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data: rows } = await admin
    .from("profiles")
    .select("profile_id")
    .eq("is_synthetic", true);
  const ids = (rows ?? []).map((r) => r.profile_id);
  const errors: string[] = [];
  let deleted = 0;
  for (const id of ids) {
    try {
      // auth user 삭제 — profile 및 활동 데이터는 FK CASCADE 로 자동 정리.
      const { error } = await adminClient.auth.admin.deleteUser(id);
      if (error) errors.push(`${id}: ${error.message}`);
      else deleted += 1;
    } catch (e) {
      errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { deleted, errors };
}

export async function getSeedCount(): Promise<number> {
  const admin = adminClient as SupabaseClient<Database>;
  const { count } = await admin
    .from("profiles")
    .select("profile_id", { head: true, count: "exact" })
    .eq("is_synthetic", true);
  return count ?? 0;
}
