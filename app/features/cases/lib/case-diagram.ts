// feat-2-035 — 판례 도식(사실관계→쟁점→법조문→법리→포섭→결론) 형태 정의 SSOT.
//
// DB(case_diagrams.blocks jsonb)는 배열 여부만 보장하고, 필드 검증은 여기 Zod 가 단독으로 한다
// (action 경계 1곳에서만 검증 — 개발원칙 Layer 2 "단일 진입점").
// 순수 모듈 — 서버 전용 import 금지(화면·스크립트 양쪽에서 쓴다).

import { z } from "zod";

// ── 법리 4축 (원장 지정) ───────────────────────────────────────────────────
// ★각 축은 optional. 한 판결이 넷을 다 쓰는 일은 드물고, 빈 축을 채우게 하면
//   없는 논거를 지어내게 된다(CLAUDE.md Non-negotiable 11).
export const DOCTRINE_AXES = [
  {
    key: "textual",
    label: "문언적 해석",
    hint: "조문 문언 자체에서 도출되는 근거",
  },
  {
    key: "purpose",
    label: "취지의 해석",
    hint: "그 규정을 둔 입법취지",
  },
  {
    key: "objective",
    label: "목적의 해석",
    hint: "법 전체의 목적(제1조) 관점",
  },
  {
    key: "balance",
    label: "형평성 고려",
    hint: "다른 규정과의 균형·체계",
  },
] as const;

export type DoctrineAxisKey = (typeof DOCTRINE_AXES)[number]["key"];

export const DOCTRINE_AXIS_LABEL: Record<DoctrineAxisKey, string> =
  DOCTRINE_AXES.reduce(
    (acc, ax) => ({ ...acc, [ax.key]: ax.label }),
    {} as Record<DoctrineAxisKey, string>,
  );

// ── 사실관계 출처 종류 ─────────────────────────────────────────────────────
// DB CHECK 제약과 같은 목록을 유지할 것(스키마 변경 시 양쪽 동시 수정).
export const FACTS_SOURCE_KINDS = [
  "lower_auto",
  "lower_self",
  "lower_manual",
  "supreme_only",
  "manual",
  "none",
] as const;

export type FactsSourceKind = (typeof FACTS_SOURCE_KINDS)[number];

export const FACTS_SOURCE_LABEL: Record<FactsSourceKind, string> = {
  lower_auto: "하급심(자동 수집)",
  lower_self: "하급심(판례 자체)",
  lower_manual: "하급심(수기 투입)",
  supreme_only: "대법원 판결문 기재 범위",
  manual: "직접 작성",
  none: "사실관계 없음",
};

/** 하급심 근거가 있는 출처인지 — staff 목록의 "하급심 보강 필요" 판정. */
export function isLowerCourtSource(kind: FactsSourceKind): boolean {
  return (
    kind === "lower_auto" || kind === "lower_self" || kind === "lower_manual"
  );
}

// ── 블록 스키마 ────────────────────────────────────────────────────────────

const trimmed = z.string().trim();

export const doctrineSchema = z.object({
  textual: trimmed.optional(),
  purpose: trimmed.optional(),
  objective: trimmed.optional(),
  balance: trimmed.optional(),
});

export const caseDiagramBlockSchema = z.object({
  /** 쟁점 — 유일한 필수 항목. 쟁점 없는 블록은 의미가 없다. */
  issue: trimmed.min(2, "쟁점을 입력하세요"),
  /** 법조문 표기 문자열. v1 은 articles FK 링크를 두지 않는다(article_case_links 가 이미 담당). */
  statutes: z.array(trimmed.min(1)).default([]),
  doctrine: doctrineSchema.default({}),
  application: trimmed.default(""),
  conclusion: trimmed.default(""),
});

export const caseDiagramBlocksSchema = z.array(caseDiagramBlockSchema);

// ── 경과 타임라인 (사실관계와 같은 층위 — 판례당 1개) ──────────────────────
// when 을 date 로 강제하지 않는 이유: 판결문이 "2018. 7.경" 처럼 불완전한 날짜를 쓰는
// 경우가 있어, 엄격히 파싱하면 그런 사실을 통째로 버리게 된다.
export const TIMELINE_KINDS = [
  "filing", // 출원
  "disclosure", // 공지·공개·실시
  "registration", // 등록·설정
  "trial", // 심판 청구·심결
  "litigation", // 소 제기·판결
  "other",
] as const;

export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export const TIMELINE_KIND_LABEL: Record<TimelineKind, string> = {
  filing: "출원",
  disclosure: "공지",
  registration: "등록",
  trial: "심판",
  litigation: "소송",
  other: "경과",
};

export const timelineEventSchema = z.object({
  when: trimmed.min(1),
  what: trimmed.min(1),
  kind: z.enum(TIMELINE_KINDS).default("other"),
});

export const caseTimelineSchema = z.array(timelineEventSchema);

export type TimelineEvent = z.infer<typeof timelineEventSchema>;

/** DB jsonb → 타임라인. 형태가 깨진 항목은 버린다(전체를 못 읽는 것보다 낫다). */
export function parseTimeline(value: unknown): TimelineEvent[] {
  if (!Array.isArray(value)) return [];
  const out: TimelineEvent[] = [];
  for (const raw of value) {
    const parsed = timelineEventSchema.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export type CaseDiagramBlock = z.infer<typeof caseDiagramBlockSchema>;

/**
 * DB jsonb → 블록 배열. 형태가 깨진 값은 조용히 버린다(도식 전체를 못 읽는 것보다 낫다).
 * 깨진 블록이 있었는지는 반환값 길이로 비교해 호출부가 알 수 있다.
 */
export function parseBlocks(value: unknown): CaseDiagramBlock[] {
  if (!Array.isArray(value)) return [];
  const out: CaseDiagramBlock[] = [];
  for (const raw of value) {
    const parsed = caseDiagramBlockSchema.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** 빈 축은 렌더하지 않는다 — 자리만 만들어 두면 "비어 있음"이 정보처럼 보인다. */
export function filledAxes(
  block: CaseDiagramBlock,
): Array<{ key: DoctrineAxisKey; label: string; body: string }> {
  return DOCTRINE_AXES.flatMap((ax) => {
    const body = block.doctrine[ax.key]?.trim();
    return body ? [{ key: ax.key, label: ax.label, body }] : [];
  });
}

export function emptyBlock(): CaseDiagramBlock {
  return {
    issue: "",
    statutes: [],
    doctrine: {},
    application: "",
    conclusion: "",
  };
}

/** 승인 가능 여부 — 쟁점 1개 이상 + 각 쟁점에 결론이 있어야 도식으로서 성립. */
export function diagramApprovable(blocks: CaseDiagramBlock[]): boolean {
  return (
    blocks.length > 0 &&
    blocks.every((b) => b.issue.length >= 2 && b.conclusion.length > 0)
  );
}
