// 운영 업무(duty) 정의 SSOT — 서버 리졸버(duties.server.ts)와 관리자 관리 화면이 공유.
// *.server.ts 가 아니어야 화면 모듈 레벨(zod 스키마 등)에서 참조 가능.

export const STAFF_DUTIES = [
  "upgrade_request",
  "bug_report",
  "qna_question",
  "ai_usage_alert",
  "lecture_abuse_alert",
  "student_admin_access",
  // 감사 이상(권한 변경·완전삭제 등) 실시간 경보 라우팅.
  "audit_alert",
  // feat-6-011 — 고객센터 문의 접수 알림 라우팅.
  "cs_inquiry",
  // feat-11-004 4d — LMS 접근 권한 4종 (설계 §3.12)
  "lms_video_admin",
  "lms_cs",
  "lms_orders_admin",
  "lms_stats_view",
] as const;

export type StaffDuty = (typeof STAFF_DUTIES)[number];

export type StaffRole = "instructor" | "manager" | "admin";

export interface DutyMeta {
  label: string;
  desc: string;
  /**
   * notify = 알림 라우팅(배정 0명 → fallbackRoles 전체 발송).
   * access = 화면 접근 권한(배정 스태프 + admin 만, 배정 0명 → admin 전용).
   */
  kind: "notify" | "access";
  /** notify: 배정 0명일 때 폴백 수신 역할 — 기존 broadcast 동작과 동일하게 유지. */
  fallbackRoles: StaffRole[];
}

export const DUTY_META: Record<StaffDuty, DutyMeta> = {
  upgrade_request: {
    label: "종합반 등업신청",
    desc: "학생이 pricing 에서 종합반 등업을 신청하면 접수 알림.",
    kind: "notify",
    fallbackRoles: ["admin", "manager"],
  },
  bug_report: {
    label: "오류신고",
    desc: "학생·스태프가 화면에서 오류를 신고하면 접수 알림.",
    kind: "notify",
    fallbackRoles: ["instructor", "manager", "admin"],
  },
  cs_inquiry: {
    label: "고객센터 문의",
    desc: "학생·회원이 고객센터에 문의를 남기면 접수 알림.",
    kind: "notify",
    fallbackRoles: ["manager", "admin"],
  },
  audit_alert: {
    label: "감사 이상 경보",
    desc: "권한 변경·계정 완전삭제 등 고위험 운영 작업 발생 시 실시간 경보.",
    kind: "notify",
    fallbackRoles: ["admin"],
  },
  qna_question: {
    label: "Q&A 신규 질문",
    desc: "학생이 질문을 올리면 인박스·이메일·알림톡 발송. 과목별 답변자 지정이 있으면 그쪽이 우선.",
    kind: "notify",
    fallbackRoles: ["instructor", "manager", "admin"],
  },
  ai_usage_alert: {
    label: "AI/OCR 한도 경보",
    desc: "GS AI 채점·OCR 일일 비용 한도 도달 시 경보.",
    kind: "notify",
    fallbackRoles: ["instructor", "manager", "admin"],
  },
  lecture_abuse_alert: {
    label: "강의노트·도해 이상 열람 경보",
    desc: "단시간 대량 열람(유출 시도 의심) 감지 경보.",
    kind: "notify",
    fallbackRoles: ["manager", "admin"],
  },
  student_admin_access: {
    label: "수강생 관리 접근",
    desc: "수강생 관리(/admin/users) 화면 열람과 이용 승인/해제 권한. 원장은 항상 가능하고, 역할 변경은 원장 전용으로 유지됩니다.",
    kind: "access",
    fallbackRoles: ["admin"],
  },
  lms_video_admin: {
    label: "강의 영상·도서 등록",
    desc: "강의 개설·회차·영상 등록과 도서 관리 화면 접근.",
    kind: "access",
    fallbackRoles: ["admin"],
  },
  lms_cs: {
    label: "LMS CS (수강권·기기·배수)",
    desc: "영상 수강권 지급·연장·회수·배수 복구와 기기 관리 화면 접근.",
    kind: "access",
    fallbackRoles: ["admin"],
  },
  lms_orders_admin: {
    label: "주문·환불·배송",
    desc: "주문 관리(부분 환불·무통장 승인)와 배송 관리 화면 접근.",
    kind: "access",
    fallbackRoles: ["admin"],
  },
  lms_stats_view: {
    label: "매출 통계 열람",
    desc: "주문 기준 매출 요약(주문 관리 상단 카드 등) 열람.",
    kind: "access",
    fallbackRoles: ["admin"],
  },
};
