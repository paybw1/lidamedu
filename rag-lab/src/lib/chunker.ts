/**
 * 텍스트 paragraphs → 청크 분할.
 *
 * 목표: ~512 토큰/청크, ~12% overlap. 문단 경계 우선.
 * 헤더(`제N장`, `제N편`, `§ N` 등) 발견 시 sticky → meta.section_path.
 */
import { approxTokens } from './tokenize.js';

const TARGET_TOKENS = 512;
const MAX_TOKENS = 768;            // soft upper bound
const OVERLAP_TOKENS = 60;         // ~12%
const HEADER_RE = /^(제\s*\d+\s*[편장절]\s*[^\n]{0,40}|§\s*\d+\.?[^\n]{0,40}|Chapter\s+\d+[^\n]{0,40})$/u;

export interface InputParagraph {
  text: string;
  page: number | null;
}

export interface TextChunk {
  text: string;
  tokens: number;
  pageStart: number | null;
  pageEnd: number | null;
  sectionPath: string | null;
}

export function chunkParagraphs(paragraphs: InputParagraph[]): TextChunk[] {
  const chunks: TextChunk[] = [];
  let buf: InputParagraph[] = [];
  let bufTokens = 0;
  let currentSection: string | null = null;

  const flush = (): void => {
    if (buf.length === 0) return;
    const text = buf.map((p) => p.text).join('\n').trim();
    if (!text) { buf = []; bufTokens = 0; return; }
    const pages = buf.map((p) => p.page).filter((p): p is number => p != null);
    chunks.push({
      text,
      tokens: approxTokens(text),
      pageStart: pages.length ? Math.min(...pages) : null,
      pageEnd: pages.length ? Math.max(...pages) : null,
      sectionPath: currentSection,
    });
    // overlap — buf 마지막 N토큰만큼 유지하고 나머지는 비움
    const tail: InputParagraph[] = [];
    let tailTokens = 0;
    for (let i = buf.length - 1; i >= 0 && tailTokens < OVERLAP_TOKENS; i--) {
      const p = buf[i];
      if (!p) continue;
      tail.unshift(p);
      tailTokens += approxTokens(p.text);
    }
    buf = tail;
    bufTokens = tailTokens;
  };

  for (const p of paragraphs) {
    if (!p.text.trim()) continue;
    // 헤더 감지 — sticky section
    if (HEADER_RE.test(p.text)) {
      currentSection = p.text.trim();
    }
    const t = approxTokens(p.text);
    // 단일 문단이 너무 크면 단독 청크로 강제 flush
    if (t > MAX_TOKENS) {
      flush();
      chunks.push({
        text: p.text,
        tokens: t,
        pageStart: p.page,
        pageEnd: p.page,
        sectionPath: currentSection,
      });
      buf = [];
      bufTokens = 0;
      continue;
    }
    if (bufTokens + t > TARGET_TOKENS && bufTokens >= TARGET_TOKENS * 0.5) {
      flush();
    }
    buf.push(p);
    bufTokens += t;
  }
  flush();
  // 마지막 flush 후 buf 에 overlap tail 만 남음 — 의미 있는 신규 내용 없으므로 폐기
  return chunks;
}

/** 파일명에서 책 제목 추출 — 대괄호·확장자 제거. */
export function bookTitleFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')              // .hwpx, .pdf 등
    .replace(/^\[[^\]]+\]\s*/, '')        // [내지2+본문]
    .replace(/\s+/g, ' ')
    .trim();
}

/** 파일명에서 과목 추정 (없으면 null). */
export function guessSubjectFromFilename(filename: string): 'patent' | 'trademark' | 'design' | 'civil' | 'civil_procedure' | null {
  const lower = filename.toLowerCase();
  if (/특허/.test(filename) || /patent/.test(lower)) return 'patent';
  if (/상표/.test(filename) || /trademark/.test(lower)) return 'trademark';
  if (/디자인|디보/.test(filename) || /design/.test(lower)) return 'design';
  if (/민사소송|민소|민소법/.test(filename)) return 'civil_procedure';
  if (/민법/.test(filename) || /civil/.test(lower)) return 'civil';
  // 심판편람/심사기준 등 일반 실무서는 특허 도메인으로 가정
  if (/심판|심사|특허청/.test(filename)) return 'patent';
  return null;
}
