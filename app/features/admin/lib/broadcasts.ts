// 대량 메시징(broadcast) 세그먼트 정의 SSOT — 클라이언트(화면)와 서버(broadcasts.server) 공유.
// *.server.ts 가 아니어야 화면 컴포넌트에서 값(BROADCAST_SEGMENTS)을 import 가능
// (server 모듈은 adminClient 를 끌어와 클라이언트 번들에 포함될 수 없음).

export type BroadcastSegmentKey =
  | "trial_expiring"
  | "trial_followup"
  | "unapproved"
  | "all_students";

export type BroadcastChannel = "in_app" | "email";

export const BROADCAST_SEGMENTS: {
  key: BroadcastSegmentKey;
  label: string;
  desc: string;
}[] = [
  {
    key: "trial_expiring",
    label: "체험 만료 임박",
    desc: "무료 체험이 곧 끝나는 미전환 학생 (전환 유도)",
  },
  {
    key: "trial_followup",
    label: "체험 만료 미전환",
    desc: "최근 체험이 끝났으나 전환하지 않은 학생 (팔로업)",
  },
  {
    key: "unapproved",
    label: "이용 승인 대기",
    desc: "가입 후 이용 승인이 나지 않은 학생",
  },
  {
    key: "all_students",
    label: "전체 학생",
    desc: "모든 수험생 계정 (공지·안내)",
  },
];

export function broadcastSegmentLabel(key: BroadcastSegmentKey): string {
  return BROADCAST_SEGMENTS.find((s) => s.key === key)?.label ?? key;
}
