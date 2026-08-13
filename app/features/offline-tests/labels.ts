// feat-7-042 — 오프라인 테스트 공용 타입·라벨. 클라이언트/서버 양쪽 import 가능.
// (컴포넌트가 쓰는 값·타입은 *.server.ts 에 두면 클라이언트 번들 위반 — 여기로 분리.)

import {
  SCIENCE_SUBJECTS,
  normalizeScienceSlug,
  type ScienceSubjectSlug,
} from "~/features/subjects/lib/science";
import {
  LAW_SUBJECTS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

export type OfflineQuestionType = "mcq" | "ox" | "blank";

// Phase 1 T2 — 배포 게이트. draft(학생 비노출·편집 가능) / published(노출·문항 잠금·결과 입력)
// / closed(결과 열람만). 학생 RLS 는 화이트리스트('published','closed').
export type OfflineTestStatus = "draft" | "published" | "closed";

export const OFFLINE_TEST_STATUS_LABEL: Record<OfflineTestStatus, string> = {
  draft: "초안",
  published: "배포됨",
  closed: "마감",
};

export const OFFLINE_QUESTION_TYPE_LABEL: Record<OfflineQuestionType, string> = {
  mcq: "객관식",
  ox: "OX",
  blank: "빈칸",
};

// 과목 = 법률(law_code) XOR 자연과학(science_subject). DB check 가 강제.
export interface OfflineTestSubject {
  lawCode: LawSubjectSlug | null;
  scienceSubject: ScienceSubjectSlug | null;
}

export function offlineTestSubjectName(s: OfflineTestSubject): string {
  if (s.lawCode) return LAW_SUBJECTS[s.lawCode]?.name ?? s.lawCode;
  if (s.scienceSubject) return SCIENCE_SUBJECTS[s.scienceSubject]?.name ?? s.scienceSubject;
  return "—";
}

// 과목 select 단일 값 ↔ 컬럼 쌍 변환 — "patent" | "science:physics".
export function parseOfflineTestSubject(raw: string): OfflineTestSubject | null {
  if (raw.startsWith("science:")) {
    const slug = normalizeScienceSlug(raw.slice("science:".length));
    return slug ? { lawCode: null, scienceSubject: slug } : null;
  }
  return Object.prototype.hasOwnProperty.call(LAW_SUBJECTS, raw)
    ? { lawCode: raw as LawSubjectSlug, scienceSubject: null }
    : null;
}

export function offlineTestSubjectValue(s: OfflineTestSubject): string {
  return s.lawCode ?? `science:${s.scienceSubject}`;
}

export interface OfflineTestSummary extends OfflineTestSubject {
  testId: string;
  assignmentId: string;
  cohortId: string;
  title: string;
  status: OfflineTestStatus;
  durationMin: number | null;
  questionCount: number;
  totalPoints: number;
  resultCount: number;
  createdAt: string;
}

export interface OfflineTestQuestion {
  questionId: string;
  ord: number;
  points: number;
  questionType: OfflineQuestionType;
  problemId: string | null;
  oxRefType: "choice" | "box" | null;
  oxRefId: string | null;
  oxProblemId: string | null;
  blankSetId: string | null;
  // 표시용
  label: string;
  sub: string | null;
}

export interface OfflineTestDetail extends OfflineTestSubject {
  testId: string;
  assignmentId: string;
  cohortId: string;
  title: string;
  status: OfflineTestStatus;
  durationMin: number | null;
  instructionsMd: string | null;
  // feat-7-044 — 시리즈(주간 테스트 묶음) 소속.
  seriesId: string | null;
  seriesRoundNo: number | null;
  questions: OfflineTestQuestion[];
}

export interface OfflineQuestionRef {
  questionType: OfflineQuestionType;
  problemId?: string;
  oxRefType?: "choice" | "box";
  oxRefId?: string;
  oxProblemId?: string;
  blankSetId?: string;
}

export interface McqCandidate {
  problemId: string;
  snippet: string;
  year: number | null;
  problemNumber: number | null;
  importance: number;
  format: string;
}

export interface OxCandidate {
  refType: "choice" | "box";
  refId: string;
  problemId: string;
  snippet: string;
  oxTruth: "O" | "X";
  year: number | null;
  importance: number;
}

export interface BlankCandidate {
  setId: string;
  articleLabel: string;
  displayName: string | null;
  blanksCount: number;
  articleImportance: number;
}

export interface CohortOfflineTestStat extends OfflineTestSubject {
  testId: string;
  assignmentId: string;
  title: string;
  createdAt: string;
  takenCount: number;
  absentCount: number;
  maxScore: number | null;
  avgScore: number | null;
  avgPct: number | null;
  topScore: number | null;
  bottomScore: number | null;
}
