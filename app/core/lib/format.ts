// 표기 포매터 — 도메인 중립 단일 소스 (feat-11-012 P6-c).
//
// ★고치기 전 증상: 같은 값이 화면마다 다른 모양으로 나왔다. 금액은 어떤 곳은 「29,700원」,
//   어떤 곳은 「29,700」. 시간은 강의실이 **원시 초**(「강의 1200초 · 학습 45초」)를 그대로
//   보여 줬다 — 사람이 읽는 단위가 아니다.
// ★서버·클라이언트 공용 순수 모듈 — `.server` 를 import 하지 않는다.
// ★여기 있는 것은 **도메인 중립 표기**뿐이다. 상태어(주문·수강권)는 그 도메인의 labels 에
//   둔다 — 뜻이 도메인에 매여 있어 여기로 올리면 소유자가 흐려진다.

const KO = "ko-KR";

/** 금액 — 「29,700원」. */
export function won(krw: number): string {
  return `${Math.round(krw).toLocaleString(KO)}원`;
}

/** 금액(단위 없이) — 표 안에서 단위를 열 머리에 뺄 때. */
export function amount(krw: number): string {
  return Math.round(krw).toLocaleString(KO);
}

/**
 * 길이 — 사람이 읽는 단위. 「45초」 「12분」 「1시간 30분」.
 * ★0 이하는 빈 문자열이다(「0분」을 쓰면 「길이 미확인」과 구분이 안 된다).
 */
export function duration(seconds: number): string {
  const s = Math.floor(seconds);
  if (s <= 0) return "";
  if (s < 60) return `${s}초`;
  const totalMin = Math.round(s / 60);
  if (totalMin < 60) return `${totalMin}분`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** 재생 위치 시계 표기 — 「7:05」 「1:02:30」. 길이와 달리 자릿수를 맞춘다. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0
    ? `${h}:${mm}:${String(sec).padStart(2, "0")}`
    : `${mm}:${String(sec).padStart(2, "0")}`;
}

/** 비율 — 「38%」. 0~1 을 받는다. */
export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** 날짜 — 「2026. 9. 14.」. 값이 없으면 빈 문자열. */
export function date(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString(KO, { timeZone: "Asia/Seoul" });
}

/** 날짜+시각 — 「2026. 9. 14. 오후 3:20」. */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleString(KO, {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
