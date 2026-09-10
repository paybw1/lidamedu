// 정리비교표 팝업 — 조문 체계도 단원 화면의 「정리」 배지로 연다.
//
// ★왜 팝업인가: 정리비교표는 교재 한 쪽을 통째로 쓰는 넓은 표·도해다. 본문 자리
//   (좌패널을 뺀 폭)에 넣으면 글자를 아무리 줄여도 한 화면에 못 담는다.
// ★크기는 적재본 CSS 가 화면 높이에 묶어 정한다(scripts/digest/convert.mjs). 다만 화면
//   배율이 높거나 창이 작으면 바닥(8px)에 걸려 너무 작게 나온다 — 그래서 **보는 사람이
//   키우고 줄일 수 있게** 했다(원장 지시 2026-09-10). 키우면 넘치는 만큼 스크롤한다.
import { MinusIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "~/core/components/ui/dialog";
import type { SystematicDigest } from "~/features/laws/queries.server";

import { FitPage } from "./digest-page";

/** 고를 수 있는 배율. 1 = 화면에 맞춘 기본 크기. */
const ZOOMS = [0.85, 1, 1.2, 1.45, 1.75, 2.1, 2.5];
const ZOOM_KEY = "lidam.digest.zoom";

export function DigestPopup({
  label,
  digests,
  open,
  onOpenChange,
}: {
  /** 단원 이름 — 팝업 머리에 쓴다. */
  label: string;
  digests: SystematicDigest[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [idx, setIdx] = useState(1);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ★높이는 **반드시 고정**(h-)이다. max-h- 로 두면 팝업 높이가 내용을 따라가는데,
          내용 크기는 화면 높이(vh)를 보고 정하므로 서로 물려 오그라든다. */}
      <DialogContent className="flex h-[94vh] w-[98vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <div className="border-border flex flex-none items-center gap-2 border-b px-4 py-2.5 pr-12">
          <DialogTitle className="text-sm font-bold">
            {label} 정리비교표
          </DialogTitle>
          <span className="text-muted-foreground hidden text-[11px] font-semibold sm:inline">
            교재 부록
          </span>
          <div className="ml-auto flex items-center gap-1">
            <span className="text-muted-foreground mr-1 text-[11px] font-semibold">
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
          className="min-h-0 flex-1 touch-pan-x touch-pan-y overflow-x-auto overflow-y-auto overscroll-contain px-4 py-3"
          style={{ ["--digest-zoom" as string]: ZOOMS[idx] }}
        >
          <div className="space-y-6">
            {digests.map((d) => (
              <section key={d.digestId}>
                {digests.length > 1 ? (
                  <h3 className="mb-2 text-[13px] font-extrabold">{d.title}</h3>
                ) : null}
                <FitPage html={d.bodyHtml} css={d.css} page={d.page} />
              </section>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
