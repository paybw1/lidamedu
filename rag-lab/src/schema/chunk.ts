/**
 * 공통 청크 스키마 — 단일 소유 (SSOT).
 *
 * (A) 본 플랫폼 DB 정적 export (statute/case/problem) 와
 * (B) 기본서·실무서 (textbook/practice) 가 같은 모양으로 들어와
 * 한 인덱스에 섞일 수 있도록 강제한다.
 *
 * 모든 청크 산출물(JSONL)은 빌드 직전에 `ChunkSchema.parse()` 로 검증한다.
 */
import { z } from 'zod';
import { createHash } from 'node:crypto';

// ---------- enums ----------

export const DocTypeSchema = z.enum([
  'statute',   // 조문 (1차)
  'case',      // 판례 (1차)
  'problem',   // 문제+선지+해설 (1차 — 평가 자산이라 1차로 분류)
  'textbook',  // 기본서 (2차)
  'practice',  // 실무서 (2차)
]);
export type DocType = z.infer<typeof DocTypeSchema>;

export const SourceOriginSchema = z.enum(['db_export', 'added_file']);
export type SourceOrigin = z.infer<typeof SourceOriginSchema>;

export const SubjectSchema = z.enum([
  'patent',           // 특허법
  'trademark',        // 상표법
  'design',           // 디자인보호법
  'civil',            // 민법
  'civil_procedure',  // 민사소송법
]);
export type Subject = z.infer<typeof SubjectSchema>;

// 권위 등급 — 검색 가중치·생성 프롬프트에 반영.
// 1 = 1차 (법령·판례·문제: 공식·검증된 자료)
// 2 = 2차 (기본서·실무서: 해석·요약)
// 충돌 시 1차 우선, 답변에서 "[법령] / [기본서]" 등 등급 라벨로 구분.
export const AuthorityTierSchema = z.union([z.literal(1), z.literal(2)]);
export type AuthorityTier = z.infer<typeof AuthorityTierSchema>;

// ---------- meta payloads (doc_type 별) ----------

export const StatuteMetaSchema = z.object({
  doc_type: z.literal('statute'),
  law_code: z.string(),                  // 'patent' | 'trademark' | ...
  law_name: z.string(),                  // '특허법'
  article_number: z.number().int(),      // 29
  clause_number: z.number().int().nullable(),  // 항 (없으면 null)
  item_number: z.number().int().nullable(),
  sub_item: z.string().nullable(),
  effective_date: z.string().nullable(), // YYYY-MM-DD
  revision_id: z.string().nullable(),    // articles.current_revision_id (역추적용)
});

export const CaseMetaSchema = z.object({
  doc_type: z.literal('case'),
  case_no: z.string(),                   // '2020다1234' | '2018후10470' 등
  court: z.string().nullable(),
  decided_at: z.string().nullable(),     // YYYY-MM-DD
  section: z.enum(['full', 'summary', 'reasoning', 'commentary']),
});

export const ProblemMetaSchema = z.object({
  doc_type: z.literal('problem'),
  question_id: z.string(),               // problems.problem_id (UUID)
  exam_round: z.string().nullable(),     // '2024년 1차' 등
  format: z.enum(['mcq', 'ox', 'blank', 'subjective']),
  answer: z.string().nullable(),         // 정답 (eval·근거 검증용)
  choices_count: z.number().int().nullable(),
});

export const TextbookMetaSchema = z.object({
  doc_type: z.literal('textbook'),
  book_title: z.string(),                // '리담특허법 강의노트(제10판)'
  author: z.string().nullable(),
  page_start: z.number().int().nullable(),
  page_end: z.number().int().nullable(),
  section_path: z.string().nullable(),   // '제2장 > 특허요건 > 진보성'
  filepath: z.string(),                  // data/added/textbook/foo.pdf
});

export const PracticeMetaSchema = z.object({
  doc_type: z.literal('practice'),
  book_title: z.string(),
  author: z.string().nullable(),
  page_start: z.number().int().nullable(),
  page_end: z.number().int().nullable(),
  section_path: z.string().nullable(),
  filepath: z.string(),
});

export const ChunkMetaSchema = z.discriminatedUnion('doc_type', [
  StatuteMetaSchema,
  CaseMetaSchema,
  ProblemMetaSchema,
  TextbookMetaSchema,
  PracticeMetaSchema,
]);
export type ChunkMeta = z.infer<typeof ChunkMetaSchema>;

// ---------- chunk ----------

export const ChunkSchema = z.object({
  /** sha1(`${doc_type}:${source_id}:${chunk_index}`) — 재빌드 시 안정 키 */
  id: z.string().length(40),
  /** 임베딩·BM25 대상 평문. 정제 완료 상태. */
  content: z.string().min(1),
  doc_type: DocTypeSchema,
  source_type: SourceOriginSchema,
  /** UI/리포트 표시용 라벨 — "특허법" / "대법원 2020다1234" / "리담특허법 p.123" */
  source: z.string().min(1),
  /** 역추적 키 — db_export: 원본 row UUID / added_file: `${relpath}#p${page}#c${chunk_idx}` */
  source_id: z.string().min(1),
  subject: SubjectSchema.nullable(),
  /** 한 소스에 여러 청크일 때 순서 (0-based) */
  chunk_index: z.number().int().min(0),
  meta: ChunkMetaSchema,
  authority_tier: AuthorityTierSchema,
  token_count: z.number().int().positive(),
  /** sha1(content) — 재청킹 시 동일 hash 면 재임베딩 skip */
  content_hash: z.string().length(40),
}).refine(
  (c) => c.doc_type === c.meta.doc_type,
  { message: 'chunk.doc_type 과 meta.doc_type 이 일치해야 합니다' },
);
export type Chunk = z.infer<typeof ChunkSchema>;

// ---------- helpers ----------

/** doc_type → 권위 등급 매핑 (단일 소유). */
export function authorityTierFor(docType: DocType): AuthorityTier {
  switch (docType) {
    case 'statute':
    case 'case':
    case 'problem':
      return 1;
    case 'textbook':
    case 'practice':
      return 2;
  }
}

/** UI/생성 프롬프트에서 출처 라벨로 사용: `[법령] 특허법 제29조`. */
export function docTypeLabel(docType: DocType): string {
  switch (docType) {
    case 'statute':  return '법령';
    case 'case':     return '판례';
    case 'problem':  return '문제';
    case 'textbook': return '기본서';
    case 'practice': return '실무서';
  }
}

const sha1 = (input: string) =>
  createHash('sha1').update(input, 'utf8').digest('hex');

export function chunkId(docType: DocType, sourceId: string, chunkIndex: number): string {
  return sha1(`${docType}:${sourceId}:${chunkIndex}`);
}

export function contentHash(content: string): string {
  return sha1(content);
}

/**
 * 청크 1건을 검증. 빌드/인덱싱 직전 모든 청크는 이 함수를 통과해야 한다.
 * Zod 실패 시 의미 있는 에러 메시지로 throw — 어느 청크가 왜 깨졌는지 분명히.
 */
export function parseChunk(raw: unknown): Chunk {
  return ChunkSchema.parse(raw);
}

/** 1차/2차 카운트 + doc_type별 분포 보고용. */
export interface ChunkStats {
  total: number;
  byDocType: Record<DocType, number>;
  bySourceType: Record<SourceOrigin, number>;
  byTier: Record<AuthorityTier, number>;
  bySubject: Record<string, number>;
  totalTokens: number;
}

export function emptyStats(): ChunkStats {
  return {
    total: 0,
    byDocType: {
      statute: 0, case: 0, problem: 0, textbook: 0, practice: 0,
    },
    bySourceType: { db_export: 0, added_file: 0 },
    byTier: { 1: 0, 2: 0 },
    bySubject: {},
    totalTokens: 0,
  };
}

export function tallyChunk(stats: ChunkStats, chunk: Chunk): void {
  stats.total += 1;
  stats.byDocType[chunk.doc_type] += 1;
  stats.bySourceType[chunk.source_type] += 1;
  stats.byTier[chunk.authority_tier] += 1;
  const subjKey = chunk.subject ?? '(none)';
  stats.bySubject[subjKey] = (stats.bySubject[subjKey] ?? 0) + 1;
  stats.totalTokens += chunk.token_count;
}
