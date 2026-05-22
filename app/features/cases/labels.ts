// 클라이언트·서버 공용 라벨/타입. queries.server.ts 와 분리해 클라이언트 번들에 import 가능.
import type { Database } from "database.types";

import type { ExamProblemRef } from "~/features/problems/labels";

export type CaseCourt = Database["public"]["Enums"]["case_court"];

export const COURT_LABELS: Record<CaseCourt, string> = {
  supreme: "대법원",
  patent_court: "특허법원",
  high_court: "고등법원",
  district_court: "지방법원",
};

export interface CaseListItem {
  caseId: string;
  court: CaseCourt;
  decidedAt: string;
  caseNumber: string;
  caseTitle: string;
  // 판례 닉네임 — 중요 판례의 통칭(예: 수지상 세포 사건). 선택. 사건명 앞에 표시.
  nickname: string | null;
  caseType: string | null;
  isEnBanc: boolean;
  importance: number;
  summaryTitle: string | null;
  // 복수 요지(summary_items)의 [1] 제목 — list 화면 사건명 컬럼에서 우선 표시.
  // summary_items 가 비었으면 null. legacy summary_title 보다 우선.
  summaryFirstTitle: string | null;
  subjectLaws: string[];
  // feat-8-024: 이 판례가 출제된 1차 객관식 기출문제 — 목록에서 ExamProblemChip 으로 표시.
  exam1stProblems: ExamProblemRef[];
  exam2ndYears: number[];
}

export interface SummaryItem {
  title: string;
  body: string;
}

// feat-7-005 후속: 판례 본문 이미지(상표법 다수, 특허법 일부).
// position 별로 그룹화해 본문 섹션 뒤에 그리드로 렌더. storagePath 는 storage 객체 경로
// (삭제 시 사용), url 은 public URL.
// "related" — 관련자료 (그림·표·도면 등 본문 보조 자료) 영역. related_md 본문과 함께.
export type CaseImagePosition =
  | "summary"
  | "reasoning"
  | "comment"
  | "related"
  | "pending";

export const CASE_IMAGE_POSITIONS: readonly CaseImagePosition[] = [
  "summary",
  "reasoning",
  "comment",
  "related",
  "pending",
] as const;

export const CASE_IMAGE_POSITION_LABELS: Record<CaseImagePosition, string> = {
  summary: "판결요지",
  reasoning: "판시이유",
  comment: "비고",
  related: "관련자료",
  pending: "미분류",
};

export interface CaseImage {
  id: string;
  url: string;
  storagePath: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  alt: string;
  position: CaseImagePosition;
  sortOrder: number;
}

// cases.images jsonb → CaseImage[]. position/sortOrder 별로 안정 정렬.
// 잘못된 항목(필수 필드 결손)은 silently skip — staff 가 admin UI 에서 정정.
// labels.ts(클라이언트·서버 공용) 에 두는 이유: admin-case-edit 의 클라이언트 컴포넌트에서도
// 직접 호출 — queries.server.ts 에 두면 server-only 모듈이 클라이언트 번들에 새는 위반.
export function parseCaseImages(raw: unknown): CaseImage[] {
  if (!Array.isArray(raw)) return [];
  const out: CaseImage[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.url !== "string") continue;
    if (typeof o.storagePath !== "string") continue;
    const position: CaseImagePosition = (
      CASE_IMAGE_POSITIONS as readonly string[]
    ).includes(o.position as string)
      ? (o.position as CaseImagePosition)
      : "pending";
    out.push({
      id: o.id,
      url: o.url,
      storagePath: o.storagePath,
      mimeType: typeof o.mimeType === "string" ? o.mimeType : "image/jpeg",
      width: typeof o.width === "number" ? o.width : null,
      height: typeof o.height === "number" ? o.height : null,
      alt: typeof o.alt === "string" ? o.alt : "",
      position,
      sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : 0,
    });
  }
  out.sort((a, b) => {
    const pa = CASE_IMAGE_POSITIONS.indexOf(a.position);
    const pb = CASE_IMAGE_POSITIONS.indexOf(b.position);
    if (pa !== pb) return pa - pb;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id.localeCompare(b.id);
  });
  return out;
}

export interface CaseDetail extends CaseListItem {
  summaryBodyMd: string | null;
  summaryItems: SummaryItem[];
  reasoningMd: string | null;
  fullTextPdf: string | null;
  commentSource: string | null;
  commentBodyMd: string | null;
  // feat-7-005 후속: 관련자료 본문 (그림·표 설명). 그림 자체는 images[position=related].
  relatedMd: string | null;
  images: CaseImage[];
}

// feat-4-A-214 관련논문/기사 링크.
export type CaseReferenceKind = "paper" | "article" | "other";

export interface CaseReference {
  referenceId: string;
  caseId: string;
  kind: CaseReferenceKind;
  title: string;
  authors: string | null;
  source: string | null;
  publishedAt: string | null; // YYYY-MM-DD
  url: string | null;
  pdfUrl: string | null;
  note: string | null;
  ord: number;
  createdAt: string;
  updatedAt: string;
}
