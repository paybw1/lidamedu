// feat-9-001 청킹 로직 — 조문/판례/문제 → content_chunks 입력 형태.
//
// 청크 단위 (docs/features/feat-9-ai-qna.md §6):
// - article: 조 1개 = 청크 1. (본문이 길어도 v1 은 단일 청크 — 단순화. 800 토큰 초과 시 split 은 v1.1.)
// - case: 요지(summary) / 이유(reasoning) / 평석(commentary) 섹션별 청크.
// - problem: 발문 + 보기 + 해설 합쳐 단일 청크 (학습 가치 = 해설).
//
// 안정적 식별자 (source_type, source_id, chunk_index) 로 upsert. content_hash 동일하면
// 재임베딩 skip 판정에 사용. body_text 는 평문(임베딩·trigram 양쪽).
//
// 토큰 수 추정 — 임베딩 비용 모니터링용. 한국어 1글자 ≈ 1~1.5 토큰 (대략값).

import { createHash } from "node:crypto";

export type ChunkSourceType = "article" | "case" | "problem";

export interface ChunkInput {
  sourceType: ChunkSourceType;
  sourceId: string;
  chunkIndex: number;
  lawCode: string | null;
  headingPath: string | null;
  bodyText: string;
  tokenCount: number;
  contentHash: string;
}

// 평문 정규화 — 멀티스페이스/개행 압축, 양끝 trim. content_hash 안정화.
// `<u>...</u>` 는 판례 본문의 underline 시각 마커이며 임베딩/검색에는 노이즈이므로 제거.
function normalizeBody(s: string): string {
  return s
    .replace(/<\/?u>/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

// 매우 단순한 토큰 추정 — 공백 분리 + 한글 문자수 가중. eval 후 정교화.
function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  // 한글 1자 ≈ 1.4 토큰 (Voyage 멀티링구얼 토크나이저 대략).
  let count = 0;
  for (const ch of trimmed) {
    if (ch >= "가" && ch <= "힯") count += 1.4;
    else if (/\s/.test(ch)) count += 0.0;
    else count += 0.4;
  }
  // 공백 단위 단어 — 영문/숫자 보정.
  count += trimmed.split(/\s+/).length * 0.2;
  return Math.max(1, Math.round(count));
}

function makeChunk(
  sourceType: ChunkSourceType,
  sourceId: string,
  chunkIndex: number,
  lawCode: string | null,
  headingPath: string | null,
  rawBody: string,
): ChunkInput {
  const body = normalizeBody(rawBody);
  return {
    sourceType,
    sourceId,
    chunkIndex,
    lawCode,
    headingPath,
    bodyText: body,
    tokenCount: estimateTokens(body),
    contentHash: sha256Hex(body),
  };
}

// ── article ──────────────────────────────────────────────────────────────

export interface ArticleChunkSource {
  articleId: string;
  lawCode: string;
  displayLabel: string; // 예: "특허법 제29조"
  bodyText: string;     // article_revisions.body_text (현행 시행본)
}

export function chunkArticle(a: ArticleChunkSource): ChunkInput[] {
  if (!a.bodyText.trim()) return [];
  return [
    makeChunk(
      "article",
      a.articleId,
      0,
      a.lawCode,
      a.displayLabel,
      `${a.displayLabel}\n\n${a.bodyText}`,
    ),
  ];
}

// ── case ─────────────────────────────────────────────────────────────────

export interface CaseChunkSource {
  caseId: string;
  /** 표시용 — "대법원 2021. 4. 8. 선고 2018후10844 판결" 식. */
  headingPath: string;
  /** subject_laws[0] 등으로 결정. null 이면 cross-subject. */
  lawCode: string | null;
  summaryTitle: string | null;
  summaryBodyMd: string | null;  // 요지 (교재 기반)
  reasoningMd: string | null;    // 이유 (교재 기반)
  commentBodyMd: string | null;  // 평석 (교재 기반)
  officialTextMd: string | null; // 공식 판결 전문 (국가법령정보 OPEN API, A안)
}

export function chunkCase(c: CaseChunkSource): ChunkInput[] {
  const out: ChunkInput[] = [];
  const sections: { label: string; body: string | null }[] = [
    { label: "요지", body: c.summaryBodyMd },
    { label: "이유", body: c.reasoningMd },
    { label: "평석", body: c.commentBodyMd },
    { label: "공식전문", body: c.officialTextMd },
  ];
  for (const sec of sections) {
    if (!sec.body || !sec.body.trim()) continue;
    const heading = c.summaryTitle
      ? `${c.headingPath} · ${c.summaryTitle} · ${sec.label}`
      : `${c.headingPath} · ${sec.label}`;
    out.push(
      makeChunk(
        "case",
        c.caseId,
        out.length,
        c.lawCode,
        heading,
        `${heading}\n\n${sec.body}`,
      ),
    );
  }
  return out;
}

// ── problem ──────────────────────────────────────────────────────────────

export interface ProblemChoicePlain {
  /** 보기 라벨 (① ② … 또는 1 2 …). */
  label: string;
  bodyMd: string;
  /** OX 진위 (객관식·OX 공용). */
  oxTruth?: "O" | "X" | null;
}

export interface ProblemChunkSource {
  problemId: string;
  /** 문제 표시명 — "2023년 1차 12번" 식 또는 "기출변형 5번". */
  headingPath: string;
  /** 법 과목(과학 문제는 null). */
  lawCode: string | null;
  bodyMd: string;
  explanationMd: string | null;
  /** 객관식 보기. 없으면 빈 배열. */
  choices: ReadonlyArray<ProblemChoicePlain>;
  /** 박스/사례 항목 (mc_box 등). */
  boxItems: ReadonlyArray<ProblemChoicePlain>;
  /** 주관식 모범답안. */
  modelAnswerMd: string | null;
  gradingRubricMd: string | null;
}

export function chunkProblem(p: ProblemChunkSource): ChunkInput[] {
  const parts: string[] = [p.headingPath, "", p.bodyMd];

  if (p.choices.length > 0) {
    parts.push("", "[보기]");
    for (const c of p.choices) {
      const ox = c.oxTruth ? ` (${c.oxTruth})` : "";
      parts.push(`${c.label}. ${c.bodyMd}${ox}`);
    }
  }
  if (p.boxItems.length > 0) {
    parts.push("", "[항목]");
    for (const b of p.boxItems) {
      const ox = b.oxTruth ? ` (${b.oxTruth})` : "";
      parts.push(`${b.label}. ${b.bodyMd}${ox}`);
    }
  }
  if (p.explanationMd) {
    parts.push("", "[해설]", p.explanationMd);
  }
  if (p.modelAnswerMd) {
    parts.push("", "[모범답안]", p.modelAnswerMd);
  }
  if (p.gradingRubricMd) {
    parts.push("", "[채점기준]", p.gradingRubricMd);
  }

  const body = parts.join("\n");
  if (!body.trim()) return [];
  return [
    makeChunk(
      "problem",
      p.problemId,
      0,
      p.lawCode,
      p.headingPath,
      body,
    ),
  ];
}
