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

// 판례집 주제 노드 — display_label 이 "주제3 서비스에 대한 상표의 사용" 꼴이다.
// 체계도 번호(ord)와는 다른 축(교재 목차 순번)이라 배지도 따로 쓴다.
// "주제3 …" → { topicNo: 3, title: "서비스에 대한 상표의 사용" }, 아니면 topicNo=null.
export function splitTopicLabel(label: string): {
  topicNo: number | null;
  title: string;
} {
  const m = /^주제\s*(\d+)\s*(.*)$/.exec(label.trim());
  if (!m) return { topicNo: null, title: label };
  return { topicNo: Number(m[1]), title: m[2].trim() || label };
}

// 주제 배지 — 체계도 번호 배지(숫자만)와 헷갈리지 않게 "주제"를 달아 둔다.
// 교재 순번이라는 다른 축임을 한눈에 알리는 게 목적이라 글자를 살린다.
export function TopicBadge({ no }: { no: number }) {
  return (
    // min-w — 한 자리(주제 1)와 두 자리(주제 47)가 섞여도 제목 시작선이 맞게.
    <span className="border-primary/25 bg-primary/5 text-link inline-flex h-[18px] min-w-[44px] flex-none items-center justify-center gap-0.5 rounded-full border px-1.5 text-[10px] leading-none font-bold">
      <span className="font-medium opacity-70">주제</span>
      <span className="tabular-nums">{no}</span>
    </span>
  );
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
