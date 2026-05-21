// 하이라이트 목록 — 우측 패널 "하이라이트" 탭.
// feat-8-023: 강사 작성 하이라이트는 모든 수험생에게 노출(읽기 전용 + "강사" 표식),
//   본인 것만 삭제 가능.
import { Trash2Icon } from "lucide-react";
import { useFetcher } from "react-router";

import { cn } from "~/core/lib/utils";

import {
  type AnnotationTargetType,
  type HighlightColor,
  type HighlightRecord,
} from "../labels";

const COLOR_CLASS: Record<HighlightColor, string> = {
  green: "bg-emerald-100 text-emerald-900 border-emerald-300",
  yellow: "bg-amber-100 text-amber-900 border-amber-300",
  red: "bg-rose-100 text-rose-900 border-rose-300",
  blue: "bg-sky-100 text-sky-900 border-sky-300",
  // 밑줄(underline) — 배경 없이 발췌 자체에 underline 데코레이션.
  underline: "bg-background text-foreground border-foreground/30",
};

// 발췌 텍스트에 추가로 적용할 inline 스타일 (underline 일 때만 밑줄).
const EXCERPT_TEXT_CLASS: Partial<Record<HighlightColor, string>> = {
  underline: "underline decoration-foreground/70 decoration-[1.5px] underline-offset-[3px]",
};

export function HighlightList({
  targetType: _targetType,
  targetId: _targetId,
  initial,
  viewerIsStaff = false,
}: {
  targetType: AnnotationTargetType;
  targetId: string;
  initial: HighlightRecord[];
  /** 보는 사람이 강사·원장인지 — 본인 하이라이트도 강사 표식으로 표시. */
  viewerIsStaff?: boolean;
}) {
  const deleteFetcher = useFetcher();

  const deletingId =
    deleteFetcher.formData?.get("intent") === "delete"
      ? String(deleteFetcher.formData.get("highlightId"))
      : null;
  const visible = initial.filter((h) => h.highlightId !== deletingId);

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs leading-relaxed">
        본문에서 텍스트를 드래그하면 선택 영역 위에 색상 툴바가 떠오릅니다. 색을
        클릭하면 저장됩니다.
      </p>

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
