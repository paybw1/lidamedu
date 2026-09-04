// feat-2-036 S1 — 주관식 모범답안(`model_answer_md`) → 목차 트리.
//
// 연습 모드 두 가지가 모두 이 파서 하나를 쓴다.
//   목차 연습 — 제목만 뽑아 학생이 세운 목차와 맞춘다(`headingLines`)
//   내용 연습 — 본문이 붙은 칸을 빈칸으로 내준다(`leaves`)
//
// ── 전수 실측(184건, 2026-09-04) ──────────────────────────────────────────
//   `##` 없는 답안 0건 · `#` 은 0개 아니면 1개(문서 제목) · `#####` 이상 0건
//   블록(`##`) 중앙 3개(최대 7) · 블록당 잎 칸 중앙 5개(90% 9, 최대 14)
//   잎 칸 글자 수 중앙 150자(90% 321)
//
// ★두 가지 모양이 섞여 있다 — 어느 쪽도 특별취급하지 않는다.
//   (가) `## Ⅰ. 설문 (1)` 처럼 설문이 `##`      (109건)
//   (나) `# 문제 3 모범답안` + `## Ⅰ. 서 설`     (75건)
//   `#` 은 **문서 제목**이지 설문이 아니다. 블록 단위는 언제나 `##` 다.
//
// ★제목 없이 본문만 있는 칸을 잃지 않는다. `##` 바로 아래 본문이 오는 답안이 있어
//   "본문은 `###` 에만 붙는다"고 보면 그 글이 통째로 사라진다.

/** 목차 한 칸. 본문이 있으면 내용 연습의 빈칸이 된다. */
export interface OutlineNode {
  /** 화면·초안 저장 키 — 블록 안에서 안정적이다(`b0.n3`). */
  id: string;
  level: 2 | 3 | 4;
  /** 제목에서 `##` 를 뗀 텍스트. */
  title: string;
  /** 다음 제목 직전까지의 본문(없으면 빈 문자열). */
  bodyMd: string;
  children: OutlineNode[];
}

/** `##` 하나 = 연습 한 판. 설문형이면 설문, 아니면 대목차다. */
export interface OutlineBlock {
  index: number;
  title: string;
  /** 트리(자식 포함) — 화면 들여쓰기용. */
  nodes: OutlineNode[];
  /** 본문이 붙은 칸만 평평하게 — 내용 연습의 빈칸 목록. */
  leaves: OutlineNode[];
  /** 제목만 순서대로 — 목차 연습 채점의 모범답안. */
  headingLines: string[];
}

export interface ParsedAnswer {
  /** `# …` 문서 제목(없으면 null). 연습에서는 쓰지 않는다. */
  docTitle: string | null;
  /** 첫 `##` 앞에 있던 글. 버리지 않고 담아 둔다. */
  preambleMd: string;
  blocks: OutlineBlock[];
}

const HEADING = /^(#{1,4})\s+(.*?)\s*$/;
/** 마크다운 구분선 — 설문 사이에 들어가 있고 목차가 아니다. */
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

function trimBody(lines: string[]): string {
  return lines.join("\n").replace(/^\s*\n+/, "").replace(/\s+$/, "");
}

/**
 * 모범답안 마크다운 → 목차 트리.
 * 제목이 하나도 없으면 blocks 는 빈 배열이고 글 전체가 preambleMd 로 남는다
 * (연습을 걸지 않기 위한 신호 — 화면에서 이 경우 연습 모드를 감춘다).
 */
export function parseEssayOutline(md: string | null | undefined): ParsedAnswer {
  const out: ParsedAnswer = { docTitle: null, preambleMd: "", blocks: [] };
  if (!md || !md.trim()) return out;

  const lines = md.split(/\r?\n/);
  const preamble: string[] = [];
  let block: OutlineBlock | null = null;
  // 지금 본문을 받고 있는 칸. 블록 제목 직후에는 블록 자신의 노드가 받는다.
  let sink: OutlineNode | null = null;
  let buf: string[] = [];
  // 층별 최근 노드 — 자식을 매달 자리를 찾는다.
  let lastByLevel: Record<number, OutlineNode | null> = { 2: null, 3: null, 4: null };

  const flush = () => {
    if (sink) sink.bodyMd = trimBody(buf);
    else preamble.push(...buf);
    buf = [];
  };

  for (const raw of lines) {
    if (RULE.test(raw)) {
      // 구분선은 본문에도 목차에도 넣지 않는다.
      continue;
    }
    const m = raw.match(HEADING);
    if (!m) {
      buf.push(raw);
      continue;
    }
    const level = m[1].length;
    const title = m[2].trim();

    if (level === 1) {
      flush();
      // ★`#` 은 문서 제목이다. 여러 개인 답안은 실측 0건이지만, 나오면 첫 개만 쓴다.
      if (out.docTitle === null) out.docTitle = title;
      sink = null;
      continue;
    }

    flush();

    if (level === 2) {
      // ★블록 제목 자신도 칸이다 — `##` 바로 아래 본문이 오는 답안이 있다.
      const node: OutlineNode = {
        id: `b${out.blocks.length}.n0`,
        level: 2,
        title,
        bodyMd: "",
        children: [],
      };
      block = {
        index: out.blocks.length,
        title,
        nodes: [node],
        leaves: [],
        headingLines: [],
      };
      out.blocks.push(block);
      lastByLevel = { 2: node, 3: null, 4: null };
      sink = node;
      continue;
    }

    // level 3 · 4 — 블록이 없으면(문서가 `###` 로 시작) 그 층을 블록으로 승격한다.
    if (!block) {
      const node: OutlineNode = {
        id: `b${out.blocks.length}.n0`,
        level: 2,
        title,
        bodyMd: "",
        children: [],
      };
      block = { index: out.blocks.length, title, nodes: [node], leaves: [], headingLines: [] };
      out.blocks.push(block);
      lastByLevel = { 2: node, 3: null, 4: null };
      sink = node;
      continue;
    }

    const lv = level as 3 | 4;
    const node: OutlineNode = {
      id: `b${block.index}.n${countNodes(block.nodes)}`,
      level: lv,
      title,
      bodyMd: "",
      children: [],
    };
    // 부모 = 바로 위 층의 최근 노드. 없으면 한 층 더 위로 올라간다.
    const parent = lv === 4 ? (lastByLevel[3] ?? lastByLevel[2]) : lastByLevel[2];
    if (parent) parent.children.push(node);
    else block.nodes.push(node);
    lastByLevel[lv] = node;
    if (lv === 3) lastByLevel[4] = null;
    sink = node;
  }
  flush();

  out.preambleMd = trimBody(preamble);
  for (const b of out.blocks) {
    b.headingLines = [];
    b.leaves = [];
    walk(b.nodes, (n) => {
      b.headingLines.push(n.title);
      if (n.bodyMd.trim()) b.leaves.push(n);
    });
  }
  return out;
}

function countNodes(nodes: OutlineNode[]): number {
  let n = 0;
  walk(nodes, () => {
    n += 1;
  });
  return n;
}

/** 트리를 화면 순서(깊이 우선)대로 훑는다. */
export function walk(nodes: OutlineNode[], fn: (n: OutlineNode) => void): void {
  for (const n of nodes) {
    fn(n);
    walk(n.children, fn);
  }
}

/** 목차 연습의 모범답안 — 제목을 줄바꿈으로 이은 글. */
export function outlineText(block: OutlineBlock): string {
  return block.headingLines.join("\n");
}

/** 연습을 걸 수 있는 블록인가 — 칸이 하나도 없으면 내줄 게 없다. */
export function isPracticable(block: OutlineBlock): boolean {
  return block.headingLines.length >= 2 || block.leaves.length >= 1;
}

/** 블록 머리에 붙일 이름과 배점 — 제목 전체를 보여 주면 목차 첫 줄을 알려 주는 셈이다. */
export function blockLabel(block: OutlineBlock): { label: string; points: number | null } {
  const t = block.title;
  const sul = t.match(/설문\s*\(?\s*([0-9０-９]+)\s*\)?/);
  const pt = t.match(/\(\s*([0-9]+)\s*점\s*\)/);
  return {
    label: sul ? `설문 (${sul[1]})` : `${block.index + 1}번째 묶음`,
    points: pt ? Number(pt[1]) : null,
  };
}
