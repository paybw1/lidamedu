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
];

export const annotationTargetTypeSchema = z.enum([
  "article",
  "case",
  "problem",
  "problem_choice",
]);

// step_notes: 키는 "1"~"5" (문자열), 값은 markdown 메모.
// 사용자가 하트 N 단계를 거치면서 누적되는 단계별 메모.
export type BookmarkStepNotes = Partial<Record<"1" | "2" | "3" | "4" | "5", string>>;

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
  createdAt: string;
  updatedAt: string;
}

export const HIGHLIGHT_COLORS = ["green", "yellow", "red", "blue"] as const;
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
}
