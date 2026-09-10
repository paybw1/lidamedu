// 정리비교표 한 장 — 자료를 그대로 그린다.
//
// ★크기 맞추기는 **전부 CSS 로** 한다. 자바스크립트로 자리를 재서 맞추던 방식은 원장
//   화면에서 세 번 연속 듣지 않았다(2026-09-10). 배포 번들에 코드가 들어간 것도,
//   React 19 에서 `<style ref>` 가 정상인 것도 확인했지만 결과는 늘 손대지 않은 화면
//   이었다 — 무엇이 어긋났든, **재지 않으면 어긋날 것이 없다.**
//
//   적재(scripts/digest/convert.mjs)에서 자료에 다음이 박혀 나온다:
//     · `.digest-page { width: max(기준폭, 100%) }` — 자리가 넓으면 채우고 좁아도 기준 폭 유지
//       (표는 폭이 넓을수록 줄 수가 줄어 세로가 짧아진다)
//     · 표 글자 `clamp(8px, N vh, 12.5px)` — **화면 높이에 묶는다**. 여백은 em 이라 함께 준다
//     · 도형 `max-width: 가로세로비 × N vh` — 도형은 폭에 비례해 높이가 정해지므로
//       폭에 천장을 씌우면 높이가 화면에 묶인다(자료에 박힌 min-width 는 걷어냈다)
//
//   넘치는 만큼은 팝업 본문이 스크롤한다.

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
  return (
    <>
      {/* ★React 는 text child 를 이스케이프한다 — `.panel > h2`·content:"" 가 깨진다. */}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {/* ★여기에 스크롤 상자를 두지 않는다 — 팝업 본문이 이미 양쪽으로 스크롤한다.
          겹쳐 두면 표 머리줄 고정(sticky)이 바깥 스크롤을 못 따라가 안 붙는다. */}
      <div
        className={`digest-doc dp${page}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
