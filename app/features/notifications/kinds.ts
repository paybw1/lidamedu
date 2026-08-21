// 알림 kind 분류 SSOT — 서버(queries.server)와 화면(인박스 필터 탭)이 공유.
// *.server.ts 가 아니어야 컴포넌트에서 import 가능 (값은 enum 문자열 목록뿐 — 서버 비밀 없음).

import type { Database } from "database.types";

export type NotificationKind =
  Database["public"]["Enums"]["staff_notification_kind"];

// 강사용 kinds (인박스에서 staff 필터링).
export const STAFF_KINDS: NotificationKind[] = [
  "qna_new_question",
  "cohort_inactive_alert",
  "exam_certificate_submitted",
  "bug_report_created",
  "cohort_upgrade_requested",
  "lecture_note_abuse",
  // GS AI/OCR 일일 한도 경보 — usage-tracker 가 직접 insert (누락돼 인박스에 안 보이던 것 수정).
  "gs_cap_reached",
  // feat-6-011 — 고객센터 신규 문의 접수.
  "cs_inquiry_created",
  // 감사 이상(권한 변경·완전삭제) 실시간 경보.
  "security_alert",
];

// 학생용 kinds.
export const STUDENT_KINDS: NotificationKind[] = [
  "qna_new_answer",
  "announcement",
  "student_note_shared",
  "exam_result_reminder",
  "trial_expiry_warning",
  "trial_ended",
  "cohort_upgrade_processed",
  "bug_report_resolved",
  // 강사 → 학생 쪽지 (질문자 프로필 화면에서 발송)
  "staff_message",
  // feat-11 B2-4 — 도서 재입고 알림.
  "book_restock",
  // feat-6-011 — 고객센터 문의 답변 등록 알림(작성자에게).
  "cs_inquiry_answered",
  // 운영자 세그먼트 대량 안내(broadcast).
  "broadcast_message",
  // feat-8-030 dunning — 자동결제 실패 재시도 안내 / 최종 만료.
  "payment_failed",
  "subscription_lapsed",
  // feat-11-008 보완 — 운영자가 개별 발급한 쿠폰(쿠폰함에서 확인).
  "coupon_granted",
  // feat-7-048 — 상담자가 월간 계획을 직접 수정·승인함.
  "study_plan_updated_by_staff",
];

export function isStaffKind(k: NotificationKind): boolean {
  return STAFF_KINDS.includes(k);
}
export function isStudentKind(k: NotificationKind): boolean {
  return STUDENT_KINDS.includes(k);
}
