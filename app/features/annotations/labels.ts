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

export interface BookmarkRecord {
  bookmarkId: string;
  starLevel: number;
  noteMd: string | null;
  updatedAt: string;
}

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
