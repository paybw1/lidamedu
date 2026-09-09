import {
  ArticleOutlineBadge,
  splitOutlineLabel,
} from "./article-outline-label";

// 체계도 노드 라벨 — 번호 표기 A안.
// systematic_nodes.display_label 에는 번호가 "02 특허요건" / "[01] 특허를 받을 수
// 있는 발명" 처럼 박혀 있어 표기가 들쭉날쭉하다. 표시할 땐 접두사를 떼어 제목만
// 남기고, 번호는 systematicNumbers() 가 매긴 숫자를 깊이별 배지로 렌더한다.
// (DB display_label·ord 는 보존 — 표시 계층에서만 분리.)

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
// no = systematicNumbers() 가 매긴 표시 숫자. ★node.ord 를 넘기지 말 것(아래 주석 참조).
export function SystematicNumberBadge({
  depth,
  no,
}: {
  depth: number;
  no: number;
}) {
  if (depth === 0) {
    return (
      <span className="bg-primary text-primary-foreground inline-flex size-[18px] flex-none items-center justify-center rounded-md text-[10px] font-bold tabular-nums">
        {no}
      </span>
    );
  }
  if (depth === 1) {
    return (
      <span className="bg-primary/10 text-link inline-flex h-[17px] min-w-[17px] flex-none items-center justify-center rounded px-1 text-[10px] font-bold tabular-nums">
        {no}
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

// ── 배지 숫자 ────────────────────────────────────────────────────────────────
// ★배지에 node.ord 를 그대로 찍으면 안 된다. ord 는 정렬 키일 뿐, 과목마다 매기는
//   방식이 다르다 — 특허·민법은 형제 순번(1·2·3…)이라 원본 번호와 우연히 같지만,
//   상표·디자인은 apply-tree.mjs 가 트리 전체를 훑는 전역 카운터로 매겨서
//   대분류가 0 · 21 · 44 · 49 … 로 찍힌다(원장 지적 2026-09-07).
//   ord 의 뜻은 그대로 두고(정렬·페이징이 이 유일성에 기댄다), 표시 숫자만 따로 만든다.

// "01 총칙/보칙" → 1, "[03] 특허를 받을 수 있는 자" → 3. 번호가 없으면 null.
export function parseSystematicNumber(label: string): number | null {
  const m = /^(?:\[(\d+)\]|(\d+))\s+/.exec(label.trim());
  if (!m) return null;
  return Number(m[1] ?? m[2]);
}

interface NumberableNode {
  nodeId: string;
  parentId: string | null;
  displayLabel: string;
  ord: number;
}

// 노드별 표시 숫자표.
// ① 라벨에 박힌 원본 번호가 우선 — 원본에 결번이 있다(디자인 09 국제출원 다음이
//    11 최신판례). 형제 순서로만 세면 원본과 어긋난다.
// ② 번호가 없는 층만 형제 순서로 매긴다 — 상표 중분류는 적재 때(source-tree.mjs)
//    "[01]" 접두사가 지워져 DB 에 원본 번호가 없다.
// ★반드시 필터·검색 **전의 전체 목록**으로 만들 것. 걸러낸 목록으로 매기면
//   중요도 필터를 켤 때마다 번호가 바뀐다.
export function systematicNumbers(
  nodes: NumberableNode[],
): Record<string, number> {
  const siblings = new Map<string, NumberableNode[]>();
  for (const n of nodes) {
    const key = n.parentId ?? "";
    const arr = siblings.get(key);
    if (arr) arr.push(n);
    else siblings.set(key, [n]);
  }
  const out: Record<string, number> = {};
  for (const group of siblings.values()) {
    const sorted = [...group].sort((a, b) => a.ord - b.ord);
    sorted.forEach((n, i) => {
      out[n.nodeId] = parseSystematicNumber(n.displayLabel) ?? i + 1;
    });
  }
  return out;
}

// ── 체계도 한 줄의 이름 ──────────────────────────────────────────────────────
// ★민법 체계도는 조문 목차 그 자체다(`제1편 총칙` · `제1장 통칙`). 그래서 체계도 번호
//   배지를 달면 조문 탭과 객관식 탭의 같은 목차가 서로 다르게 보인다(원장 지적
//   2026-09-09). 목차 표기면 조문 트리와 **같은 배지**를 쓴다.
export function SystematicTreeLabel({
  depth,
  no,
  label,
}: {
  depth: number;
  no: number;
  label: string;
}) {
  const outline = splitOutlineLabel(label);
  if (outline) {
    return (
      <>
        <ArticleOutlineBadge no={outline.no} unit={outline.unit} />
        <span className="flex-1 truncate">{outline.title}</span>
      </>
    );
  }
  return (
    <>
      <SystematicNumberBadge depth={depth} no={no} />
      <span className="flex-1 truncate">{stripSystematicNumber(label)}</span>
    </>
  );
}
