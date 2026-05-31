// ArticleBody JSON → SRS 카드 뒷면용 plain text 평탄화.
// 학생 학습 카드 정답으로 노출되므로 ref_article/ref_law/amendment_note 같은
// 참조·개정 메타데이터는 제거하고 순수 조문 본문만 남긴다.
//
// blockCumulativeText (blanks/lib/blank-layout) 는 빈칸 위치 계산용이라
// ref 토큰 raw 와 amendment_note 까지 길이 보존을 위해 포함하므로 SRS 에는 부적합.

import type {
  ArticleBody,
  Block,
  Inline,
} from "~/features/laws/lib/article-body";

function inlineLearnerText(t: Inline): string {
  if (t.type === "text" || t.type === "underline") {
    return t.text;
  }
  // 학습 카드 정답 본문에서 제외:
  //  - subtitle (본문에 박힌 명시적 소제목 마커)
  //  - annotation (조문 표제·요지 라벨 — "[외국인의 권리능력]", "[특허권의 공유]" 등.
  //    article-viewer 에서는 노란 chip 으로 보이지만 plain text 카드에서는 본문 흐름을
  //    끊는 노이즈가 됨)
  //  - ordinance_ref (하위 조문 라벨 — "시행령 제5조" 등. 본 조문 본문이 아닌 참조)
  //  - ref_article / ref_law (관련조문 참조 raw — "法 132의13②" 등)
  //  - amendment_note (개정 이력 — "[전문개정 2014.6.11.]")
  //  - footnote
  return "";
}

function blockLearnerText(block: Block): string {
  if (
    block.kind === "title_marker" ||
    block.kind === "header_refs" ||
    block.kind === "sub_article_group"
  ) {
    return "";
  }
  return block.inline.map(inlineLearnerText).join("").trim();
}

function walkBlocksAll(body: ArticleBody, visit: (b: Block) => void): void {
  const walk = (blocks: Block[]) => {
    for (const b of blocks) {
      visit(b);
      if (b.kind === "clause" || b.kind === "item" || b.kind === "sub") {
        walk(b.children);
      }
      // sub_article_group(시행령·시행규칙 등 부속 조문) 는 본 조문이 아니므로 descent X
    }
  };
  walk(body.blocks);
}

/**
 * article_revisions.body_text (ArticleBody JSON 직렬화) 를 학생 카드 뒷면용
 * plain text 로 평탄화.
 *  - 본문(clause/item/sub/para) 의 text/underline/subtitle/annotation 만 노출
 *  - clause/item/sub 의 label (①, 1., 가.) 은 앞에 붙여 가독성 보존
 *  - ref_*, amendment_note, footnote, title_marker, header_refs, sub_article_group 은 제외
 *
 * 파싱 실패 시 null.
 */
export function flattenBodyForCard(jsonStr: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("blocks" in parsed) ||
    !Array.isArray((parsed as { blocks: unknown }).blocks)
  ) {
    return null;
  }
  const body = parsed as ArticleBody;
  const parts: string[] = [];
  walkBlocksAll(body, (block) => {
    const text = blockLearnerText(block);
    if (!text) return;
    if (
      block.kind === "clause" ||
      block.kind === "item" ||
      block.kind === "sub"
    ) {
      const head = block.label ? `${block.label} ` : "";
      parts.push(`${head}${text}`);
    } else if (block.kind === "para") {
      parts.push(text);
    }
  });
  return parts.join("\n").trim() || null;
}
