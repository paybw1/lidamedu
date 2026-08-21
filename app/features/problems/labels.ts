// 클라이언트·서버 공용 타입/라벨.
import type { Database } from "database.types";

import type { BookmarkRecord } from "~/features/annotations/labels";
import type { ContentComment } from "~/features/comments/queries.server";

export type ProblemExamRound =
  Database["public"]["Enums"]["problem_exam_round"];
export type ProblemFormat = Database["public"]["Enums"]["problem_format"];
export type ProblemOrigin = Database["public"]["Enums"]["problem_origin"];
export type ProblemPolarity = Database["public"]["Enums"]["problem_polarity"];
export type ProblemScope = Database["public"]["Enums"]["problem_scope"];
export type ProblemReviewStatus =
  Database["public"]["Enums"]["problem_review_status"];
export type ProblemChoiceType =
  Database["public"]["Enums"]["problem_choice_type"];
export type OxTruth = Database["public"]["Enums"]["ox_truth"];
export type SubjectiveKind = Database["public"]["Enums"]["subjective_kind"];

export const SUBJECTIVE_KIND_LABEL: Record<SubjectiveKind, string> = {
  case_based: "사례형",
  theory: "논점형",
  mixed: "혼합형",
};

// 채점기준 한 항목 — feat-4-A-322.
export interface RubricItem {
  label: string;
  points: number;
}

export function parseRubricItems(raw: unknown): RubricItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: RubricItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const label = (r as Record<string, unknown>).label;
    const points = (r as Record<string, unknown>).points;
    if (typeof label !== "string" || typeof points !== "number") continue;
    out.push({ label, points });
  }
  return out.length > 0 ? out : null;
}

// OX 지문 — 조문 viewer 우측 패널/서브젝트 OX 풀이용.
// queries.server.ts 의 fetcher 가 반환하는 데이터 형태 (route loader → 컴포넌트 prop 으로 전달).
// 타입을 labels.ts (non-server) 에 두어 RR vite plugin 이 component → loader 타입 추적 시
// `.server.ts` 의존을 만들지 않게 한다.
export interface OxQuestionItem {
  refType: "choice" | "box";
  refId: string;
  problemId: string;
  bodyMd: string;
  oxTruth: OxTruth;
  explanationMd: string | null;
  year: number | null;
  problemNumber: number | null;
  origin: string;
  // feat-4-A-343 — 표시 dedup 대표 선정용(승인>초안) + "여러 회차 출제" 배지(대표에만).
  reviewStatus?: ProblemReviewStatus;
  dupCount?: number;
  // 스태프 수동 숨김 여부 — 학생 쿼리는 숨김 제외, 스태프 패널만 숨김 표시+복원.
  oxHidden?: boolean;
}

// 지문(선지/박스)이 정오문제로 학습 가능한지 — 정오문제 패널 노출 조건과 동일 SSOT
// (ox_truth 가 분류돼 있고 ox_ineligible 이 아님). 이걸 만족해야 정오문제 즐겨찾기
// (problem_choice/problem_box_item 타깃)로 연결된다. 미충족 = 정오문제 학습 불가.
export function isOxEligible(
  oxTruth: OxTruth | null,
  oxIneligible: boolean | null,
): boolean {
  return oxTruth != null && oxIneligible !== true;
}

// ★전항 정답 = "정답 없음" (사용자 결정 2026-08-15, 특허·상표·디자인 공통 규칙)
//   출제 오류로 모든 지문이 정답 처리된 기출이 실재한다(예: 특허 2019년 17번,
//   상표 2009년 1번). 데이터 오류가 아니므로 정정하지 않고, 학생 화면에는
//   "정답 5번" 대신 "정답 없음(전항 정답 처리)"으로 표기한다.
export function isAllChoicesCorrect(
  choices: ReadonlyArray<{ isCorrect: boolean }>,
): boolean {
  return choices.length > 0 && choices.every((c) => c.isCorrect);
}

/** 정답 표기 문자열 — 전항 정답이면 "정답 없음", 아니면 "정답 N번". */
export function answerLabelOf(
  choices: ReadonlyArray<{ isCorrect: boolean; choiceIndex: number }>,
): string {
  if (isAllChoicesCorrect(choices)) return "정답 없음 (전항 정답 처리)";
  const idx = choices.filter((c) => c.isCorrect).map((c) => c.choiceIndex);
  return idx.length > 0 ? `정답 ${idx.join(", ")}번` : "";
}

export interface OxRefAnnotations {
  // 정오문제 = 지문 전체 대상 → 코멘트(content_comments). 포스트잇(문구 앵커) 아님.
  comments: ContentComment[];
  bookmark: BookmarkRecord | null;
  // 학생 개인 숨김(user_ox_hidden). staff 전체 숨김(OxQuestionItem.oxHidden)과 별개 —
  // 본인만 해당 지문을 안 보이게 하는 개인 설정.
  userHidden: boolean;
}

export const FORMAT_LABEL: Record<ProblemFormat, string> = {
  mc_short: "단답형",
  mc_box: "박스형",
  mc_case: "사례형",
  ox: "정오문제",
  blank: "빈칸",
  subjective: "주관식",
};

// 객관식 형식 — 객관식 1차 기출 판정(feat-8-024) 등에 사용.
export const MC_FORMATS: readonly ProblemFormat[] = [
  "mc_short",
  "mc_box",
  "mc_case",
];

export const ORIGIN_LABEL: Record<ProblemOrigin, string> = {
  past_exam: "기출",
  past_exam_variant: "기출변형",
  expected: "예상문제",
  mock: "모의고사",
  ai_draft: "AI 초안",
};

export const POLARITY_LABEL: Record<ProblemPolarity, string> = {
  positive: "긍정형",
  negative: "부정형",
};

export const SCOPE_LABEL: Record<ProblemScope, string> = {
  unit: "단원",
  comprehensive: "종합",
};

// ── 객관식 목록 컬럼 정렬 (학습과목 문제 탭) ──────────────────────────────
// 컬럼(색인 기준) 헤더 클릭 → 그 기준으로 오름/내림 정렬. 클라(헤더 UI)·서버(정렬
// 로직) 공용이라 여기(라벨 모듈)에 둔다. loader.server 의 ProblemSort = ProblemSortKey.
export type ProblemSortKey =
  | "overall" // 체계도 전체 순번(노드 트리 순 — 배치 따라 동적)
  | "number" // 문항 번호(노드별/워크북)
  | "year" // 연도/회차
  | "accuracy" // 전체 정답률(난이도)
  | "importance" // 강사 중요도(★)
  | "origin" // 출처
  | "format" // 유형
  | "polarity" // 극성
  | "scope"; // 단원/종합
export type ProblemSortDir = "asc" | "desc";

export const PROBLEM_SORT_KEYS: readonly ProblemSortKey[] = [
  "overall",
  "number",
  "year",
  "accuracy",
  "importance",
  "origin",
  "format",
  "polarity",
  "scope",
];

// 컬럼별 "처음 누를 때" 기본 방향. 번호·출처류는 오름차순, 연도·중요도는 내림차순,
// 난이도(정답률)는 오름차순(=어려운 것 먼저)이 학습상 유용.
export const PROBLEM_SORT_DEFAULT_DIR: Record<ProblemSortKey, ProblemSortDir> = {
  overall: "asc",
  number: "asc",
  year: "desc",
  accuracy: "asc",
  importance: "desc",
  origin: "asc",
  format: "asc",
  polarity: "asc",
  scope: "asc",
};

// 범주형 컬럼 정렬용 순서(작을수록 앞). 기출/기출변형은 한 묶음(동일 순위).
export const ORIGIN_SORT_ORDER: Record<ProblemOrigin, number> = {
  past_exam: 0,
  past_exam_variant: 0,
  mock: 1,
  expected: 2,
  ai_draft: 3,
};
export const FORMAT_SORT_ORDER: Record<ProblemFormat, number> = {
  mc_short: 0,
  mc_box: 1,
  mc_case: 2,
  ox: 3,
  blank: 4,
  subjective: 5,
};
export const POLARITY_SORT_ORDER: Record<ProblemPolarity, number> = {
  positive: 0,
  negative: 1,
};
export const SCOPE_SORT_ORDER: Record<ProblemScope, number> = {
  unit: 0,
  comprehensive: 1,
};

export const CHOICE_TYPE_LABEL: Record<ProblemChoiceType, string> = {
  statute: "조문",
  precedent: "판례",
  theory: "이론",
};

export const CHOICE_TYPE_COLOR: Record<ProblemChoiceType, string> = {
  statute: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  precedent:
    "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  theory:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
};

// 출처 중 연도/회차 가 의미있는 것 — 기출/기출변형/모의고사. 예상문제·AI 초안은 회차 없음.
export const ORIGIN_HAS_ROUND: Record<ProblemOrigin, boolean> = {
  past_exam: true,
  past_exam_variant: true,
  mock: true,
  expected: false,
  ai_draft: false,
};

// 화면 표시·인접(prev/next) 번호 SSOT. 기출/변형은 실제 시험 문항번호(examNumber)를,
//   그 외(예상·모의·초안)는 노드 순번(problemNumber)을 쓴다. examNumber 미매칭이면
//   problemNumber 로 폴백(과거 데이터 안전). Q&A 타겟 라벨과 동일 규칙.
export function problemDisplayNumber(
  origin: ProblemOrigin,
  examNumber: number | null | undefined,
  problemNumber: number | null,
): number | null {
  const isPast = origin === "past_exam" || origin === "past_exam_variant";
  return isPast ? (examNumber ?? problemNumber) : problemNumber;
}

export interface ProblemListItem {
  problemId: string;
  examRound: ProblemExamRound;
  format: ProblemFormat;
  origin: ProblemOrigin;
  polarity: ProblemPolarity | null;
  scope: ProblemScope | null;
  year: number | null;
  examRoundNo: number | null;
  problemNumber: number | null;
  // 실제 시험 문항번호(기출/변형만). problemNumber(노드 순번)와 별개 축 — 표시·정렬은
  //   기출이면 이 값을 우선(problemDisplayNumber). 미설정(미매칭)이면 null.
  examNumber?: number | null;
  // 전역 고유 표시번호(불변, "P-{n}"). listProblemsBySubject 에서 채움(그 외 미설정 가능).
  displayNo?: number | null;
  // 체계도 전체 순번(노드 트리 순 → 노드 내 기본순). 학습과목 허브 로더에서만 채움(그 외 미설정).
  // 배치(primary 노드)가 바뀌면 매 로드마다 재계산되는 파생값.
  overallNo?: number | null;
  bodyMd: string;
  primaryArticleId: string | null;
  primaryArticleNumber: string | null;
  primaryArticleLabel: string | null;
  unclassifiedChoices: number;
  reviewedAt: string | null;
  // 문제-해설 불일치 등으로 운영자가 "재검토 필요" 표시한 시각.
  mismatchFlaggedAt: string | null;
  explanationMd: string | null;
  // 주관식 (format='subjective') 모범답안 + 채점기준 (feat-4-A-322). null = 미등록.
  modelAnswerMd: string | null;
  gradingRubricMd: string | null;
  // 강사 풀이 동영상 URL (feat-4-A-315). null = 미등록.
  videoUrl: string | null;
  // 주관식 분류 (feat-4-A-321). format='subjective' 에서만 의미.
  subjectiveKind: SubjectiveKind | null;
  subjectiveKeywords: string[] | null;
  subjectiveTopic: string | null;
  // 채점기준 구조화 (feat-4-A-322) — [{label, points}].
  rubricItems: RubricItem[] | null;
  // 채점기준·모범답안이 강사 해설 없이 AI 생성된 경우(배지 표시·비교분석용). null = 강사 해설 기반.
  rubricAiGeneratedAt: string | null;
  // 운영자가 채점기준·모범답안을 심층 검수 완료한 시각. null = 미검수.
  rubricReviewedAt: string | null;
  // 종합/지문/박스 해설 어딘가에 마크다운 표가 있는지.
  hasTable: boolean;
  // 종합/지문/박스 해설 어딘가에 이미지가 있는지.
  hasImage: boolean;
  // 강사·운영자 중요도 0~3 (feat-8-025). 0=미평가.
  importance: number;
}

// 주관식 모범답안 인용 판례 배지(설문별) — problem-viewer 관련판례 카드.
export interface AnswerCitedCase {
  caseId: string;
  caseNumber: string;
  // 팝업 제목의 법원명 — 특허법원·고등법원 판결을 "대법원"으로 오표기하지 않도록 실값을 싣는다.
  court: Database["public"]["Enums"]["case_court"];
  // 판결요지 쟁점 단위(제목 박스 + 내용). 다중 쟁점은 [1] [2] 재번호.
  items: Array<{ title: string; body: string }>;
  subjectSlug: string;
  // 메인 판례(problems.main_case_number 지정) — 그룹 내 맨 앞 정렬 + ★ 강조.
  isMain?: boolean;
  // 목록 미수록(cases.list_visible=false) — 팝업은 열리되 [공부하러 가기]를 감춘다.
  listVisible?: boolean;
}
export interface AnswerCaseGroup {
  label: string; // "설문(1)" | "공통"
  cases: AnswerCitedCase[];
}

// 객관식 선지/박스 해설 텍스트에서 추출한 인용 판례 배지(팝업 미리보기용).
export interface ChoiceCaseRef {
  caseId: string;
  caseNumber: string;
  subjectSlug: string;
}

// 주관식(2차) 표시 순서 — 시험 최신순(연도↓·회차↓) + 문제번호↑.
// 주관식 탭(groupByYear)과 문제 뷰어 prev/next(?list=1)가 공유해 순서 정합 보장.
export function compareSubjectiveDisplay(
  a: Pick<ProblemListItem, "year" | "examRoundNo" | "problemNumber">,
  b: Pick<ProblemListItem, "year" | "examRoundNo" | "problemNumber">,
): number {
  return (
    (b.year ?? -1) - (a.year ?? -1) ||
    (b.examRoundNo ?? -1) - (a.examRoundNo ?? -1) ||
    (a.problemNumber ?? Number.MAX_SAFE_INTEGER) -
      (b.problemNumber ?? Number.MAX_SAFE_INTEGER)
  );
}

export interface ProblemChoice {
  choiceId: string;
  choiceIndex: number;
  bodyMd: string;
  isCorrect: boolean;
  explanationMd: string | null;
  choiceType: ProblemChoiceType | null;
  relatedArticleId: string | null;
  relatedArticleNumber: string | null;
  relatedCaseId: string | null;
  relatedCaseNumber: string | null;
  // feat-4-A-342 — 지문 체계도 소분류(getProblemById 에서만 채움, 그 외 loader 는 undefined).
  relatedNodeId?: string | null;
  oxIneligible: boolean;
  oxTruth: OxTruth | null;
}

export interface ProblemBoxItem {
  boxItemId: string;
  positionIndex: number;
  marker: string;
  bodyMd: string;
  explanationMd: string | null;
  choiceType: ProblemChoiceType | null;
  relatedArticleId: string | null;
  relatedArticleNumber: string | null;
  relatedCaseId: string | null;
  relatedCaseNumber: string | null;
  // feat-4-A-342 — 보기항목 체계도 소분류.
  relatedNodeId?: string | null;
  oxIneligible: boolean;
  oxTruth: OxTruth | null;
}

export interface ProblemDetail extends ProblemListItem {
  /** 전역 고유 표시번호(불변). 코드 표기 "P-{displayNo}". */
  displayNo: number;
  choices: ProblemChoice[];
  boxItems: ProblemBoxItem[];
  /** 주관식 관련판례 메인 지정(사건번호) — null=미지정. */
  mainCaseNumber: string | null;
  /** 배점(주관식). 시험 모드 기본 제한시간 산출에 쓴다. null=미설정. */
  totalPoints: number | null;
}

// ── 운영자 기출문제 판례 매칭 (feat-8-024) ──────────────────────────────
// /admin/relations/exam-cases 화면 타입. 클라이언트 컴포넌트
// (exam-case-row.tsx) 가 import 하므로 .server.ts 가 아닌 여기에 둔다.

// 기출문제 지문 한 조각 — 선택지 또는 박스 항목.
export interface ExamCaseSegment {
  /** problem_choices.choice_id 또는 problem_box_items.box_item_id. */
  segmentId: string;
  /** 'choice' = 선택지, 'box' = 박스 항목. 해설 편집 시 대상 테이블 분기. */
  segmentKind: "choice" | "box";
  /** 표시 라벨 — 선택지는 번호("1"…), 박스 항목은 marker("ㄱ"…). */
  label: string;
  bodyMd: string;
  /** 해설 (markdown). 인라인 해설 편집기의 초기값. */
  explanationMd: string | null;
  choiceType: ProblemChoiceType | null;
  /** 지문에 입력된 판례 인용문 (자동 스캔이 읽는 필드). 없으면 null. */
  relatedCaseNumber: string | null;
}

// 한 기출문제에 연결된 판례 1건.
export interface ExamCaseLink {
  linkId: string;
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  /** 자동 스캔으로 생성된 링크인지 (note='exam-scan'). false = 수동 매칭. */
  isAuto: boolean;
}

// 매칭 화면의 한 행 — 1차 객관식 기출문제 1개 + 전체 지문 + 연결 판례.
export interface ExamCaseLinkRow {
  problemId: string;
  year: number | null;
  problemNumber: number | null;
  lawCode: string;
  format: ProblemFormat;
  /** 문제 발문 (markdown). 빈 문자열일 수 있음. */
  bodyMd: string;
  /** 박스형 지문 항목 (mc_box). 없으면 빈 배열. */
  boxItems: ExamCaseSegment[];
  /** 선택지. */
  choices: ExamCaseSegment[];
  links: ExamCaseLink[];
}

// 한 판례가 출제된 1차 객관식 기출문제 참조 (feat-8-024).
// case-viewer 헤더 칩 + 판례 목록 1차 칩 → ExamProblemChip 으로 해당 문제 뷰어 이동.
export interface ExamProblemRef {
  problemId: string;
  year: number | null;
  problemNumber: number | null;
  lawCode: string;
  // 변형 기출(past_exam_variant) — 그 연도 기출에서 유래한 변형 문제. 연도 칩은 동일하게
  // 표시하되(기출 연도 사실은 참) 툴팁으로 구분. 같은 연도에 원본 기출이 있으면 그쪽 우선.
  isVariant?: boolean;
}
