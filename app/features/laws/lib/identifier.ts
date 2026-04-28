import {
  LAW_SUBJECTS,
  type LawSubjectSlug,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

export interface ArticleIdent {
  lawCode: LawSubjectSlug;
  article: number;
  branch?: number;
  clause?: number;
  item?: number;
  subItem?: string;
}

// articleNumberText: "29" 또는 "29의2" — DB 의 articles.article_number 필드와 동일.
export function articleNumberText(ident: ArticleIdent): string {
  return ident.branch ? `${ident.article}의${ident.branch}` : String(ident.article);
}

// 표시용 prefix. 한국 법령 표기는 "제29조의2" (가지조는 조 뒤에 의N).
//   "29"     → "제29조"
//   "29의2"  → "제29조의2"
export function articleDisplayPrefix(articleNumber: string): string {
  const [base, branch] = articleNumber.split("의");
  return branch ? `제${base}조의${branch}` : `제${base}조`;
}

export function articleDisplayPrefixFromIdent(ident: ArticleIdent): string {
  return ident.branch
    ? `제${ident.article}조의${ident.branch}`
    : `제${ident.article}조`;
}

const CIRCLED_DIGITS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const KOREAN_SUB_ITEMS = [
  "가",
  "나",
  "다",
  "라",
  "마",
  "바",
  "사",
  "아",
  "자",
  "차",
  "카",
  "타",
  "파",
  "하",
] as const;

const LAW_NAME_TO_CODE: Record<string, LawSubjectSlug> = {
  특허법: "patent",
  상표법: "trademark",
  디자인보호법: "design",
  민법: "civil",
  민사소송법: "civil-procedure",
};

function clauseFromCircled(ch: string): number | null {
  const idx = CIRCLED_DIGITS.indexOf(ch);
  return idx === -1 ? null : idx + 1;
}

function clauseToCircled(n: number): string | null {
  if (!Number.isInteger(n) || n < 1 || n > CIRCLED_DIGITS.length) return null;
  return CIRCLED_DIGITS[n - 1];
}

const KOREAN_TO_LETTER: Record<string, string> = Object.fromEntries(
  KOREAN_SUB_ITEMS.map((k, i) => [k, String.fromCharCode("A".charCodeAt(0) + i)]),
);

const LETTER_TO_KOREAN: Record<string, string> = Object.fromEntries(
  KOREAN_SUB_ITEMS.map((k, i) => [String.fromCharCode("A".charCodeAt(0) + i), k]),
);

export function subItemToLetter(sub: string): string | null {
  return KOREAN_TO_LETTER[sub] ?? null;
}

export function letterToSubItem(letter: string): string | null {
  return LETTER_TO_KOREAN[letter.toUpperCase()] ?? null;
}

function isLawSubjectSlug(value: unknown): value is LawSubjectSlug {
  return lawSubjectSlugSchema.safeParse(value).success;
}

// ── parseDisplay: "특허법 제29조의2 제1항 제2호 가목"
// 한국 법령 표기: 제N조 또는 제N조의M
const DISPLAY_RE =
  /^(특허법|상표법|디자인보호법|민법|민사소송법)\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?:\s*제\s*(\d+)\s*항)?(?:\s*제\s*(\d+)\s*호)?(?:\s*([가-하])\s*목)?$/;

export function parseDisplay(input: string): ArticleIdent | null {
  const m = DISPLAY_RE.exec(input.trim());
  if (!m) return null;
  const [, lawName, article, branch, clause, item, sub] = m;
  const lawCode = LAW_NAME_TO_CODE[lawName];
  if (!lawCode) return null;
  return {
    lawCode,
    article: Number(article),
    branch: branch ? Number(branch) : undefined,
    clause: clause ? Number(clause) : undefined,
    item: item ? Number(item) : undefined,
    subItem: sub ?? undefined,
  };
}

export function toDisplay(ident: ArticleIdent): string {
  const lawName = LAW_SUBJECTS[ident.lawCode].name;
  let out = `${lawName} ${articleDisplayPrefixFromIdent(ident)}`;
  if (ident.clause !== undefined) out += ` 제${ident.clause}항`;
  if (ident.item !== undefined) out += ` 제${ident.item}호`;
  if (ident.subItem) out += ` ${ident.subItem}목`;
  return out;
}

// ── parseShorthand: "法 29①2.가" 또는 "法 29의2②1.가"
// 한국 본문 약식 표기는 "29의2" 와 같이 의가 조보다 먼저 — "29의2 + ②1.가"
const SHORTHAND_RE =
  /^法\s*(\d+(?:의\d+)?)([①-⑳])?(?:\s*(\d+)(?:\s*\.\s*([가-하]))?)?$/;

export function parseShorthand(
  input: string,
  defaultLawCode: LawSubjectSlug,
): ArticleIdent | null {
  const m = SHORTHAND_RE.exec(input.trim());
  if (!m) return null;
  const [, articleStr, circled, item, sub] = m;
  const [base, branch] = articleStr.split("의");
  const clause = circled ? clauseFromCircled(circled) : null;
  return {
    lawCode: defaultLawCode,
    article: Number(base),
    branch: branch ? Number(branch) : undefined,
    clause: clause ?? undefined,
    item: item ? Number(item) : undefined,
    subItem: sub ?? undefined,
  };
}

export function toShorthand(ident: ArticleIdent): string {
  let out = `法 ${articleNumberText(ident)}`;
  if (ident.clause !== undefined) {
    const circled = clauseToCircled(ident.clause);
    out += circled ?? `(${ident.clause})`;
  }
  if (ident.item !== undefined) out += `${ident.item}`;
  if (ident.subItem) out += `.${ident.subItem}`;
  return out;
}

// ── parseSlug: 다음 형식 모두 허용
//   "29"            → article 29
//   "29의2"         → article 29, branch 2 (가지조)
//   "29-1-2-ga"     → article 29, clause 1, item 2, sub 가
//   "29의2-1"       → article 29의2, clause 1
const SLUG_RE =
  /^(\d+)(?:의(\d+))?(?:-(\d+))?(?:-(\d+))?(?:-([a-n]))?$/i;

export function parseSlug(
  input: string,
  lawCode: LawSubjectSlug,
): ArticleIdent | null {
  const m = SLUG_RE.exec(input.trim());
  if (!m) return null;
  const [, article, branch, clause, item, letter] = m;
  return {
    lawCode,
    article: Number(article),
    branch: branch ? Number(branch) : undefined,
    clause: clause ? Number(clause) : undefined,
    item: item ? Number(item) : undefined,
    subItem: letter ? (letterToSubItem(letter) ?? undefined) : undefined,
  };
}

export function toSlug(ident: ArticleIdent): string {
  const parts: string[] = [String(ident.article)];
  if (ident.clause !== undefined) parts.push(String(ident.clause));
  if (ident.item !== undefined) {
    if (ident.clause === undefined) parts.push("0");
    parts.push(String(ident.item));
  }
  if (ident.subItem) {
    while (parts.length < 3) parts.push("0");
    const letter = subItemToLetter(ident.subItem);
    if (letter) parts.push(letter.toLowerCase());
  }
  return parts.join("-");
}

// ── ltree path: "patent.ch02.s01.a29.c01.i02.gA"
// 조 위 그룹 노드(ch/s)는 호출 시 ancestors 로 전달. 미지정 시 a 부터 시작.
const LTREE_RE =
  /^([a-z-]+)((?:\.(?:pt|ch|s)\d{2,3})*)\.a(\d+)(?:\.c(\d+))?(?:\.i(\d+))?(?:\.g([A-N]))?$/;

export function parseLtreePath(input: string): ArticleIdent | null {
  const m = LTREE_RE.exec(input.trim());
  if (!m) return null;
  const [, lawCode, , article, clause, item, letter] = m;
  if (!isLawSubjectSlug(lawCode)) return null;
  return {
    lawCode,
    article: Number(article),
    clause: clause ? Number(clause) : undefined,
    item: item ? Number(item) : undefined,
    subItem: letter ? (letterToSubItem(letter) ?? undefined) : undefined,
  };
}

interface LtreeAncestors {
  part?: number;
  chapter?: number;
  section?: number;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

export function toLtreePath(
  ident: ArticleIdent,
  ancestors: LtreeAncestors = {},
): string {
  const segments: string[] = [ident.lawCode];
  if (ancestors.part !== undefined) segments.push(`pt${pad(ancestors.part, 2)}`);
  if (ancestors.chapter !== undefined)
    segments.push(`ch${pad(ancestors.chapter, 2)}`);
  if (ancestors.section !== undefined)
    segments.push(`s${pad(ancestors.section, 2)}`);
  segments.push(`a${ident.article}`);
  if (ident.clause !== undefined) segments.push(`c${pad(ident.clause, 2)}`);
  if (ident.item !== undefined) segments.push(`i${pad(ident.item, 2)}`);
  if (ident.subItem) {
    const letter = subItemToLetter(ident.subItem);
    if (letter) segments.push(`g${letter}`);
  }
  return segments.join(".");
}

// ── extractRefs: 본문 텍스트에서 inline 참조 토큰 추출 (가지조 대응)
const REF_GLOBAL_RE =
  /法\s*(\d+(?:의\d+)?)([①-⑳])?(?:\s*(\d+)(?:\s*\.\s*([가-하]))?)?/g;

export interface ExtractedRef {
  raw: string;
  ident: ArticleIdent;
  start: number;
  end: number;
}

export function extractRefs(
  text: string,
  defaultLawCode: LawSubjectSlug,
): ExtractedRef[] {
  const out: ExtractedRef[] = [];
  for (const m of text.matchAll(REF_GLOBAL_RE)) {
    if (m.index === undefined) continue;
    const [raw, articleStr, circled, item, sub] = m;
    const [base, branch] = articleStr.split("의");
    const clause = circled ? clauseFromCircled(circled) : null;
    out.push({
      raw,
      start: m.index,
      end: m.index + raw.length,
      ident: {
        lawCode: defaultLawCode,
        article: Number(base),
        branch: branch ? Number(branch) : undefined,
        clause: clause ?? undefined,
        item: item ? Number(item) : undefined,
        subItem: sub ?? undefined,
      },
    });
  }
  return out;
}
