// 운영 업무(duty) 정의 SSOT — 서버 리졸버(duties.server.ts)와 관리자 관리 화면이 공유.
// *.server.ts 가 아니어야 화면 모듈 레벨(zod 스키마 등)에서 참조 가능.

export const STAFF_DUTIES = [
  "upgrade_request",
  "bug_report",
  "qna_question",
  "review_request",
  "ai_usage_alert",
  "lecture_abuse_alert",
] as const;

export type StaffDuty = (typeof STAFF_DUTIES)[number];

export type StaffRole = "instructor" | "manager" | "admin";

export interface DutyMeta {
  label: string;
  desc: string;
  /** 배정 0명일 때 폴백 수신 역할 — 기존 broadcast 동작과 동일하게 유지. */
  fallbackRoles: StaffRole[];
}

export const DUTY_META: Record<StaffDuty, DutyMeta> = {
  upgrade_request: {
    label: "종합반 등업신청",
    desc: "학생이 pricing 에서 종합반 등업을 신청하면 접수 알림.",
    fallbackRoles: ["admin", "manager"],
  },
  bug_report: {
    label: "오류신고",
    desc: "학생·스태프가 화면에서 오류를 신고하면 접수 알림.",
    fallbackRoles: ["instructor", "manager", "admin"],
  },
  qna_question: {
    label: "Q&A 신규 질문",
    desc: "학생이 질문을 올리면 인박스·이메일·알림톡 발송. 과목별 답변자 지정이 있으면 그쪽이 우선.",
    fallbackRoles: ["instructor", "manager", "admin"],
  },
  review_request: {
    label: "주관식 첨삭 요청",
    desc: "학생이 주관식 첨삭을 요청하면 인박스·이메일·알림톡 발송.",
    fallbackRoles: ["instructor", "manager", "admin"],
  },
  ai_usage_alert: {
    label: "AI/OCR 한도 경보",
    desc: "GS AI 채점·OCR 일일 비용 한도 도달 시 경보.",
    fallbackRoles: ["instructor", "manager", "admin"],
  },
  lecture_abuse_alert: {
    label: "강의노트 이상 열람 경보",
    desc: "단시간 대량 열람(유출 시도 의심) 감지 경보.",
    fallbackRoles: ["manager", "admin"],
  },
};
