// 정리비교표 팝업 — 조문 체계도 단원 화면의 「정리」 배지로 연다.
//
// ★왜 팝업인가: 정리비교표는 교재 한 쪽을 통째로 쓰는 넓은 표·도해다. 본문 자리
//   (좌패널을 뺀 폭)에 넣으면 4p 는 글자를 11px 로 줄여도 세로 1,094px 이라 한 화면에
//   못 담는다. 화면 전체를 쓰면 그 부담이 사라진다(원장 지시 2026-09-09).
// ★자료는 기준 폭(`.digest-page`)에서 판이 짜여 있다 — 팝업 크기에 맞춰 **통째로**
//   줄인다(FitPage). 글자 크기만 줄이면 표의 가로세로 비가 교재와 달라진다.
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "~/core/components/ui/dialog";
import type { SystematicDigest } from "~/features/laws/queries.server";

import { FitPage } from "./digest-page";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ★크기 규약은 도해 팝업(잘 도는 쪽)과 같게 — max-h + flex-col + 본문만 스크롤. */}
      <DialogContent className="flex max-h-[94vh] w-[98vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <div className="border-border flex flex-none items-center gap-2 border-b px-4 py-2.5 pr-12">
          <DialogTitle className="text-sm font-bold">
            {label} 정리비교표
          </DialogTitle>
          <span className="text-muted-foreground text-[11px] font-semibold">
            교재 부록
          </span>
        </div>
        {/* 넘치는 만큼은 여기서 스크롤한다. iPad 등 터치에서도 확실히 잡히도록 축을 명시. */}
        <div className="min-h-0 flex-1 touch-pan-x touch-pan-y overflow-x-auto overflow-y-auto overscroll-contain px-4 py-3">
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
