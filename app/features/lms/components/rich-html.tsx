// feat-11-008 / 수강정책 요청서 ⑦ — 운영자(staff)가 에디터로 저장한 HTML 을 렌더한다.
//
// ★왜 별도 컴포넌트가 필요한가
//   dangerouslySetInnerHTML 로 넣은 <script> 는 브라우저가 **실행하지 않는다**(HTML 사양).
//   그래서 카운트다운·스크롤 리빌 같은 이벤트 페이지 스크립트가 조용히 죽어 있었다.
//   여기서는 삽입 후 script 노드를 새로 만들어 붙여 실행시킨다(표준 우회).
//   <style>·@media·@keyframes 는 innerHTML 로도 적용되므로 별도 처리가 필요 없다.
//
// ★보안 경계 — 이 컴포넌트는 **운영자가 작성한 콘텐츠에만** 쓴다.
//   강의 상세페이지 · 페이지관리처럼 staff 만 쓸 수 있는 화면이 대상이고,
//   일반 회원이 작성하는 게시판·댓글·문의에는 절대 쓰지 않는다(그쪽은 기존 렌더 유지).
//   요청서의 "관리자만 소스 편집 권한" 지침을 코드 경계로 옮긴 것이다.

import { useEffect, useRef } from "react";

export function RichHtml({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // innerHTML 로 들어온 script 는 비활성 상태다 — 같은 내용으로 새 노드를 만들어
    // 교체하면 그때 실행된다. 외부 src 스크립트도 동일(로드 순서는 문서 순서를 따른다).
    const stale = Array.from(root.querySelectorAll("script"));
    const created: HTMLScriptElement[] = [];
    for (const old of stale) {
      const fresh = document.createElement("script");
      for (const attr of Array.from(old.attributes)) {
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
  }, [html]);

  return (
    <div
      ref={ref}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
