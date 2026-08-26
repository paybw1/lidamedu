// 구법 ↔ 현행 조문 매칭표 (원장 요청 2026-08-26).
//
// 전문개정(전부개정)은 조문을 통째로 다시 매긴다. 그래서 "구 특허법 제11조"의 수식어만 떼고
// 현행 제11조로 잇는 것은 **다른 조문을 보여주는 일**이다(statute-label.ts 참조).
// 여기 표에 실린 조문만 현행으로 잇고, 없으면 링크하지 않는다 — 틀린 조문을 펼치는 것보다
// 아무것도 안 펼치는 편이 낫다.
//
// ★근거 없는 항목을 넣지 않는다. 각 항목은 ⓐ 국가법령정보센터에서 받은 **구법 원문의
//   조문제목·본문**과 ⓑ 우리 `articles` DB 의 현행 조문을 대조해 확인한 것만 싣는다.
//   확인 경로를 주석으로 남긴다 — 나중에 사람이 다시 대조할 수 있어야 한다.
//
// 조 단위로만 맞춘다. 항·호는 표기에 그대로 남아 화면에 보인다(대응이 갈리는 경우가 있어
// 조 단위 이상은 표로 단정하지 않는다).

/** 조문을 다시 매긴 전문개정 사건 하나. */
export interface OldLawRenumberEvent {
  /** 표기에 쓰이는 법령명 — "특허법". parseReferenceStatute 가 뽑아 주는 값과 맞춘다. */
  lawName: string;
  /** 전문개정 **공포 연도**. 표기 괄호에서 이 값으로 사건을 특정한다. */
  year: number;
  /** 사람이 읽는 사건 이름 — 화면·로그용. */
  label: string;
  /** 구 조문번호 → 현행 조문번호. 표에 없으면 링크하지 않는다. */
  map: Readonly<Record<string, string>>;
}

/**
 * ★공포번호로 사건을 특정하지 않는다 — 실제 도식 표기에 오타가 있다
 *   ("법률 제42307호" — 자릿수가 하나 많다. 올바른 값은 제4207호).
 *   연도(1990)는 사람이 잘 틀리지 않고, 한 법에 같은 해 전문개정이 둘 있는 일도 없다.
 */
export const OLD_LAW_RENUMBER_EVENTS: readonly OldLawRenumberEvent[] = [
  {
    lawName: "특허법",
    year: 1990,
    label: "특허법 1990. 1. 13. 법률 제4207호 전부개정",
    // 대조한 구법: 시행 1987. 7. 1.(법률 제3891호) — 1990 전부개정 직전 판본.
    //   국가법령정보센터 lawService.do target=law MST=4621. 확인 2026-08-26.
    // 현행 쪽은 우리 articles DB 의 display_label 로 확인했다.
    map: {
      // 구 제8조 [특허출원] → 현행 제42조 [특허출원]
      //   구 ③ "발명의 상세한 설명에는 … 용이하게 실시할 수 있을 정도로 … 기재하여야 한다"
      //   = 현행 제42조 제3항(실시가능요건).
      "8": "42",
      // 구 제11조 [선원주의] → 현행 제36조 [선출원]
      //   구 ① "동일한 발명에 대하여는 최선출원에 한하여 특허를 받을 수 있다".
      "11": "36",
      // 구 제69조 [특허의 무효사유] → 현행 제133조 [특허의 무효심판]
      //   구 ① "특허가 다음 각호의 1에 해당하는 경우에는 심판에 의하여 이를 무효로 하여야 한다".
      "69": "133",
    },
  },
];

/** 표기 괄호에서 전문개정 **연도**를 뽑는다 — "(1990.1.13. 법률 제4207호로 전문 개정…)" → 1990. */
function amendmentYear(raw: string): number | null {
  const m = /\(\s*(\d{4})\s*[.년]/.exec(raw);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isInteger(y) ? y : null;
}

/**
 * 이 표기가 가리키는 전문개정 사건. 표에 없는 사건이면 null —
 * **모르면 링크하지 않는다**가 기본값이다.
 */
export function findRenumberEvent(
  raw: string,
  lawName: string | null,
): OldLawRenumberEvent | null {
  if (!lawName) return null;
  const year = amendmentYear(raw);
  if (year === null) return null;
  return (
    OLD_LAW_RENUMBER_EVENTS.find(
      (e) => e.lawName === lawName && e.year === year,
    ) ?? null
  );
}

/** 구 조문번호 → 현행 조문번호. 표에 없으면 null(= 링크하지 않는다). */
export function mapOldArticleNumber(
  event: OldLawRenumberEvent,
  oldNumber: string,
): string | null {
  return event.map[oldNumber] ?? null;
}
