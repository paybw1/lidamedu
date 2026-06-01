/**
 * 단계 ③ — 기본서·실무서 추출·청킹.
 *
 *   data/added/textbook/*.{pdf,hwp,hwpx}  → doc_type=textbook
 *   data/added/practice/*.{pdf,hwp,hwpx}  → doc_type=practice
 *
 * 결과:
 *   data/chunks/added/textbook.jsonl
 *   data/chunks/added/practice.jsonl
 *
 * 옵션:
 *   --kind=textbook|practice    한쪽만
 *   --file=<basename>           해당 파일 1건만
 *   --counts-only               파일 안 쓰고 카운트·진단만
 *
 * PDF 인 경우 페이지당 평균 문자수가 임계 미만이면 OCR 권유 메시지 출력 (강제 OCR 안 함).
 */
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, relative, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractHwpx, type HwpxParagraph } from '../lib/extract-hwpx.js';
import { extractPdf } from '../lib/extract-pdf.js';
import { extractHwp, type HwpParagraph } from '../lib/extract-hwp.js';
import {
  chunkParagraphs, bookTitleFromFilename, guessSubjectFromFilename,
  type InputParagraph,
} from '../lib/chunker.js';
import {
  authorityTierFor, chunkId, contentHash, emptyStats, tallyChunk,
  parseChunk,
  type Chunk, type DocType,
} from '../schema/chunk.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADDED_DIR = join(__dirname, '..', '..', 'data', 'added');
const OUT_DIR = join(__dirname, '..', '..', 'data', 'chunks', 'added');

type Kind = 'textbook' | 'practice';
type Args = { only?: Kind; file?: string; countsOnly: boolean };
function parseArgs(argv: string[]): Args {
  const args: Args = { countsOnly: false };
  for (const a of argv.slice(2)) {
    if (a === '--counts-only') args.countsOnly = true;
    else if (a.startsWith('--kind=')) args.only = a.slice('--kind='.length) as Kind;
    else if (a.startsWith('--file=')) args.file = a.slice('--file='.length);
  }
  return args;
}

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

async function extractFile(filepath: string): Promise<{ paragraphs: InputParagraph[]; diag: string }> {
  const ext = extname(filepath).toLowerCase();
  if (ext === '.hwpx') {
    const ps: HwpxParagraph[] = extractHwpx(filepath);
    return { paragraphs: ps, diag: `hwpx · ${ps.length} paragraphs` };
  }
  if (ext === '.hwp') {
    const ps: HwpParagraph[] = extractHwp(filepath);
    return { paragraphs: ps, diag: `hwp · ${ps.length} lines (via Hancom COM)` };
  }
  if (ext === '.pdf') {
    const result = await extractPdf(filepath);
    const paragraphs: InputParagraph[] = result.pages.flatMap((pg) =>
      pg.text
        .split(/\n\s*\n/)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((text) => ({ text, page: pg.page })),
    );
    let diag = `pdf · ${result.pages.length} pages · avg ${result.avgCharsPerPage.toFixed(0)} chars/page`;
    if (result.ocrLikelyNeeded) {
      diag += `  ⚠ OCR 권유 (텍스트가 거의 추출되지 않음 — scanned PDF 일 가능성)`;
    }
    return { paragraphs, diag };
  }
  throw new Error(`unsupported extension: ${ext}`);
}

async function processKind(kind: Kind, args: Args, stats: ReturnType<typeof emptyStats>): Promise<void> {
  const dir = join(ADDED_DIR, kind);
  let files: string[];
  try {
    files = (await readdir(dir))
      .filter((f) => /\.(hwpx|hwp|pdf)$/i.test(f))
      .map((f) => join(dir, f));
  } catch {
    process.stdout.write(`[${kind}] (skip — 디렉토리 없음 또는 빈 디렉토리)\n`);
    return;
  }
  if (args.file) {
    files = files.filter((f) => basename(f) === args.file);
  }
  if (files.length === 0) {
    process.stdout.write(`[${kind}] 처리할 파일 없음\n`);
    return;
  }
  process.stdout.write(`[${kind}] files: ${files.length}\n`);

  const writer = new JsonlWriter(join(OUT_DIR, `${kind}.jsonl`), !args.countsOnly);
  const docType: DocType = kind;

  for (const filepath of files) {
    const name = basename(filepath);
    process.stdout.write(`  [${kind}] ${name}\n`);
    let extraction: { paragraphs: InputParagraph[]; diag: string };
    try {
      extraction = await extractFile(filepath);
    } catch (e) {
      process.stdout.write(`    SKIP — ${e instanceof Error ? e.message : String(e)}\n`);
      continue;
    }
    process.stdout.write(`    ${extraction.diag}\n`);
    if (extraction.paragraphs.length === 0) {
      process.stdout.write('    (paragraphs 0 — skip)\n');
      continue;
    }

    const chunks = chunkParagraphs(extraction.paragraphs);
    process.stdout.write(`    chunks: ${chunks.length} (avg ${Math.round(chunks.reduce((s, c) => s + c.tokens, 0) / Math.max(chunks.length, 1))} tok)\n`);

    const bookTitle = bookTitleFromFilename(name);
    const subj = guessSubjectFromFilename(name);
    const relpath = relative(join(__dirname, '..', '..'), filepath).replace(/\\/g, '/');

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (!c) continue;
      const sourceId = `${relpath}#c${i}`;
      const pageLabel = c.pageStart != null && c.pageEnd != null
        ? (c.pageStart === c.pageEnd ? ` p.${c.pageStart}` : ` p.${c.pageStart}-${c.pageEnd}`)
        : '';
      const sourceLabel = `${bookTitle}${pageLabel}`;
      const chunk: Chunk = {
        id: chunkId(docType, sourceId, 0),
        content: c.text,
        doc_type: docType,
        source_type: 'added_file',
        source: sourceLabel,
        source_id: sourceId,
        subject: subj,
        chunk_index: i,
        meta: {
          doc_type: docType,
          book_title: bookTitle,
          author: null,
          page_start: c.pageStart,
          page_end: c.pageEnd,
          section_path: c.sectionPath,
          filepath: relpath,
        },
        authority_tier: authorityTierFor(docType),
        token_count: c.tokens,
        content_hash: contentHash(c.text),
      };
      parseChunk(chunk);
      writer.push(chunk);
      tallyChunk(stats, chunk);
    }
  }
  await writer.flush();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const stats = emptyStats();
  const t0 = Date.now();

  if (!args.only || args.only === 'textbook') await processKind('textbook', args, stats);
  if (!args.only || args.only === 'practice') await processKind('practice', args, stats);

  const ms = Date.now() - t0;
  process.stdout.write('\n--- chunk-added summary ---\n');
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
