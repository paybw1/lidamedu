// 클라이언트·서버 공용 타입. queries.server.ts 와 분리해 클라이언트 번들에 import 가능.
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export type BookUpdateKind = "supplement" | "errata" | "other";

export const BOOK_UPDATE_KIND_LABELS: Record<BookUpdateKind, string> = {
  supplement: "추록",
  errata: "정오표",
  other: "기타",
};

export interface BookUpdateItem {
  updateId: string;
  bookTitle: string;
  publisher: string | null;
  edition: string | null;
  kind: BookUpdateKind;
  title: string;
  description: string | null;
  publishedAt: string | null;
  url: string | null;
  pdfUrl: string | null;
  subjectLaws: LawSubjectSlug[];
  importance: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
