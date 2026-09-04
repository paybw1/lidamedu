// 체계도 원본(hwpx 추출 JSON) 파싱 공용 모듈.
//
// ★apply-tree(트리 반영)와 apply-article-refs(조문 배치)가 **같은 파서를 쓴다**.
//   두 벌로 두면 한쪽만 고쳐져 트리와 배치가 서로 다른 원본 해석 위에 놓인다.
//
// 원본은 법마다 두 벌이다.
//   조문용        = 기본 트리(display_label)
//   판례/객관식용 = 판례 화면 트리(case_only 노드 · case_display_label 이 다른 이름)

import fs from "node:fs";

export const SOURCES = {
  trademark: {
    label: "상표법",
    article: "source/상표법/체계도/체계도(상표법) - 조문용.extracted.json",
    caseView: "source/상표법/체계도/체계도(상표법) - 판례, 객관식용.extracted.json",
  },
  design: {
    label: "디자인보호법",
    article: "source/디자인보호법학습/체계도/체계도(디보법) - 조문용.extracted.json",
    caseView: "source/디자인보호법학습/체계도/체계도(디보법) - 판례, 객관식용.extracted.json",
  },
};

/** 글머리·번호·중복 공백만 지운 표시용 이름. 글자는 건드리지 않는다. */
export const norm = (s) =>
  s
    .replace(/^\s*[•·]\s*/, "")
    .replace(/^\s*-\s*/, "")
    .replace(/^\s*\[\d{2}\]\s*/, "")
    .replace(/^\s*\d{2}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

/** 원본의 `(法 101, 102, 103)` 은 제목이 아니라 **배치 지시**다 — 라벨에서 뗀다. */
// ★닫는 괄호가 빠진 원본이 실제로 있다(`실시권 일반(法 97, 98, 99, 104`) — `\)?` 필수.
export const REF_SUFFIX = /\s*\(\s*法\s*([^)]*)\)?\s*$/;
export const stripRefs = (s) => s.replace(REF_SUFFIX, "").trim();

// ★안쪽 공백까지 지운다. `신규성상실의 예외` 와 `신규성 상실의 예외` 는 같은 항목인데
//   띄어쓰기만 다르다 — 이걸 놓쳐 실제로 중복 노드가 하나 생겼다(2026-09-03).
export const matchKey = (s) => stripRefs(s).replace(/\s+/g, "").trim();
export const keyPath = (p) => p.split(" / ").map(matchKey).join(" / ");

/** 글머리 모양으로 계층을 읽는다. `01 …` / `[01] …` / `• …` / ` - …` */
export function levelOf(t) {
  if (/^\d{2}\s/.test(t)) return 1;
  if (/^\s*\[\d{2}\]/.test(t)) return 2;
  if (/^\s*[•·]/.test(t)) return 3;
  if (/^\s*-\s/.test(t)) return 4;
  return 0;
}

/**
 * 원본 → 순서를 보존한 노드 목록.
 * refs 는 `(法 …)` 안의 원문(없으면 null) — 조문 배치는 이 값을 쓴다.
 */
export function parseTree(file) {
  const paras = JSON.parse(fs.readFileSync(file, "utf8")).paragraphs;
  const stack = [];
  const out = [];
  for (const p of paras) {
    const raw = p.text;
    if (!raw || !raw.trim()) continue;
    const lv = levelOf(raw);
    if (lv === 0) throw new Error(`형식을 못 읽은 줄: ${JSON.stringify(raw)}`);
    const label = norm(raw);
    stack.length = lv - 1;
    stack[lv - 1] = label;
    const chain = stack.slice(0, lv).filter(Boolean);
    out.push({
      label,
      path: chain.join(" / "),
      parentPath: chain.slice(0, -1).join(" / "),
      // 최상위는 원본의 `01 …` 번호를 라벨에 유지한다(DB 도 그렇게 저장돼 있다).
      displayLabel: stripRefs(lv === 1 ? raw.trim() : label),
      refs: label.match(REF_SUFFIX)?.[1]?.trim() ?? null,
    });
  }
  return out;
}

/**
 * DB 노드의 조상 라벨 사슬 → keyPath. 원본 경로와 대조하는 유일한 기준.
 * byId 는 node_id → 노드.
 */
export function dbPathOf(n, byId) {
  const parts = [];
  let cur = n;
  while (cur) {
    parts.unshift(norm(cur.display_label));
    cur = cur.parent_id ? byId.get(cur.parent_id) : null;
  }
  return parts.join(" / ");
}
