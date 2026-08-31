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

/** zod enum·순회용 키 목록 — DOCTRINE_AXES 와 항상 같은 순서. */
export const DOCTRINE_AXIS_KEYS = DOCTRINE_AXES.map((ax) => ax.key) as [
  DoctrineAxisKey,
  ...DoctrineAxisKey[],
];

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
  /**
   * 쟁점별 코멘트 — 판결문 서술이 아니라 **강사가 덧붙이는 말**(출제 포인트·주의점·
   * 관련 논점 등). 도식의 나머지 칸은 판결문 근거로만 채우는 규칙이라(창작 금지),
   * 그 규칙 밖의 서술은 이 칸으로 분리한다.
   * ★새 필드라 기존 블록에는 없다 — default("") 로 읽어야 파싱이 깨지지 않는다.
   */
  comment: trimmed.default(""),
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

// ── 심급별 결과(경과 배지) ───────────────────────────────────────────────
// ★심급을 3칸 고정(심판원/특허법원/대법원)으로 두지 않는다 — 심결취소계열과 민사계열
//   (지방법원 → 항소심 → 대법원)이 섞여 있어 고정 칸은 민사 사건에 안 맞는다.
//   대신 level 로 순서를 주고 court 는 판결문에 적힌 법원명을 그대로 쓴다.
export const OUTCOME_LEVELS = [
  "trial_board", // 특허심판원(심결·결정)
  "first", // 1심
  "appeal", // 항소심 — 심결취소소송의 특허법원도 여기
  "supreme", // 대법원
] as const;

export type OutcomeLevel = (typeof OUTCOME_LEVELS)[number];

export const OUTCOME_LEVEL_LABEL: Record<OutcomeLevel, string> = {
  trial_board: "심판원",
  first: "1심",
  appeal: "항소심",
  supreme: "대법원",
};

const OUTCOME_LEVEL_ORDER: Record<OutcomeLevel, number> = {
  trial_board: 0,
  first: 1,
  appeal: 2,
  supreme: 3,
};

export const OUTCOME_RESULTS = [
  "인용",
  "일부인용",
  "기각",
  "각하",
  "취소", // 심결취소 — 청구인 승. 주문 표기가 "…심결을 취소한다"
  "파기환송",
  "파기자판",
  "상고기각",
  "심리불속행",
  "기타",
] as const;

export type OutcomeResult = (typeof OUTCOME_RESULTS)[number];

/**
 * 배지 색 — 결과의 **방향**만 구분한다(누가 이겼나).
 * 학생이 배지를 훑을 때 알아야 하는 건 심급마다 결론이 뒤집혔는지이지,
 * 주문 문구의 종류가 아니다.
 *  challenge = 다투는 쪽이 이긴 것(인용·취소·파기)
 *  keep      = 기존 상태가 유지된 것(기각·각하·상고기각·심리불속행)
 */
export type OutcomeTone = "challenge" | "keep" | "mixed" | "neutral";

export const OUTCOME_TONE: Record<OutcomeResult, OutcomeTone> = {
  인용: "challenge",
  취소: "challenge",
  파기환송: "challenge",
  파기자판: "challenge",
  일부인용: "mixed",
  기각: "keep",
  각하: "keep",
  상고기각: "keep",
  심리불속행: "keep",
  기타: "neutral",
};

export const caseOutcomeSchema = z.object({
  level: z.enum(OUTCOME_LEVELS),
  /** 판결문에 적힌 법원명 그대로 — "특허심판원", "특허법원", "서울고등법원", "대법원". */
  court: trimmed.min(1),
  result: z.enum(OUTCOME_RESULTS),
  /** 그 심급의 사건번호(있을 때만). */
  caseNo: trimmed.optional(),
  /** 심결·선고일. 타임라인과 같은 이유로 문자열(불완전 날짜 허용). */
  when: trimmed.optional(),
  /** 배지에 안 들어가는 한 줄 보충(마우스오버). */
  note: trimmed.optional(),
});

export const caseOutcomesSchema = z.array(caseOutcomeSchema);

export type CaseOutcome = z.infer<typeof caseOutcomeSchema>;

/**
 * DB jsonb → 심급별 결과. 깨진 항목은 버리고, 심급 순서로 정렬한다.
 * (생성·백필이 순서를 지켜 넣지만 손으로 고칠 수 있으므로 읽는 쪽에서 한 번 더 맞춘다.)
 */
export function parseOutcomes(value: unknown): CaseOutcome[] {
  if (!Array.isArray(value)) return [];
  const out: CaseOutcome[] = [];
  for (const raw of value) {
    const parsed = caseOutcomeSchema.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
  }
  return out.sort(
    (a, b) => OUTCOME_LEVEL_ORDER[a.level] - OUTCOME_LEVEL_ORDER[b.level],
  );
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

/**
 * 합쳐진 법리 축의 조각들. "1. …

2. …" 로 번호가 붙어 있으면 그 단위로 자른다.
 * 번호가 없으면 통째로 한 조각 — 사람이 손으로 쓴 여러 문단을 쪼개면 문장이 흩어진다.
 */
function splitNumbered(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  // 줄머리의 "1. " — 문단 첫 줄에만 온다(본문 중간의 "제1. " 등과 섞이지 않게).
  const marker = /^(?:\d{1,2})\. +/;
  const paras = t.split(/\n\s*\n/);
  if (!paras.every((x) => marker.test(x.trim()))) return [t];
  return paras.map((x) => x.trim().replace(marker, "").trim()).filter(Boolean);
}

/**
 * 조각들을 하나의 축 본문으로. 두 개 이상이면 번호를 붙인다(원장 요청 2026-08-26) —
 * 서로 다른 법리를 한 축으로 합치면 어디까지가 한 갈래인지 읽히지 않는다.
 * 하나뿐이면 번호를 붙이지 않는다("1." 만 덩그러니 남는 게 더 이상하다).
 */
function joinNumbered(parts: string[]): string {
  const list = parts.map((x) => x.trim()).filter(Boolean);
  if (list.length <= 1) return list[0] ?? "";
  return list.map((x, i) => `${i + 1}. ${x}`).join("\n\n");
}
/**
 * 법리 한 축의 내용을 다른 축으로 옮긴다 — 검수에서 가장 잦은 수정이 '분류가 틀림'이다.
 * ★대상 축에 이미 내용이 있으면 **덮어쓰지 않고 이어붙이면서 번호를 매긴다**.
 *   검수 중 실수로 다른 축의 서술을 날리는 편이 잘못 분류된 채 두는 것보다 나쁘다.
 *   서로 다른 법리가 한 축에 모이므로, 어디까지가 한 갈래인지 번호로 갈라 준다.
 *     문언적 해석 "A" + 취지의 해석 "B"  →  문언적 해석 "1. A

2. B"
 *   이미 번호가 붙은 축에 또 옮기면 전체를 다시 매긴다(1. 2. 3. …).
 * from 과 to 가 같거나 from 이 비어 있으면 원본을 그대로 돌려준다.
 */
export function moveDoctrineAxis(
  block: CaseDiagramBlock,
  from: DoctrineAxisKey,
  to: DoctrineAxisKey,
): CaseDiagramBlock {
  if (from === to) return block;
  const body = block.doctrine[from]?.trim();
  if (!body) return block;
  const target = block.doctrine[to]?.trim();
  const doctrine = { ...block.doctrine };
  delete doctrine[from];
  doctrine[to] = target
    ? joinNumbered([...splitNumbered(target), ...splitNumbered(body)])
    : body;
  return { ...block, doctrine };
}

/**
 * 한 축의 본문을 갈래 단위로 읽는다 — 번호가 매겨져 있으면 그 조각들, 아니면 통째로 하나.
 * 화면이 "몇 번째 갈래를 옮길지" 고르게 하려면 같은 기준으로 세야 해서 공개한다.
 */
export function doctrineParts(
  block: CaseDiagramBlock,
  axis: DoctrineAxisKey,
): string[] {
  return splitNumbered(block.doctrine[axis] ?? "");
}

/**
 * 한 축에 묶여 있던 갈래 **하나만** 떼어 다른 축으로 옮긴다(원장 요청 2026-08-27).
 * 합칠 때 번호를 매겨 두었으므로(moveDoctrineAxis), 잘못 합친 것을 되돌리거나 셋 중
 * 하나만 다시 분류하는 길이 필요하다.
 * ★남는 쪽도 다시 번호를 매긴다 — 2번을 떼면 3번이 2번이 된다. 하나만 남으면 번호를
 *   떼고, 남는 게 없으면 축 자체를 비운다.
 * 범위를 벗어난 partIndex·같은 축이면 원본을 그대로 돌려준다.
 */
export function moveDoctrinePart(
  block: CaseDiagramBlock,
  from: DoctrineAxisKey,
  to: DoctrineAxisKey,
  partIndex: number,
): CaseDiagramBlock {
  if (from === to) return block;
  const parts = splitNumbered(block.doctrine[from] ?? "");
  const moved = parts[partIndex];
  if (!moved) return block;
  const rest = parts.filter((_, i) => i !== partIndex);
  const target = block.doctrine[to]?.trim();
  const doctrine = { ...block.doctrine };
  const remain = joinNumbered(rest);
  if (remain) doctrine[from] = remain;
  else delete doctrine[from];
  doctrine[to] = target
    ? joinNumbered([...splitNumbered(target), moved])
    : moved;
  return { ...block, doctrine };
}

/** 코멘트가 달린 쟁점 수 — 검수 목록·배지에서 쓴다. */
export function commentedBlockCount(blocks: CaseDiagramBlock[]): number {
  return blocks.filter((b) => (b.comment ?? "").trim().length > 0).length;
}

export function emptyBlock(): CaseDiagramBlock {
  return {
    issue: "",
    statutes: [],
    doctrine: {},
    application: "",
    conclusion: "",
    comment: "",
  };
}

/** 승인 가능 여부 — 쟁점 1개 이상 + 각 쟁점에 결론이 있어야 도식으로서 성립. */
export function diagramApprovable(blocks: CaseDiagramBlock[]): boolean {
  return (
    blocks.length > 0 &&
    blocks.every((b) => b.issue.length >= 2 && b.conclusion.length > 0)
  );
}
