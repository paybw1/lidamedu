// 재생이 막힌 사유 → 학생에게 할 말 + 다음 행동 (feat-11-012 P6-b).
//
// ★이 파일은 **서버 전용이 아니다.** 사유 문구·버튼은 강의실 목록(lecture-room)과 재생
//   화면(lecture-watch)이 **같은 말**을 해야 하는데, 종전에는 재생 화면만 사유별 안내를
//   갖고 있었고 강의실은 「수강중이냐 아니냐」 하나로 뭉갰다. 그래서 「멀쩡해 보이는 재생을
//   눌러 들어간 뒤에야 막힌다」가 났다.
// ★판정(playback.server.ts)은 서버 전용이므로 사유 문구를 거기 두면 화면이 import 하는 순간
//   typecheck 는 통과하고 **build 가 깨진다**(메모: build-server-in-client). 그래서 사유
//   타입과 문구를 서버 밖 이 파일에 둔다.

/** 재생 거부 사유 — 서버 판정(playback.server.ts)이 내는 값. */
export type PlaybackDenyReason =
  | "login_required"
  | "no_enrollment"
  | "expired"
  | "paused"
  | "lesson_blocked"
  | "not_published"
  | "no_video"
  | "multiplier_exhausted" // (폐지) 시간 제한 — 잔존 호환용
  | "play_limit_exhausted" // 회차별 재생 허용량 소진
  | "device_not_registered" // M3
  | "session_superseded"; // 다른 기기에서 더 새 로그인 — 단일 세션(feat-11-012 P0)

export interface LockNotice {
  /** 학생에게 보일 한 줄. */
  message: string;
  /** 목록에서 자물쇠 옆에 붙일 짧은 말(버튼 자리가 좁다). */
  short: string;
  /** 스스로 빠져나올 다음 행동. 사용자가 할 수 있는 일이 없으면 null. */
  action: { label: string; to: string } | null;
}

// ★「기기 관리에서 등록해 주세요」는 틀린 안내였다 — 학생용 기기 등록 화면은 없고,
//   빈 슬롯은 재생할 때 자동 등록된다. 학생이 실제로 할 수 있는 일은 **기존 기기 해제**이고
//   그 버튼은 내 강의실의 등록 기기 카드에 있다.
const DEVICE_CARD = "/lecture#devices";
const SUPPORT_NEW = "/lecture/support/new";
const MY_ROOM = "/lecture";

const NOTICE: Record<PlaybackDenyReason, LockNotice> = {
  login_required: {
    message: "로그인 후 시청할 수 있습니다.",
    short: "로그인 필요",
    action: { label: "로그인", to: "/login" },
  },
  no_enrollment: {
    message: "수강권이 없습니다. 수강 신청 후 이용해 주세요.",
    short: "수강권 없음",
    action: { label: "수강신청", to: "/lecture/catalog" },
  },
  expired: {
    message: "수강 기간이 만료되었습니다. 연장은 내 강의실에서 신청할 수 있습니다.",
    short: "기간 만료",
    action: { label: "수강 연장", to: MY_ROOM },
  },
  paused: {
    message:
      "수강권이 일시정지 상태입니다. 정지 종료일이 지나면 자동으로 재개됩니다.",
    short: "일시정지",
    action: { label: "내 강의실", to: MY_ROOM },
  },
  lesson_blocked: {
    message: "이 회차는 재생이 제한되어 있습니다. 고객센터로 문의해 주세요.",
    short: "재생 제한",
    action: { label: "문의하기", to: SUPPORT_NEW },
  },
  not_published: {
    message: "준비 중인 강의입니다.",
    short: "준비 중",
    action: null,
  },
  no_video: {
    message: "영상이 아직 등록되지 않았습니다.",
    short: "영상 없음",
    action: null,
  },
  multiplier_exhausted: {
    message: "시청 가능 시간을 모두 사용했습니다.",
    short: "시간 소진",
    action: { label: "문의하기", to: SUPPORT_NEW },
  },
  play_limit_exhausted: {
    message:
      "이 회차의 재생 가능 시간을 모두 사용했습니다. 추가 시청이 필요하면 고객센터로 문의해 주세요.",
    short: "재생 제한",
    action: { label: "문의하기", to: SUPPORT_NEW },
  },
  device_not_registered: {
    message:
      "등록된 기기 수를 초과했습니다. 내 강의실의 등록 기기에서 쓰지 않는 기기를 해제해 주세요.",
    short: "기기 초과",
    action: { label: "등록 기기 관리", to: DEVICE_CARD },
  },
  session_superseded: {
    message:
      "다른 기기에서 로그인되어 이 기기에서는 재생할 수 없습니다. 다시 로그인해 주세요.",
    short: "다른 기기 로그인",
    action: { label: "다시 로그인", to: "/login" },
  },
};

export function lockNotice(reason: PlaybackDenyReason): LockNotice {
  return NOTICE[reason];
}

/** 문구만 필요한 기존 호출처(API 응답 등) 호환. */
export const PLAYBACK_DENY_MESSAGE: Record<PlaybackDenyReason, string> =
  Object.fromEntries(
    (Object.keys(NOTICE) as PlaybackDenyReason[]).map((k) => [
      k,
      NOTICE[k].message,
    ]),
  ) as Record<PlaybackDenyReason, string>;
