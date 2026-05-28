// 클라이언트·서버 공용 타입/라벨/zod 스키마.
import type { Database } from "database.types";

import { z } from "zod";

export type AnnotationTargetType =
  Database["public"]["Enums"]["annotation_target_type"];

export const ANNOTATION_TARGET_TYPES: AnnotationTargetType[] = [
  "article",
  "case",
  "problem",
  "problem_choice",
  "problem_box_item",
];

export const annotationTargetTypeSchema = z.enum([
  "article",
  "case",
  "problem",
  "problem_choice",
  "problem_box_item",
]);

// step_notes: 키는 "1"~"5" (문자열), 값은 markdown 메모.
// 사용자가 하트 N 단계를 거치면서 누적되는 단계별 메모.
export type BookmarkStepNotes = Partial<
  Record<"1" | "2" | "3" | "4" | "5", string>
>;

export interface BookmarkRecord {
  bookmarkId: string;
  starLevel: number;
  noteMd: string | null;
  stepNotes: BookmarkStepNotes;
  updatedAt: string;
}

export const BOOKMARK_STEP_LEVELS = [1, 2, 3, 4, 5] as const;
export type BookmarkStepLevel = (typeof BOOKMARK_STEP_LEVELS)[number];

export interface MemoRecord {
  memoId: string;
  bodyMd: string;
  // 사용자가 조문 본문에서 복사해 paste 한 단어/구문. 이 메모가 어떤 단어에 대한 것인지 표시.
  // null 이면 article 전체에 대한 일반 메모.
  snippet: string | null;
  // 본문 상의 정확 위치 — walkBlocks pre-order block 인덱스 + 그 block 안 cumulative text offset.
  // 같은 snippet 이 여러 위치에 등장해도 사용자가 선택한 그 자리에만 마크 표시.
  // null 이면 (legacy) snippet 의 첫 occurrence 에 fallback 마킹.
  blockIndex: number | null;
  cumOffset: number | null;
  createdAt: string;
  updatedAt: string;
  /** 현재 사용자가 작성자인지. false = 강사 작성(전체 공개) 포스트잇. */
  isMine: boolean;
}

// 5번째 옵션 "underline" 은 배경 없이 텍스트 데코레이션(밑줄)만 — feat-3-207.
// 강사가 그으면 모든 수험생에게 노출(전체 공개), 학생이 그으면 본인만 — RLS 는 기존 정책 그대로.
export const HIGHLIGHT_COLORS = [
  "green",
  "yellow",
  "red",
  "blue",
  "underline",
] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export const highlightColorSchema = z.enum(HIGHLIGHT_COLORS);

export interface HighlightRecord {
  highlightId: string;
  fieldPath: string;
  startOffset: number;
  endOffset: number;
  contentHash: string;
  color: HighlightColor;
  label: string | null;
  createdAt: string;
  excerpt: string;
  /** 현재 사용자가 작성자인지. false = 강사 작성(전체 공개) 하이라이트. */
  isMine: boolean;
  // 자동 재앵커링용 — 본문 수정 시 offset 이 어긋났을 때 위치 재탐색.
  // null = legacy(이 컬럼 추가 전 생성). overlay 는 label 로 fallback.
  snippet?: string | null;
  beforeCtx?: string | null;
  afterCtx?: string | null;
}

// 색상별 기본 한글 이름 — 사용자 alias 가 없을 때 폴백.
export const HIGHLIGHT_COLOR_DEFAULT_LABEL: Record<HighlightColor, string> = {
  yellow: "노랑",
  green: "초록",
  red: "빨강",
  blue: "파랑",
  underline: "밑줄",
};

// 사용자별 색상 닉네임 — feat-3-208.
// 사용자가 "이 색은 어떤 목적으로 쓴다" 라고 라벨링한 결과. 누락 키는 기본 색 이름으로 폴백.
export type HighlightColorAliases = Partial<Record<HighlightColor, string>>;

// alias 1건당 최대 길이 — DB 폭주 방지 + UI 한 줄 표시 가능.
export const HIGHLIGHT_ALIAS_MAX_LEN = 24;

export const highlightAliasSchema = z
  .string()
  .max(HIGHLIGHT_ALIAS_MAX_LEN)
  .trim();

// jsonb 자유 형식 → 안전 alias 맵으로 정규화.
export function normalizeHighlightColorAliases(
  raw: unknown,
): HighlightColorAliases {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: HighlightColorAliases = {};
  for (const c of HIGHLIGHT_COLORS) {
    const v = src[c];
    if (typeof v === "string") {
      const trimmed = v.trim().slice(0, HIGHLIGHT_ALIAS_MAX_LEN);
      if (trimmed) out[c] = trimmed;
    }
  }
  return out;
}

// 색상 → 표시용 라벨 (alias 우선, 없으면 기본 색 이름).
export function highlightColorLabel(
  color: HighlightColor,
  aliases: HighlightColorAliases | null | undefined,
): string {
  return aliases?.[color]?.trim() || HIGHLIGHT_COLOR_DEFAULT_LABEL[color];
}
