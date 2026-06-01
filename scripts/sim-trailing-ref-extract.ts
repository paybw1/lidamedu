// 특허법 제42조 본문 inline 의 raw "法 ..." 텍스트가 ref_article 토큰으로 분리되는지 시뮬레이션.
// DB 호출 없이 article-body.tsx 의 헬퍼와 동일한 로직을 재현. 실제 본문 inline 입력은 하드코딩.

const TRAILING_RAW_REFS_RE =
  /(?:[\s,·、，/]*法\s*\d+(?:의\d+)?[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]*[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]*)+\s*$/;
const SINGLE_RAW_REF_RE_G =
  /法\s*(\d+)(?:의(\d+))?([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮])?([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ])?/g;
const CIRCLED_TO_INT: Record<string, number> = {
  "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5,
  "⑥": 6, "⑦": 7, "⑧": 8, "⑨": 9, "⑩": 10,
};
const ROMAN_TO_INT: Record<string, number> = {
  "Ⅰ": 1, "Ⅱ": 2, "Ⅲ": 3, "Ⅳ": 4, "Ⅴ": 5,
  "Ⅵ": 6, "Ⅶ": 7, "Ⅷ": 8, "Ⅸ": 9, "Ⅹ": 10,
};

interface Token { type: string; text?: string; raw?: string; target?: unknown; }

function parseSingleRawRef(
  raw: string, article: string, branch: string | undefined,
  clauseChar: string | undefined, itemChar: string | undefined, lawCode: string,
): Token {
  const articleNum = parseInt(article, 10);
  if (!Number.isInteger(articleNum) || articleNum <= 0) return { type: "text", text: raw };
  const target: Record<string, unknown> = { law_code: lawCode, article: articleNum };
  if (branch) target.branch = parseInt(branch, 10);
  if (clauseChar) target.clause = CIRCLED_TO_INT[clauseChar];
  if (itemChar) target.item = ROMAN_TO_INT[itemChar];
  return { type: "ref_article", raw, target };
}

function extractTrailingRawRefs(inline: Token[], lawCode: string): Token[] {
  if (inline.length === 0) return inline;
  const last = inline[inline.length - 1];
  if (last.type !== "text" || !last.text) return inline;
  const m = TRAILING_RAW_REFS_RE.exec(last.text);
  if (!m) return inline;
  const head = last.text.slice(0, m.index);
  const refsBlob = m[0];
  const refsOut: Token[] = [];
  let lastIdx = 0;
  SINGLE_RAW_REF_RE_G.lastIndex = 0;
  let rm: RegExpExecArray | null;
  while ((rm = SINGLE_RAW_REF_RE_G.exec(refsBlob)) !== null) {
    if (rm.index > lastIdx) {
      const sep = refsBlob.slice(lastIdx, rm.index);
      if (sep.length > 0) refsOut.push({ type: "text", text: sep });
    }
    refsOut.push(parseSingleRawRef(rm[0], rm[1], rm[2], rm[3], rm[4], lawCode));
    lastIdx = rm.index + rm[0].length;
  }
  const out: Token[] = inline.slice(0, -1);
  if (head.length > 0) out.push({ type: "text", text: head });
  out.push(...refsOut);
  return out;
}

// 특허법 제42조 실제 본문 inline (DB 에서 확인).
const cases: { label: string; inline: Token[] }[] = [
  {
    label: "clause ①",
    inline: [{ type: "text", text: "특허를 받으려는 자는 다음 각 호의 사항을 적은 특허출원서를 지식재산처장에게 제출하여야 한다. <개정 2014.6.11.>法 200의2①" }],
  },
  {
    label: "clause ②",
    inline: [{ type: "text", text: "제1항에 따른 특허출원서에는 발명의 설명·청구범위를 적은 명세서와 필요한 도면 및 요약서를 첨부하여야 한다. <개정 2014.6.11.>法 200의2②, 法 200의2③" }],
  },
  {
    label: "clause ③ > item 1",
    inline: [{ type: "text", text: "그 발명이 속하는 기술분야에서 통상의 지식을 가진 사람이 그 발명을 쉽게 실시할 수 있도록 명확하고 상세하게 적을 것 法 62Ⅳ, 法 63의2, 法 133①Ⅰ" }],
  },
  {
    label: "clause ⑧ (mixed inline)",
    inline: [
      { type: "text", text: "제2항에 따른 청구범위의 기재방법에 관하여 필요한 사항은 대통령령" },
      { type: "ordinance_ref", text: "시행령 제5조" },
      { type: "text", text: "으로 정한다. <개정 2014.6.11.>法 62Ⅳ" },
    ],
  },
  {
    label: "(대조군) clause text 끝에 法 없음",
    inline: [{ type: "text", text: "이 규칙에 따른 가산료는 그 기본료와 합산하여 납부하여야 한다." }],
  },
];

for (const c of cases) {
  const out = extractTrailingRawRefs(c.inline, "patent");
  const refsAdded = out.filter((t) => t.type === "ref_article").length;
  process.stdout.write(`── ${c.label} ──\n`);
  process.stdout.write(`  before: ${JSON.stringify(c.inline)}\n`);
  process.stdout.write(`  after:  ${JSON.stringify(out)}\n`);
  process.stdout.write(`  → ref_article 추가: ${refsAdded}건\n\n`);
}
