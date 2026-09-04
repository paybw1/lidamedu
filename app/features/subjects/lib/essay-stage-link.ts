// feat-2-032 — ③ 사안의 포섭·결론을 **② 목차 구성에서 세운 목차대로** 쓰게 한다.
//
// 원장 지적(2026-09-04): "쟁점이 여러 개 있으니 목차 구성에서 구성한 목차에서
// 사안의 포섭 및 결론 작성이 이루어져야 한다."
//
// 종전에는 ③이 빈 칸 하나였다. 쟁점이 셋인 문항에서 학생은 세 논점을 한 칸에 몰아 썼고,
// ②에서 세운 목차와 ③이 서로 무관해졌다 — 실제 답안은 목차를 따라 써 내려간다.
//
// ★저장은 `analysis_md` 하나 그대로다(스키마 변경 없음). 항목별 입력을 `### 제목` 이 붙은
//   마크다운으로 합쳐 넣고, 읽을 때 같은 규칙으로 되나눈다.
// ★목차를 나중에 고쳐도 **이미 쓴 글을 잃지 않는다.** 짝을 못 찾은 덩이는 버리지 않고
//   `orphans` 로 돌려주어 화면에 남긴다(학습 데이터 무삭제 원칙).

/** 학생이 ②에 쓴 목차 → 항목 목록. 빈 줄과 군더더기만 걸러 낸다. */
export function outlineItems(outlineMd: string | null | undefined, max = 40): string[] {
  if (!outlineMd) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of outlineMd.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t) continue;
    // 마크다운 제목 기호나 글머리표만 있는 줄은 항목이 아니다.
    const cleaned = t.replace(/^#{1,6}\s*/, "").replace(/^[-*•·]\s*/, "").trim();
    if (!cleaned) continue;
    // ★같은 제목이 두 번 나오면 뒤엣것을 버린다 — 항목 제목이 저장 키다.
    const key = cleaned.replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= max) break;
  }
  return out;
}

export interface AnalysisChunk {
  /** `### 제목` 의 제목. 제목 없이 시작한 글이면 null. */
  title: string | null;
  body: string;
}

/** `analysis_md` → 항목별 덩이. 제목이 없던 옛 기록은 title null 하나로 온다. */
export function splitAnalysis(analysisMd: string | null | undefined): AnalysisChunk[] {
  if (!analysisMd || !analysisMd.trim()) return [];
  const lines = analysisMd.split(/\r?\n/);
  const out: AnalysisChunk[] = [];
  let cur: AnalysisChunk = { title: null, body: "" };
  const buf: string[] = [];
  const flush = () => {
    cur.body = buf.join("\n").replace(/^\s*\n+/, "").replace(/\s+$/, "");
    if (cur.title !== null || cur.body) out.push(cur);
    buf.length = 0;
  };
  for (const raw of lines) {
    const m = raw.match(/^###\s+(.*?)\s*$/);
    if (m) {
      flush();
      cur = { title: m[1], body: "" };
      continue;
    }
    buf.push(raw);
  }
  flush();
  return out;
}

/** 항목별 입력 → `analysis_md`. 빈 항목은 넣지 않는다(빈 제목만 줄줄이 남지 않게). */
export function joinAnalysis(entries: Array<{ title: string; body: string }>): string {
  return entries
    .filter((e) => e.body.trim())
    .map((e) => `### ${e.title}\n\n${e.body.trim()}`)
    .join("\n\n");
}

export interface AnalysisMapping {
  /** 목차 항목 제목 → 그 항목에 쓴 글. */
  byItem: Record<string, string>;
  /** 지금 목차에 없는 덩이 — 목차를 고친 뒤 남은 글. 버리지 않는다. */
  orphans: AnalysisChunk[];
}

/** 저장된 글을 지금 목차 항목에 맞춰 나눈다. */
export function mapAnalysisToItems(
  items: string[],
  analysisMd: string | null | undefined,
): AnalysisMapping {
  const chunks = splitAnalysis(analysisMd);
  const norm = (s: string) => s.replace(/\s+/g, "");
  const byKey = new Map(items.map((t) => [norm(t), t]));
  const byItem: Record<string, string> = {};
  const orphans: AnalysisChunk[] = [];
  for (const c of chunks) {
    const hit = c.title !== null ? byKey.get(norm(c.title)) : undefined;
    if (hit && !byItem[hit]) byItem[hit] = c.body;
    else orphans.push(c);
  }
  return { byItem, orphans };
}
