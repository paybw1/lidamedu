/**
 * 스키마 자기 검증 — `npm run schema:check`.
 * 스키마 변경 후 회귀 확인용. 각 doc_type 의 minimal valid sample 을 통과시키고,
 * cross-check (chunk.doc_type vs meta.doc_type) 실패 케이스를 거부하는지 검증.
 */
import {
  ChunkSchema, parseChunk, chunkId, contentHash, authorityTierFor,
  type Chunk,
} from './chunk.js';

const samples: Chunk[] = [
  {
    id: chunkId('statute', 'art-uuid-1', 0),
    content: '제29조 ① 산업상 이용할 수 있는 발명으로서 ...',
    doc_type: 'statute',
    source_type: 'db_export',
    source: '특허법 제29조',
    source_id: 'art-uuid-1',
    subject: 'patent',
    chunk_index: 0,
    meta: {
      doc_type: 'statute',
      law_code: 'patent', law_name: '특허법',
      article_number: 29, clause_number: null, item_number: null, sub_item: null,
      effective_date: '2024-01-01', revision_id: 'rev-uuid-1',
    },
    authority_tier: authorityTierFor('statute'),
    token_count: 42,
    content_hash: contentHash('제29조 ① 산업상 이용할 수 있는 발명으로서 ...'),
  },
  {
    id: chunkId('case', 'case-uuid-1', 0),
    content: '【판결요지】 ... 진보성 판단 기준은 ...',
    doc_type: 'case',
    source_type: 'db_export',
    source: '대법원 2020다1234',
    source_id: 'case-uuid-1',
    subject: 'patent',
    chunk_index: 0,
    meta: {
      doc_type: 'case',
      case_no: '2020다1234', court: '대법원', decided_at: '2020-05-14',
      section: 'summary',
    },
    authority_tier: authorityTierFor('case'),
    token_count: 30,
    content_hash: contentHash('【판결요지】 ... 진보성 판단 기준은 ...'),
  },
  {
    id: chunkId('problem', 'prob-uuid-1', 0),
    content: '문제: 특허요건이 아닌 것은? 1) ... 2) ... 정답: 3\n해설: ...',
    doc_type: 'problem',
    source_type: 'db_export',
    source: '2024년 1차 문제 12',
    source_id: 'prob-uuid-1',
    subject: 'patent',
    chunk_index: 0,
    meta: {
      doc_type: 'problem',
      question_id: 'prob-uuid-1', exam_round: '2024년 1차',
      format: 'mcq', answer: '3', choices_count: 4,
    },
    authority_tier: authorityTierFor('problem'),
    token_count: 25,
    content_hash: contentHash('문제: 특허요건이 아닌 것은? 1) ... 2) ... 정답: 3\n해설: ...'),
  },
  {
    id: chunkId('textbook', 'tb1.pdf#p123#c0', 0),
    content: '진보성은 발명의 기술적 곤란성을 판단하는 ...',
    doc_type: 'textbook',
    source_type: 'added_file',
    source: '리담특허법 강의노트(제10판) p.123',
    source_id: 'tb1.pdf#p123#c0',
    subject: 'patent',
    chunk_index: 0,
    meta: {
      doc_type: 'textbook',
      book_title: '리담특허법 강의노트(제10판)', author: null,
      page_start: 123, page_end: 123, section_path: '제2장 > 진보성',
      filepath: 'data/added/textbook/tb1.pdf',
    },
    authority_tier: authorityTierFor('textbook'),
    token_count: 20,
    content_hash: contentHash('진보성은 발명의 기술적 곤란성을 판단하는 ...'),
  },
];

let pass = 0;
for (const s of samples) {
  parseChunk(s);
  pass += 1;
}
process.stdout.write(`OK · ${pass}/${samples.length} valid samples passed\n`);

// negative — doc_type mismatch 는 거부되어야 한다
const bad: unknown = { ...samples[0], doc_type: 'case' };
const r = ChunkSchema.safeParse(bad);
if (r.success) {
  process.stderr.write('FAIL · doc_type mismatch 를 허용함\n');
  process.exit(1);
}
process.stdout.write(`OK · doc_type mismatch 거부됨\n`);

// negative — meta 누락
const bad2: unknown = { ...samples[0], meta: undefined };
const r2 = ChunkSchema.safeParse(bad2);
if (r2.success) {
  process.stderr.write('FAIL · meta 누락을 허용함\n');
  process.exit(1);
}
process.stdout.write(`OK · meta 누락 거부됨\n`);
