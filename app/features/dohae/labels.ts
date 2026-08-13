// 도해특허법 — 블록 타입(서버·클라 공용). blocks jsonb 의 렌더 계약.
// ★staff 전용 콘텐츠(수험생 비노출) — 노출 게이트는 RLS + api/unit staff 확인.

export interface DohaeCell {
  text: string;
  colSpan: number;
  rowSpan: number;
  /** 셀 안 중첩 표들. */
  tables?: DohaeCell[][][];
  /** 셀 안 이미지 binId (현재 미사용 — 시드에 이미지 미포함). */
  imgs?: string[];
}

export type DohaeBlock =
  | { type: "h"; numeral: string; text: string }
  | { type: "p"; text: string }
  | { type: "table"; cells: DohaeCell[][]; fromShape?: boolean }
  | {
      type: "diagram";
      /** storage 경로(비공개 버킷) — api/unit 이 signedUrl 을 주입해 내려준다. */
      image: string | null;
      signedUrl?: string;
      page?: number;
      texts?: string[];
    }
  | { type: "image"; binIds: string[] };

export interface DohaeUnitSummary {
  unitId: string;
  unitKey: string;
  kind: "topic" | "reference";
  title: string;
  chapterNo: number;
  chapterTitle: string;
  unitNo: number | null;
  refNo: string | null;
}

/** 유닛 표시 라벨 — "34 심사의 진행" / "참고 2.1 …". */
export function dohaeUnitLabel(u: Pick<DohaeUnitSummary, "kind" | "unitNo" | "refNo">): string {
  return u.kind === "topic" ? String(u.unitNo ?? "") : `참고 ${u.refNo ?? ""}`;
}
