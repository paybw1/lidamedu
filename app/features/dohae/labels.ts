// 도해특허법 — 블록 타입(서버·클라 공용). blocks jsonb 의 렌더 계약.
// ★2026-08-23 학생 공개(유출방지 동반: 워터마크·복사차단·고지·열람로그 — dohae-guard).
//   편집·검수는 계속 staff 전용(viewerIsStaff 게이트 + admin API 역할 확인).

export interface DohaeCell {
  text: string;
  colSpan: number;
  rowSpan: number;
  /** 원본 칸 너비(HWPX hp:cellSz/@width). 렌더에서 열 비율(colgroup)로 환산한다. */
  width?: number;
  /** 원본 칸 배경이 회색(#F0F0F0 등) — 교재가 라벨 칸에만 깐다. */
  shade?: boolean;
  /** 원본 문단 정렬이 가운데. (그 밖은 왼쪽 — 별도 표기 없음) */
  align?: "center";
  /** 칸 **전체**가 굵은 계열(돋움체 Bold 등). ★hh:bold 플래그는 교재가 거의 안 쓴다. */
  bold?: boolean;
  /**
   * 칸 안에서 **일부만** 굵은 구간 `[시작, 끝)` — text 기준 글자 오프셋.
   * 교재는 한 칸 안에서 소제목만 굵게 쓴다(조문 비교표의 조문 제목, t65 「공통점」의 ▪항목).
   */
  boldRanges?: [number, number][];
  /** 셀 안 중첩 표들. */
  tables?: DohaeCell[][][];
  /** 각 속표가 놓이는 자리(text 기준 글자 오프셋). 없으면 글 뒤. */
  tablesAt?: number[];
  /**
   * 조문 비교표에서 한 조문을 항 단위로 쪼갠 행. contRow = 윗 행에서 이어짐,
   * contMore = 아랫 행으로 이어짐. 이어지는 자리의 가로줄을 지워 한 덩어리로 보이게 한다.
   */
  contRow?: boolean;
  contMore?: boolean;
  /** 셀 안 이미지 binId (현재 미사용 — 시드에 이미지 미포함). */
  imgs?: string[];
  /**
   * 이 칸에 도해가 그려져 있다 — 표는 살리고 이 칸만 PDF 에서 잘라 넣는다.
   * (표째 이미지로 바꾸면 하이라이트·포스트잇을 못 붙인다)
   */
  diagram?: boolean;
  /** 크롭 페이지를 고르는 probe — 그 칸 도형 안 글자. */
  diagramTexts?: string[];
  /** 칸 글 안에서 그림이 놓이는 자리(글자 오프셋). 없으면 글 앞. */
  diagramAt?: number;
  /** storage 경로(비공개 버킷) — api/unit 이 signedUrl 을 주입한다. */
  image?: string | null;
  signedUrl?: string;
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
  /** 책 쪽수 — 목록 정렬의 기준(주제·참고자료가 원본 순서대로 섞인다). */
  pdfPage: number | null;
}

/** 유닛 표시 라벨 — "34 심사의 진행" / "참고 2.1 …". */
export function dohaeUnitLabel(u: Pick<DohaeUnitSummary, "kind" | "unitNo" | "refNo">): string {
  return u.kind === "topic" ? String(u.unitNo ?? "") : `참고 ${u.refNo ?? ""}`;
}

/** 도해특허법 = 특허법 단행본. 다른 과목 도해가 생기면 유닛의 book_code 로 갈라야 한다. */
export const DOHAE_LAW_CODE = "patent";

/**
 * 도해 항목 진입 — 체계도 노드 뷰어에서 그 유닛 팝업을 연다.
 * ★노드 연결이 없는 유닛(94 중 1)은 과목 허브로. 링크를 빼면 개수 배지와 어긋난다.
 */
export function dohaeUnitHref(nodeId: string | null, unitId: string): string {
  return nodeId
    ? `/subjects/${DOHAE_LAW_CODE}/systematic/${nodeId}?dohae=${unitId}`
    : `/subjects/${DOHAE_LAW_CODE}`;
}

/**
 * 유닛 본문(blocks)에서 글자만 뽑는다 — 검색 결과 스니펫용.
 * 표 칸·속표까지 훑되 구조 키(type·numeral 등)는 건드리지 않는다.
 */
export function dohaeBlocksText(blocks: DohaeBlock[]): string[] {
  const out: string[] = [];
  const pushCells = (cells: DohaeCell[][]) => {
    for (const row of cells) {
      for (const cell of row) {
        if (cell.text) out.push(cell.text);
        for (const nested of cell.tables ?? []) pushCells(nested);
      }
    }
  };
  for (const b of blocks) {
    if (b.type === "h" || b.type === "p") out.push(b.text);
    else if (b.type === "table") pushCells(b.cells);
  }
  return out;
}
