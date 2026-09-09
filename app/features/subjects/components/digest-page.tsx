// 정리비교표 한 장을 **교재 한 쪽처럼 통째로** 화면에 맞춘다.
//
// ★글자 크기만 줄이는 방법은 실패했다 — 4p 는 11px 로도 세로 1,094px 이라 한 화면
//   (≈760px)을 넘고 5·6p 는 8px 로도 넘는다(scripts/digest/estimate-height.mjs).
//   판짜기를 기준 폭(`.digest-page`, 적재 때 감싼다)에 고정해 두고 그 장 전체를 줄여야
//   표의 가로세로 비가 교재와 같은 채로 한눈에 들어온다.
// ★`zoom` 을 쓴다(transform 아님) — transform 은 줄여도 **자리는 원래 크기만큼**
//   차지해 밑에 빈 공간이 남는다. zoom 은 배치까지 줄어든다.
import { useCallback, useEffect, useRef, useState } from "react";

/** 줄일 수 있는 한계 — 이보다 작아지면 글자가 아니라 무늬가 된다. */
const MIN_ZOOM = 0.4;
/** 자료 아래로 남겨 둘 여백. */
const BOTTOM_GAP = 24;

export function FitPage({
  html,
  css,
  page,
}: {
  html: string;
  /** `.digest-doc.dpN` 으로 좁혀 둔 자료 전용 CSS. */
  css: string;
  page: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  // 적재 때 감싼 기준 폭(`.digest-page`). 판짜기가 이 폭에서 계산돼 있다.
  const pageW = Number(
    html.match(/class="digest-page" style="width:(\d+)px"/)?.[1] ?? 1180,
  );

  const measure = useCallback(() => {
    const el = box.current;
    const sheet = el?.firstElementChild as HTMLElement | null;
    const paper = sheet?.firstElementChild as HTMLElement | null;
    if (!el || !sheet || !paper) return;
    if (!fit) {
      paper.style.width = `${pageW}px`;
      setZoom(1);
      return;
    }
    const availW = el.clientWidth;
    const availH = Math.max(
      280,
      window.innerHeight - el.getBoundingClientRect().top - BOTTOM_GAP,
    );
    // ★자리가 기준 폭보다 넓으면 **늘려 앉힌다**. 표는 폭이 넓어질수록 줄 수가 줄어
    //   세로가 확 짧아진다(4p: 1180→1850 폭이면 높이가 6할). 줄이기 전에 이것부터.
    const usedW = Math.max(pageW, availW);
    paper.style.width = `${usedW}px`;
    // ★재는 동안 배율을 1 로 돌린다 — 줄어든 상태에서 재면 배율이 계속 작아진다.
    sheet.style.zoom = "1";
    const natH = sheet.scrollHeight;
    sheet.style.zoom = "";
    if (!natH) return;
    setZoom(Math.max(MIN_ZOOM, Math.min(1, availW / usedW, availH / natH)));
  }, [fit, pageW]);

  useEffect(() => {
    measure();
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, html, fit]);

  const shrunk = fit && zoom < 1;
  return (
    <>
      {/* ★React 는 text child 를 이스케이프한다 — `.panel > h2`·content:"" 가 깨진다. */}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="mb-1.5 flex items-center justify-end gap-2">
        {shrunk ? (
          <span className="text-muted-foreground text-[11px] font-semibold tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setFit((v) => !v)}
          className="border-border text-muted-foreground hover:text-foreground rounded-md border px-2 py-[3px] text-[11px] font-bold transition-colors"
        >
          {fit ? "원본 크기" : "화면 맞춤"}
        </button>
      </div>
      <div ref={box} className={fit ? "" : "overflow-x-auto"}>
        <div
          className={`digest-doc dp${page}`}
          style={fit ? { zoom } : undefined}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </>
  );
}
