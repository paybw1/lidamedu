// 빈칸 자료 대상 법령 4종 SSoT. 운영 결정: 특허법·상표법·디자인보호법·민법.
// 민사소송법은 빈칸 자료 대상 아님 — 빈칸 화면에서 노출 X, 직접 URL 진입은 loader 에서 redirect.

import { LAW_SUBJECTS, type LawSubjectSlug } from "~/features/subjects/lib/subjects";

export const BLANK_LAW_SLUGS = [
  "patent",
  "trademark",
  "design",
  "civil",
] as const satisfies readonly LawSubjectSlug[];

export type BlankLawSlug = (typeof BLANK_LAW_SLUGS)[number];

export function isBlankLawSlug(s: string): s is BlankLawSlug {
  return (BLANK_LAW_SLUGS as readonly string[]).includes(s);
}

export const BLANK_LAW_TABS: ReadonlyArray<{
  slug: BlankLawSlug;
  name: string;
  shortName: string;
}> = BLANK_LAW_SLUGS.map((slug) => ({
  slug,
  name: LAW_SUBJECTS[slug].name,
  shortName: LAW_SUBJECTS[slug].shortName,
}));
