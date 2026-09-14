// 수강권 상태 — 학생에게 보일 말 (feat-11-012 P6-c). 서버 전용 아님.
//
// ★고치기 전 증상: 증명서 화면이 ${it.status === "active" ? "수강중" : it.status} 로 써서
//   paused·expired·revoked 가 **원시 영문 그대로** 학생에게 나갔다. 내 강의 화면은 따로
//   4키 표를 들고 있었는데 `Record<string, string>` 이라 값이 늘어도 알려 주지 않는다.
//
// ★주문 상태(orders/lib/order-status.ts)와 같은 방식으로 **타입이 닫는다** —
//   enrollments.status 도 Postgres enum 이 아니라 text 라 생성 타입에서 후보를 못 얻는다.
//   허용값을 여기 세우고 Record<EnrollmentStatus, …> 로 선언해, 값을 늘리면서 문구를
//   빠뜨리면 컴파일이 깨지게 한다.

/** enrollments.status 허용값 — DB CHECK 제약과 일치(2026-09-14 확인). */
export const ENROLLMENT_STATUSES = [
  "active",
  "paused",
  "expired",
  "revoked",
] as const;

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

const LABEL: Record<EnrollmentStatus, string> = {
  active: "수강중",
  paused: "일시정지",
  expired: "기간 만료",
  revoked: "수강 종료",
};

/** 상태 표시명. ★모르는 값이어도 원시코드를 내보내지 않는다. */
export function enrollmentStatusLabel(status: string): string {
  return (ENROLLMENT_STATUSES as readonly string[]).includes(status)
    ? LABEL[status as EnrollmentStatus]
    : "확인 중";
}
