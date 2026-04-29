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
