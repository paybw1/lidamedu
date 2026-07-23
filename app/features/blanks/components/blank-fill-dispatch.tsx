// 빈칸 렌더 분기 — ?blankv2=1(feat-4-A-130b) 이면 단일 contenteditable V2, 아니면 기존 input 모델.
// 프로토타입 검증 기간 동안만 존재. 컷오버(P5) 시 V2 로 통일하며 제거.
import type { ArticleBody } from "~/features/laws/lib/article-body";
import type { BlankItem } from "~/features/blanks/queries.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

import type { BlankTier } from "../lib/tiers";
import { BlankFillView } from "./blank-fill-view";
import { BlankFillViewV2 } from "./blank-fill-view-v2";
import type { AutoBlankMeta } from "./blanks-context";

export function BlankFill({
  v2,
  enableTiers,
  completedTiers,
  ...rest
}: {
  v2: boolean;
  setId: string | null;
  autoMeta?: AutoBlankMeta;
  body: ArticleBody;
  blanks: BlankItem[];
  titleMap: Map<string, string>;
  lawCode: LawSubjectSlug;
  // feat-2-030 — 난이도 계층(V2 전용). 구 모델은 무시.
  enableTiers?: boolean;
  completedTiers?: BlankTier[];
}) {
  return v2 ? (
    <BlankFillViewV2
      {...rest}
      enableTiers={enableTiers}
      completedTiers={completedTiers}
    />
  ) : (
    <BlankFillView {...rest} />
  );
}
