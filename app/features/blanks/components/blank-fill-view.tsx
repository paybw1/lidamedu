// 빈칸 모드 — 원본 article body_json 위에 빈칸 자리만 input 으로 치환.
// ArticleBodyView 와 동일한 본문(관련조문 inline 링크, 소제목, 메타) 그대로 표시한다.
//
// 동작: BlanksRenderProvider 안에서 ArticleBodyView 가 inline text 토큰을 렌더할 때
// useBlanksRender().resolveText(text) 를 호출해 빈칸 자리(before+answer+after 매칭) 를
// BlankInput 으로 치환한다.

import { EyeIcon, RotateCcwIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "~/core/components/ui/button";
import { ArticleBodyView } from "~/features/laws/components/article-body";
import type { ArticleBody } from "~/features/laws/lib/article-body";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";
import type { BlankItem } from "~/features/blanks/queries.server";

import { BlanksRenderProvider } from "./blanks-context";

export function BlankFillView({
  setId,
  body,
  blanks,
  titleMap,
  lawCode,
}: {
  setId: string;
  body: ArticleBody;
  blanks: BlankItem[];
  titleMap: Map<string, string>;
  lawCode: LawSubjectSlug;
}) {
  const [reveal, setReveal] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const totalBlanks = blanks.length;
  const mappedCount = useMemo(
    () => blanks.filter((b) => b.answer).length,
    [blanks],
  );
  const unmappedCount = totalBlanks - mappedCount;

  return (
    <div className="space-y-4">
      <div className="bg-muted/40 flex flex-wrap items-center gap-3 rounded-md border border-dashed px-3 py-2 text-xs">
        <span className="font-medium">총 빈칸 {totalBlanks}개</span>
        {unmappedCount > 0 ? (
          <span className="text-muted-foreground">
            (정답 미입력 {unmappedCount}개 — 운영자 보강 대기)
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant={reveal ? "default" : "outline"}
            size="sm"
            onClick={() => setReveal((v) => !v)}
            className="h-7 gap-1 text-xs"
          >
            <EyeIcon className="size-3.5" />
            {reveal ? "정답 숨기기" : "정답 모두 보기"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setReveal(false);
              setResetKey((k) => k + 1);
            }}
            className="h-7 gap-1 text-xs"
          >
            <RotateCcwIcon className="size-3.5" /> 다시 풀기
          </Button>
        </div>
      </div>

      <BlanksRenderProvider
        key={resetKey}
        setId={setId}
        blanks={blanks}
        reveal={reveal}
      >
        <ArticleBodyView
          body={body}
          titleMap={titleMap}
          subtitlesOnly={false}
          lawCode={lawCode}
        />
      </BlanksRenderProvider>
    </div>
  );
}
