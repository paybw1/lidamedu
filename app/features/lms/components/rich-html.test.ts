// 운영자 HTML 안의 <script> 를 SSR 파싱 단계에서 무력화하는지(2026-09-01 요청서 ①).
//
// ★왜 필요한가: 서버가 만든 문서에 <script> 가 그대로 들어가면 브라우저가 **파싱 도중**
//   한 번 실행하고, 마운트 후 RichHtml 이 다시 붙여 **두 번** 실행된다. 자기 뒤 요소를 잡는
//   스크립트는 첫 실행에서 null 을 잡고, DOMContentLoaded 로 감싼 스크립트는 두 번째 실행에서
//   영영 안 돈다. 여는 태그만 비활성 type 으로 바꿔 실행을 마운트 이후 한 번으로 모은다.
import { describe, expect, it } from "vitest";

import { inertifyScripts } from "./rich-html";

describe("inertifyScripts", () => {
  it("여는 태그에 비활성 type 을 붙인다", () => {
    expect(inertifyScripts("<script>alert(1)</script>")).toBe(
      '<script type="text/x-lidam-inert">alert(1)</script>',
    );
  });

  it("스크립트 내용과 닫는 태그는 건드리지 않는다", () => {
    const body = 'const s = "</div>"; if (a < b) {}';
    const out = inertifyScripts(`<script>${body}</script>`);
    expect(out).toContain(body);
    expect(out.endsWith("</script>")).toBe(true);
  });

  it("원래 type 은 잃지 않고 옮겨 둔다(module 등)", () => {
    const out = inertifyScripts('<script type="module">import "./a.js"</script>');
    expect(out).toContain('data-lidam-type="module"');
    expect(out).toContain('type="text/x-lidam-inert"');
  });

  it("src·defer 같은 속성은 그대로 남긴다", () => {
    const out = inertifyScripts('<script src="/a.js" defer></script>');
    expect(out).toContain('src="/a.js"');
    expect(out).toContain("defer");
  });

  it("대문자 태그도 잡는다", () => {
    expect(inertifyScripts("<SCRIPT>x()</SCRIPT>")).toContain(
      'type="text/x-lidam-inert"',
    );
  });

  it("style·본문은 손대지 않는다 — CSS 는 innerHTML 로도 그대로 적용된다", () => {
    const html = "<style>@media (max-width:600px){.a{color:red}}</style><p>본문</p>";
    expect(inertifyScripts(html)).toBe(html);
  });

  it("여러 개를 모두 처리한다", () => {
    const out = inertifyScripts("<script>a()</script><div></div><script>b()</script>");
    expect(out.match(/text\/x-lidam-inert/g)).toHaveLength(2);
  });
});
