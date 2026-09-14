// 목록 페이저 — 공용 부품 (feat-11-012 P7).
//
// ★저장소에 공용 페이저가 없어서 **13곳이 제각기** 만들어 쓰고 있었다. URL 만드는 축만
//   다섯 갈래다 — makeUrl 콜백 / 컴포넌트 안 useSearchParams / 하드코딩 경로 / `?offset=` /
//   setSearchParams onClick(★이건 <Link> 가 아니라 버튼이라 **우클릭·새 탭이 안 된다**).
// ★계약은 `makeUrl` 콜백을 받는 쪽으로 정했다 — 이미 두 곳(최신자료·회원관리)이 같은 모양이고,
//   경로·파라미터 이름이 화면마다 다르므로(page vs offset) 부품이 URL 을 직접 지으면 안 된다.
//
// ★★계획서의 「공용화하면 3줄 교체」는 **사실이 아니다**(조사로 확인). 이미 서버 페이징이
//   되는 화면은 렌더 한 줄로 끝나지만, 「상한만 걸린 화면」은 서버가 애초에 페이징을 안 하므로
//   loader 쪽에 8~10줄이 더 든다. 그래서 이 파일과 짝으로 `core/lib/paging.ts` 를 함께 낸다 —
//   실제 비용은 JSX 가 아니라 그쪽에 있다.

import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";

export function Pager({
  page,
  totalPages,
  /** 페이지 번호를 받아 그 페이지의 URL 을 돌려준다. 다른 필터는 호출자가 보존한다. */
  makeUrl,
  className,
}: {
  page: number;
  totalPages: number;
  makeUrl: (page: number) => string;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const prev = page > 1;
  const next = page < totalPages;
  return (
    <nav
      aria-label="페이지 이동"
      className={`mt-6 flex items-center justify-center gap-2 ${className ?? ""}`}
    >
      {/* ★끝 페이지에서는 <Link> 를 <span> 으로 바꾼다 — 비활성 링크를 눌러도
          같은 페이지로 도는 것을 막고, 키보드 탐색에서도 빠진다. */}
      <Button
        asChild={prev}
        variant="outline"
        size="sm"
        disabled={!prev}
        className="h-9 rounded-full"
      >
        {prev ? <Link to={makeUrl(page - 1)}>← 이전</Link> : <span>← 이전</span>}
      </Button>
      <span className="text-muted-foreground px-2 text-xs font-bold tabular-nums">
        {page} / {totalPages}
      </span>
      <Button
        asChild={next}
        variant="outline"
        size="sm"
        disabled={!next}
        className="h-9 rounded-full"
      >
        {next ? <Link to={makeUrl(page + 1)}>다음 →</Link> : <span>다음 →</span>}
      </Button>
    </nav>
  );
}
