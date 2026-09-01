// 좌측 체계도 목차의 **계층 안내선** — 조문 트리와 같은 모양을 판례·객관식·주관식에도.
//
// ★왜 컴포넌트가 따로 필요한가
//   조문 트리(systematic-tree)는 자식을 `ml-[15px] border-l` 컨테이너로 감싸 들여쓰기와
//   선을 한 번에 얻는다. 판례·문제 트리는 행마다 `paddingLeft: depth*12+6` 으로 들여쓰기
//   해서 선을 걸 요소가 없다. 들여쓰기 방식을 갈아엎으면 뱃지·잎 위치 계산이 전부 흔들리므로,
//   같은 위치에 선만 얹는다(레이아웃 불변).
//
//   left = depth*12 + 15 — 자식 행의 들여쓰기(depth*12+18)보다 3px 왼쪽. 조문 트리의
//   ml-[15px] 과 같은 자리에 떨어진다.
import type { ReactNode } from "react";

export function TreeBranch({
  depth,
  children,
}: {
  /** 부모 노드의 depth. 선은 이 깊이 기준으로 그린다. */
  depth: number;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="bg-border absolute top-0 bottom-0 w-[1.5px] rounded-full"
        style={{ left: `${depth * 12 + 15}px` }}
      />
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}
