// feat-11-008 / 수강정책 요청서 ⑦ — 운영자(staff)가 에디터로 저장한 HTML 을 렌더한다.
//
// ★왜 별도 컴포넌트가 필요한가
//   dangerouslySetInnerHTML 로 넣은 <script> 는 브라우저가 **실행하지 않는다**(HTML 사양).
//   그래서 카운트다운·스크롤 리빌 같은 이벤트 페이지 스크립트가 조용히 죽어 있었다.
//   여기서는 삽입 후 script 노드를 새로 만들어 붙여 실행시킨다(표준 우회).
//   <style>·@media·@keyframes 는 innerHTML 로도 적용되므로 별도 처리가 필요 없다.
//
// ★★2026-09-01 요청서 ①(재요청) — "저장은 되는데 실제 페이지에서 안 돈다" 의 진짜 원인.
//   SSR 이라 서버가 만든 문서 자체에 <script> 가 들어간다. 브라우저는 그것을 **문서 파싱 중에
//   한 번 실행**하고, 그 뒤 이 컴포넌트가 다시 붙여 **두 번째 실행**을 한다. 결과:
//     · 자기보다 뒤에 있는 요소를 잡는 스크립트는 파싱 중 실행에서 null 을 잡아 아무 것도 못 한다
//     · DOMContentLoaded/onload 로 감싼 스크립트는 두 번째 실행 때 이미 이벤트가 끝나 영영 안 돈다
//       (SPA 이동으로 들어오면 첫 실행조차 없어 아예 죽는다 — 사이트 안에서 링크로 들어오는
//        경로가 바로 이 경우다)
//     · setInterval 을 거는 스크립트는 타이머가 두 벌 돈다
//   → 서버 마크업 단계에서 script 를 **비활성 type 으로 무력화**해 파싱 중 실행을 막고,
//     마운트 후 이 컴포넌트가 **정확히 한 번** 되살린다. SSR·SPA 이동 결과가 같아진다.
//
// ★보안 경계 — 이 컴포넌트는 **운영자가 작성한 콘텐츠에만** 쓴다.
//   강의 상세페이지 · 페이지관리처럼 staff 만 쓸 수 있는 화면이 대상이고,
//   일반 회원이 작성하는 게시판·댓글·문의에는 절대 쓰지 않는다(그쪽은 기존 렌더 유지).
//   요청서의 "관리자만 소스 편집 권한" 지침을 코드 경계로 옮긴 것이다.

import { useEffect, useMemo, useRef } from "react";

/** 파싱 중 실행을 막는 비활성 type. 브라우저는 모르는 type 의 script 를 실행하지 않는다. */
const INERT_TYPE = "text/x-lidam-inert";
/** 원래 type 을 잃지 않도록 옮겨 두는 자리(module 스크립트 등). */
const ORIG_TYPE_ATTR = "data-lidam-type";

/**
 * 여는 `<script ...>` 태그만 손댄다 — 내용과 닫는 태그는 그대로다.
 * (HTML 파서는 `</script>` 로 끊으므로 여는 태그만 바꿔도 파싱 결과가 어긋나지 않는다.)
 */
export function inertifyScripts(html: string): string {
  return html.replace(/<script\b([^>]*)>/gi, (_m, rawAttrs: string) => {
    const attrs = rawAttrs.replace(/\btype\s*=/gi, `${ORIG_TYPE_ATTR}=`);
    return `<script${attrs} type="${INERT_TYPE}">`;
  });
}

export function RichHtml({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // 서버·클라이언트가 같은 문자열을 만들어야 hydration 이 어긋나지 않는다.
  const inert = useMemo(() => inertifyScripts(html), [html]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // 무력화해 둔 script 를 같은 내용의 새 노드로 교체 — 그때 비로소 실행된다.
    // 외부 src 스크립트도 동일(로드 순서는 문서 순서를 따른다).
    const stale = Array.from(
      root.querySelectorAll<HTMLScriptElement>(`script[type="${INERT_TYPE}"]`),
    );
    const created: HTMLScriptElement[] = [];
    for (const old of stale) {
      const fresh = document.createElement("script");
      for (const attr of Array.from(old.attributes)) {
        if (attr.name === "type") continue;
        // 원래 type 이 있었으면 되돌린다(module 등).
        if (attr.name === ORIG_TYPE_ATTR) {
          fresh.setAttribute("type", attr.value);
          continue;
        }
        fresh.setAttribute(attr.name, attr.value);
      }
      fresh.text = old.textContent ?? "";
      old.replaceWith(fresh);
      created.push(fresh);
    }
    return () => {
      // 페이지 이동 시 남은 노드 정리. setInterval 등 스크립트가 건 타이머까지는
      // 회수할 수 없으므로, 이벤트 페이지 스크립트는 자체적으로 정리하도록 작성한다.
      for (const s of created) s.remove();
    };
    // html 이 바뀌면 다시 주입한다(관리자 미리보기에서 편집 중 반영).
  }, [inert]);

  return (
    <div
      ref={ref}
      className={className}
      dangerouslySetInnerHTML={{ __html: inert }}
    />
  );
}
