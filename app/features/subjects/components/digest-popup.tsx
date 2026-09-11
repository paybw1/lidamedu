// 정리비교표 팝업 — 조문 체계도 단원 화면의 「정리」 배지로 연다.
//
// ★왜 팝업인가: 정리비교표는 교재 한 쪽을 통째로 쓰는 넓은 표·도해다. 본문 자리
//   (좌패널을 뺀 폭)에 넣으면 글자를 아무리 줄여도 한 화면에 못 담는다.
// ★크기는 적재본 CSS 가 화면 높이에 묶어 정한다(scripts/digest/convert.mjs). 다만 화면
//   배율이 높거나 창이 작으면 바닥(8px)에 걸려 너무 작게 나온다 — 그래서 **보는 사람이
//   키우고 줄일 수 있게** 했다(원장 지시 2026-09-10). 키우면 넘치는 만큼 스크롤한다.
// ★‹ › 이동은 **목차 순서**를 따른다(체계도 → 총칙/보칙 → 특허요건 …). 자료가 없는
//   단원은 목록에서 빠져 있어 빈 화면으로 넘어가지 않는다(lib/digest-outline.ts).
// ★유출방지(2026-09-11 학생 공개) — 도해와 같은 다섯 겹: ① 열람자 워터마크 ② 복사·우클릭·
//   드래그 차단(판례 도식과 같이 staff 제외, 선택은 허용) ③ 인쇄 숨김 ④ 첫 열람 1회 저작권
//   고지 ⑤ 열람 로그. 본문은 로더로 미리 내려보내지 않고 **한 장씩 `/api/laws/digest` 로
//   받는다** — 그 요청이 본문·워터마크·로그를 한 번에 처리한다(도해 /api/dohae/unit 과 같다).
// ★★상태(지금 보는 장·확대)는 DialogContent **안쪽**(DigestPopupBody)에 둔다. 팝업 컴포넌트는
//   늘 붙어 있고 Radix 가 닫힐 때 속만 떼므로, 안쪽에 두면 열 때마다 새로 시작한다 —
//   바깥에 두면 직전에 보던 장이 한 프레임 먼저 그려지고 그 장의 열람 로그가 헛되이
//   남는다(검토 지적 2026-09-11).
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  MinusIcon,
  PlusIcon,
  SquareDashedIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  CopyrightGate,
  ViewerWatermark,
  copyGuardProps,
} from "~/core/components/leak-guard";
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
/** 고지 문구를 고치면 버전을 올린다(다시 한 번 받는다). */
const NOTICE_KEY = "digest-copyright-notice-v1";
const SHEET_API = "/api/laws/digest";

function readZoom(): number {
  if (typeof window === "undefined") return DEFAULT_ZOOM;
  try {
    const saved = Number(window.localStorage.getItem(ZOOM_KEY));
    if (Number.isInteger(saved) && saved >= 0 && saved < ZOOMS.length) return saved;
  } catch {
    /* 사생활 보호 모드 등 */
  }
  return DEFAULT_ZOOM;
}

export function DigestPopup({
  groups,
  startIndex,
  open,
  onOpenChange,
  viewerIsStaff,
}: {
  /** 목차 순서로 묶은 자료 — ‹ › 이동 대상. */
  groups: DigestGroup[];
  /** 열 때 보여 줄 자리(지금 보는 단원). */
  startIndex: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** staff 는 복사 차단·열람 로그를 받지 않는다(검수·출제 때 본문을 옮겨 써야 한다). */
  viewerIsStaff: boolean;
}) {
  if (groups.length === 0) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ★높이는 **반드시 고정**(h-)이다. max-h- 로 두면 팝업 높이가 내용을 따라가는데,
          내용 크기는 화면 높이(vh)를 보고 정하므로 서로 물려 오그라든다. */}
      <DialogContent className="flex h-[94vh] w-[98vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DigestPopupBody
          groups={groups}
          startIndex={startIndex}
          viewerIsStaff={viewerIsStaff}
        />
      </DialogContent>
    </Dialog>
  );
}

/** 팝업 속 — 열릴 때 붙고 닫히면 떨어진다(지금 보는 장·확대·워터마크가 매번 새로 시작). */
function DigestPopupBody({
  groups,
  startIndex,
  viewerIsStaff,
}: {
  groups: DigestGroup[];
  startIndex: number;
  viewerIsStaff: boolean;
}) {
  const [at, setAt] = useState(() =>
    Math.min(groups.length - 1, Math.max(0, startIndex)),
  );
  // 고른 크기는 기억한다 — 화면 배율은 사람마다 고정이라 매번 다시 맞추는 건 번거롭다.
  const [idx, setIdx] = useState(readZoom);
  const setZoom = (next: number) => {
    const v = Math.min(ZOOMS.length - 1, Math.max(0, next));
    setIdx(v);
    try {
      window.localStorage.setItem(ZOOM_KEY, String(v));
    } catch {
      /* 사생활 보호 모드 등 — 기억만 포기 */
    }
  };
  // 유출방지 ① — 서버가 요청마다 찍어 준 열람자 문자열(장을 옮기면 그 시각으로 갱신).
  const [watermark, setWatermark] = useState<string | null>(null);

  const group = groups[at];
  const blanks = useDigestBlanks(group.key);

  return (
    <>
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
            가릴 칸이 없는 자료(또는 본문이 아직 안 왔을 때)는 나오지 않는다. */}
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

      {/* 유출방지 ①③ — 워터마크는 스크롤 영역 전체를 덮는 상자에 깔고, 인쇄 매체에서는 본문을
          통째로 숨긴다. ② 복사 차단은 staff 에게 걸지 않는다. */}
      <div
        className="relative min-h-0 flex-1 print:hidden"
        {...(viewerIsStaff ? {} : copyGuardProps)}
      >
        {watermark ? <ViewerWatermark text={watermark} /> : null}
        {/* 넘치는 만큼은 여기서 스크롤한다(키우면 반드시 넘친다).
            iPad 등 터치에서도 확실히 잡히도록 축을 명시. */}
        <div
          key={group.key}
          className="h-full touch-pan-x touch-pan-y overflow-x-auto overflow-y-auto overscroll-contain px-4 py-3"
          style={{ ["--digest-zoom" as string]: ZOOMS[idx] }}
        >
          {/* 유출방지 ④ — 기기당 첫 열람 1회 고지. 확인 전에는 본문을 **요청조차 하지 않는다**
              (게이트가 자식을 그리지 않으므로 아래 DigestSheet 가 붙지 않는다). */}
          <CopyrightGate storageKey={NOTICE_KEY} title="『특허법 정리비교표』 열람 안내">
            <DigestSheet
              digestId={group.key}
              rootRef={blanks.ref}
              onWatermark={setWatermark}
            />
          </CopyrightGate>
        </div>
      </div>
    </>
  );
}

interface SheetPayload {
  digestId: string;
  scopeKey: string;
  bodyHtml: string;
  css: string;
  watermark: string;
}

/** 한 장 — 붙는 순간 서버에 요청한다(그 요청이 열람 로그다). 장이 바뀌면 key 로 새로 붙는다. */
function DigestSheet({
  digestId,
  rootRef,
  onWatermark,
}: {
  digestId: string;
  rootRef: (el: HTMLDivElement | null) => void;
  onWatermark: (text: string) => void;
}) {
  const [sheet, setSheet] = useState<SheetPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setSheet(null);
    setFailed(false);
    fetch(`${SHEET_API}?digestId=${encodeURIComponent(digestId)}`, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    })
      .then((r) =>
        r.ok
          ? (r.json() as Promise<SheetPayload | { error: string }>)
          : Promise.reject(r.status),
      )
      .then((p) => {
        // 상태 코드와 별개로 본문 형상도 본다 — {error} 가 200 으로 와도 실패다.
        if (!("bodyHtml" in p) || typeof p.bodyHtml !== "string") throw new Error("bad payload");
        setSheet(p);
        onWatermark(p.watermark);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        setFailed(true);
      });
    return () => ctrl.abort();
    // onWatermark 는 setState 라 안정적이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digestId, attempt]);

  if (failed) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 px-6 py-14 text-center text-[13px]">
        <p>자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
          다시 시도
        </Button>
      </div>
    );
  }
  if (!sheet) {
    return (
      <p className="text-muted-foreground px-6 py-14 text-center text-[13px]">
        불러오는 중…
      </p>
    );
  }
  return (
    <FitPage
      html={sheet.bodyHtml}
      css={sheet.css}
      scopeKey={sheet.scopeKey}
      rootRef={rootRef}
    />
  );
}
