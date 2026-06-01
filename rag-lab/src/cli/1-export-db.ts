/**
 * 단계 ② — DB 정적 export (읽기 전용 SELECT only).
 *
 * 본 플랫폼 DB 에서 articles(현행 시행본) / cases / problems 를 읽어
 * 공통 청크 스키마(`src/schema/chunk.ts`)로 직렬화하여 JSONL 로 저장한다.
 *
 *   data/db_export/statute.jsonl
 *   data/db_export/case.jsonl
 *   data/db_export/problem.jsonl
 *
 * 옵션:
 *   --only=statute|case|problem   해당 doc_type 만 export
 *   --limit=N                     각 doc_type 별 최대 N 건 (sanity check 용)
 *   --counts-only                 파일 안 쓰고 카운트만 보고
 *
 * RLS bypass(service_role) 로 deleted_at 포함 전 row 가 SELECT 됨 — 본 코드에서
 * 명시적으로 `deleted_at IS NULL` 필터를 건다.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../lib/db.js';
import { serializeBodyJson } from '../lib/article-body.js';
import { approxTokens } from '../lib/tokenize.js';
import {
  authorityTierFor, chunkId, contentHash, emptyStats, tallyChunk,
  parseChunk,
  type Chunk, type DocType, type Subject,
} from '../schema/chunk.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', '..', 'data', 'db_export');

// ----- args -----
type Args = { only?: DocType; limit?: number; countsOnly: boolean };
function parseArgs(argv: string[]): Args {
  const args: Args = { countsOnly: false };
  for (const a of argv.slice(2)) {
    if (a === '--counts-only') args.countsOnly = true;
    else if (a.startsWith('--only=')) args.only = a.slice('--only='.length) as DocType;
    else if (a.startsWith('--limit=')) args.limit = parseInt(a.slice('--limit='.length), 10);
  }
  return args;
}

// law_code → Subject enum
const LAW_CODE_TO_SUBJECT: Record<string, Subject> = {
  patent: 'patent',
  trademark: 'trademark',
  design: 'design',
  civil: 'civil',
  'civil-procedure': 'civil_procedure',
  cprocedure: 'civil_procedure',
};

function lawCodeToSubject(code: string | null | undefined): Subject | null {
  if (!code) return null;
  return LAW_CODE_TO_SUBJECT[code] ?? null;
}

// case_court enum → 한글 라벨
const COURT_LABEL: Record<string, string> = {
  supreme: '대법원',
  patent_court: '특허법원',
  high_court: '고등법원',
  district_court: '지방법원',
};
function courtLabel(code: string | null | undefined): string {
  if (!code) return '';
  return COURT_LABEL[code] ?? code;
}

// ----- writer -----
class JsonlWriter {
  private lines: string[] = [];
  constructor(private filepath: string, private enabled: boolean) {}
  push(chunk: Chunk): void {
    if (!this.enabled) return;
    this.lines.push(JSON.stringify(chunk));
  }
  async flush(): Promise<void> {
    if (!this.enabled) return;
    await mkdir(dirname(this.filepath), { recursive: true });
    await writeFile(this.filepath, this.lines.join('\n') + (this.lines.length ? '\n' : ''), 'utf8');
  }
}

// ============================================================
// statute
// ============================================================
async function exportStatute(args: Args, stats: ReturnType<typeof emptyStats>): Promise<void> {
  process.stdout.write('[statute] querying articles + revisions + laws…\n');
  // 두 단계 fetch: laws (5) → articles + join current revision.
  const { data: laws, error: lawErr } = await db
    .from('laws')
    .select('law_id, law_code, display_label');
  if (lawErr) throw lawErr;
  const lawById = new Map((laws ?? []).map((l) => [l.law_id, l]));

  // 본문 있는 조 단위만 (편/장/절 제외).
  let q = db
    .from('articles')
    .select(
      'article_id, law_id, level, article_number, display_label, current_revision_id, deleted_at, path',
    )
    .eq('level', 'article')
    .is('deleted_at', null)
    .not('current_revision_id', 'is', null);
  if (args.limit) q = q.limit(args.limit);
  const { data: articles, error: artErr } = await q;
  if (artErr) throw artErr;

  process.stdout.write(`[statute] articles loaded: ${articles?.length ?? 0}\n`);

  const writer = new JsonlWriter(join(OUT_DIR, 'statute.jsonl'), !args.countsOnly);

  // revision 본문은 in 배치로 가져옴.
  const revIds = (articles ?? [])
    .map((a) => a.current_revision_id)
    .filter((id): id is string => !!id);
  const revisions = new Map<string, { body_json: unknown; effective_date: string | null }>();
  const BATCH = 200;
  for (let i = 0; i < revIds.length; i += BATCH) {
    const slice = revIds.slice(i, i + BATCH);
    const { data: rs, error: rErr } = await db
      .from('article_revisions')
      .select('revision_id, body_json, effective_date')
      .in('revision_id', slice);
    if (rErr) throw rErr;
    for (const r of rs ?? []) {
      revisions.set(r.revision_id, {
        body_json: r.body_json,
        effective_date: r.effective_date,
      });
    }
  }
  process.stdout.write(`[statute] revisions loaded: ${revisions.size}\n`);

  let kept = 0; let skipped = 0;
  for (const art of articles ?? []) {
    if (!art.current_revision_id) { skipped += 1; continue; }
    const rev = revisions.get(art.current_revision_id);
    if (!rev) { skipped += 1; continue; }
    // body_text 컬럼은 raw JSON 캐스트라 평문 캐시가 아님 → body_json 만 사용.
    const body = serializeBodyJson(rev.body_json);
    if (!body.trim()) { skipped += 1; continue; }

    const law = lawById.get(art.law_id);
    const lawCode = law?.law_code ?? null;
    const lawName = law?.display_label ?? lawCode ?? '';
    const articleNumber = art.article_number ? parseInt(art.article_number, 10) : NaN;

    const sourceLabel = `${lawName} ${art.display_label}`.trim();
    const content =
      `${sourceLabel}\n\n${body}`;

    const chunk: Chunk = {
      id: chunkId('statute', art.article_id, 0),
      content,
      doc_type: 'statute',
      source_type: 'db_export',
      source: sourceLabel,
      source_id: art.article_id,
      subject: lawCodeToSubject(lawCode),
      chunk_index: 0,
      meta: {
        doc_type: 'statute',
        law_code: lawCode ?? '',
        law_name: lawName,
        article_number: Number.isFinite(articleNumber) ? articleNumber : 0,
        clause_number: null,
        item_number: null,
        sub_item: null,
        effective_date: rev.effective_date,
        revision_id: art.current_revision_id,
      },
      authority_tier: authorityTierFor('statute'),
      token_count: approxTokens(content),
      content_hash: contentHash(content),
    };
    parseChunk(chunk);   // ★ 빌드 직전 같은 검증을 export 단계에서도 강제
    writer.push(chunk);
    tallyChunk(stats, chunk);
    kept += 1;
  }
  await writer.flush();
  process.stdout.write(`[statute] kept=${kept} skipped=${skipped}\n`);
}

// ============================================================
// case
// ============================================================
async function exportCase(args: Args, stats: ReturnType<typeof emptyStats>): Promise<void> {
  process.stdout.write('[case] querying cases…\n');
  let q = db
    .from('cases')
    .select('case_id, case_number, case_title, court, decided_at, subject_laws, summary_body_md, reasoning_md, comment_body_md, related_md, deleted_at')
    .is('deleted_at', null);
  if (args.limit) q = q.limit(args.limit);
  const { data: cases, error } = await q;
  if (error) throw error;

  process.stdout.write(`[case] cases loaded: ${cases?.length ?? 0}\n`);

  const writer = new JsonlWriter(join(OUT_DIR, 'case.jsonl'), !args.countsOnly);

  // 본 실험 단순화: 한 case = 한 청크 (summary + reasoning + comment + related 결합).
  // 너무 길면 단계 ④ 인덱싱 직전에 토큰 길이 보고 후 추가 분할 검토.
  let kept = 0; let skipped = 0;
  for (const c of cases ?? []) {
    const courtKr = courtLabel(c.court);
    const head = `${c.case_title ?? c.case_number} (${courtKr} ${c.case_number}${c.decided_at ? ' · ' + c.decided_at : ''})`;
    const sections: string[] = [];
    if (c.summary_body_md?.trim()) sections.push(`【요지】\n${c.summary_body_md.trim()}`);
    if (c.reasoning_md?.trim())    sections.push(`【이유】\n${c.reasoning_md.trim()}`);
    if (c.comment_body_md?.trim()) sections.push(`【평석】\n${c.comment_body_md.trim()}`);
    if (c.related_md?.trim())      sections.push(`【관련】\n${c.related_md.trim()}`);
    const body = sections.join('\n\n');
    if (!body) { skipped += 1; continue; }

    // subject_laws 배열 첫 매칭으로 subject 결정 (없으면 null — 검색 가능하되 과목 필터에서 누락)
    const subj =
      (c.subject_laws ?? [])
        .map((sl) => lawCodeToSubject(sl))
        .find((s): s is Subject => !!s) ?? null;

    const sourceLabel = `${courtKr} ${c.case_number}`.trim();
    const content = `${head}\n\n${body}`;
    const chunk: Chunk = {
      id: chunkId('case', c.case_id, 0),
      content,
      doc_type: 'case',
      source_type: 'db_export',
      source: sourceLabel,
      source_id: c.case_id,
      subject: subj,
      chunk_index: 0,
      meta: {
        doc_type: 'case',
        case_no: c.case_number,
        court: courtKr || null,
        decided_at: c.decided_at ?? null,
        section: 'full',
      },
      authority_tier: authorityTierFor('case'),
      token_count: approxTokens(content),
      content_hash: contentHash(content),
    };
    parseChunk(chunk);
    writer.push(chunk);
    tallyChunk(stats, chunk);
    kept += 1;
  }
  await writer.flush();
  process.stdout.write(`[case] kept=${kept} skipped=${skipped}\n`);
}

// ============================================================
// problem
// ============================================================
async function exportProblem(args: Args, stats: ReturnType<typeof emptyStats>): Promise<void> {
  process.stdout.write('[problem] querying problems + choices…\n');
  // 법령과목만 (자연과학 제외 — feat-9 §14.6 결정).
  let q = db
    .from('problems')
    .select('problem_id, law_id, body_md, format, explanation_md, model_answer_md, exam_round, exam_round_no, year, problem_number, deleted_at, subject_type')
    .eq('subject_type', 'law')
    .is('deleted_at', null);
  if (args.limit) q = q.limit(args.limit);
  const { data: problems, error } = await q;
  if (error) throw error;

  process.stdout.write(`[problem] problems loaded: ${problems?.length ?? 0}\n`);

  // laws 매핑
  const { data: laws } = await db
    .from('laws')
    .select('law_id, law_code, display_label');
  const lawCodeById = new Map((laws ?? []).map((l) => [l.law_id, l.law_code]));
  const lawNameById = new Map((laws ?? []).map((l) => [l.law_id, l.display_label]));

  // choices 배치 fetch (problem_id IN ...)
  const problemIds = (problems ?? []).map((p) => p.problem_id);
  const choicesByProblem = new Map<string, Array<{
    choice_index: number; body_md: string; is_correct: boolean; explanation_md: string | null;
  }>>();
  const BATCH = 200;
  for (let i = 0; i < problemIds.length; i += BATCH) {
    const slice = problemIds.slice(i, i + BATCH);
    const { data: cs, error: cErr } = await db
      .from('problem_choices')
      .select('problem_id, choice_index, body_md, is_correct, explanation_md')
      .in('problem_id', slice);
    if (cErr) throw cErr;
    for (const c of cs ?? []) {
      const arr = choicesByProblem.get(c.problem_id) ?? [];
      arr.push({
        choice_index: c.choice_index,
        body_md: c.body_md,
        is_correct: c.is_correct,
        explanation_md: c.explanation_md,
      });
      choicesByProblem.set(c.problem_id, arr);
    }
  }
  process.stdout.write(`[problem] choices loaded for ${choicesByProblem.size} problems\n`);

  const writer = new JsonlWriter(join(OUT_DIR, 'problem.jsonl'), !args.countsOnly);

  const formatToEnum = (fmt: string): 'mcq' | 'ox' | 'blank' | 'subjective' => {
    if (fmt === 'mc_short' || fmt === 'mc_box' || fmt === 'mc_case') return 'mcq';
    if (fmt === 'ox' || fmt === 'blank' || fmt === 'subjective') return fmt;
    return 'subjective';   // 안전 fallback
  };

  let kept = 0; let skipped = 0;
  for (const p of problems ?? []) {
    if (!p.body_md?.trim()) { skipped += 1; continue; }

    const lawCode = p.law_id ? lawCodeById.get(p.law_id) ?? null : null;
    const lawName = p.law_id ? lawNameById.get(p.law_id) ?? '' : '';
    const subj = lawCodeToSubject(lawCode);

    const roundParts = [
      p.year ? `${p.year}년` : null,
      p.exam_round ?? null,
      p.exam_round_no ? `${p.exam_round_no}회` : null,
    ].filter(Boolean);
    const roundLabel = roundParts.join(' ');
    const numberLabel = p.problem_number != null ? `문제 ${p.problem_number}` : '문제';
    const sourceLabel = [lawName, roundLabel, numberLabel].filter(Boolean).join(' · ');

    const choices = (choicesByProblem.get(p.problem_id) ?? [])
      .sort((a, b) => a.choice_index - b.choice_index);
    const choiceLines = choices.map((c) => {
      const mark = c.is_correct ? '★' : '·';
      const expl = c.explanation_md?.trim() ? `\n   해설: ${c.explanation_md.trim()}` : '';
      return `${mark} ${c.choice_index}) ${c.body_md.trim()}${expl}`;
    });
    const correctIdx = choices.filter((c) => c.is_correct).map((c) => c.choice_index);
    const fmt = formatToEnum(p.format);
    const answerLine =
      fmt === 'mcq'
        ? (correctIdx.length ? `정답: ${correctIdx.join(', ')}번` : '')
        : (p.model_answer_md?.trim() ? `모범답안:\n${p.model_answer_md.trim()}` : '');
    const explanationLine = p.explanation_md?.trim() ? `해설:\n${p.explanation_md.trim()}` : '';

    const blocks: string[] = [
      `[${sourceLabel}]`,
      p.body_md.trim(),
      choiceLines.length ? choiceLines.join('\n') : '',
      answerLine,
      explanationLine,
    ].filter(Boolean);

    const content = blocks.join('\n\n');

    const chunk: Chunk = {
      id: chunkId('problem', p.problem_id, 0),
      content,
      doc_type: 'problem',
      source_type: 'db_export',
      source: sourceLabel,
      source_id: p.problem_id,
      subject: subj,
      chunk_index: 0,
      meta: {
        doc_type: 'problem',
        question_id: p.problem_id,
        exam_round: roundLabel || null,
        format: fmt,
        answer: fmt === 'mcq'
          ? (correctIdx.length ? correctIdx.join(',') : null)
          : (p.model_answer_md ? '(모범답안 본문 참조)' : null),
        choices_count: choices.length || null,
      },
      authority_tier: authorityTierFor('problem'),
      token_count: approxTokens(content),
      content_hash: contentHash(content),
    };
    parseChunk(chunk);
    writer.push(chunk);
    tallyChunk(stats, chunk);
    kept += 1;
  }
  await writer.flush();
  process.stdout.write(`[problem] kept=${kept} skipped=${skipped}\n`);
}

// ============================================================
// main
// ============================================================
async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const stats = emptyStats();
  const t0 = Date.now();

  if (!args.only || args.only === 'statute') await exportStatute(args, stats);
  if (!args.only || args.only === 'case')    await exportCase(args, stats);
  if (!args.only || args.only === 'problem') await exportProblem(args, stats);

  const ms = Date.now() - t0;
  process.stdout.write('\n--- export summary ---\n');
  process.stdout.write(`total chunks: ${stats.total} (${ms} ms)\n`);
  process.stdout.write(`by doc_type:  ${JSON.stringify(stats.byDocType)}\n`);
  process.stdout.write(`by tier:      ${JSON.stringify(stats.byTier)}\n`);
  process.stdout.write(`by subject:   ${JSON.stringify(stats.bySubject)}\n`);
  process.stdout.write(`total approx tokens: ${stats.totalTokens.toLocaleString()}\n`);
  if (args.countsOnly) {
    process.stdout.write('(counts-only — JSONL 미작성)\n');
  } else {
    process.stdout.write(`output dir: ${OUT_DIR}\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`ERROR: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
