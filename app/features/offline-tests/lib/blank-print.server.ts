// 오프라인 테스트 인쇄용 빈칸 본문 직렬화 (feat-7-042 교정).
// 인쇄가 평면 body_text 만 쓰던 문제를 해결 — 라이브 빈칸 뷰와 동일하게 article body_json 전체를
// 기준으로 빈칸을 배치(computeBlockBlankHits)하고 구조화 텍스트로 직렬화한다.
//  · body_text 에 없고 body_json 에만 있던 빈칸(예: 제42조 §2~④)까지 전부 포함 → 조문 짤림 해소
//  · 관련조문(header_refs 블록 + 절 끝 "法 …" 참조)은 제외("함께 공부할 조문" 본문·시행령은 유지)
//  · 빈칸 번호는 읽기 순서대로 1,2,3… 재부여(원문자↔괄호 혼용 제거)
import {
  parseArticleBody,
  type Block,
} from "~/features/laws/lib/article-body";
import type { BlankHit } from "~/features/blanks/components/blanks-context";
import {
  blockCumulativeText,
  computeBlockBlankHits,
} from "~/features/blanks/lib/blank-layout";
import type { BlankItem } from "~/features/blanks/queries.server";

export interface PrintBlank {
  idx: number; // 읽기 순서 1-based
  answer: string;
  length: number;
}
export interface PrintBlankBody {
  bodyText: string; // [[BLANK:N]] 토큰 포함(N = 읽기 순서)
  blanks: PrintBlank[];
}

// 관련조문 참조 마커 "法 NN(의N)?(①…)?(Ⅰ…)?"(+ 콤마 연속) 제거. 빈칸 토큰([[BLANK:N]])은 건드리지 않음.
const REF_CHARS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ";
const RELATED_REF_RE = new RegExp(
  `法\\s*\\d+(?:의\\d+)?[${REF_CHARS}]*(?:\\s*[,、·]\\s*\\d+(?:의\\d+)?[${REF_CHARS}]*)*`,
  "g",
);
function stripRelatedRefs(text: string): string {
  return text
    .replace(RELATED_REF_RE, "")
    .replace(/[ \t]+([.,、·)\]])/g, "$1") // 참조 제거 후 남은 공백-구두점 정리
    .replace(/,[\s,]*,/g, ",") // 연속 콤마 → 하나
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[\s,]+$/g, "") // 줄 끝 공백·콤마 잔재
    .trimEnd();
}

const LABELED = new Set(["clause", "item", "sub"]);

export function buildPrintBlankBody(
  bodyJson: unknown,
  rawBlanks: BlankItem[],
): PrintBlankBody {
  const body = parseArticleBody(bodyJson);
  if (!body) return { bodyText: "", blanks: [] };
  const hitsMap = computeBlockBlankHits(body, rawBlanks);

  const outBlanks: PrintBlank[] = [];
  const lines: string[] = [];
  let counter = 0;

  // 한 블록의 cumulative text 에 hit 위치마다 [[BLANK:N]] 토큰을 삽입(읽기 순서 재번호).
  const withTokens = (block: Block): string => {
    const cum = blockCumulativeText(block);
    const hits = (hitsMap.get(block) ?? [])
      .slice()
      .sort((a: BlankHit, b: BlankHit) => a.start - b.start);
    let text = "";
    let cursor = 0;
    for (const h of hits) {
      counter += 1;
      outBlanks.push({
        idx: counter,
        answer: h.blank.answer,
        length: h.blank.length || h.blank.answer.length || 4,
      });
      text += cum.slice(cursor, h.start) + `[[BLANK:${counter}]]`;
      cursor = h.end;
    }
    text += cum.slice(cursor);
    return stripRelatedRefs(text);
  };

  const emit = (block: Block, depth: number): void => {
    if (block.kind === "header_refs") return; // 관련조문 헤더 제외
    const indent = "  ".repeat(depth);
    if (block.kind === "sub_article_group") {
      for (const p of block.preface ?? []) emit(p, depth);
      for (const sa of block.articles) {
        const title = `${indent}〈${sa.title}〉`.trimEnd();
        if (sa.title.trim()) lines.push(title);
        for (const sb of sa.blocks) emit(sb, depth + 1);
      }
      return;
    }
    if (block.kind === "title_marker") {
      const t = stripRelatedRefs(block.text);
      if (t.trim()) lines.push(`${indent}${t}`.trimEnd());
      return;
    }
    // clause / item / sub / para
    const bodyText = withTokens(block);
    const label = LABELED.has(block.kind) ? (block as { label: string }).label : "";
    const subtitle =
      LABELED.has(block.kind) && (block as { subtitle?: string | null }).subtitle
        ? `(${(block as { subtitle?: string | null }).subtitle})`
        : "";
    const head = `${indent}${label}`.trimEnd();
    const rest = [subtitle, bodyText].filter((s) => s.trim()).join(" ").trim();
    const line = head ? (rest ? `${head} ${rest}` : head) : rest;
    if (line.trim()) lines.push(line);
    // 자손(항/호/목) 재귀
    if (block.kind === "clause" || block.kind === "item" || block.kind === "sub") {
      for (const c of block.children) emit(c, depth + 1);
    }
  };

  for (const b of body.blocks) emit(b, 0);
  return { bodyText: lines.join("\n"), blanks: outBlanks };
}
