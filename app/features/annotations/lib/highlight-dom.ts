// 조문 본문(또는 임의의 컨테이너) 안에서의 텍스트 선택을 안정적으로 저장·복원하기 위한 유틸.
//
// 핵심 아이디어:
//   - 저장 시: 컨테이너 안 모든 text node 들의 길이를 누적하여 "컨테이너 텍스트 시작점에서 몇 글자 떨어진 위치"를 계산
//   - 복원 시: 같은 방식으로 누적하면서 누적 위치가 저장된 offset 에 도달하는 text node 와 그 안 위치를 찾아 Range 재구성
//
// React 가 inline 토큰 단위로 span 을 끊어서 만들기 때문에 단순 range.startOffset (text-node 내부 offset) 으로는
// re-render 후 위치 추적이 불가능. 누적 offset 방식이 필요.

export interface DocSelectionInfo {
  text: string;
  startOffset: number; // 컨테이너 텍스트 시작점 기준 누적 char offset (start)
  endOffset: number; // 컨테이너 텍스트 시작점 기준 누적 char offset (end)
}

function isTextNode(node: Node | null): node is Text {
  return !!node && node.nodeType === Node.TEXT_NODE;
}

/** 컨테이너 안에서 현재 선택을 찾아 누적 offset 으로 변환. 선택 없거나 컨테이너 밖이면 null. */
export function captureContainerSelection(
  container: Element,
): DocSelectionInfo | null {
  if (typeof window === "undefined") return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const text = sel.toString();
  if (!text.trim()) return null;
  const range = sel.getRangeAt(0);
  // 선택이 컨테이너 밖이면 무시
  if (
    !container.contains(range.startContainer) ||
    !container.contains(range.endContainer)
  ) {
    return null;
  }
  const start = textOffsetInContainer(
    container,
    range.startContainer,
    range.startOffset,
  );
  const end = textOffsetInContainer(
    container,
    range.endContainer,
    range.endOffset,
  );
  if (start === null || end === null) return null;
  if (end <= start) return null;
  return { text, startOffset: start, endOffset: end };
}

/** 특정 (textNode, offset) 의 컨테이너 기준 누적 char offset 계산. text node 가 아닌 경우 null. */
function textOffsetInContainer(
  container: Element,
  targetNode: Node,
  targetOffset: number,
): number | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let cumulative = 0;
  let node = walker.nextNode();
  while (node) {
    if (node === targetNode && isTextNode(node)) {
      return cumulative + targetOffset;
    }
    if (isTextNode(node)) {
      cumulative += node.data.length;
    }
    node = walker.nextNode();
  }
  // targetNode 가 element 인 경우 (선택이 element boundary 에서 끝남): 그 element 직전까지의 누적길이
  if (!isTextNode(targetNode)) {
    return cumulative;
  }
  return null;
}

/** 누적 char offset 으로부터 (textNode, offset) 위치를 찾아 반환. */
export function locateOffset(
  container: Element,
  charOffset: number,
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let cumulative = 0;
  let node = walker.nextNode();
  while (node) {
    if (isTextNode(node)) {
      const len = node.data.length;
      if (charOffset <= cumulative + len) {
        return { node, offset: charOffset - cumulative };
      }
      cumulative += len;
    }
    node = walker.nextNode();
  }
  return null;
}

/** 저장된 (start, end) char offset 을 DOM Range 로 복원. 실패 시 null. */
export function rangeFromOffsets(
  container: Element,
  startOffset: number,
  endOffset: number,
): Range | null {
  if (typeof document === "undefined") return null;
  const startLoc = locateOffset(container, startOffset);
  const endLoc = locateOffset(container, endOffset);
  if (!startLoc || !endLoc) return null;
  const range = document.createRange();
  try {
    range.setStart(startLoc.node, startLoc.offset);
    range.setEnd(endLoc.node, endLoc.offset);
  } catch {
    return null;
  }
  return range;
}

/** 컨테이너 전체 텍스트(공백/개행 그대로). content_hash 계산 등에 사용. */
export function containerText(container: Element): string {
  let out = "";
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (isTextNode(node)) out += node.data;
    node = walker.nextNode();
  }
  return out;
}
