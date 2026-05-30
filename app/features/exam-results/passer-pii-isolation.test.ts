// A4 — 학생 화면이 받는 합격자 반환 타입에 PII 컬럼이 노출되지 않는지 회귀 보호.
// 1년차에는 모든 합격자가 합성이라 실제 누수는 없지만, 내년 실데이터 유입 전에
// 타입 레벨에서 잠가둔다. 향후 누가 PasserBenchmark / PasserSummary 등에 userId,
// userName, userEmail 같은 식별 필드를 추가하면 본 테스트가 컴파일 단계에서 깨진다.

import { describe, it, expectTypeOf } from "vitest";

import type {
  PasserBenchmark,
  PasserBenchmarkMetric,
  PasserLawAverage,
  PasserSummary,
  GroupBaseline,
  PublicPlatformStats,
} from "./analytics.server";
import type { PasserSrsBenchmark } from "~/features/study/passer-srs-benchmark.server";

// PII 컬럼 — 절대 학생 화면에 가서는 안 되는 필드 키.
type PiiKey = "userId" | "userName" | "userEmail" | "user_id" | "name" | "email";

// 컴파일 타임 — 키 집합에서 PiiKey 가 분리됨을 보장.
type Forbid<T> = Extract<keyof T, PiiKey> extends never ? true : false;

describe("학생 화면 합격자 풀 반환 타입 PII 격리 (A4)", () => {
  it("PasserBenchmark — 집계값만", () => {
    expectTypeOf<Forbid<PasserBenchmark>>().toEqualTypeOf<true>();
    // 양성 — 집계 필드가 정의됨.
    expectTypeOf<PasserBenchmark>().toHaveProperty("sampleSize");
    expectTypeOf<PasserBenchmark>().toHaveProperty("studyHours");
  });

  it("PasserBenchmarkMetric — passerMean/median/userPercentile + user 값", () => {
    expectTypeOf<Forbid<PasserBenchmarkMetric>>().toEqualTypeOf<true>();
  });

  it("PasserSummary — resultId / scoreBucket / verified / summaryMd 만 (식별 필드 0)", () => {
    expectTypeOf<Forbid<PasserSummary>>().toEqualTypeOf<true>();
    expectTypeOf<PasserSummary>().toHaveProperty("scoreBucket");
    expectTypeOf<PasserSummary>().toHaveProperty("summaryMd");
  });

  it("PasserLawAverage — 과목별 평균만", () => {
    expectTypeOf<Forbid<PasserLawAverage>>().toEqualTypeOf<true>();
  });

  it("GroupBaseline — 평균/중간값만", () => {
    expectTypeOf<Forbid<GroupBaseline>>().toEqualTypeOf<true>();
  });

  it("PublicPlatformStats (비로그인 랜딩) — 카운트 + 평균만", () => {
    expectTypeOf<Forbid<PublicPlatformStats>>().toEqualTypeOf<true>();
  });

  it("PasserSrsBenchmark (학생 /study/srs) — 표본 + 4종 SRS 평균만", () => {
    expectTypeOf<Forbid<PasserSrsBenchmark>>().toEqualTypeOf<true>();
    expectTypeOf<PasserSrsBenchmark>().toHaveProperty("sampleSize");
  });
});
