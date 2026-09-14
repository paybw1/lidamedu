// 재생 허용량 판정 테스트 (feat-11-012 P6-a).
//
// ★못박는 것: ① 무제한 조건(null·길이 0)의 의미가 한 벌뿐이라는 것
//   ② 경계(허용량과 같을 때)는 **소진**이라는 것 — 판정 세 곳이 어긋나면 여기서 갈렸다.

import { describe, expect, it } from "vitest";

import { computePlayLimit } from "./play-limit";

const LEN = 600; // 10분짜리 회차

describe("computePlayLimit", () => {
  it("max_plays 가 없으면 무제한 — ★목록이 쓰던 「없으면 2회」와 반대다", () => {
    const r = computePlayLimit({
      maxPlays: null,
      durationSeconds: LEN,
      usedSeconds: 999_999,
    });
    expect(r.allowanceSeconds).toBeNull();
    expect(r.remainingSeconds).toBeNull();
    expect(r.exhausted).toBe(false);
  });

  it("길이를 모르는 회차는 막지 않는다(fail-open)", () => {
    const r = computePlayLimit({
      maxPlays: 2,
      durationSeconds: 0,
      usedSeconds: 100,
    });
    expect(r.allowanceSeconds).toBeNull();
    expect(r.exhausted).toBe(false);
  });

  it("허용량 = max_plays × 길이", () => {
    const r = computePlayLimit({
      maxPlays: 2,
      durationSeconds: LEN,
      usedSeconds: 0,
    });
    expect(r.allowanceSeconds).toBe(1200);
    expect(r.remainingSeconds).toBe(1200);
    expect(r.exhausted).toBe(false);
  });

  it("★경계 — 정확히 다 쓰면 소진이다(>= 이지 > 가 아니다)", () => {
    expect(
      computePlayLimit({ maxPlays: 2, durationSeconds: LEN, usedSeconds: 1199 })
        .exhausted,
    ).toBe(false);
    expect(
      computePlayLimit({ maxPlays: 2, durationSeconds: LEN, usedSeconds: 1200 })
        .exhausted,
    ).toBe(true);
  });

  it("초과 사용해도 남은 초는 음수가 되지 않는다", () => {
    const r = computePlayLimit({
      maxPlays: 1,
      durationSeconds: LEN,
      usedSeconds: 900,
    });
    expect(r.exhausted).toBe(true);
    expect(r.remainingSeconds).toBe(0);
  });

  it("운영 실측(2026-09-14) 값으로 확인 — 45초 사용 / 허용 1200초", () => {
    const r = computePlayLimit({
      maxPlays: 2,
      durationSeconds: LEN,
      usedSeconds: 45,
    });
    expect(r.exhausted).toBe(false);
    expect(r.remainingSeconds).toBe(1155);
  });
});
