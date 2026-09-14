// 수강권 상태 표기 테스트 (feat-11-012 P6-c).
// ★못박는 것: 증명서 화면이 `status === "active" ? "수강중" : it.status` 로 써서
//   paused·expired·revoked 가 원시 영문으로 나가던 것.

import { describe, expect, it } from "vitest";

import {
  ENROLLMENT_STATUSES,
  enrollmentStatusLabel,
} from "./enrollment-status";

describe("enrollmentStatusLabel", () => {
  it("DB CHECK 제약의 네 값 전부 한글이다", () => {
    expect(ENROLLMENT_STATUSES).toEqual([
      "active",
      "paused",
      "expired",
      "revoked",
    ]);
    for (const s of ENROLLMENT_STATUSES) {
      expect(enrollmentStatusLabel(s)).not.toBe(s);
    }
  });

  it("★종전에 원시 영문으로 새던 세 값", () => {
    expect(enrollmentStatusLabel("paused")).toBe("일시정지");
    expect(enrollmentStatusLabel("expired")).toBe("기간 만료");
    expect(enrollmentStatusLabel("revoked")).toBe("수강 종료");
  });

  it("모르는 값이 와도 원시코드를 내보내지 않는다", () => {
    expect(enrollmentStatusLabel("suspended_by_x")).toBe("확인 중");
  });
});
