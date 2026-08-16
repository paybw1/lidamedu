// 하이라이트 목록 — 우측 패널 "하이라이트" 탭.
// feat-8-023: 강사 작성 하이라이트는 모든 수험생에게 노출(읽기 전용 + "강사" 표식),
//   본인 것만 삭제 가능.
import { Trash2Icon } from "lucide-react";
import { useFetcher } from "react-router";

import { cn } from "~/core/lib/utils";

import {
  type AnnotationTargetType,
  HIGHLIGHT_COLOR_DEFAULT_LABEL,
  type HighlightColor,
  type HighlightRecord,
} from "../labels";
import { useHighlightAliases } from "../lib/use-highlight-aliases";

// 밑줄 계열(underline*) — 배경 없이 발췌 자체에 underline 데코레이션.
const UNDERLINE_CHIP = "bg-background text-foreground border-foreground/30";
const COLOR_CLASS: Record<HighlightColor, string> = {
  green: "bg-emerald-100 text-emerald-900 border-emerald-300",
  yellow: "bg-amber-100 text-amber-900 border-amber-300",
  red: "bg-rose-100 text-rose-900 border-rose-300",
  blue: "bg-sky-100 text-sky-900 border-sky-300",
  underline: UNDERLINE_CHIP,
  underline_thick: UNDERLINE_CHIP,
  underline_orange: UNDERLINE_CHIP,
  underline_orange_thick: UNDERLINE_CHIP,
  underline_blue: UNDERLINE_CHIP,
  underline_blue_thick: UNDERLINE_CHIP,
};

// 발췌 텍스트에 추가로 적용할 inline 스타일 (밑줄 계열 — 색·굵기 미리보기).
const EXCERPT_TEXT_CLASS: Partial<Record<HighlightColor, string>> = {
  underline:
    "underline decoration-foreground/70 decoration-[1.5px] underline-offset-[3px]",
  underline_thick:
    "underline decoration-foreground/70 decoration-[3px] underline-offset-[3px]",
  underline_orange:
    "underline decoration-amber-600 decoration-[1.5px] underline-offset-[3px]",
  underline_orange_thick:
    "underline decoration-amber-600 decoration-[3px] underline-offset-[3px]",
  underline_blue:
    "underline decoration-sky-500 decoration-[1.5px] underline-offset-[3px]",
  underline_blue_thick:
    "underline decoration-sky-500 decoration-[3px] underline-offset-[3px]",
};

export function HighlightList({
  targetType: _targetType,
  targetId: _targetId,
  initial,
  viewerIsStaff = false,
  compact = false,
}: {
  targetType: AnnotationTargetType;
  targetId: string;
  initial: HighlightRecord[];
  /** 보는 사람이 강사·원장인지 — 본인 하이라이트도 강사 표식으로 표시. */
  viewerIsStaff?: boolean;
  /** 한 화면에 여러 개를 쌓을 때(도해 팝업의 조문별 목록) 안내문 반복을 없앤다. */
  compact?: boolean;
}) {
  const deleteFetcher = useFetcher();
  const aliases = useHighlightAliases();

  const deletingId =
    deleteFetcher.formData?.get("intent") === "delete"
      ? String(deleteFetcher.formData.get("highlightId"))
      : null;
  const visible = initial.filter((h) => h.highlightId !== deletingId);

  return (
    <div className="space-y-3">
      {compact ? null : (
        <p className="text-muted-foreground text-xs leading-relaxed">
          본문에서 텍스트를 드래그하면 선택 영역 위에 색상 툴바가 떠오릅니다. 색을
          클릭하면 저장됩니다.
        </p>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium">
          저장된 하이라이트
          {visible.length > 0 ? (
            <span className="text-muted-foreground ml-1 tabular-nums">
              {visible.length}
            </span>
          ) : null}
        </p>
        {visible.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            아직 저장된 하이라이트가 없습니다.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {visible.map((h) => {
              const isStaffHl = !h.isMine || viewerIsStaff;
              return (
                <li
                  key={h.highlightId}
                  className={cn(
                    "group flex items-start gap-2 rounded-md border p-2 text-xs leading-relaxed",
                    COLOR_CLASS[h.color],
                  )}
                >
                  {isStaffHl ? (
                    <span className="mt-0.5 shrink-0 rounded-sm bg-black/10 px-1 py-0.5 text-[10px] font-bold">
                      강사
                    </span>
                  ) : null}
                  {/* 색상 alias 칩 — alias 가 있으면 본인 하이라이트 한정으로 표시 (강사 작성은 강사 의도) */}
                  {h.isMine && aliases[h.color] ? (
                    <span
                      className="mt-0.5 shrink-0 rounded-sm bg-black/5 px-1 py-0.5 text-[10px] font-semibold"
                      title={`${aliases[h.color]} (${HIGHLIGHT_COLOR_DEFAULT_LABEL[h.color]})`}
                    >
                      {aliases[h.color]}
                    </span>
                  ) : null}
                  <span className={cn("flex-1", EXCERPT_TEXT_CLASS[h.color])}>
                    {h.excerpt || "(발췌 없음)"}
                  </span>
                  {h.isMine ? (
                    <deleteFetcher.Form
                      method="post"
                      action="/api/annotations/highlight"
                    >
                      <input type="hidden" name="intent" value="delete" />
                      <input
                        type="hidden"
                        name="highlightId"
                        value={h.highlightId}
                      />
                      <button
                        type="submit"
                        aria-label="하이라이트 삭제"
                        className="hover:text-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Trash2Icon className="size-3.5" />
                      </button>
                    </deleteFetcher.Form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
