// 정리비교표 한 장을 **교재 한 쪽처럼 통째로** 화면에 맞춘다.
//
// ★글자 크기만 줄이는 방법은 실패했다 — 4p 는 11px 로도 세로 1,094px 이라 한 화면
//   (≈760px)을 넘고 5·6p 는 8px 로도 넘는다(scripts/digest/estimate-height.mjs).
//   판짜기를 기준 폭(`.digest-page`, 적재 때 감싼다)에 고정해 두고 그 장 전체를 줄여야
//   표의 가로세로 비가 교재와 같은 채로 한눈에 들어온다.
//
// ★줄이기는 `transform: scale` + **줄인 크기만큼의 빈 상자**로 한다.
//   `zoom` 으로 줄였더니 아래가 잘렸다(원장 지적 2026-09-10) — 줄어든 뒤 바깥이 차지할
//   높이를 브라우저 계산에 맡기면 어긋난다. 여기서는 자연 높이를 직접 재서 상자 크기를
//   `자연크기 × 배율` 로 못박는다. transform 은 배치를 건드리지 않으므로 안쪽 높이를
//   그대로 잴 수 있고, 바깥은 정확히 그만큼만 차지한다.
import { useCallback, useEffect, useRef, useState } from "react";

/** 줄일 수 있는 한계 — 이보다 작아지면 글자가 아니라 무늬가 된다. */
const MIN_SCALE = 0.4;
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
  const doc = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(true);
  // 적재 때 감싼 기준 폭(`.digest-page`). 판짜기가 이 폭에서 계산돼 있다.
  const pageW = Number(
    html.match(/class="digest-page" style="width:(\d+)px"/)?.[1] ?? 1180,
  );
  const [size, setSize] = useState<{ w: number; h: number; s: number }>({
    w: pageW,
    h: 0,
    s: 1,
  });

  const measure = useCallback(() => {
    const el = box.current;
    const node = doc.current;
    const paper = node?.firstElementChild as HTMLElement | null;
    if (!el || !node || !paper) return;

    if (!fit) {
      paper.style.width = `${pageW}px`;
      setSize({ w: pageW, h: 0, s: 1 });
      return;
    }
    const availW = el.clientWidth;
    if (!availW) return;
    const availH = Math.max(
      280,
      window.innerHeight - el.getBoundingClientRect().top - BOTTOM_GAP,
    );
    // ★자리가 기준 폭보다 넓으면 **늘려 앉힌다**. 표는 폭이 넓어질수록 줄 수가 줄어
    //   세로가 확 짧아진다(4p: 1180→1850 폭이면 높이가 6할). 줄이기 전에 이것부터.
    const usedW = Math.max(pageW, availW);
    paper.style.width = `${usedW}px`;
    // transform 은 배치를 건드리지 않으므로 여기서 잰 높이가 곧 자연 높이다.
    const natH = node.scrollHeight;
    if (!natH) return;
    const s = Math.max(
      MIN_SCALE,
      Math.min(1, availW / usedW, availH / natH),
    );
    // ★값이 같으면 상태를 건드리지 않는다 — 상자 높이가 바뀌면 ResizeObserver 가 다시
    //   울리므로, 매번 새 객체를 넣으면 다시 그리기가 꼬리를 문다.
    setSize((prev) =>
      prev.w === usedW && prev.h === natH && prev.s === s
        ? prev
        : { w: usedW, h: natH, s },
    );
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
  }, [measure, html]);

  const shrunk = fit && size.s < 1;
  return (
    <>
      {/* ★React 는 text child 를 이스케이프한다 — `.panel > h2`·content:"" 가 깨진다. */}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="mb-1.5 flex items-center justify-end gap-2">
        {shrunk ? (
          <span className="text-muted-foreground text-[11px] font-semibold tabular-nums">
            {Math.round(size.s * 100)}%
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
        {/* 줄인 만큼만 자리를 차지하는 상자 — 높이를 재기 전(h=0)에는 그냥 흘려 둔다. */}
        <div
          style={
            fit && size.h
              ? {
                  width: size.w * size.s,
                  height: size.h * size.s,
                  overflow: "hidden",
                }
              : undefined
          }
        >
          <div
            ref={doc}
            className={`digest-doc dp${page}`}
            style={
              fit && size.s < 1
                ? {
                    transform: `scale(${size.s})`,
                    transformOrigin: "top left",
                  }
                : undefined
            }
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </>
  );
}
