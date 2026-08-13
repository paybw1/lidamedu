// B1 — 문항별 시간 계산(computePerQuestionTimeMs) 단위 검증 (Stage 1 C1~C4).
import { describe, expect, test } from "vitest";

import {
  PER_QUESTION_TIME_CAP_MS,
  computePerQuestionTimeMs,
} from "./study-volume";

// OMR 시트 recordAttempt 의 시계 동작을 그대로 시뮬레이션:
// 조작마다 lastActionAt 리셋 + 답한 문항 집합 추적.
function makeRecorder(entryAt: number) {
  let lastActionAt = entryAt;
  const answered = new Set<string>();
  return (problemId: string, at: number): number => {
    const ms = computePerQuestionTimeMs(at, lastActionAt, answered.has(problemId));
    lastActionAt = at;
    answered.add(problemId);
    return ms;
  };
}

describe("B1 문항별 시간 (누적 버그 수정)", () => {
  test("C1 — 순차 응답: 누적이 아닌 개별 시간", () => {
    const rec = makeRecorder(0);
    expect(rec("q1", 20_000)).toBe(20_000);
    expect(rec("q2", 50_000)).toBe(30_000); // 누적(50s)이 아니라 개별(30s)
    expect(rec("q3", 60_000)).toBe(10_000);
  });

  test("C2 — 건너뛰고 응답: 실제 조작 순서 기준", () => {
    const rec = makeRecorder(0);
    // 7번을 먼저 풀고 → 2번 → 다시 9번 (문항 순서 무관).
    expect(rec("q7", 40_000)).toBe(40_000);
    expect(rec("q2", 55_000)).toBe(15_000);
    expect(rec("q9", 90_000)).toBe(35_000);
  });

  test("C3 — 이미 답한 문항 수정: 0ms + 수정 체류시간이 다음 문항에 전가되지 않음", () => {
    const rec = makeRecorder(0);
    expect(rec("q1", 20_000)).toBe(20_000);
    expect(rec("q1", 80_000)).toBe(0); // 수정 — 최초 응답 시간 유지, 추가 시간 없음
    // 수정 시점에 시계가 리셋되므로 다음 문항은 수정 이후 경과만.
    expect(rec("q2", 95_000)).toBe(15_000);
  });

  test("C4 — 상한 클램프: 탭 방치", () => {
    const rec = makeRecorder(0);
    expect(rec("q1", PER_QUESTION_TIME_CAP_MS + 5_000_000)).toBe(
      PER_QUESTION_TIME_CAP_MS,
    );
    // 클록 역행 방어.
    expect(computePerQuestionTimeMs(10, 999, false)).toBe(0);
  });
});
