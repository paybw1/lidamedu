// 체계도 노드 라벨 — 번호 표기 A안.
// systematic_nodes.display_label 에는 번호가 "02 특허요건" / "[01] 특허를 받을 수
// 있는 발명" 처럼 박혀 있어 표기가 들쭉날쭉하다. 표시할 땐 접두사를 떼어 제목만
// 남기고, 번호는 node.ord 로 깊이별 배지로 렌더한다. (DB display_label 은 보존 —
// 표시 계층에서만 분리.)

// "02 특허요건" → "특허요건", "[01] 특허를 받을 수 있는 발명" → "특허를 받을 수 있는 발명".
// 접두사가 없는 라벨(소분류 등)은 그대로 반환.
export function stripSystematicNumber(label: string): string {
  return label.replace(/^(?:\[\d+\]|\d+)\s+/, "").trim();
}

// 깊이별 번호 배지 — depth 0 대분류(솔리드) · depth 1 중분류(옅음) · depth ≥ 2 소분류(점).
export function SystematicNumberBadge({
  depth,
  ord,
}: {
  depth: number;
  ord: number;
}) {
  if (depth === 0) {
    return (
      <span className="bg-primary text-primary-foreground inline-flex size-[18px] flex-none items-center justify-center rounded-md text-[10px] font-bold tabular-nums">
        {ord}
      </span>
    );
  }
  if (depth === 1) {
    return (
      <span className="bg-primary/10 text-link inline-flex h-[17px] min-w-[17px] flex-none items-center justify-center rounded px-1 text-[10px] font-bold tabular-nums">
        {ord}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="bg-foreground/30 inline-block size-1 flex-none rounded-full"
    />
  );
}
