// 정리비교표 한 장을 자리 폭에 맞춰 앉힌다.
//
// ★표는 **폭이 넓어질수록 세로가 짧아진다**(칸에 들어가는 글자가 늘어 줄 수가 준다).
//   4p 는 1180px 폭에서 세로 1,360px 이지만 1850px 폭이면 830px 로 준다. 그래서 자리가
//   기준 폭보다 넓으면 늘려 앉히는 것만으로 대개 한 화면에 들어온다.
//
// ★높이를 재서 줄이는 방식은 쓰지 않는다(2026-09-10, 두 번 실패).
//   `zoom`·`transform` 어느 쪽이든 "줄인 뒤 바깥이 차지할 높이"를 정해야 하는데,
//   그 높이를 재고 난 **뒤에** 글꼴이 올라오거나 글이 다시 흐르면 그만큼이 잘린다.
//   자르는 대신 **넘치면 스크롤**한다(원장 지시) — 잘리는 일이 원천적으로 없다.
import { useCallback, useEffect, useRef } from "react";

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
  // 적재 때 감싼 기준 폭(`.digest-page`). 판짜기가 이 폭에서 계산돼 있다.
  const pageW = Number(
    html.match(/class="digest-page" style="width:(\d+)px"/)?.[1] ?? 1180,
  );

  // 자리가 기준 폭보다 넓으면 그만큼 늘려 앉힌다. 좁으면 기준 폭을 지키고 옆으로 민다
  // — 더 좁혀 봐야 칸이 뭉개져 못 읽는다.
  const fitWidth = useCallback(() => {
    const el = box.current;
    const paper = el?.querySelector<HTMLElement>(".digest-page");
    if (!el || !paper) return;
    paper.style.width = `${Math.max(pageW, el.clientWidth)}px`;
  }, [pageW]);

  useEffect(() => {
    fitWidth();
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(fitWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitWidth, html]);

  return (
    <>
      {/* ★React 는 text child 를 이스케이프한다 — `.panel > h2`·content:"" 가 깨진다. */}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {/* ★여기에 스크롤 상자를 두지 않는다 — 팝업 본문이 이미 양쪽으로 스크롤한다.
          겹쳐 두면 표 머리줄 고정(sticky)이 바깥 스크롤을 못 따라가 안 붙는다. */}
      <div ref={box}>
        <div
          className={`digest-doc dp${page}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </>
  );
}
