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

// ── 묶음 이름 줄여쓰기 ────────────────────────────────────────────────────
// ★원본은 `심판의 진행`, 화면은 `진행` 처럼 줄여 쓰는 묶음이 있다. 이걸 DB 에서만
//   바꾸면 (a) apply-tree 재실행 때 되돌아가고 (b) 원본↔DB 대조가 이름으로 이뤄지므로
//   짝을 못 찾아 같은 자리에 새 노드가 하나 더 생긴다. 그래서 **파싱 단계에서** 바꿔
//   원본 트리 자체를 화면 이름으로 만든다 — 경로 키도 자동으로 맞는다.
const OVERRIDE_DOC = JSON.parse(
  fs.readFileSync("scripts/systematic/label-overrides.json", "utf8"),
);
const RENAMES = OVERRIDE_DOC.renames;
// ★묶음 층을 아예 만들지 않고 자식을 위로 올린다(특허법 체계도와 같은 모양).
//   DB 에서 부모를 바꾸고 노드를 지우는 대신 **원본 해석을 바꾼다** — 그래야
//   apply-tree 가 스스로 자식을 옮기고 빈 묶음을 지운다(노드 id 보존).
const FLATTEN = OVERRIDE_DOC.flatten ?? [];

/** 이 묶음은 만들지 않는가? */
export function isFlattened(lawCode, parentLabel, label) {
  return FLATTEN.some(
    (f) => f.law === lawCode && f.label === label && f.parent === (parentLabel ?? null),
  );
}

/** 원본 이름 → 화면 이름. 같은 이름이 여러 층에 있어 부모까지 본다. */
export function renameLabel(lawCode, parentLabel, label) {
  const hit = RENAMES.find(
    (r) => r.law === lawCode && r.from === label && r.parent === (parentLabel ?? null),
  );
  return hit ? hit.to : label;
}

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
export function parseTree(file, lawCode = null) {
  const paras = JSON.parse(fs.readFileSync(file, "utf8")).paragraphs;
  const stack = [];
  const out = [];
  for (const p of paras) {
    const raw = p.text;
    if (!raw || !raw.trim()) continue;
    const lv = levelOf(raw);
    if (lv === 0) throw new Error(`형식을 못 읽은 줄: ${JSON.stringify(raw)}`);
    // ★이름 바꾸기는 **stack 에 넣기 전**에 한다. 그래야 자식의 부모 경로에도
    //   바뀐 이름이 들어가 원본 경로와 DB 경로가 같아진다.
    const label = lawCode
      ? renameLabel(lawCode, stack[lv - 2] ?? null, norm(raw))
      : norm(raw);
    stack.length = lv - 1;
    // ★걷어낼 묶음은 stack 에 null 로 둔다. chain 이 falsy 를 걸러 내므로 자식의
    //   경로에서 이 층이 자연스럽게 빠지고, 노드 자체도 만들지 않는다.
    const flat = lawCode ? isFlattened(lawCode, stack[lv - 2] ?? null, label) : false;
    stack[lv - 1] = flat ? null : label;
    if (flat) continue;
    const chain = stack.slice(0, lv).filter(Boolean);
    out.push({
      label,
      path: chain.join(" / "),
      parentPath: chain.slice(0, -1).join(" / "),
      // 최상위는 원본의 `01 …` 번호를 라벨에 유지한다(DB 도 그렇게 저장돼 있다).
      displayLabel: stripRefs(lv === 1 ? raw.trim() : label),
      sourceLabel: norm(raw),
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
