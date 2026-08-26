import { z } from "zod";

import { lawSubjectSlugSchema } from "~/features/subjects/lib/subjects";

const articleRefSchema = z.object({
  law_code: lawSubjectSlugSchema,
  article: z.number().int().positive(),
  branch: z.number().int().positive().optional(),
  clause: z.number().int().positive().optional(),
  item: z.number().int().positive().optional(),
  item_branch: z.number().int().positive().optional(),
  sub_item: z.string().optional(),
});

const inlineTextSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const inlineUnderlineSchema = z.object({
  type: z.literal("underline"),
  text: z.string(),
});

const inlineSubtitleSchema = z.object({
  type: z.literal("subtitle"),
  text: z.string(),
});

const inlineAnnotationSchema = z.object({
  type: z.literal("annotation"),
  text: z.string(),
});

// 하위 조문 라벨 — 시행령·시행규칙·대통령령·총리령 등 위임 조문 참조.
// annotation(강사 강조 라벨)과 시각적·의미적으로 구분돼야 한다.
// 화면 표시: 인디고 chip + (text) 모양. text 는 wrap 없이 plain ("시행령 제5조").
const inlineOrdinanceRefSchema = z.object({
  type: z.literal("ordinance_ref"),
  text: z.string(),
});

const inlineRefArticleSchema = z.object({
  type: z.literal("ref_article"),
  raw: z.string(),
  target: articleRefSchema,
});

const inlineRefLawSchema = z.object({
  type: z.literal("ref_law"),
  raw: z.string(),
  lawCode: lawSubjectSlugSchema,
});

const inlineAmendmentNoteSchema = z.object({
  type: z.literal("amendment_note"),
  text: z.string(),
});

const inlineFootnoteSchema = z.object({
  type: z.literal("footnote"),
  n: z.number().int().nonnegative(),
  body_md: z.string(),
});

const inlineSchema = z.discriminatedUnion("type", [
  inlineTextSchema,
  inlineUnderlineSchema,
  inlineSubtitleSchema,
  inlineAnnotationSchema,
  inlineOrdinanceRefSchema,
  inlineRefArticleSchema,
  inlineRefLawSchema,
  inlineAmendmentNoteSchema,
  inlineFootnoteSchema,
]);

export type Inline = z.infer<typeof inlineSchema>;
export type ArticleRef = z.infer<typeof articleRefSchema>;

export interface ClauseBlock {
  kind: "clause";
  number: number;
  label: string;
  subtitle?: string | null;
  inline: Inline[];
  children: Block[];
}
export interface ItemBlock {
  kind: "item";
  number: number;
  label: string;
  subtitle?: string | null;
  inline: Inline[];
  children: Block[];
}
export interface SubBlock {
  kind: "sub";
  letter: string;
  label: string;
  subtitle?: string | null;
  inline: Inline[];
  children: Block[];
}
export interface ParaBlock {
  kind: "para";
  inline: Inline[];
}
export interface TitleMarkerBlock {
  kind: "title_marker";
  text: string;
}
export interface SubArticleEntry {
  number: number;
  branch?: number | null;
  title: string;
  blocks: Block[];
}
export interface SubArticleGroupBlock {
  kind: "sub_article_group";
  source: string;
  // article 헤더(HStyle4) 가 나오기 전의 그룹 내 본문 — 코멘트/요약 등
  preface?: Block[];
  articles: SubArticleEntry[];
}
export interface HeaderRefsBlock {
  kind: "header_refs";
  refs: Inline[];
}
export type Block =
  | ClauseBlock
  | ItemBlock
  | SubBlock
  | ParaBlock
  | TitleMarkerBlock
  | SubArticleGroupBlock
  | HeaderRefsBlock;

export interface ArticleBody {
  blocks: Block[];
}

const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal("clause"),
      number: z.number().int().positive(),
      label: z.string(),
      subtitle: z.string().nullish(),
      inline: z.array(inlineSchema),
      children: z.array(blockSchema),
    }),
    z.object({
      kind: z.literal("item"),
      number: z.number().int().positive(),
      label: z.string(),
      subtitle: z.string().nullish(),
      inline: z.array(inlineSchema),
      children: z.array(blockSchema),
    }),
    z.object({
      kind: z.literal("sub"),
      letter: z.string(),
      label: z.string(),
      subtitle: z.string().nullish(),
      inline: z.array(inlineSchema),
      children: z.array(blockSchema),
    }),
    z.object({
      kind: z.literal("para"),
      inline: z.array(inlineSchema),
    }),
    z.object({
      kind: z.literal("title_marker"),
      text: z.string(),
    }),
    z.object({
      kind: z.literal("sub_article_group"),
      source: z.string(),
      preface: z.array(blockSchema).optional(),
      articles: z.array(
        z.object({
          number: z.number().int().positive(),
          branch: z.number().int().positive().nullish(),
          title: z.string(),
          blocks: z.array(blockSchema),
        }),
      ),
    }),
    z.object({
      kind: z.literal("header_refs"),
      refs: z.array(inlineSchema),
    }),
  ]),
);

export const articleBodySchema: z.ZodType<ArticleBody> = z.object({
  blocks: z.array(blockSchema),
});

export function parseArticleBody(input: unknown): ArticleBody | null {
  const result = articleBodySchema.safeParse(input);
  return result.success ? result.data : null;
}

export function articleAnchor(t: {
  clause?: number;
  item?: number;
  item_branch?: number;
  sub_item?: string;
}): string {
  if (t.sub_item) return `#sub-${t.sub_item}`;
  if (t.item !== undefined) {
    return t.item_branch !== undefined
      ? `#item-${t.item}_${t.item_branch}`
      : `#item-${t.item}`;
  }
  if (t.clause !== undefined) return `#clause-${t.clause}`;
  return "";
}

// ── 본문 텍스트에 섞여 들어온 메타 제거 ──────────────────────────────────────
//
// 특허법 import 일부 조문은 본문 inline text 끝에 관련조문 참조가 raw 한자로 박혀 있고
// ("… 제출하여야 한다. <개정 2014.6.11.>法 200의2①"), 개정 표기도 본문에 그대로 들어 있다.
// 조문 뷰어는 이걸 참조 토글로 옮겨 보여 주지만, **원문 자체가 정답이 되는 곳**(암기 모드)은
// 텍스트에서 걷어내야 한다 — 학생이 외울 대상이 아니고, 유사도 채점에 섞이면 본문을 다 써도
// 100%가 나오지 않는다(특허 42조 ①은 최대 86% — 2026-08-26 신고).

/** 본문 끝에 붙은 관련조문 참조 "法 NN(의N)?(①)?(Ⅰ)?" — 콤마로 이어진 연속도 함께. */
export const TRAILING_RAW_REFS_RE =
  /(?:[\s,·、，/]*法\s*\d+(?:의\d+)?[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]*[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]*)+\s*$/;

/** 개정·신설·시행 표기 — `<개정 2014.6.11.>` · `[전문개정 …]`. */
const AMENDMENT_NOTE_RE = /<[^>]*>|\[[^\]]*(?:개정|신설|시행)[^\]]*\]/g;

/**
 * 조문 본문 텍스트에서 관련조문 참조와 개정 표기를 걷어낸다.
 * ★개정 표기를 먼저 지운다 — 참조가 그 뒤에 붙어 있는 경우("…<개정 …>法 200의2①")와
 *   앞에 있는 경우("…法 62Ⅳ <개정 …>") 둘 다 끝에서 잡히게 하기 위해서다.
 */
export function stripRefsAndNotes(text: string): string {
  return text
    .replace(AMENDMENT_NOTE_RE, "")
    .replace(TRAILING_RAW_REFS_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
