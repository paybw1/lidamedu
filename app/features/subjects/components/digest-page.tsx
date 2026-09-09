// 정리비교표 한 장을 자리에 맞춰 앉힌다 — ①폭을 넓히고 ②그래도 넘치면 글자를 줄인다.
//
// ★표는 **폭이 넓어질수록 세로가 짧아진다**(칸에 들어가는 글자가 늘어 줄 수가 준다).
//   4p 는 1180px 폭에서 1,360px 이지만 1850px 폭이면 1,132px 로 준다. 그래도 팝업에서
//   보이는 높이(≈970px)를 넘어 아래가 화면 밖으로 나간다.
//
// ★줄이기는 **글자 크기**로 한다. zoom·transform 으로 줄이는 방식은 두 번 다 아래가
//   잘렸다(2026-09-10) — 줄인 뒤 바깥이 차지할 높이를 따로 정해 줘야 하는데, 그 높이를
//   잰 **뒤에** 글꼴이 올라오거나 글이 다시 흐르면 그만큼이 잘려 나가고 스크롤로도 못 본다.
//   글자 크기는 바꾸면 글이 **다시 흐르고 상자 높이가 저절로 따라오므로** 잘릴 수가 없다.
// ★가장 작은 크기로도 안 들어가면 그냥 넘치게 둔다 — 팝업 본문이 스크롤한다(원장 지시).
import { useCallback, useEffect, useRef } from "react";

// 큰 것부터 시도한다. 첫 값은 자료가 원래 쓰는 크기라 대개 그대로 통과한다.
// ★끝까지 내려 잡는다 — **스크롤에 기대지 않는다**. 원장 화면에서 아래가 잘린 채
//   스크롤도 되지 않았다(2026-09-10, 인쇄본 확인: 「시기적 기준-원칙」 줄에서 끊기고
//   예외·판단방법·위반의 효과 줄이 통째로 없었다). 들어가는 크기를 찾아 넣는 편이
//   안전하다. 실측(1920×1080): 4p 10.5 · 5p 9.5 · 6p 9.5 · 7p 10.5 · 8p 9.5 · 12p 12.5.
const FONT_STEPS = [12.5, 11.5, 10.5, 9.5, 9, 8.5, 8];
/** 자료 아래로 남겨 둘 여백. */
const BOTTOM_GAP = 16;

/** 위로 올라가며 실제로 스크롤하는 조상을 찾는다(팝업 본문). 없으면 null=창 기준. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el.parentElement;
  while (cur && cur !== document.body) {
    const oy = getComputedStyle(cur).overflowY;
    if (oy === "auto" || oy === "scroll") return cur;
    cur = cur.parentElement;
  }
  return null;
}

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
  // 글자 크기 덮어쓰기 — React 가 아니라 여기서 직접 갈아 끼운다(재면서 여러 번 바꾼다).
  const tune = useRef<HTMLStyleElement>(null);
  // 적재 때 감싼 기준 폭(`.digest-page`). 판짜기가 이 폭에서 계산돼 있다.
  const pageW = Number(
    html.match(/class="digest-page" style="width:(\d+)px"/)?.[1] ?? 1180,
  );

  const fit = useCallback(() => {
    const el = box.current;
    const node = doc.current;
    const paper = node?.querySelector<HTMLElement>(".digest-page");
    if (!el || !node || !paper) return;

    // ① 자리가 기준 폭보다 넓으면 늘려 앉힌다. 좁으면 기준 폭을 지키고 옆으로 민다
    //    — 더 좁히면 칸이 뭉개져 못 읽는다.
    paper.style.width = `${Math.max(pageW, el.clientWidth)}px`;

    const table = node.querySelector("table");
    const diagram = node.querySelector(".dg");

    // ★가용 높이는 **실제로 스크롤하는 상자**(팝업 본문) 기준으로 잰다. 창 높이로 재면
    //   팝업 바닥이 창 바닥보다 위에 있는 만큼(94vh 가운데 정렬이면 위아래 3vh씩)
    //   더 크게 잡혀, 딱 그만큼이 화면 밖으로 밀려난다.
    const scroller = scrollParent(el);
    const availH = Math.max(
      280,
      (scroller
        ? scroller.clientHeight -
          (el.getBoundingClientRect().top - scroller.getBoundingClientRect().top)
        : window.innerHeight - el.getBoundingClientRect().top) - BOTTOM_GAP,
    );
    // ② 도형만 있는 쪽(3p 총칙·13p 국제조약 등)은 글자 조절이 듣지 않는다 — 글자가
    //    폭에 비례(cqw)하고 그림이 가로세로 비로 묶여 있어, **폭을 줄이면 높이가 그대로
    //    비례해 준다**. 한 번 계산으로 맞는다.
    //    ★2p 체계도(`.grid`, 두 단 흘림)에는 쓰지 않는다 — 좁히면 오히려 길어진다.
    if (diagram && !table) {
      // ★도형에 박아 둔 최소 폭(min-width:940px)을 풀어야 실제로 줄어든다 — 안 풀면
      //   폭만 줄이고 높이는 그대로라 계산이 헛돈다.
      if (tune.current) {
        tune.current.textContent = `.digest-doc.dp${page} .dg{min-width:0 !important}`;
      }
      // ★한 번으로는 덜 줄어든다 — 머리글·여백은 폭에 따라오지 않아 비례식이 조금씩
      //   빗나간다. 몇 번 되풀이하면 붙는다.
      for (let i = 0; i < 3; i += 1) {
        const natH = node.scrollHeight;
        if (natH <= availH) break;
        const baseW = paper.getBoundingClientRect().width;
        const next = Math.max(560, Math.floor(baseW * (availH / natH)));
        if (next >= baseW) break;
        paper.style.width = `${next}px`;
      }
      return;
    }
    if (!table || !tune.current) return;

    const sel = `.digest-doc.dp${page}`;
    for (const fs of FONT_STEPS) {
      // 글자를 줄일 때는 줄 간격·여백도 같이 좁힌다 — 작은 글자에 넓은 줄 간격은
      // 자리만 먹고 읽기에 도움이 안 된다.
      const pad = fs >= 11 ? "6px 7px" : fs >= 10 ? "5px 5px" : "4px 4px";
      const lh = fs >= 10 ? 1.5 : 1.35;
      tune.current.textContent = `${sel} table{font-size:${fs}px}${sel} th,${sel} td{padding:${pad};line-height:${lh}}`;
      // 여기서 잰 높이는 그 글자 크기로 **다시 흐른** 결과다.
      if (node.scrollHeight <= availH) return;
    }
    // 가장 작은 크기로도 못 담으면 그대로 둔다 — 넘치는 만큼 팝업이 스크롤한다.
  }, [page, pageW]);

  useEffect(() => {
    fit();
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    // 글꼴이 늦게 올라오면 글이 다시 흘러 높이가 바뀐다 — 그때 한 번 더 맞춘다.
    document.fonts?.ready.then(fit).catch(() => {});
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [fit, html]);

  return (
    <>
      {/* ★React 는 text child 를 이스케이프한다 — `.panel > h2`·content:"" 가 깨진다. */}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {/* 자료 CSS 뒤에 와야 같은 특이도에서 이긴다. */}
      <style ref={tune} />
      {/* ★여기에 스크롤 상자를 두지 않는다 — 팝업 본문이 이미 양쪽으로 스크롤한다.
          겹쳐 두면 표 머리줄 고정(sticky)이 바깥 스크롤을 못 따라가 안 붙는다. */}
      <div ref={box}>
        <div
          ref={doc}
          className={`digest-doc dp${page}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </>
  );
}
