// 정리비교표 팝업 — 조문 체계도 단원 화면의 「정리」 배지로 연다.
//
// ★왜 팝업인가: 정리비교표는 교재 한 쪽을 통째로 쓰는 넓은 표·도해다. 본문 자리
//   (좌패널을 뺀 폭)에 넣으면 글자를 아무리 줄여도 한 화면에 못 담는다.
// ★크기는 적재본 CSS 가 화면 높이에 묶어 정한다(scripts/digest/convert.mjs). 다만 화면
//   배율이 높거나 창이 작으면 바닥(8px)에 걸려 너무 작게 나온다 — 그래서 **보는 사람이
//   키우고 줄일 수 있게** 했다(원장 지시 2026-09-10). 키우면 넘치는 만큼 스크롤한다.
// ★‹ › 이동은 **목차 순서**를 따른다(체계도 → 총칙/보칙 → 특허요건 …). 자료가 없는
//   단원은 목록에서 빠져 있어 빈 화면으로 넘어가지 않는다(lib/digest-outline.ts).
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  MinusIcon,
  PlusIcon,
  SquareDashedIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "~/core/components/ui/dialog";

import { useDigestBlanks } from "../hooks/use-digest-blanks";
import type { DigestGroup } from "../lib/digest-outline";
import { FitPage } from "./digest-page";

/** 고를 수 있는 배율. 1 = 화면에 맞춘 기본 크기. */
const ZOOMS = [0.85, 1, 1.2, 1.45, 1.75, 2.1, 2.5];
/** 기본은 120% — 100% 는 화면에 딱 맞추느라 작다(원장 지시 2026-09-10). */
const DEFAULT_ZOOM = 2;
const ZOOM_KEY = "lidam.digest.zoom";

export function DigestPopup({
  groups,
  startIndex,
  open,
  onOpenChange,
}: {
  /** 목차 순서로 묶은 자료 — ‹ › 이동 대상. */
  groups: DigestGroup[];
  /** 열 때 보여 줄 자리(지금 보는 단원). */
  startIndex: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [at, setAt] = useState(startIndex);
  // 배지를 누를 때마다 지금 단원에서 다시 시작한다.
  useEffect(() => {
    if (open) setAt(startIndex);
  }, [open, startIndex]);

  const [idx, setIdx] = useState(DEFAULT_ZOOM);
  // 고른 크기는 기억한다 — 화면 배율은 사람마다 고정이라 매번 다시 맞추는 건 번거롭다.
  useEffect(() => {
    const saved = Number(window.localStorage.getItem(ZOOM_KEY));
    if (Number.isInteger(saved) && saved >= 0 && saved < ZOOMS.length) {
      setIdx(saved);
    }
  }, []);
  const setZoom = (next: number) => {
    const v = Math.min(ZOOMS.length - 1, Math.max(0, next));
    setIdx(v);
    try {
      window.localStorage.setItem(ZOOM_KEY, String(v));
    } catch {
      /* 사생활 보호 모드 등 — 기억만 포기 */
    }
  };

  const group = groups[at];
  // ★훅은 언제나 같은 수만큼 불러야 한다 — 자료가 없어도 먼저 부르고 뒤에서 판단한다.
  const blanks = useDigestBlanks(group?.key ?? "");
  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ★높이는 **반드시 고정**(h-)이다. max-h- 로 두면 팝업 높이가 내용을 따라가는데,
          내용 크기는 화면 높이(vh)를 보고 정하므로 서로 물려 오그라든다. */}
      <DialogContent className="flex h-[94vh] w-[98vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <div className="border-border flex flex-none items-center gap-2 border-b px-4 py-2.5 pr-12">
          <DialogTitle className="text-sm font-bold">
            {group.label} 정리비교표
          </DialogTitle>
          <span className="text-muted-foreground hidden text-[11px] font-semibold tabular-nums sm:inline">
            {at + 1} / {groups.length}
          </span>

          {/* 목차 순서로 앞뒤 이동 */}
          <div className="ml-3 flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={at === 0}
              onClick={() => setAt((v) => Math.max(0, v - 1))}
              className="h-6 gap-0.5 px-1.5 text-[11px] font-bold"
            >
              <ChevronLeftIcon className="size-3" />
              <span className="hidden max-w-[9rem] truncate sm:inline">
                {groups[at - 1]?.label ?? "이전"}
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={at === groups.length - 1}
              onClick={() => setAt((v) => Math.min(groups.length - 1, v + 1))}
              className="h-6 gap-0.5 px-1.5 text-[11px] font-bold"
            >
              <span className="hidden max-w-[9rem] truncate sm:inline">
                {groups[at + 1]?.label ?? "다음"}
              </span>
              <ChevronRightIcon className="size-3" />
            </Button>
          </div>

          {/* 빈칸 학습 — 목차(의의·진보성·표 이름)를 눌러도 되고, 여기서 한 번에 해도 된다.
              표가 아닌 자료(체계도·도해)는 가릴 칸이 없어 아예 나오지 않는다. */}
          {blanks.total > 0 ? (
            <div className="ml-3 flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={blanks.blankAll}
                className="h-6 gap-1 px-1.5 text-[11px] font-bold"
              >
                <SquareDashedIcon className="size-3" />
                전부 빈칸
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={blanks.count === 0}
                onClick={blanks.revealAll}
                className="h-6 gap-1 px-1.5 text-[11px] font-bold"
              >
                <EyeIcon className="size-3" />
                모두 보기
              </Button>
              <span className="text-muted-foreground ml-1 hidden text-[11px] font-semibold tabular-nums lg:inline">
                {blanks.count > 0
                  ? `빈칸 ${blanks.count} / ${blanks.total}`
                  : "목차를 누르면 그 줄·칸이 빈칸"}
              </span>
            </div>
          ) : null}

          <div className="ml-auto flex items-center gap-1">
            <span className="text-muted-foreground mr-1 hidden text-[11px] font-semibold sm:inline">
              글자 크기
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="글자 작게"
              disabled={idx === 0}
              onClick={() => setZoom(idx - 1)}
              className="size-6"
            >
              <MinusIcon className="size-3" />
            </Button>
            <span className="text-muted-foreground w-9 text-center text-[11px] font-bold tabular-nums">
              {Math.round(ZOOMS[idx] * 100)}%
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="글자 크게"
              disabled={idx === ZOOMS.length - 1}
              onClick={() => setZoom(idx + 1)}
              className="size-6"
            >
              <PlusIcon className="size-3" />
            </Button>
          </div>
        </div>
        {/* 넘치는 만큼은 여기서 스크롤한다(키우면 반드시 넘친다).
            iPad 등 터치에서도 확실히 잡히도록 축을 명시. */}
        <div
          key={group.key}
          className="min-h-0 flex-1 touch-pan-x touch-pan-y overflow-x-auto overflow-y-auto overscroll-contain px-4 py-3"
          style={{ ["--digest-zoom" as string]: ZOOMS[idx] }}
        >
          <FitPage
            html={group.digest.bodyHtml}
            css={group.digest.css}
            scopeKey={group.digest.scopeKey}
            rootRef={blanks.ref}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
