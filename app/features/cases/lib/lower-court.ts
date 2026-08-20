// feat-2-035 — 하급심 판결문 상태 라벨(클라이언트 안전).
//
// ★.server 모듈에 두면 안 된다 — 화면 컴포넌트가 라벨을 쓰는 순간 React Router 가
//   "Server-only module referenced by client" 로 빌드를 깬다(loader 밖 참조는 제거해 주지 않는다).
//   DB CHECK 제약과 같은 목록을 유지할 것.

export const LOWER_STATUSES = [
  "loaded",
  "not_in_api",
  "summary_only",
  "no_ref",
] as const;

export type LowerCourtStatus = (typeof LOWER_STATUSES)[number];

export const LOWER_STATUS_LABEL: Record<LowerCourtStatus, string> = {
  loaded: "적재됨",
  not_in_api: "미수록 — 판결문만 구하면 됨",
  summary_only: "요지만 — 판결문만 구하면 됨",
  no_ref: "원심 미상 — 원심 확인부터",
};

/** 수기 확보가 필요한 상태인지. 목록 기본 필터. */
export function needsManualWork(status: LowerCourtStatus): boolean {
  return status !== "loaded";
}
