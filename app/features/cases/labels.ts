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

/**
 * 판례 표준 인용 한 줄. 예: "대법원 전원합의체 2015. 1. 22. 선고 2011후927 판결 【등록무효(특)】".
 * 결측 필드(선고일·번호)는 생략하고 안전 조립. 인용 복사 버튼 + 암기 카드 front 식별자 공용.
 * (클라/서버 공용 — labels.ts 에 둠.)
 */
export function buildCitation(opts: {
  court: CaseCourt;
  decidedAt: string | null;
  caseNumber: string | null;
  caseType: string | null;
  isEnBanc?: boolean;
}): string {
  const parts: string[] = [COURT_LABELS[opts.court] ?? "법원"];
  if (opts.isEnBanc) parts.push("전원합의체");
  const m = (opts.decidedAt ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) parts.push(`${Number(m[1])}. ${Number(m[2])}. ${Number(m[3])}.`, "선고");
  if (opts.caseNumber) parts.push(opts.caseNumber);
  parts.push("판결");
  let s = parts.join(" ");
  if (opts.caseType) s += ` 【${opts.caseType}】`;
  return s.replace(/\s+/g, " ").trim();
}

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
  // 운영자가 admin-case-edit 의 "1차 기출 연도" 컬럼(cases.exam_1st_years) 에 수동
  // 입력한 연도 중, problem_case_links 파생(exam1stProblems) 의 year 집합에 없는
  // 것만. ExamYearChip(round="first") 로 보조 표시 — problem link 없는 historical
  // 기록 또는 누락분을 운영자가 채울 수 있게 한다.
  exam1stExtraYears: number[];
  exam2ndYears: number[];
}

export interface SummaryItem {
  title: string;
  body: string;
  // 항목별 비고 — 같은 인덱스의 summary 소제목/본문에 대한 코멘트. 빈 문자열 또는
  // undefined 면 비고 없음. legacy cases.comment_body_md 의 "N. ..." 단락을
  // 항목별로 풀어낸 것 (자동 마이그레이션). render 측에서는 "N. " 라벨이 자동 부여.
  commentMd?: string;
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
  // 판례 트리에서 이 case 의 현재 placement — case-viewer 좌측 트리 사이드바가
  // 이 위치로 자동 펼침 + 하이라이트. node 가 set 되면 node 우선, 아니면 article.
  primaryArticleId: string | null;
  primaryNodeId: string | null;
  /** 국가법령정보 OPEN API 자동 생성 PDF — Storage 경로. signed URL 발급용. */
  officialTextPdfPath: string | null;
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
