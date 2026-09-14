// 회차 재생 허용량 판정 — 순수 계산부 (feat-11-012 P6-a).
//
// ★고치기 전 증상: 「이 회차를 얼마나 썼고 잠겼는가」의 답이 **세 군데서 따로** 나왔다.
//   ① 강의실 목록  — playback_grants.counts_as_play 를 셌다. 그런데 그 플래그를 true 로
//      넣는 코드가 없어(시간 비례 판정으로 바뀐 뒤 상수 false) **항상 0**이었다. 운영 실측
//      2026-09-14: grant 78건 중 counts_as_play=true 는 0건 — 자물쇠가 한 번도 켜진 적이 없다.
//      그래서 「멀쩡해 보이는 재생을 눌러 들어간 뒤에야 막힌다」가 났다.
//   ② 재생 판정    — watch_ledger 합계(회계 원장). 이쪽이 권위다.
//   ③ 하트비트     — 아무것도 안 봤다(아래 참조).
//
// ★기준 컬럼도 갈라져 있었다 — 목록은 `course_lessons.max_plays`(null → 2로 대체),
//   판정은 `courses.max_plays`(null → 무제한). **기본값이 서로 반대**라, max_plays 를
//   비워 둔 강의는 판정은 무제한인데 목록만 2회로 잠그게 된다. feat-11-008 P6(원장 확정
//   2026-08-07)이 권위를 강의 단위로 정했으므로 `courses.max_plays` 하나만 본다.

/** 회차 하나의 재생 허용량 상태. */
export interface PlayLimit {
  /** 강의에 설정된 최대 재생 횟수. null = 무제한. */
  maxPlays: number | null;
  /** 회차 길이(초). 0 = 길이 미확인. */
  durationSeconds: number;
  /** 원장(watch_ledger) 기준 누적 사용 초 — 관리자 조정·초기화가 반영된 값. */
  usedSeconds: number;
  /** 허용량(초) = maxPlays × 길이. null = 무제한 또는 길이 미확인(fail-open). */
  allowanceSeconds: number | null;
  /** 남은 초. 무제한이면 null. 음수는 0 으로 자른다. */
  remainingSeconds: number | null;
  /** 소진 — 재생을 막고 차감도 멈춰야 하는 상태. */
  exhausted: boolean;
}

/**
 * 허용량 판정 — 재생 시작·강의실 목록·하트비트 차감이 **모두 이 함수를 통과한다.**
 *
 * 차감식은 feat-11-008 P6 그대로다(변경 없음): 허용량 = max_plays × 회차 길이,
 * 사용량 = watch_ledger 합계. 길이를 모르는 회차(0)는 종전대로 fail-open.
 */
export function computePlayLimit(input: {
  maxPlays: number | null;
  durationSeconds: number;
  usedSeconds: number;
}): PlayLimit {
  const { maxPlays, durationSeconds, usedSeconds } = input;
  const unlimited = maxPlays == null || durationSeconds <= 0;
  const allowanceSeconds = unlimited ? null : maxPlays * durationSeconds;
  return {
    maxPlays,
    durationSeconds,
    usedSeconds,
    allowanceSeconds,
    remainingSeconds:
      allowanceSeconds == null ? null : Math.max(0, allowanceSeconds - usedSeconds),
    exhausted: allowanceSeconds != null && usedSeconds >= allowanceSeconds,
  };
}
