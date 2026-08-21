// feat-7-048 — 학습 시간의 '과목' 축. 클라이언트/서버 공용(서버 전용 값 금지).
//
// 계획 항목·학습 기록에 (subject_kind, subject_code) 로 붙는다. 법과목은 노드에서
// 파생할 수 있지만 자연과학·기타는 근거가 없어 직접 고른다. NULL = 미분류.
import {
  LAW_SUBJECTS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";
import {
  SCIENCE_SUBJECTS,
  type ScienceSubjectSlug,
} from "~/features/subjects/lib/science";

export type SubjectAxisKind = "law" | "science" | "other";

export interface SubjectRef {
  kind: SubjectAxisKind;
  code: string;
}

export const OTHER_SUBJECT_CODE = "other";

/** 팔레트 — hex 를 저장하지 않는다(다크 모드 정합). 키만 저장하고 클래스로 렌더. */
export const SUBJECT_COLOR_KEYS = [
  "sky",
  "emerald",
  "violet",
  "amber",
  "rose",
  "teal",
  "orange",
  "slate",
] as const;
export type SubjectColorKey = (typeof SUBJECT_COLOR_KEYS)[number];

/** 아무 설정도 안 한 학생도 색이 나오도록 고정 기본값을 둔다. */
const DEFAULT_COLOR: Record<string, SubjectColorKey> = {
  "law:patent": "sky",
  "law:trademark": "emerald",
  "law:design": "violet",
  "law:civil": "amber",
  "law:civil-procedure": "amber",
  "science:physics": "rose",
  "science:chemistry": "teal",
  "science:biology": "orange",
  "science:earth_science": "slate",
  "other:other": "slate",
};

export const UNCLASSIFIED_COLOR: SubjectColorKey = "slate";

export function subjectKey(kind: string, code: string): string {
  return `${kind}:${code}`;
}

export function defaultColorFor(kind: string, code: string): SubjectColorKey {
  return DEFAULT_COLOR[subjectKey(kind, code)] ?? UNCLASSIFIED_COLOR;
}

/** 팔레트 키 → Tailwind 클래스. 인라인 hex 금지 규칙을 이 맵 하나로 지킨다. */
export const SUBJECT_COLOR_CLASS: Record<
  SubjectColorKey,
  { fill: string; chip: string; dot: string; label: string }
> = {
  sky: {
    fill: "bg-sky-500",
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
    label: "하늘",
  },
  emerald: {
    fill: "bg-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    label: "초록",
  },
  violet: {
    fill: "bg-violet-500",
    chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500",
    label: "보라",
  },
  amber: {
    fill: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    label: "노랑",
  },
  rose: {
    fill: "bg-rose-500",
    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
    label: "빨강",
  },
  teal: {
    fill: "bg-teal-500",
    chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
    dot: "bg-teal-500",
    label: "청록",
  },
  orange: {
    fill: "bg-orange-500",
    chip: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
    dot: "bg-orange-500",
    label: "주황",
  },
  slate: {
    fill: "bg-slate-400",
    chip: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    dot: "bg-slate-400",
    label: "회색",
  },
};

/** 과목 표시명. 미분류(null)는 "미분류". */
export function subjectName(kind: string | null, code: string | null): string {
  if (!kind || !code) return "미분류";
  if (kind === "law") {
    return LAW_SUBJECTS[code as LawSubjectSlug]?.name ?? code;
  }
  if (kind === "science") {
    return SCIENCE_SUBJECTS[code as ScienceSubjectSlug]?.name ?? code;
  }
  return "기타";
}

/** 선택 목록 — 반 차수와 무관하게 학습 기록은 전 과목을 허용한다. */
export function subjectOptions(): Array<SubjectRef & { name: string }> {
  return [
    ...(Object.keys(LAW_SUBJECTS) as LawSubjectSlug[]).map((c) => ({
      kind: "law" as const,
      code: c,
      name: LAW_SUBJECTS[c].name,
    })),
    ...(Object.keys(SCIENCE_SUBJECTS) as ScienceSubjectSlug[]).map((c) => ({
      kind: "science" as const,
      code: c,
      name: SCIENCE_SUBJECTS[c].name,
    })),
    { kind: "other" as const, code: OTHER_SUBJECT_CODE, name: "기타" },
  ];
}

export function isValidSubject(kind: string, code: string): boolean {
  return subjectOptions().some((o) => o.kind === kind && o.code === code);
}

// ── 공부 통계 히트맵 채도 구간 (분) ─────────────────────────────────────────
// 매직 넘버 금지 — 학생·상담 화면이 같은 경계를 쓴다.
export const STUDY_HEATMAP_STEPS = [60, 180, 300, 480] as const;

/** 그날 총 분 → 0(없음)~4(최상) 단계. */
export function heatLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (minutes < STUDY_HEATMAP_STEPS[0]) return 1;
  if (minutes < STUDY_HEATMAP_STEPS[1]) return 2;
  if (minutes < STUDY_HEATMAP_STEPS[2]) return 3;
  return 4;
}
