// 사이트맵 조립 테스트 (feat-11-012 P1).
//
// ★첫 테스트는 회귀 테스트다 — 2026-09-13 운영 사이트맵 7건이 전부
//   `https://www.lidamipedu.com//legal/...` 였다. 호스트 끝 슬래시와 경로 앞 슬래시가
//   겹친 것인데, 눈으로는 잘 안 보이고 크롤러에게는 다른 주소다.

import { describe, expect, it } from "vitest";

import { buildSitemapXml, dedupeEntries, joinUrl } from "./sitemap";

describe("joinUrl", () => {
  it("★호스트 끝에 슬래시가 있어도 이중 슬래시가 나지 않는다", () => {
    expect(joinUrl("https://a.com/", "/legal/terms")).toBe(
      "https://a.com/legal/terms",
    );
    expect(joinUrl("https://a.com///", "/legal/terms")).toBe(
      "https://a.com/legal/terms",
    );
  });

  it("호스트 끝에 슬래시가 없어도 같은 결과", () => {
    expect(joinUrl("https://a.com", "/legal/terms")).toBe(
      "https://a.com/legal/terms",
    );
  });

  it("경로 앞 슬래시가 없어도 붙여 준다", () => {
    expect(joinUrl("https://a.com", "legal/terms")).toBe(
      "https://a.com/legal/terms",
    );
  });

  it("루트는 슬래시 하나로 끝난다", () => {
    expect(joinUrl("https://a.com/", "/")).toBe("https://a.com/");
    expect(joinUrl("https://a.com", "")).toBe("https://a.com/");
  });

  it("경로 끝 슬래시는 떼서 같은 화면이 두 주소를 갖지 않게 한다", () => {
    expect(joinUrl("https://a.com", "/lecture/home/")).toBe(
      "https://a.com/lecture/home",
    );
  });
});

describe("dedupeEntries", () => {
  it("같은 경로는 한 번만 — 끝 슬래시 차이도 같은 것으로 본다", () => {
    const out = dedupeEntries([
      { path: "/lecture/home" },
      { path: "/lecture/home/" },
      { path: "/about" },
    ]);
    expect(out.map((e) => e.path)).toEqual(["/lecture/home", "/about"]);
  });

  it("먼저 들어온 항목의 lastmod 를 지킨다", () => {
    const out = dedupeEntries([
      { path: "/a", lastmod: "2026-01-01T00:00:00Z" },
      { path: "/a", lastmod: "2020-01-01T00:00:00Z" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].lastmod).toBe("2026-01-01T00:00:00Z");
  });
});

describe("buildSitemapXml", () => {
  it("lastmod 는 진짜 값이 있을 때만 넣는다", () => {
    const xml = buildSitemapXml("https://a.com", [
      { path: "/" },
      { path: "/lecture/news/1", lastmod: "2026-09-13T00:00:00Z" },
    ]);
    // 값 없는 항목에 lastmod 를 만들어 넣으면 "모든 페이지가 방금 바뀌었다"는 거짓 신호가 된다.
    expect(xml.match(/<lastmod>/g) ?? []).toHaveLength(1);
    expect(xml).toContain("<loc>https://a.com/</loc>");
    expect(xml).toContain("<loc>https://a.com/lecture/news/1</loc>");
  });

  it("주소의 XML 특수문자를 이스케이프한다", () => {
    const xml = buildSitemapXml("https://a.com", [{ path: "/x?a=1&b=2" }]);
    expect(xml).toContain("a=1&amp;b=2");
    expect(xml).not.toContain("a=1&b=2");
  });

  it("★어떤 항목에도 이중 슬래시가 남지 않는다", () => {
    const xml = buildSitemapXml("https://a.com/", [
      { path: "/" },
      { path: "/legal/terms" },
      { path: "/lecture/home" },
    ]);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toHaveLength(3);
    for (const loc of locs) {
      expect(loc.replace("https://", ""), loc).not.toContain("//");
    }
  });
});
